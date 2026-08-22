import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { ClientSession, Model } from 'mongoose';
import { Payment, PaymentDocument, WebhookEvent, WebhookEventDocument } from './schemas/payment.schema';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { Cart, CartDocument } from '../cart/schemas/cart.schema';
import { Logger } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { NotificationService } from '../notification/notification.service';
import Razorpay from 'razorpay';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name); // Initialize Logger

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(WebhookEvent.name) private readonly eventModel: Model<WebhookEventDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    private readonly orderService: OrderService,
    private readonly notificationService: NotificationService,
  ) { }

  async createRazorpayOrder(userId: string, orderId: string) {
    this.logger.log(`Creating Razorpay order for userId: ${userId}, orderId: ${orderId}`);

    const order = await this.orderModel.findOne({ _id: orderId, userId }).exec();
    if (!order) {
      this.logger.warn(`Order not found for userId: ${userId}, orderId: ${orderId}`);
      throw new ForbiddenException('Order not found');
    }

    if (order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') {
      this.logger.warn(`Order is not awaiting payment for userId: ${userId}, orderId: ${orderId}`);
      throw new BadRequestException('Order is not awaiting payment');
    }

    const existing = await this.paymentModel.findOne({ orderId, status: { $in: ['CREATED', 'AUTHORIZED'] } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (existing) {
      this.logger.log(`Existing Razorpay order found for orderId: ${orderId}`);
      return this.checkoutResponse(existing); // existing is null or undefined here
    }

    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      this.logger.error('Payment gateway is not configured');
      throw new BadGatewayException('Payment gateway is not configured');
    }

    const amount = Math.round(order.totalAmount * 100);
    this.logger.log(`Creating Razorpay order with amount: ${amount}, currency: ${order.currency}`);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: order.currency,
        receipt: order.orderNumber,
        notes: { internal_order_id: order.id },
      }),
    });

    if (!response.ok) {
      this.logger.error('Unable to create Razorpay order');
      throw new BadGatewayException('Unable to create Razorpay order');
    }

    const gatewayOrder = await response.json() as { id: string; amount: number; currency: string };
    this.logger.log(`Razorpay order created successfully: ${gatewayOrder.id}`);

    try {
      const payment = await this.paymentModel.create({
        orderId: order._id,
        razorpayOrderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        status: 'CREATED',
      });
      this.logger.log(`Payment record created for Razorpay orderId: ${gatewayOrder.id}`);
      return this.checkoutResponse(payment);
    } catch (error: any) {
      if (error?.code === 11000) {
        this.logger.warn(`Duplicate payment record found for orderId: ${orderId}`);
        const duplicatePayment = await this.paymentModel.findOne({ orderId, status: { $in: ['CREATED', 'AUTHORIZED'] } })
          .sort({ createdAt: -1 })
          .exec();

        if (!duplicatePayment) {
          this.logger.error(`No duplicate payment record found for orderId: ${orderId}`);
          throw new BadGatewayException('Unable to retrieve duplicate payment record');
        }

        return this.checkoutResponse(duplicatePayment);
      }
      this.logger.error('Error creating payment record', error.stack);
      throw error;
    }
  }

  async retryPayment(userId: string, orderId: string) {
    await this.orderService.retryPayment(userId, orderId);
    return this.createRazorpayOrder(userId, orderId);
  }

  /**
   * Refund a captured payment before cancelling the order.  The payment row is
   * claimed first so concurrent cancel requests cannot issue a second refund.
   */
  async cancelOrder(userId: string, orderId: string) {
    const order = await this.orderModel.findOne({ _id: orderId, userId }).exec();
    if (!order) throw new ForbiddenException('Order not found');
    if (order.paymentStatus === 'REFUNDED' && order.status === 'CANCELLED') return order;
    if (order.paymentStatus !== 'PAID' || !['PAID', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw new BadRequestException('Only paid or processing orders can be cancelled');
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      { orderId: order._id, razorpayPaymentId: { $exists: true }, status: 'CAPTURED' },
      { $set: { status: 'REFUND_PENDING' } },
      { new: true, sort: { createdAt: -1 } },
    ).exec();
    if (!payment) {
      const refundPending = await this.paymentModel.exists({ orderId: order._id, status: 'REFUND_PENDING' });
      if (refundPending) throw new ConflictException('A refund is already being processed');
      throw new BadRequestException('No captured payment is available to refund');
    }

    let refund: { id: string };
    try {
      refund = await this.razorpay().payments.refund(payment.razorpayPaymentId!, {
        amount: payment.amount,
        notes: { internal_order_id: order.id, reason: 'customer_cancelled' },
      }) as { id: string };
    } catch (error) {
      await this.paymentModel.updateOne({ _id: payment._id, status: 'REFUND_PENDING' }, { $set: { status: 'CAPTURED' } }).exec();
      this.logger.error(`Unable to refund payment ${payment.razorpayPaymentId}`, error);
      throw new BadGatewayException('Unable to process refund; please try again');
    }

    const session = await this.paymentModel.db.startSession();
    let cancelled: OrderDocument | null = null;
    try {
      await session.withTransaction(async () => {
        const current = await this.orderModel.findOne({
          _id: order._id,
          userId,
          paymentStatus: 'PAID',
          status: { $in: ['PAID', 'CONFIRMED', 'PROCESSING'] },
        }).session(session).exec();
        if (!current) throw new ConflictException('Order can no longer be cancelled');
        const completed = await this.paymentModel.updateOne(
          { _id: payment._id, status: 'REFUND_PENDING' },
          { $set: { status: 'REFUNDED', razorpayRefundId: refund.id } },
          { session },
        ).exec();
        if (!completed.modifiedCount) throw new ConflictException('Refund is already being finalized');
        current.status = 'CANCELLED';
        current.paymentStatus = 'REFUNDED';
        cancelled = await current.save({ session });
        await this.orderService.releaseStock(current, session);
      });
    } finally {
      await session.endSession();
    }
    await this.notificationService.sendOrderNotification(cancelled!, 'CANCELLED');
    return cancelled!;
  }

  private razorpay() {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new BadGatewayException('Payment gateway is not configured');
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  private async isCurrentPaymentAttempt(orderId: OrderDocument['_id'], paymentId: PaymentDocument['_id'], session: ClientSession) {
    const current = await this.paymentModel.findOne(
      { orderId },
      { _id: 1 },
      { session, sort: { createdAt: -1 } },
    ).exec();
    return current?._id.equals(paymentId) ?? false;
  }

  private checkoutResponse(payment: PaymentDocument | any) {
    if (!payment) {
      this.logger.error('Invalid payment object passed to checkoutResponse');
      throw new BadRequestException('Invalid payment object');
    }

    this.logger.log(`Returning checkout response for Razorpay orderId: ${payment?.razorpayOrderId}`);

    return {
      key: this.config.get<string>('RAZORPAY_KEY_ID'),
      razorpayOrderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      internalOrderId: payment.orderId
    };
  }

  async handleWebhook(rawBody: Buffer, signature?: string, eventId?: string) {
    this.logger.log('Handling Razorpay webhook');
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret || !signature || !this.signatureIsValid(rawBody, signature, secret)) {
      this.logger.warn('Invalid Razorpay webhook signature');
      throw new ForbiddenException('Invalid Razorpay webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    if (!eventId || !payload.event) {
      this.logger.warn('Malformed Razorpay webhook');
      throw new BadRequestException('Malformed Razorpay webhook');
    }

    const session = await this.paymentModel.db.startSession();
    try {
      let duplicate = false;
      const confirmation = { order: null as OrderDocument | null };
      const failure = { order: null as OrderDocument | null };
      await session.withTransaction(async () => {
        try {
          await this.eventModel.create([{ eventId, event: payload.event }], { session });
        } catch (error: any) {
          if (error?.code === 11000) {
            duplicate = true;
            this.logger.warn(`Duplicate webhook event received: ${eventId}`);
            return;
          }
          throw error;
        }

        const entity = payload.payload?.payment?.entity;
        if (!entity?.order_id) return;

        const payment = await this.paymentModel.findOne({ razorpayOrderId: entity.order_id }).session(session).exec();
        if (!payment) {
          this.logger.warn(`Payment not found for Razorpay orderId: ${entity.order_id}`);
          return;
        }

        const order = await this.orderModel.findById(payment.orderId).session(session).exec();
        if (!order) {
          this.logger.warn(`Order not found for paymentId: ${payment._id}`);
          return;
        }

        if (payload.event === 'payment.captured') {
          this.logger.log(`Payment captured for Razorpay paymentId: ${entity.id}`);
          await this.paymentModel.updateOne(
            { _id: payment._id, status: { $ne: 'CAPTURED' } },
            { status: 'CAPTURED', razorpayPaymentId: entity.id },
            { session },
          ).exec();
          if (!(await this.isCurrentPaymentAttempt(order._id, payment._id, session))) return;
          confirmation.order = await this.orderService.markPaid(order.id, session);
          if (confirmation.order) {
            await this.cartModel.updateOne(
              { userId: order.userId },
              { $set: { items: [] } },
              { session },
            ).exec();
          }
        } else if (payload.event === 'payment.failed') {
          this.logger.log(`Payment failed for Razorpay paymentId: ${entity.id}`);
          const failedPayment = await this.paymentModel.updateOne(
            { _id: payment._id, status: { $ne: 'FAILED' } },
            { status: 'FAILED', razorpayPaymentId: entity.id, failure: entity.error ?? {} },
            { session },
          ).exec();
          // Do not let a duplicate/late failure for an earlier attempt cancel a
          // newer retry that is already awaiting payment.
          if (failedPayment.modifiedCount && await this.isCurrentPaymentAttempt(order._id, payment._id, session)) {
            if (await this.orderService.markPaymentFailed(order, session)) failure.order = order;
          }
        }
      });
      if (confirmation.order) {
        void this.notificationService.sendOrderNotification(confirmation.order, 'PAID');
      }
      if (failure.order) void this.notificationService.sendOrderNotification(failure.order, 'PAYMENT_FAILED');
      return { received: true, duplicate };
    } finally {
      await session.endSession();
    }
  }

  private signatureIsValid(body: Buffer, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const received = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    return (
      received.length === expectedBuffer.length &&
      timingSafeEqual(received, expectedBuffer)
    );
  }
}

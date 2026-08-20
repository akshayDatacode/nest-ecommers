import { BadGatewayException, BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name); // Initialize Logger

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(WebhookEvent.name) private readonly eventModel: Model<WebhookEventDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

    const existing = await this.paymentModel.findOne({ orderId, status: { $in: ['CREATED', 'AUTHORIZED'] } }).sort({ createdAt: -1 }).lean().exec();
    if (existing) {
      this.logger.log(`Existing Razorpay order found for orderId: ${orderId}`);
      return this.checkoutResponse(existing);
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
        return this.checkoutResponse(await this.paymentModel.findOne({ orderId, status: { $in: ['CREATED', 'AUTHORIZED'] } }).sort({ createdAt: -1 }).exec());
      }
      this.logger.error('Error creating payment record', error.stack);
      throw error;
    }
  }

  async retryPayment(userId: string, orderId: string) {
    await this.orderService.retryPayment(userId, orderId);
    return this.createRazorpayOrder(userId, orderId);
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
    this.logger.log(`Returning checkout response for Razorpay orderId: ${payment.razorpayOrderId}`);

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
            await this.orderService.markPaymentFailed(order, session);
          }
        }
      });
      if (confirmation.order) {
        const user = await this.userModel.findById(confirmation.order.userId).select('email').lean().exec();
        if (user) await this.notificationService.sendOrderConfirmation(confirmation.order, user.email);
      }
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

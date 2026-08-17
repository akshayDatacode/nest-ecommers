import { BadGatewayException, BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, WebhookEvent, WebhookEventDocument } from './schemas/payment.schema';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { Cart, CartDocument } from '../cart/schemas/cart.schema';
import { Product, ProductDocument } from '../product/schemas/product.schema';

@Injectable()
export class PaymentService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(WebhookEvent.name) private readonly eventModel: Model<WebhookEventDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  async createRazorpayOrder(userId: string, orderId: string) {
    const order = await this.orderModel.findOne({ _id: orderId, userId }).exec();
    if (!order) throw new ForbiddenException('Order not found');
    if (order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') throw new BadRequestException('Order is not awaiting payment');
    const existing = await this.paymentModel.findOne({ orderId }).lean().exec();
    if (existing) return this.checkoutResponse(existing);
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new BadGatewayException('Payment gateway is not configured');
    const amount = Math.round(order.totalAmount * 100);
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: order.currency, receipt: order.orderNumber, notes: { internal_order_id: order.id } }),
    });
    if (!response.ok) throw new BadGatewayException('Unable to create Razorpay order');
    const gatewayOrder = await response.json() as { id: string; amount: number; currency: string };
    try {
      const payment = await this.paymentModel.create({ orderId: order._id, razorpayOrderId: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency, status: 'CREATED' });
      return this.checkoutResponse(payment);
    } catch (error: any) {
      if (error?.code === 11000) return this.checkoutResponse(await this.paymentModel.findOne({ orderId }).exec());
      throw error;
    }
  }

  private checkoutResponse(payment: PaymentDocument | any) {
    return { key: this.config.get<string>('RAZORPAY_KEY_ID'), razorpayOrderId: payment.razorpayOrderId, amount: payment.amount, currency: payment.currency, internalOrderId: payment.orderId };
  }

  async handleWebhook(rawBody: Buffer, signature?: string) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret || !signature || !this.signatureIsValid(rawBody, signature, secret)) throw new ForbiddenException('Invalid Razorpay webhook signature');
    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    if (!payload.id || !payload.event) throw new BadRequestException('Malformed Razorpay webhook');
    const session = await this.paymentModel.db.startSession();
    try {
      let duplicate = false;
      await session.withTransaction(async () => {
        try { await this.eventModel.create([{ eventId: payload.id, event: payload.event }], { session }); }
        catch (error: any) { if (error?.code === 11000) { duplicate = true; return; } throw error; }
        const entity = payload.payload?.payment?.entity;
        if (!entity?.order_id) return;
        const payment = await this.paymentModel.findOne({ razorpayOrderId: entity.order_id }).session(session).exec();
        if (!payment) return; // acknowledge events not belonging to this merchant/order database
        const order = await this.orderModel.findById(payment.orderId).session(session).exec();
        if (!order) return;
        if (payload.event === 'payment.captured') {
          await this.paymentModel.updateOne({ _id: payment._id, status: { $ne: 'CAPTURED' } }, { status: 'CAPTURED', razorpayPaymentId: entity.id }, { session }).exec();
          const confirmed = await this.orderModel.updateOne({ _id: order._id, status: 'PENDING', paymentStatus: 'PENDING' }, { status: 'CONFIRMED', paymentStatus: 'PAID' }, { session }).exec();
          if (confirmed.modifiedCount) await this.cartModel.updateOne({ userId: order.userId }, { $set: { items: [] } }, { session }).exec();
        } else if (payload.event === 'payment.failed') {
          await this.paymentModel.updateOne({ _id: payment._id }, { status: 'FAILED', razorpayPaymentId: entity.id, failure: entity.error ?? {} }, { session }).exec();
          const cancelled = await this.orderModel.updateOne({ _id: order._id, status: 'PENDING', paymentStatus: 'PENDING' }, { status: 'CANCELLED', paymentStatus: 'FAILED' }, { session }).exec();
          if (cancelled.modifiedCount) for (const item of order.items) await this.productModel.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session }).exec();
        }
      });
      return { received: true, duplicate };
    } finally { await session.endSession(); }
  }

  private signatureIsValid(body: Buffer, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const received = Buffer.from(signature, 'utf8'); const expectedBuffer = Buffer.from(expected, 'utf8');
    return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
  }
}

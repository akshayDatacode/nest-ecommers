import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import { Cart, CartDocument } from '../cart/schemas/cart.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';
import { ProductService } from '../product/product.service';
import { ShippingService } from '../shipping/shipping.service';
import { UpdateShippingDto } from './dto/order.dto';

const PAYMENT_HOLD_MS = 60 * 60 * 1000;

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;
  private readonly logger = new Logger(OrderService.name);
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Address.name) private readonly addressModel: Model<AddressDocument>,
    private readonly productService: ProductService,
    private readonly shippingService: ShippingService,
  ) { }

  onModuleInit() {
    // Each worker may run this; the conditional state transition makes it safe
    // across replicas and guarantees stock is restored at most once.
    void this.runExpirySweep();
    this.expiryTimer = setInterval(() => void this.runExpirySweep(), 60_000);
    this.expiryTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  private async runExpirySweep() {
    try {
      await this.expirePendingOrders();
    } catch (error) {
      this.logger.error('Pending-order expiry sweep failed', error);
    }
  }

  async createFromCart(userId: string, addressId: string, idempotencyKey?: string, shippingPartnerCode?: string) {
    if (idempotencyKey) {
      const existing = await this.orderModel.findOne({ userId, idempotencyKey }).exec();
      if (existing) return existing;
    }
    const session = await this.orderModel.db.startSession();
    try {
      let order: OrderDocument | undefined;
      await session.withTransaction(async () => { order = await this.createInTransaction(userId, addressId, shippingPartnerCode, idempotencyKey, session); });
      return order!;
    } catch (error: any) {
      console.error('Order creation failed:', error);
      if (error?.code === 11000 && idempotencyKey) {
        return this.orderModel.findOne({ userId, idempotencyKey }).exec();
      }
      throw error;
    } finally { await session.endSession(); }
  }

  private async createInTransaction(userId: string, addressId: string, shippingPartnerCode: string | undefined, idempotencyKey: string | undefined, session: ClientSession) {
    // Do not run session-bound operations in parallel. A MongoDB transaction
    // has one active operation per session; concurrent commands can make the
    // server treat a second command as another transaction start.
    const cart = await this.cartModel.findOne({ userId })
      .session(session).lean().exec();
    const address = await this.addressModel.findOne({ _id: addressId, userId })
      .session(session).lean().exec();

    if (!address) throw new NotFoundException('Address not found');
    if (!cart?.items.length) throw new BadRequestException('Cart is empty');

    const items: any[] = [];

    for (const cartItem of cart.items) {
      // Atomic conditional decrement prevents overselling under concurrent checkouts.
      const product = await this.productService.reserveStock(cartItem.productId, cartItem.quantity, session);

      if (!product) throw new ConflictException('One or more items are out of stock');

      items.push({
        productId: cartItem.productId,
        name: product.name,
        unitPrice: product.price,
        quantity: cartItem.quantity,
        lineTotal: product.price * cartItem.quantity
      });
    }

    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    const quantity = items.reduce((total, item) => total + item.quantity, 0);
    const shipping = await this.shippingService.quote(subtotal, quantity, shippingPartnerCode, session);

    return this.orderModel.create([{
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      userId,
      items,
      shippingAddress: {
        recipientName: address.recipientName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country
      },
      subtotal,
      shippingFee: shipping.amount,
      shippingPartnerCode: shipping.code,
      shippingPartnerName: shipping.name,
      courierPartner: shipping.name,
      currency: shipping.currency,
      totalAmount: subtotal + shipping.amount,
      idempotencyKey,
      expiresAt: new Date(Date.now() + PAYMENT_HOLD_MS),
    }], { session }).then(([created]) => created);
  }

  async listForUser(userId: string) {
    return this.orderModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findOwned(userId: string, orderId: string) {
    const order = await this.orderModel.findOne({ _id: orderId, userId }).exec();
    if (!order) throw new NotFoundException('Order not found');

    return order;
  }

  async findById(orderId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateFulfillmentStatus(orderId: string, target: OrderStatus) {
    const order = await this.findById(orderId);
    const allowed: Record<string, OrderStatus[]> = { CONFIRMED: ['PACKED'], PACKED: ['SHIPPED'], SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'], OUT_FOR_DELIVERY: ['DELIVERED'] };

    if (!allowed[order.status]?.includes(target)) throw new BadRequestException(`Cannot move order from ${order.status} to ${target}`);

    order.status = target;

    if (target === 'PACKED') order.packedAt = new Date();
    if (target === 'SHIPPED') order.shippedAt = new Date();
    if (target === 'DELIVERED') order.deliveredAt = new Date();

    return order.save();
  }

  async trackingForUser(userId: string, orderId: string) {
    const order = await this.findOwned(userId, orderId);
    const trackingUrl = order.trackingUrl ?? await this.shippingService.trackingUrl(order.shippingPartnerCode, order.trackingNumber);
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      courierPartner: order.courierPartner,
      trackingNumber: order.trackingNumber,
      trackingUrl,
      events: order.trackingEvents,
    };
  }

  async updateShipping(orderId: string, dto: UpdateShippingDto) {
    const order = await this.findById(orderId);
    if (order.paymentStatus !== 'PAID') throw new BadRequestException('Shipment cannot be updated before payment is captured');
    if (dto.status) {
      const allowed: Record<string, OrderStatus[]> = { PACKED: ['SHIPPED'], SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'], OUT_FOR_DELIVERY: ['DELIVERED'] };
      if (!allowed[order.status]?.includes(dto.status)) throw new BadRequestException(`Cannot move order from ${order.status} to ${dto.status}`);
      order.status = dto.status;
      if (dto.status === 'SHIPPED') order.shippedAt = new Date();
      if (dto.status === 'DELIVERED') order.deliveredAt = new Date();
    }
    if (dto.trackingNumber) order.trackingNumber = dto.trackingNumber;
    if (dto.courierPartner) order.courierPartner = dto.courierPartner;
    if (dto.status || dto.message || dto.location) {
      order.trackingEvents.push({ status: dto.status ?? order.status, message: dto.message, location: dto.location, occurredAt: new Date() });
    }
    order.trackingUrl = await this.shippingService.trackingUrl(order.shippingPartnerCode, order.trackingNumber);
    return order.save();
  }

  async markPaid(orderId: string, session?: ClientSession) {
    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }],
      },
      { $set: { status: 'CONFIRMED', paymentStatus: 'PAID' }, $unset: { expiresAt: 1 } },
      { new: true, session }).exec();
    if (order) {
      for (const item of order.items) await this.productService.confirmReservedStock(item.productId, item.quantity, session);
    }
    return order;
  }

  async markPaymentFailed(order: OrderDocument, session: ClientSession) {
    const changed = await this.orderModel.updateOne(
      { _id: order._id, status: 'PENDING', paymentStatus: 'PENDING' },
      { $set: { status: 'CANCELLED', paymentStatus: 'FAILED' }, $unset: { expiresAt: 1 } },
      { session }).exec();

    if (changed.modifiedCount) {
      await this.releaseStock(order, session);
    }
  }

  async releaseStock(order: Pick<OrderDocument, '_id' | 'items'>, session: ClientSession) {
    for (const item of order.items) await this.productService.releaseReservedStock(item.productId, item.quantity, session);
  }

  async retryPayment(userId: string, orderId: string) {
    const session = await this.orderModel.db.startSession();
    try {
      let order: OrderDocument | null = null;
      await session.withTransaction(async () => {
        const failedOrder = await this.orderModel.findOne({ _id: orderId, userId, status: 'CANCELLED', paymentStatus: 'FAILED' }).session(session).exec();
        if (!failedOrder) throw new BadRequestException('Only failed or expired orders can be retried');
        for (const item of failedOrder.items) {
          const product = await this.productService.reserveStock(item.productId, item.quantity, session);
          if (!product) throw new ConflictException('One or more items are no longer in stock');
        }
        order = await this.orderModel.findByIdAndUpdate(
          failedOrder._id,
          { $set: { status: 'PENDING', paymentStatus: 'PENDING', expiresAt: new Date(Date.now() + PAYMENT_HOLD_MS) } },
          { new: true, session },
        ).exec();
      });
      return order!;
    } finally { await session.endSession(); }
  }

  async expirePendingOrders(now = new Date()) {
    const expired = await this.orderModel.find({ status: 'PENDING', paymentStatus: 'PENDING', expiresAt: { $lte: now } }).select('_id').lean().exec();
    let released = 0;
    for (const candidate of expired) {
      const session = await this.orderModel.db.startSession();
      try {
        await session.withTransaction(async () => {
          const order = await this.orderModel.findOne({ _id: candidate._id, status: 'PENDING', paymentStatus: 'PENDING', expiresAt: { $lte: now } }).session(session).exec();
          if (!order) return;
          await this.markPaymentFailed(order, session);
          released++;
        });
      } finally { await session.endSession(); }
    }
    return { expired: released };
  }
}

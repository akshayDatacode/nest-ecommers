import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import { Cart, CartDocument } from '../cart/schemas/cart.schema';
import { Product, ProductDocument } from '../product/schemas/product.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Address.name) private readonly addressModel: Model<AddressDocument>,
  ) { }

  async createFromCart(userId: string, addressId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.orderModel.findOne({ userId, idempotencyKey }).exec();
      if (existing) return existing;
    }
    const session = await this.orderModel.db.startSession();
    try {
      let order: OrderDocument | undefined;
      await session.withTransaction(async () => { order = await this.createInTransaction(userId, addressId, idempotencyKey, session); });
      return order!;
    } catch (error: any) {
      if (error?.code === 11000 && idempotencyKey) return this.orderModel.findOne({ userId, idempotencyKey }).exec();
      throw error;
    } finally { await session.endSession(); }
  }

  private async createInTransaction(userId: string, addressId: string, idempotencyKey: string | undefined, session: ClientSession) {
    const [cart, address] = await Promise.all([
      this.cartModel.findOne({ userId })
        .session(session).lean().exec(),
      this.addressModel.findOne({ _id: addressId, userId })
        .session(session).lean().exec(),
    ]);

    if (!address) throw new NotFoundException('Address not found');
    if (!cart?.items.length) throw new BadRequestException('Cart is empty');

    const items: any[] = [];

    for (const cartItem of cart.items) {
      // Atomic conditional decrement prevents overselling under concurrent checkouts.
      const product = await this.productModel.findOneAndUpdate(
        { _id: cartItem.productId, stock: { $gte: cartItem.quantity } },
        { $inc: { stock: -cartItem.quantity } }, { new: false, session },
      ).lean().exec();

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
      totalAmount: subtotal,
      idempotencyKey,
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
    const allowed: Record<string, OrderStatus[]> = { CONFIRMED: ['PACKED'], PACKED: ['SHIPPED'], SHIPPED: ['DELIVERED'] };

    if (!allowed[order.status]?.includes(target)) throw new BadRequestException(`Cannot move order from ${order.status} to ${target}`);

    order.status = target;

    if (target === 'PACKED') order.packedAt = new Date();
    if (target === 'SHIPPED') order.shippedAt = new Date();
    if (target === 'DELIVERED') order.deliveredAt = new Date();

    return order.save();
  }

  async confirmPaid(orderId: string, session?: ClientSession) {
    return this.orderModel.findOneAndUpdate(
      { _id: orderId, status: 'PENDING', paymentStatus: 'PENDING' },
      { status: 'CONFIRMED', paymentStatus: 'PAID' },
      { new: true, session }).exec();
  }

  async cancelFailedPayment(order: OrderDocument, session: ClientSession) {
    const changed = await this.orderModel.updateOne(
      { _id: order._id, status: 'PENDING', paymentStatus: 'PENDING' },
      { status: 'CANCELLED', paymentStatus: 'FAILED' },
      { session }).exec();

    if (changed.modifiedCount) {
      for (const item of order.items) {
        await this.productModel.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session }).exec();
      }
    }
  }
}

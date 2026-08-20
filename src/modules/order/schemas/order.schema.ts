import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PAYMENT_FAILED', 'CANCELLED', 'REFUNDED',] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;
}

@Schema({ _id: false })
export class ShippingAddress {
  @Prop({ required: true })
  recipientName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  line1: string;

  @Prop() line2?: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  postalCode: string;

  @Prop({ required: true })
  country: string;
}

@Schema({ _id: false })
export class TrackingEvent {
  @Prop({ required: true }) status: string;
  @Prop() message?: string;
  @Prop() location?: string;
  @Prop({ required: true }) occurredAt: Date;
}

const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);
const TrackingEventSchema = SchemaFactory.createForClass(TrackingEvent);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress: ShippingAddress;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  shippingFee: number;

  @Prop({ required: true, min: 0, default: 0 })
  discount: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, default: 'INR' })
  currency: string;

  @Prop({ type: String, enum: ORDER_STATUSES, default: 'PENDING', index: true })
  status: OrderStatus;

  @Prop() razorpayOrderId?: string;
  @Prop() razorpayPaymentId?: string;
  @Prop() razorpaySignature?: string;
  @Prop() trackingNumber?: string;
  @Prop() courierPartner?: string;
  @Prop() shippingPartnerCode?: string;
  @Prop() shippingPartnerName?: string;
  @Prop() trackingUrl?: string;
  @Prop({ type: [TrackingEventSchema], default: [] }) trackingEvents: TrackingEvent[];

  @Prop({ type: String, enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'], default: 'PENDING' })
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

  @Prop({ index: true, sparse: true })
  idempotencyKey?: string;

  @Prop() packedAt?: Date;

  @Prop() shippedAt?: Date;

  @Prop() deliveredAt?: Date;

  @Prop() expiresAt?: Date; // for PENDING_PAYMENT TTL cleanup
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } });

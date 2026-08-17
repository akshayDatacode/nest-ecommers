import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;
export type WebhookEventDocument = HydratedDocument<WebhookEvent>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, unique: true, index: true }) orderId: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) razorpayOrderId: string;
  @Prop({ unique: true, sparse: true }) razorpayPaymentId?: string;
  @Prop({ required: true }) amount: number; // smallest currency unit (paise)
  @Prop({ required: true, default: 'INR' }) currency: string;
  @Prop({ enum: ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED'], default: 'CREATED', index: true }) status: string;
  @Prop({ type: Object }) failure?: Record<string, unknown>;
}

@Schema({ timestamps: true })
export class WebhookEvent {
  @Prop({ required: true, unique: true }) eventId: string;
  @Prop({ required: true }) event: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

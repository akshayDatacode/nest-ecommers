import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShippingPartnerDocument = HydratedDocument<ShippingPartner>;

@Schema({ timestamps: true })
export class ShippingPartner {
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, min: 0 }) baseCharge: number;
  @Prop({ required: true, min: 0, default: 0 }) perItemCharge: number;
  @Prop({ min: 0 }) freeShippingThreshold?: number;
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: true, index: true }) active: boolean;
  @Prop() trackingUrlTemplate?: string; // Use {{trackingNumber}} as the placeholder.
}

export const ShippingPartnerSchema = SchemaFactory.createForClass(ShippingPartner);

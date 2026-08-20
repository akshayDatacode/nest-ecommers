import { IsIn, IsMongoId, IsOptional, IsString, Length } from 'class-validator';

export class CreateOrderDto {
  @IsMongoId() addressId: string;
  @IsOptional() @IsString() shippingPartnerCode?: string;
}

export class UpdateShippingDto {
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() courierPartner?: string;
  @IsOptional() @IsIn(['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) status?: 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() location?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @Length(4, 20)
  status: string;
}

import { IsMongoId, IsOptional, IsString, Length } from 'class-validator';

export class CreateOrderDto {
  @IsMongoId() addressId: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @Length(4, 20)
  status: string;
}

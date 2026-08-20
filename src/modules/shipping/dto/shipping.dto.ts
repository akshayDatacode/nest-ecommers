import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateShippingPartnerDto {
  @Matches(/^[A-Z0-9_-]+$/) code: string;
  @IsString() name: string;
  @IsNumber() @Min(0) baseCharge: number;
  @IsOptional() @IsNumber() @Min(0) perItemCharge?: number;
  @IsOptional() @IsNumber() @Min(0) freeShippingThreshold?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() trackingUrlTemplate?: string;
}

export class UpdateShippingPartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) baseCharge?: number;
  @IsOptional() @IsNumber() @Min(0) perItemCharge?: number;
  @IsOptional() @IsNumber() @Min(0) freeShippingThreshold?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() trackingUrlTemplate?: string;
}

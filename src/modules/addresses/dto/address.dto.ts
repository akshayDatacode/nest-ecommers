import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpsertAddressDto {
  @IsString() @Length(2, 100) recipientName: string;
  @Matches(/^\+?[1-9]\d{7,14}$/) phone: string;
  @IsString() @Length(3, 200) line1: string;
  @IsOptional() @IsString() @Length(1, 200) line2?: string;
  @IsString() @Length(2, 100) city: string;
  @IsString() @Length(2, 100) state: string;
  @IsString() @Length(3, 20) postalCode: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

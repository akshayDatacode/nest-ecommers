import { IsMongoId } from 'class-validator';
export class CreatePaymentDto { @IsMongoId() orderId: string; }

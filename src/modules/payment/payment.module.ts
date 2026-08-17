import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema, WebhookEvent, WebhookEventSchema } from './schemas/payment.schema';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: WebhookEvent.name, schema: WebhookEventSchema }, { name: Order.name, schema: OrderSchema }, { name: Cart.name, schema: CartSchema }, { name: Product.name, schema: ProductSchema }]), AuthModule],
  providers: [PaymentService],
  controllers: [PaymentController],
})
export class PaymentModule {}

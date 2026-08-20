import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { OrderPaymentController } from './order-payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema, WebhookEvent, WebhookEventSchema } from './schemas/payment.schema';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: WebhookEvent.name, schema: WebhookEventSchema }, { name: Order.name, schema: OrderSchema }, { name: Cart.name, schema: CartSchema }, { name: User.name, schema: UserSchema }]), AuthModule, OrderModule, NotificationModule],
  providers: [PaymentService],
  controllers: [PaymentController, OrderPaymentController],
})
export class PaymentModule {}

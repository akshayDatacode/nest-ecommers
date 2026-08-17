import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { Cart, CartSchema } from '../cart/schemas/cart.schema';
import { Address, AddressSchema } from '../addresses/schemas/address.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Cart.name, schema: CartSchema },
      { name: Address.name, schema: AddressSchema }]),
    AuthModule
  ],
  providers: [OrderService],
  controllers: [OrderController],
  exports: [OrderService, MongooseModule],
})

export class OrderModule { }

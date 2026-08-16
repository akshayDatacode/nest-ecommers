import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]), // Register Product model
    AuthModule, // Import AuthModule to use JwtService and JwtAuthGuard
  ],
  providers: [ProductService],
  controllers: [ProductController]
})
export class ProductModule { }

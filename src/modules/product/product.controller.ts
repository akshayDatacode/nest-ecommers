import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { Product } from './schemas/product.schema';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ManagerGuard } from 'src/common/guards/manager.guard';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  @Get()
  async getAllProducts() {
    return this.productService.getAllProducts();
  }

  @Get(':id')
  async getProductById(@Param('id') productId: string) {
    return this.productService.getProductById(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, ManagerGuard) // Only managers and admins can create products
  async createProduct(@Body() data: Partial<Product>) {
    return this.productService.createProduct(data);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ManagerGuard) // Only managers and admins can update product
  async updateProduct(@Param('id') productId: string, @Body() data: Partial<Product>) {
    return this.productService.updateProduct(productId, data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ManagerGuard) // Only managers and admins can delete products
  async deleteProduct(@Param('id') productId: string) {
    return this.productService.deleteProduct(productId);
  }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) { }

  async getAllProducts() {
    return this.productModel.find().exec();
  }

  async getProductById(productId: string) {
    const product = await this.productModel.findById(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async createProduct(data: Partial<Product>) {
    const product = new this.productModel(data);
    return product.save();
  }

  async updateProduct(productId: string, data: Partial<Product>) {
    const product = await this.productModel.findByIdAndUpdate(productId, data, { new: true }).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async deleteProduct(productId: string) {
    const product = await this.productModel.findByIdAndDelete(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}
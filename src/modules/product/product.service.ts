import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) { }

  /**
   * A reservation is represented by removing units from sellable stock.  This
   * conditional update is deliberately atomic so two checkouts cannot reserve
   * the same last unit.
   */
  async reserveStock(productId: string | Types.ObjectId, quantity: number, session?: ClientSession) {
    return this.productModel.findOneAndUpdate(
      { _id: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: false, session },
    ).exec();
  }

  /** Reserved units are already removed from sellable stock, so confirmation is explicit but idempotent. */
  confirmReservedStock(productId: string | Types.ObjectId, quantity: number, session?: ClientSession) {
    void productId;
    void quantity;
    void session;
    return Promise.resolve();
  }

  async releaseReservedStock(productId: string | Types.ObjectId, quantity: number, session?: ClientSession) {
    await this.productModel.updateOne(
      { _id: productId },
      { $inc: { stock: quantity } },
      { session },
    ).exec();
  }

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

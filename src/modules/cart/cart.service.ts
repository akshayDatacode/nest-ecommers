import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from './schemas/cart.schema';
import { Product, ProductDocument } from '../product/schemas/product.schema';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) { }

  async getCart(userId: string) {
    const cart = await this.cartModel.findOne({ userId }).lean().exec();
    return cart ?? { userId, items: [] };
  }

  async addItem(userId: string, productId: string, quantity: number) {
    const product = await this.productModel.findById(productId).lean().exec();

    if (!product) throw new NotFoundException('Product not found');

    if (product.stock < quantity) throw new BadRequestException('Requested quantity exceeds available stock');

    const cart = await this.cartModel.findOne({ userId }).exec();

    if (!cart) return this.cartModel.create({ userId, items: [{ productId, quantity }] });

    const item = cart.items.find((entry) => entry.productId.toString() === productId);

    if (item) item.quantity += quantity;
    else cart.items.push({ productId: new Types.ObjectId(productId), quantity });
    if (item && product.stock < item.quantity) throw new BadRequestException('Requested quantity exceeds available stock');

    return cart.save();
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    const product = await this.productModel.findById(productId).lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    if (product.stock < quantity) throw new BadRequestException('Requested quantity exceeds available stock');
    const cart = await this.cartModel.findOne({ userId }).exec();
    const item = cart?.items.find((entry) => entry.productId.toString() === productId);
    if (!item) throw new NotFoundException('Cart item not found');
    item.quantity = quantity;
    return cart!.save();
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.cartModel.findOneAndUpdate(
      { userId },
      { $pull: { items: { productId } } },
      { new: true }
    ).exec();

    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  async clear(userId: string) { await this.cartModel.updateOne({ userId }, { $set: { items: [] } }).exec(); }
}

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
    // Fetch the cart for the user
    const cart = await this.cartModel.findOne({ userId }).lean().exec();

    // If the cart is empty, return an empty cart structure
    if (!cart) return { userId, items: [] };

    // Fetch product details for all items in the cart
    const productIds = cart.items.map((item) => item.productId);
    const products = await this.productModel.find({ _id: { $in: productIds } }).lean().exec();

    // Create a map of productId to product details for quick lookup
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    // Merge product details with cart items
    const items = cart.items.map((item) => {
      const product = productMap.get(item.productId.toString());

      // If the product is not found (e.g., deleted), skip the item
      if (!product) return null;

      return {
        productId: product._id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity, // Calculate line total
      };
    }).filter((item) => item !== null); // Remove null items (e.g., deleted products)

    return { userId, items, totalAmount: items.reduce((s, i) => s + i.lineTotal, 0) };
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

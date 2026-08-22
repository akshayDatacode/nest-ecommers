import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
// import { Queue, Worker } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export const ORDER_NOTIFICATION_QUEUE = 'order-notifications';
export type OrderNotificationType = 'PAID' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'PAYMENT_FAILED' | 'CANCELLED';

interface OrderNotificationJob {
  orderId: Types.ObjectId; // MongoDB ObjectId
  type: OrderNotificationType;
}

// --- This code contains Redis queue and workers for queueEmailService
// @Injectable()
// export class NotificationService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(NotificationService.name);
//   private queue?: Queue<OrderNotificationJob>;
//   private worker?: Worker<OrderNotificationJob>;

//   constructor(
//     private readonly mailer: MailerService,
//     private readonly config: ConfigService,
//     @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
//     @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
//   ) {}

//   onModuleInit() {
//     const connection = this.redisConnection();
//     this.queue = new Queue<OrderNotificationJob>(ORDER_NOTIFICATION_QUEUE, { connection });
//     this.worker = new Worker<OrderNotificationJob>(ORDER_NOTIFICATION_QUEUE, (job) => this.deliver(job.data), {
//       connection,
//       concurrency: 5,
//     });
//     this.worker.on('error', (error) => this.logger.error('Notification worker error', error));
//   }

//   async onModuleDestroy() {
//     await this.worker?.close();
//     await this.queue?.close();
//   }

//   /** Enqueue after the transaction commits; this must never delay a webhook response. */
//   async queueOrderNotification(order: OrderDocument, type: OrderNotificationType) {
//     if (!this.queue) {
//       this.logger.warn(`Notification queue is unavailable; skipped ${type} for order ${order.id}`);
//       return;
//     }
//     try {
//       await this.queue.add('order-lifecycle-email', { orderId: order.id, type }, {
//         jobId: `order:${order.id}:${type}`,
//         attempts: 5,
//         backoff: { type: 'exponential', delay: 1_000 },
//         removeOnComplete: { age: 60 * 60 * 24 * 30 },
//         removeOnFail: { age: 60 * 60 * 24 * 90 },
//       });
//     } catch (error) {
//       this.logger.error(`Unable to queue ${type} notification for order ${order.id}`, error);
//     }
//   }

//   private async deliver({ orderId, type }: OrderNotificationJob) {
//     const order = await this.orderModel.findById(orderId).lean().exec();
//     const user = order && await this.userModel.findById(order.userId).select('email').lean().exec();
//     if (!order || !user?.email) return;
//     const content = this.content(type, order);
//     await this.mailer.sendMail({ to: user.email, ...content });
//   }

//   private content(type: OrderNotificationType, order: any) {
//     const details = `<p>Order <strong>${order.orderNumber}</strong></p><p>Total: ${order.currency} ${order.totalAmount}</p>`;
//     const tracking = order.trackingUrl ? `<p><a href="${order.trackingUrl}">Track your order</a></p>` : '';
//     const messages: Record<OrderNotificationType, { subject: string; html: string }> = {
//       PAID: { subject: `Order confirmed: ${order.orderNumber}`, html: `<h1>Thanks for your order</h1>${details}` },
//       SHIPPED: { subject: `Your order has shipped: ${order.orderNumber}`, html: `<h1>Your order is on its way</h1>${details}${tracking}` },
//       OUT_FOR_DELIVERY: { subject: `Out for delivery today: ${order.orderNumber}`, html: `<h1>Your order is arriving today</h1>${details}${tracking}` },
//       DELIVERED: { subject: `Delivered: ${order.orderNumber}`, html: `<h1>Your order was delivered</h1>${details}<p>We'd love to hear what you think.</p>` },
//       PAYMENT_FAILED: { subject: `Complete your payment: ${order.orderNumber}`, html: `<h1>Your payment needs attention</h1>${details}<p><a href="${this.config.get('STORE_URL') ?? ''}/orders/${order._id}/payment">Complete payment</a></p>` },
//       CANCELLED: { subject: `Order cancelled: ${order.orderNumber}`, html: `<h1>Your order has been cancelled and refunded</h1>${details}` },
//     };
//     return messages[type];
//   }

//   private redisConnection() {
//     const redisUrl = this.config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
//     const parsed = new URL(redisUrl);
//     return {
//       host: parsed.hostname,
//       port: Number(parsed.port || 6379),
//       username: parsed.username || undefined,
//       password: parsed.password || undefined,
//       tls: parsed.protocol === 'rediss:' ? {} : undefined,
//       maxRetriesPerRequest: null,
//     };
//   }
// }

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) { }

  /** Send notification directly without queue */
  async sendOrderNotification(order: OrderDocument, type: OrderNotificationType) {
    try {
      const user = order && await this.userModel.findById(order.userId).select('email').lean().exec();

      if (!order || !user?.email) {
        this.logger.warn(`Order or user not found for notification. Order ID: ${order._id}`);
        return;
      }

      // Generate the email content
      const content = this.generateContent(type, order);

      // Send the email
      await this.mailer.sendMail({ to: user.email, ...content });
      this.logger.log(`Notification sent: ${type} for Order ID: ${order._id}`);
    } catch (error) {
      this.logger.error(`Failed to send notification: ${type} for Order ID: ${order._id}`, error.stack);
    }
  }

  /** Generate email content based on notification type */
  private generateContent(type: OrderNotificationType, order: any) {
    const details = `<p>Order <strong>${order.orderNumber}</strong></p><p>Total: ${order.currency} ${order.totalAmount}</p>`;
    const tracking = order.trackingUrl ? `<p><a href="${order.trackingUrl}">Track your order</a></p>` : '';
    const messages: Record<OrderNotificationType, { subject: string; html: string }> = {
      PAID: { subject: `Order confirmed: ${order.orderNumber}`, html: `<h1>Thanks for your order</h1>${details}` },
      SHIPPED: { subject: `Your order has shipped: ${order.orderNumber}`, html: `<h1>Your order is on its way</h1>${details}${tracking}` },
      OUT_FOR_DELIVERY: { subject: `Out for delivery today: ${order.orderNumber}`, html: `<h1>Your order is arriving today</h1>${details}${tracking}` },
      DELIVERED: { subject: `Delivered: ${order.orderNumber}`, html: `<h1>Your order was delivered</h1>${details}<p>We'd love to hear what you think.</p>` },
      PAYMENT_FAILED: { subject: `Complete your payment: ${order.orderNumber}`, html: `<h1>Your payment needs attention</h1>${details}<p><a href="${this.config.get('STORE_URL') ?? ''}/orders/${order._id}/payment">Complete payment</a></p>` },
      CANCELLED: { subject: `Order cancelled: ${order.orderNumber}`, html: `<h1>Your order has been cancelled and refunded</h1>${details}` },
    };
    return messages[type];
  }
}
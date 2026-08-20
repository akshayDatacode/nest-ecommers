import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { OrderDocument } from '../order/schemas/order.schema';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly mailer: MailerService) {}

  async sendOrderConfirmation(order: OrderDocument, email: string) {
    try {
      await this.mailer.sendMail({
        to: email,
        subject: `Order confirmed: ${order.orderNumber}`,
        html: `<h1>Thanks for your order</h1><p>Your order <strong>${order.orderNumber}</strong> has been confirmed.</p><p>Total: ${order.currency} ${order.totalAmount}</p>`,
      });
    } catch (error) {
      // A mail outage must never turn a paid order back into an unpaid order.
      this.logger.error(`Unable to send confirmation for order ${order.id}`, error);
    }
  }
}

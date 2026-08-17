import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from './common/adapter/handlebars.adapter';
import { join } from 'path';
import { ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { CartModule } from './modules/cart/cart.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes the ConfigModule available globally
      envFilePath: '.env', // Explicitly specify the .env file path
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60 * 1000, // 60 seconds
          limit: 10,
        },
      ],
    }),

    MailerModule.forRoot({
      transport: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      defaults: {
        from: process.env.SMTP_FROM,
      },
      template: {
        dir: join(__dirname, '..', 'templates/emails'), // Path to the templates directory
        adapter: new HandlebarsAdapter(), // Use Handlebars as the template engine
        options: {
          strict: true,
        },
      },
    }),

    DatabaseModule,

    AuthModule,
    UsersModule,
    AddressesModule,
    CartModule,
    ProductModule,
    OrderModule,
    PaymentModule,
    NotificationModule,
    AdminModule,
  ],
})
export class AppModule { }

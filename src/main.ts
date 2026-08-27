import cookieParser from "cookie-parser";
import * as dotenv from 'dotenv';
dotenv.config();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';


async function bootstrap() {
  // rawBody is required to verify Razorpay's webhook signature against the
  // exact byte sequence it signed (never against re-serialised JSON).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());  // Use cookie-parser middleware

  // Enable CORS
  app.enableCors({
    origin: 'http://localhost:3000', // Allow requests from this origin
    credentials: true, // Allow cookies and credentials
  });

  await app.listen(process.env.PORT ?? 5000);
}

bootstrap();

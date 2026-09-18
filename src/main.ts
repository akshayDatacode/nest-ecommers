import 'reflect-metadata';
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
  // Allow CORS from all origins
  app.enableCors({
    origin: [
      'http://localhost:3000', // Local frontend
      'https://elanjewels.netlify.app', // Production frontend
    ],
    credentials: true, // Allow cookies and credentials
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // Allowed HTTP methods
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ], // Explicitly specify allowed headers
  });

  const port = process.env.PORT || 5000;

  await app.listen(port, '0.0.0.0');

  console.log(`Application running on port ${port}`);
}

bootstrap();

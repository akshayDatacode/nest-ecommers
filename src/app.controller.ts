import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  getHealth() {
    return {
      success: true,
      message: 'Datacode Ecommerce API is running',
      environment: process.env.NODE_ENV,
    };
  }
}

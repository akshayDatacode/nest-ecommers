import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService
  ) { }

  @Post('razorpay/orders')
  @UseGuards(JwtAuthGuard)
  createOrder(@CurrentUser('sub') userId: string, @Body() dto: CreatePaymentDto) {
    return this.paymentService.createRazorpayOrder(userId, dto.orderId);
  }

  @Post('razorpay/webhook')
  @HttpCode(200)
  webhook(@Req() request: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string) {
    return this.paymentService.handleWebhook(
      request.rawBody ?? Buffer.from(JSON.stringify(request.body)),
      signature,
      eventId,
    );
  }
}

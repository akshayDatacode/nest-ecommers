import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentService } from './payment.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':id/retry-payment')
  retryPayment(@CurrentUser('sub') userId: string, @Param('id') orderId: string) {
    return this.paymentService.retryPayment(userId, orderId);
  }
}

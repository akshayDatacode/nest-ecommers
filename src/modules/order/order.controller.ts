import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOrderDto, UpdateOrderStatusDto, UpdateShippingDto } from './dto/order.dto';
import { OrderService } from './order.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService
  ) { }

  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateOrderDto, @Headers('idempotency-key') key?: string) {
    return this.orderService.createFromCart(userId, dto.addressId, key, dto.shippingPartnerCode);
  }

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.orderService.listForUser(userId);
  }

  @Get(':id')
  get(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.orderService.findOwned(userId, id);
  }

  @Get(':id/tracking')
  tracking(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.orderService.trackingForUser(userId, id);
  }

  @Patch(':id/shipping')
  @UseGuards(AdminGuard)
  updateShipping(@Param('id') id: string, @Body() dto: UpdateShippingDto) {
    return this.orderService.updateShipping(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(AdminGuard)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateFulfillmentStatus(id, dto.status as any);
  }
}

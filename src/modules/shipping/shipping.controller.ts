import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateShippingPartnerDto, UpdateShippingPartnerDto } from './dto/shipping.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping/partners')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) { }

  @Post()
  create(@Body() dto: CreateShippingPartnerDto) {
    return this.shippingService.createPartner(dto);
  }

  @Get()
  list() {
    return this.shippingService.listPartners();
  }

  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateShippingPartnerDto) {
    return this.shippingService.updatePartner(code, dto);
  }
}

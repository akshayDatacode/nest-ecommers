import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ShippingPartner, ShippingPartnerSchema } from './schemas/shipping-partner.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ShippingPartner.name, schema: ShippingPartnerSchema }]), AuthModule],
  providers: [ShippingService],
  controllers: [ShippingController],
  exports: [ShippingService],
})
export class ShippingModule {}

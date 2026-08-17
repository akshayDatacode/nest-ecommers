import { Module } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Address, AddressSchema } from './schemas/address.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Address.name, schema: AddressSchema }
    ]),
    AuthModule
  ],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService, MongooseModule],
})
export class AddressesModule { }

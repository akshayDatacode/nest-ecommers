import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Address, AddressDocument } from './schemas/address.schema';
import { UpsertAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectModel(Address.name) private readonly addressModel: Model<AddressDocument>
  ) { }

  list(userId: string) {
    return this.addressModel.find({ userId })
      .sort({ isDefault: -1, updatedAt: -1 })
      .exec();
  }

  async getOwned(userId: string, addressId: string) {
    const address = await this.addressModel.findOne({ _id: addressId, userId }).lean().exec();
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async create(userId: string, dto: UpsertAddressDto) {
    if (dto.isDefault) await this.addressModel.updateMany({ userId }, { isDefault: false }).exec();
    return this.addressModel.create({ ...dto, userId });
  }

  async update(userId: string, addressId: string, dto: Partial<UpsertAddressDto>) {
    if (dto.isDefault) await this.addressModel.updateMany({ userId, _id: { $ne: addressId } }, { isDefault: false }).exec();
    const address = await this.addressModel.findOneAndUpdate({ _id: addressId, userId }, dto, { new: true, runValidators: true }).exec();
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async remove(userId: string, addressId: string) {
    const address = await this.addressModel.findOneAndDelete({ _id: addressId, userId }).exec();
    if (!address) throw new NotFoundException('Address not found');
    return { deleted: true };
  }
}

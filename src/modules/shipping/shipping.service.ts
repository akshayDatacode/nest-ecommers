import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { ShippingPartner, ShippingPartnerDocument } from './schemas/shipping-partner.schema';
import { CreateShippingPartnerDto, UpdateShippingPartnerDto } from './dto/shipping.dto';

@Injectable()
export class ShippingService {
  constructor(@InjectModel(ShippingPartner.name) private readonly partnerModel: Model<ShippingPartnerDocument>) { }

  async quote(subtotal: number, quantity: number, partnerCode?: string, session?: ClientSession) {
    const filter = partnerCode ? { code: partnerCode.toUpperCase(), active: true } : { active: true };
    const partner = await this.partnerModel.findOne(filter).sort({ baseCharge: 1, perItemCharge: 1 }).session(session ?? null).exec();

    if (!partner) {
      throw new BadRequestException(
        partnerCode
          ? `The selected shipping partner (${partnerCode}) is unavailable. Please choose another partner.`
          : 'No active shipping partner is configured. Please contact support.'
      );
    }

    const amount = partner.freeShippingThreshold !== undefined && Number(subtotal) >= partner.freeShippingThreshold
      ? 0
      : Math.round((partner.baseCharge + partner.perItemCharge * quantity) * 100) / 100;

    return { code: partner.code, name: partner.name, amount, currency: partner.currency };
  }

  async trackingUrl(partnerCode: string | undefined, trackingNumber: string | undefined) {
    if (!partnerCode || !trackingNumber) return undefined;
    const partner = await this.partnerModel.findOne({ code: partnerCode }).select('trackingUrlTemplate').lean().exec();
    return partner?.trackingUrlTemplate?.replace('{{trackingNumber}}', encodeURIComponent(trackingNumber));
  }

  createPartner(dto: CreateShippingPartnerDto) {
    return this.partnerModel.create({ ...dto, code: dto.code.toUpperCase() });
  }

  listPartners() { return this.partnerModel.find().sort({ name: 1 }).exec(); }

  async updatePartner(code: string, dto: UpdateShippingPartnerDto) {
    const partner = await this.partnerModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      dto,
      { returnDocument: 'after' } // Use returnDocument instead of new
    ).exec();

    if (!partner) throw new NotFoundException('Shipping partner not found');
    return partner;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Otp } from './schemas/otp.schema';
import { TwilioVerifyService } from '../auth/twilio-verify.service';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    private readonly twilioVerifyService: TwilioVerifyService, // Use existing Twilio service
  ) { }

  // Generate a 6-digit OTP
  async generateOtp(): Promise<string> {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Store OTP in the database with expiration
  async storeOtp(phoneNumber: string, otp: string, ttl = 300): Promise<void> {
    const expiresAt = new Date(Date.now() + ttl * 1000); // Set expiration time
    await this.otpModel.create({ phoneNumber, otp, expiresAt });
  }

  // Send OTP using the existing TwilioVerifyService
  async sendOtp(phoneNumber: string): Promise<void> {
    const otp = await this.generateOtp(); // Generate OTP
    console.log("otp", otp)
    await this.storeOtp(phoneNumber, otp); // Store OTP in DB
    await this.twilioVerifyService.sendOtp(phoneNumber, otp); // Send OTP via SMS
  }

  // Validate OTP from the database
  async validateOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const record = await this.otpModel.findOne({ phoneNumber, otp }).exec();

    if (!record) {
      return false; // OTP not found
    }

    if (record.expiresAt < new Date()) {
      await this.otpModel.deleteOne({ _id: record._id }).exec(); // Delete expired OTP
      return false; // OTP expired
    }

    await this.otpModel.deleteOne({ _id: record._id }).exec(); // Delete OTP after successful validation
    return true;
  }
}
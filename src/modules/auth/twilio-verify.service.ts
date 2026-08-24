import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

@Injectable()
export class TwilioVerifyService {
  private readonly client: Twilio.Twilio;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.client = Twilio(accountSid, authToken);
  }

  // Send OTP via SMS
  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    const message = `Your verification code is ${otp}`;

    console.log("otp", otp)
    console.log(
      "client", this.client,
      this.configService.get<string>('TWILIO_ACCOUNT_SID'),
      this.configService.get<string>('TWILIO_PHONE_NUMBER'),
      this.configService.get<string>('TWILIO_AUTH_TOKEN')
    )
    await this.client.messages.create({
      body: "sms_2fa",
      from: this.configService.get<string>('TWILIO_PHONE_NUMBER'),
      to: phoneNumber,
    });
  }
}
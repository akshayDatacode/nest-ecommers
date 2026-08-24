import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { TwilioVerifyService } from '../auth/twilio-verify.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }])],
  providers: [OtpService, TwilioVerifyService],
  exports: [OtpService], // Export OtpService
})
export class OtpModule {}
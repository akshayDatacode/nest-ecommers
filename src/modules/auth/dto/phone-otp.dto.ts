import { IsIn, IsString, Matches } from 'class-validator';

const E164_PHONE_NUMBER = /^\+[1-9]\d{7,14}$/;

export class SendOtpDto {
  @IsString()
  @Matches(E164_PHONE_NUMBER, {
    message: 'phoneNumber must be a valid E.164 phone number (for example, +14155552671)',
  })
  phoneNumber: string;
}

export class VerifyOtpDto extends SendOtpDto {
  @IsString()
  @Matches(/^\d{4,10}$/, {
    message: 'code must be the verification code sent to your phone',
  })
  code: string;
}

export class SendOtpWithChannelDto extends SendOtpDto {
  @IsIn(['sms'])
  channel: 'sms' = 'sms';
}

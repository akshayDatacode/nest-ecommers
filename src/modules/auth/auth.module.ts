import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwilioVerifyService } from './twilio-verify.service';
import { UsersService } from '../users/users.service';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),

    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: '15m',
      },
    }),

    OtpModule
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    UsersService,
    TwilioVerifyService,
  ],

  exports: [
    JwtModule,
    AuthService,
  ],
})

export class AuthModule { }

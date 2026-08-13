import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    forwardRef(() => UsersModule),

    JwtModule.register({
      secret: (() => {
        console.log('JWT_ACCESS_SECRET:', process.env.JWT_ACCESS_SECRET); // Debug log
        return process.env.JWT_ACCESS_SECRET;
      })(),
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
  ],

  exports: [
    JwtModule,
    AuthService,
  ],
})

export class AuthModule { }
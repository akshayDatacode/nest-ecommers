import {
  Body,
  Controller,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';

import { AuthService } from './auth.service';

import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) { }

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(
      dto.name,
      dto.email,
      dto.password,
    );
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(
      dto.email,
      dto.password,
    );
  }

  @Post('send-verification-email')
  async sendVerificationEmail(@Body('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.sendVerificationEmail(user._id, email);
    return { message: 'Verification email sent' };
  }

  @Post('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.usersService.verifyEmail(token);
  }
}
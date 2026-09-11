import {
  Body,
  Controller,
  NotFoundException,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express'; // Import Response from express
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/phone-otp.dto';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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
      dto.role,
    );
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response,) {

    const { accessToken, refreshToken, user } = await this.authService.login(
      dto.email,
      dto.password,
    )

    // Set HTTP-only cookies
    this.setAuthCookies(response, accessToken, refreshToken);

    return { accessToken, refreshToken, user };
  }

  @Post('validate')
  async validateToken(
    @Res({ passthrough: true }) response: Response,
    @Body('token') token?: string,
    @Req() request?: any,
  ) {
    try {
      const payload = await this.authService.validateToken(token, request);
      return { valid: true, payload };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('otp/send')
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  sendLoginOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendLoginOtp(dto.phoneNumber);
  }

  @Post('otp/verify')
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  verifyLoginOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyLoginOtp(dto.phoneNumber, dto.code);
  }

  @Post('phone/send-verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  sendPhoneEnrollmentOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: SendOtpDto,
  ) {
    return this.authService.sendPhoneEnrollmentOtp(userId, dto.phoneNumber);
  }

  @Post('phone/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  verifyPhoneEnrollmentOtp(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyOtpDto,
  ) {
    return this.authService.verifyPhoneEnrollmentOtp(userId, dto.phoneNumber, dto.code);
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
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

  @Throttle({
    default: {
      limit: 5,
      ttl: 60 * 1000,
    },
  }) // Allow 5 requests per minute
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.usersService.forgotPassword(email);
  }

  @Post('reset-password')
  async resetPassword(
    @Query('token') token: string,
    @Body('password') password: string,
  ) {
    return this.usersService.resetPassword(token, password);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser('sub') userId: string, // Extract user ID from the JWT payload
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.usersService.changePassword(userId, currentPassword, newPassword);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth/refresh',
    });
  }
}

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';

import {
  JwtService,
} from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
  ) { }

  async signup(
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'manager' | 'user'
  ) {
    const user =
      await this.usersService.createUser(
        name,
        email,
        password,
        role,
      );

    return this.generateAccessToken(user);
  }

  async login(
    email: string,
    password: string,
  ) {
    const user =
      await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordValid =
      await bcrypt.compare(
        password,
        user.password,
      );

    if (!passwordValid) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is inactive',
      );
    }

    return this.generateAccessToken(user);
  }

  async refreshToken(oldRefreshToken: string) {
    try {

      // Validate the old refresh token
      const payload = this.jwtService.verify(oldRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user?.refreshToken || !await bcrypt.compare(oldRefreshToken, user.refreshToken)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const newAccessToken = this.jwtService.sign(
        { sub: user._id.toString(), email: user.email, role: user.role },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '59m' },
      );

      const newRefreshToken = this.jwtService.sign(
        { sub: user._id.toString() },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
      );

      // Update the refresh token in the database
      await this.storeRefreshToken(user._id.toString(), newRefreshToken);

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Revoke the refresh token
    let refreshToken = "";
    // Update the refresh token in the database
    await this.usersService.updateRefreshToken(user._id, refreshToken);

    return { message: 'Logged out successfully' };
  }

  private async generateAccessToken(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role, // Include the role in the payload
    };

    // Generate access token
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '59m', // Access token expires in 15 minutes
    });

    // Generate refresh token
    const refreshToken = await this.jwtService.signAsync(
      payload,
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d', // Refresh token expires in 7 days
      },
    );

    // Save the refresh token in the database
    // Update the refresh token in the database
    await this.storeRefreshToken(user._id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        phoneVerified: user.phoneVerified,
      },
    };
  }

  // Send OTP for login
  async sendLoginOtp(phoneNumber: string): Promise<{ message: string }> {
    const user = await this.usersService.findByPhoneNumber(phoneNumber);

    if (user?.isActive && user.phoneVerified) {
      console.log("d", )
      await this.otpService.sendOtp(phoneNumber); // Use OtpService to send OTP
    }

    return { message: 'If this phone number is eligible, a verification code has been sent.' };
  }

  // Verify OTP for login
  async verifyLoginOtp(phoneNumber: string, code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByPhoneNumber(phoneNumber);
    const isValid = await this.otpService.validateOtp(phoneNumber, code); // Validate OTP

    if (!isValid || !user || !user.isActive || !user.phoneVerified) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // Generate JWT tokens
    // Reuse the existing generateAccessToken method to generate tokens
    return this.generateAccessToken(user);
  }

  // Send OTP for phone enrollment
  async sendPhoneEnrollmentOtp(userId: string, phoneNumber: string): Promise<{ message: string }> {
    const existingUser = await this.usersService.findByPhoneNumber(phoneNumber);
    if (existingUser && existingUser._id.toString() !== userId) {
      throw new ConflictException('This phone number is already in use');
    }

    await this.otpService.sendOtp(phoneNumber); // Use OtpService to send OTP
    return { message: 'Verification code sent to phone number.' };
  }

  // Verify OTP for phone enrollment
  async verifyPhoneEnrollmentOtp(userId: string, phoneNumber: string, code: string): Promise<{ message: string; phoneNumber: string }> {
    const isValid = await this.otpService.validateOtp(phoneNumber, code); // Validate OTP
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const existingUser = await this.usersService.findByPhoneNumber(phoneNumber);
    if (existingUser && existingUser._id.toString() !== userId) {
      throw new ConflictException('This phone number is already in use');
    }

    const user = await this.usersService.setVerifiedPhoneNumber(userId, phoneNumber);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { message: 'Phone number verified successfully', phoneNumber: user.phoneNumber || "" };
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    await this.usersService.updateRefreshToken(userId, await bcrypt.hash(refreshToken, 12));
  }
}

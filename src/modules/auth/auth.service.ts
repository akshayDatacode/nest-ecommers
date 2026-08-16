import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  JwtService,
} from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,

    private readonly jwtService: JwtService,
  ) { }

  async signup(
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'manager' | 'user'
  ) {
    const hashedPassword = await bcrypt.hash(
      password,
      12,
    );

    const user =
      await this.usersService.createUser(
        name,
        email,
        hashedPassword,
        role,
      );

    return this.generateAccessToken(user);
  }

  async login(
    email: string,
    password: string,
  ) {
    console.log("email from login", email)
    console.log("email from password", password)
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

      if (!user || user.refreshToken !== oldRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const newAccessToken = this.jwtService.sign(
        { sub: user._id.toString(), email: user.email, role: user.role },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
      );

      const newRefreshToken = this.jwtService.sign(
        { sub: user._id.toString() },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
      );

      // Update the refresh token in the database
      await this.usersService.updateRefreshToken(user._id, newRefreshToken);

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
      expiresIn: '15m', // Access token expires in 15 minutes
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
    await this.usersService.updateRefreshToken(user._id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    };
  }
}
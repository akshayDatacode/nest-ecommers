import {
  Injectable,
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

  private async generateAccessToken(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
    };

    const accessToken =
      await this.jwtService.signAsync(payload);

    return {
      accessToken,

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }
}
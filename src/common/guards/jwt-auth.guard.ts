import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class JwtAuthGuard
  implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
  ) { }

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest();

    const authorization =
      request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException(
        'Authorization token is required',
      );
    }

    const [type, token] =
      authorization.split(' ');

    if (
      type !== 'Bearer' ||
      !token
    ) {
      throw new UnauthorizedException(
        'Invalid authorization format',
      );
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthUser>(
          token,
        );

      if (!payload.sub) {
        throw new UnauthorizedException(
          'Invalid token payload',
        );
      }

      request.user = payload;

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid or expired token',
      );
    }
  }
}
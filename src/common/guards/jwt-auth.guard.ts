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

    // Check for the token in the Authorization header
    const authorization = request.headers.authorization;
    let token: string | undefined;

    if (authorization) {
      const [type, authToken] = authorization.split(' ');

      if (type === 'Bearer' && authToken) {
        token = authToken;
      }
    }

    // If no token in the header, check for the token in cookies
    if (!token) {
      token = request.cookies?.access_token; // Check for the access_token cookie
    }

    if (!token) {
      throw new UnauthorizedException('Authorization token is required');
    }

    try {
      // Verify the token
      const payload =
        await this.jwtService.verifyAsync<AuthUser>(
          token,
        );

      if (!payload.sub) {
        throw new UnauthorizedException(
          'Invalid authorization token payload',
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
        'Invalid or expired authorization token',
      );
    }
  }
}
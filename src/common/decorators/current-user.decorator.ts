import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
  async (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const jwtService = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }); // Create a JwtService instance

    const token = request.cookies?.access_token; // Extract token from cookies

    if (!token) {
      return undefined; // No token, return undefined
    }

    try {
      // Verify the token
      const payload = await jwtService.verifyAsync<AuthUser>(token);

      // Return the requested property or the entire payload
      return data ? payload?.[data] : payload;
    } catch (error) {
      // If token is invalid or expired, return undefined
      return undefined;
    }
  },
);
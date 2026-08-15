import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // This is the JWT payload added by the JwtAuthGuard

    return data ? user?.[data] : user; // Extract the specific field (e.g., 'sub') or return the entire payload
  },
);
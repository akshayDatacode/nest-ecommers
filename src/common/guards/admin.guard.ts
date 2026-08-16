import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Extracted from JwtAuthGuard

    if (user.role !== 'admin') {
      throw new ForbiddenException('Access denied: Admins only');
    }

    return true;
  }
}
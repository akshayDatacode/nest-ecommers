import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class ManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Extracted from JwtAuthGuard

    if (user.role !== 'manager' && user.role !== 'admin') {
      throw new ForbiddenException('Access denied: Managers or Admins only');
    }

    return true;
  }
}
import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from 'src/common/interfaces/auth-user.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AdminGuard } from 'src/common/guards/admin.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) { }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.findById(
      user.sub,
    );
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, AdminGuard) // Only admins can fetch all users
  async getAllUsers() {
    return this.usersService.findAll();
  }
}
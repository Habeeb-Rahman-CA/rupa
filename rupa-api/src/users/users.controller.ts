import {
  Controller,
  Get,
  UseGuards,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get('me')
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@User() user: Express.User & { id: string }) {
    const found = await this.usersService.findById(user.id);
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return { id: found.id, email: found.email, createdAt: found.createdAt };
  }
}

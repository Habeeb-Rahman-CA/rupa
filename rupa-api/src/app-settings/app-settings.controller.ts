import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service.js';
import {
  UpdateAppSettingsDto,
  AppSettingsResponseDto,
} from './dto/app-settings.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../auth/decorators/user.decorator.js';

@ApiTags('app-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('app-settings')
export class AppSettingsController {
  constructor(
    @Inject(AppSettingsService)
    private readonly appSettingsService: AppSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get AI provider settings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Settings row (all fields null when unset)', type: AppSettingsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSettings(
    @User() user: Express.User & { id: string },
  ): Promise<AppSettingsResponseDto> {
    return this.appSettingsService.getSettings(user.id);
  }

  @Patch()
  // `expectedType` is required: Vitest (esbuild) does not emit
  // `design:paramtypes`, so the global ValidationPipe cannot infer the DTO
  // class from `@Body()` and would silently skip validation. This mirrors
  // the pattern used by AuthController/CategoriesController.
  @UsePipes(
    new ValidationPipe({
      expectedType: UpdateAppSettingsDto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary:
      'Create or partially update AI provider settings (only fields present in the body are written)',
  })
  @ApiResponse({ status: 200, description: 'Updated settings', type: AppSettingsResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateSettings(
    @Body() dto: UpdateAppSettingsDto,
    @User() user: Express.User & { id: string },
  ): Promise<AppSettingsResponseDto> {
    return this.appSettingsService.updateSettings(user.id, dto);
  }
}

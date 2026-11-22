import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UsePipes,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import * as crypto from 'crypto';
import { AuthService } from './auth.service.js';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  LogoutDto,
  UserProfileDto,
} from './dto/auth.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { User } from './decorators/user.decorator.js';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './guards/csrf.guard.js';
import { getCookie } from '../common/cookies.js';

interface AuthBody {
  userId: string;
  email: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      expectedType: RegisterDto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthBody> {
    const { tokens, user } = await this.authService.register(dto);
    this.setAuthCookies(response, tokens);
    return { userId: user.id, email: user.email };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      expectedType: LoginDto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({ summary: 'Login user and return access/refresh tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthBody> {
    const { tokens, user } = await this.authService.login(dto);
    this.setAuthCookies(response, tokens);
    return { userId: user.id, email: user.email };
  }

  @Post('refresh')
  @UseGuards(CsrfGuard)
  @UsePipes(
    new ValidationPipe({
      expectedType: RefreshDto,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 403, description: 'CSRF token mismatch' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthBody> {
    const refreshToken = dto.refreshToken || getCookie(req, 'refresh_token');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const { tokens, user } = await this.authService.refresh({ refreshToken });
    this.setAuthCookies(response, tokens);
    return { userId: user.id, email: user.email };
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const refreshToken = getCookie(req, 'refresh_token');
    if (refreshToken) {
      await this.authService.logout({ refreshToken });
    }

    this.clearAuthCookies(response);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'User profile', type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@User() user: Express.User & { id: string }): Promise<UserProfileDto> {
    const profile = await this.authService.getProfile(user.id);
    return profile;
  }

  private setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }): void {
    const isProduction = this.configService.get<string>('app.nodeEnv') === 'production';
    const sameSite = this.configService.get<string>('app.cookieSameSite') || 'lax';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: sameSite as 'lax' | 'strict' | 'none',
      path: '/',
      domain: this.configService.get<string>('app.cookieDomain') || undefined,
    };

    response.cookie('access_token', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refresh_token', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    response.cookie('csrf_token', this.generateCsrfToken(), {
      httpOnly: false,
      secure: isProduction,
      sameSite: sameSite as 'lax' | 'strict' | 'none',
      path: '/',
      domain: this.configService.get<string>('app.cookieDomain') || undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(response: Response): void {
    response.clearCookie('access_token', { path: '/' });
    response.clearCookie('refresh_token', { path: '/' });
    response.clearCookie('csrf_token', { path: '/' });
  }

  private generateCsrfToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number or special character',
  })
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsNotEmpty()
  password: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'refresh-token-string', required: false })
  @IsOptional()
  refreshToken?: string;
}

export class LogoutDto {
  @ApiProperty({ example: 'refresh-token-string', required: false })
  @IsOptional()
  refreshToken?: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'access-jwt-token' })
  accessToken: string;

  @ApiProperty({ example: 'refresh-token-string' })
  refreshToken: string;

  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;
}

export class UserProfileDto {
  @ApiProperty({ example: 'user-uuid' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: '2026-11-19T10:00:00Z' })
  createdAt: Date;
}

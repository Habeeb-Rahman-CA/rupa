import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  LogoutDto,
} from './dto/auth.dto.js';
import type { Tokens } from './interfaces/jwt-payload.interface.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';
import * as crypto from 'crypto';

const SALT_ROUNDS = 12;

interface AuthResult {
  tokens: Tokens;
  user: { id: string; email: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
    });
    await this.userRepository.save(user);

    const tokens = await this.generateTokens(user);
    return { tokens, user: { id: user.id, email: user.email } };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'passwordHash'],
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user);
    return { tokens, user: { id: user.id, email: user.email } };
  }

  async refresh(dto: RefreshDto): Promise<AuthResult> {
    const refreshToken = dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret')!,
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const storedToken = await this.refreshTokenRepository.findOne({
      where: { jti: payload.jti, userId: payload.sub, revokedAt: IsNull() },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenIsValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!tokenIsValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = storedToken.user;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      storedToken.revokedAt = new Date();
      await queryRunner.manager.save(storedToken);

      const tokens = await this.generateTokens(user);

      await queryRunner.commitTransaction();
      return { tokens, user: { id: user.id, email: user.email } };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async logout(dto: LogoutDto): Promise<void> {
    const refreshToken = dto.refreshToken;
    if (!refreshToken) {
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret')!,
      }) as JwtPayload;
    } catch {
      return;
    }

    if (payload.type !== 'refresh' || !payload.jti) {
      return;
    }

    const storedToken = await this.refreshTokenRepository.findOne({
      where: { jti: payload.jti, userId: payload.sub, revokedAt: IsNull() },
    });

    if (storedToken) {
      storedToken.revokedAt = new Date();
      await this.refreshTokenRepository.save(storedToken);
    }
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async validateUser(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'createdAt'],
    });
    return user || null;
  }

  async getProfile(userId: string): Promise<{ id: string; email: string; createdAt: Date }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'createdAt'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }

  private async generateTokens(user: User): Promise<Tokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret')!,
      expiresIn: this.configService.get<string>('jwt.accessExpiration') as any,
    });

    const jti = crypto.randomUUID();
    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      jti,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret')!,
      expiresIn: this.configService.get<string>('jwt.refreshExpiration') as any,
    });

    // Store hash of refresh token (never plaintext)
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    const refreshTokenEntity = this.refreshTokenRepository.create({
      jti,
      tokenHash: refreshTokenHash,
      userId: user.id,
      user,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    return { accessToken, refreshToken };
  }
}

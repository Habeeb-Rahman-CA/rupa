import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { AuthService } from '../auth.service.js';
import { getCookie } from '../../common/cookies.js';

const accessTokenCookieName = 'access_token';

const extractJwtFromRequest = (request: Request): string | null => {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
  if (fromHeader) {
    return fromHeader;
  }
  return (getCookie(request, accessTokenCookieName) as string | null) ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromRequest]),
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}

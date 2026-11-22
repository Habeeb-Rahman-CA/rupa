import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';

export const RefreshTokenCookie = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.cookies?.[REFRESH_TOKEN_COOKIE];
  },
);

export const AccessTokenCookie = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.cookies?.[ACCESS_TOKEN_COOKIE];
  },
);

export const CsrfToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.cookies?.[CSRF_TOKEN_COOKIE] || request.headers['x-xsrf-token'];
  },
);

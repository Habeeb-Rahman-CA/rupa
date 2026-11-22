export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  jti?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

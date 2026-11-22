import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getCookie } from '../../common/cookies.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-xsrf-token';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (!STATE_CHANGING_METHODS.has(request.method)) {
      return true;
    }

    const cookieCsrf = getCookie(request, CSRF_COOKIE);
    if (!cookieCsrf) {
      return true;
    }

    const headerCsrf = (request.headers[CSRF_HEADER] as string | undefined) ?? '';
    if (!headerCsrf || headerCsrf !== cookieCsrf) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}

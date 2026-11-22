import { Request } from 'express';

export function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie || '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(
    new RegExp('(?:^|;\\s*)' + escapedName + '=([^;]*)'),
  );
  return match ? match[1] : undefined;
}

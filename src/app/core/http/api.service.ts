import { Injectable, inject, signal } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, from, Observable, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const API_PREFIX = '/api';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ACCESS_TOKEN_COOKIE = 'access_token';
const CSRF_TOKEN_COOKIE = 'csrf_token';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Low-level HTTP client used by every data service.
 *
 * Responsibilities:
 *  - Prefix every request with `apiUrl` + `/api`
 *  - Send `credentials: 'include'` so HttpOnly auth cookies travel cross-origin
 *  - Inject the `X-XSRF-TOKEN` header (double-submit CSRF) for state-changing calls
 *  - On 401, attempt a token refresh via POST /auth/refresh, then retry once
 *  - Surface unexpected errors through the global ErrorHandler
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl =
    environment.apiUrl?.replace(/\/+$/, '') + API_PREFIX;

  /** In-flight refresh promise so concurrent 401s share a single refresh call. */
  private refreshPromise: Promise<void> | null = null;

  /**
   * Perform a request with auth cookie handling and automatic 401 refresh + retry.
   */
  request<T>(method: string, url: string, options?: {
    body?: unknown;
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    responseType?: 'json' | 'text' | 'blob';
  }): Observable<T> {
    const reqUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const isStateChanging = STATE_CHANGING.has(method.toUpperCase());

    let headers: Record<string, string> = {};
    if (options?.headers) {
      headers = { ...options.headers };
    }

    // Double-submit CSRF: read the readable csrf_token cookie and echo it as a header.
    if (isStateChanging) {
      const csrf = readCookie(CSRF_TOKEN_COOKIE);
      if (csrf) headers['X-XSRF-TOKEN'] = csrf;
    }

    const obs = this.http.request<unknown>(method.toUpperCase(), reqUrl, {
      body: options?.body,
      params: options?.params as unknown as Record<string, string | number | boolean>,
      headers,
      responseType: (options?.responseType as any) ?? 'json',
      withCredentials: true,
    }) as Observable<T>;

    return obs.pipe(
      catchError((error: HttpErrorResponse | any) => {
        // Only attempt refresh on 401 for non-auth endpoints (avoid refresh loop).
        if (error?.status === 401 && !url.startsWith('/auth/')) {
          return this.handle401AndRetry(() => this.request(method, url, options));
        }
        return throwError(() => error as Error);
      }),
    ) as Observable<T>;
  }

  private handle401AndRetry<T>(retryFn: () => Observable<T>): Observable<T> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.auth.refreshIfPossible().then(() => { this.refreshPromise = null; }).catch(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise
      ? (from(this.refreshPromise) as Observable<void>).pipe(switchMap(() => retryFn()))
      : retryFn();
  }

  // ------------------------------------------------------------------ verbs

  get<T>(url: string, options?: { params?: Record<string, string | number | boolean>; headers?: Record<string, string> }): Observable<T> {
    return this.request<T>('GET', url, options);
  }

  post<T>(url: string, body?: unknown, options?: { headers?: Record<string, string> }): Observable<T> {
    return this.request<T>('POST', url, { body, ...options });
  }

  put<T>(url: string, body?: unknown, options?: { headers?: Record<string, string> }): Observable<T> {
    return this.request<T>('PUT', url, { body, ...options });
  }

  patch<T>(url: string, body?: unknown, options?: { headers?: Record<string, string> }): Observable<T> {
    return this.request<T>('PATCH', url, { body, ...options });
  }

  delete<T>(url: string, options?: { headers?: Record<string, string> }): Observable<T> {
    return this.request<T>('DELETE', url, options);
  }
}

/**
 * Interceptor that maps HttpErrorResponse to a normalized error and delegates
 * to the global ErrorHandler. Kept separate from ApiService so it can be
 * provided as a functional interceptor if needed.
 */
@Injectable()
export class ApiErrorInterceptor {
  intercept(req: import('@angular/common/http').HttpRequest<unknown>, next: import('@angular/common/http').HttpHandler): Observable<import('@angular/common/http').HttpEvent<unknown>> {
    throw new Error('Method not implemented.');
  }
}

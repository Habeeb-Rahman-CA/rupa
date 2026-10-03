import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { signal } from '@angular/core';

describe('authGuard', () => {
  let mockAuthService: Partial<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  const isAuthSignal = signal(false);

  beforeEach(() => {
    isAuthSignal.set(false);
    mockAuthService = {
      whenReady: Promise.resolve(),
      isAuthenticated: isAuthSignal,
    };

    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.callFake((commands: any[], extras: any) => {
      return { commands, extras } as unknown as UrlTree;
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('should allow navigation if user is authenticated', async () => {
    isAuthSignal.set(true);
    const mockRoute = {} as ActivatedRouteSnapshot;
    const mockState = { url: '/transactions' } as RouterStateSnapshot;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState)
    );

    expect(result).toBe(true);
  });

  it('should redirect to /login with returnUrl query param if user is not authenticated', async () => {
    isAuthSignal.set(false);
    const mockRoute = {} as ActivatedRouteSnapshot;
    const mockState = { url: '/bank-accounts?filter=active' } as RouterStateSnapshot;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState)
    );

    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/bank-accounts?filter=active' },
    });
    expect(result).toEqual({
      commands: ['/login'],
      extras: { queryParams: { returnUrl: '/bank-accounts?filter=active' } },
    } as any);
  });
});

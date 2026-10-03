import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      client: {
        auth: {
          getSession: jasmine.createSpy().and.resolveTo({ data: { session: { user: { id: 'u1' } } }, error: null }),
          refreshSession: jasmine.createSpy().and.resolveTo({ data: null, error: { message: 'Failed to fetch', status: 0 } }),
          onAuthStateChange: jasmine.createSpy().and.returnValue({ data: { subscription: { unsubscribe: jasmine.createSpy() } } }),
          signOut: jasmine.createSpy().and.resolveTo({ error: null }),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should NOT sign out when session refresh fails due to network offline / fetch error', async () => {
    await service.whenReady;
    expect(service.isAuthenticated()).toBe(true);

    // Trigger refreshIfPossible with network error mock
    await service.refreshIfPossible();

    // Session should remain active!
    expect(service.isAuthenticated()).toBe(true);
    expect(mockSupabase.client.auth.signOut).not.toHaveBeenCalled();
  });

  it('should sign out when session refresh fails due to invalid/revoked token (e.g. 400 invalid_grant)', async () => {
    await service.whenReady;
    expect(service.isAuthenticated()).toBe(true);

    mockSupabase.client.auth.refreshSession.and.resolveTo({
      data: null,
      error: { message: 'Invalid Refresh Token', status: 400 },
    });

    await service.refreshIfPossible();

    expect(mockSupabase.client.auth.signOut).toHaveBeenCalled();
  });
});

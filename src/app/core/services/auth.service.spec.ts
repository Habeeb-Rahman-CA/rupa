import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ApiService } from '../http/api.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      get: jasmine.createSpy('get').and.returnValue({}),
      post: jasmine.createSpy('post').and.returnValue({}),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiService, useValue: mockApi },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should not be authenticated when /auth/me fails', async () => {
    mockApi.get.and.returnValue({
      pipe: () => ({
        subscribe: () => {},
      }),
    } as any);
    // Force an error
    mockApi.get.and.throwError({ status: 401 });

    await service.whenReady;
    expect(service.isAuthenticated()).toBe(false);
  });
});

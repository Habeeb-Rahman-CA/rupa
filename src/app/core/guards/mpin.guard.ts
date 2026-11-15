import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MpinService } from '../services/mpin.service';

/**
 * Keeps every route inside the shell unreachable while the app is locked.
 * Runs after `authGuard` (order in `canActivate`), so an MPIN lock implies an
 * existing login — and a forgotten PIN can only be reset from /lock, which is
 * itself behind `authGuard`.
 *
 * When MPIN is not configured the guard is a no-op (disabled by default).
 */
export const mpinGuard: CanActivateFn = (_route, state) => {
  const mpin = inject(MpinService);
  const router = inject(Router);

  if (!mpin.isConfigured() || !mpin.isLocked()) return true;
  return router.createUrlTree(['/lock'], {
    queryParams: { returnUrl: state.url },
  });
};

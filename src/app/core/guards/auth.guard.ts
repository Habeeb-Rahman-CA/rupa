import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth guard that waits for Supabase to finish restoring the session from
 * localStorage before deciding. Without this wait, refreshing any protected
 * route falsely redirects to /login because the guard runs synchronously
 * on boot while getSession() is still in flight.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;

  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

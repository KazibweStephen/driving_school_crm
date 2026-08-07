import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const MOBILE_REDIRECT_KEY = 'mobile_redirect_url';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  if (state.url && state.url !== '/login') {
    localStorage.setItem(MOBILE_REDIRECT_KEY, state.url);
  }
  return router.createUrlTree(['/login']);
};

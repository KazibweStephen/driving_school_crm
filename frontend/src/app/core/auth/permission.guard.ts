import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export function permissionGuard(): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.parseUrl('/login');
    }

    const single = route.data?.['permission'] as string | undefined;
    const many = route.data?.['permissions'] as string[] | undefined;

    if (single && !auth.hasPermission(single)) {
      return router.parseUrl('/dashboard');
    }
    if (many && !auth.hasAnyPermission(many)) {
      return router.parseUrl('/dashboard');
    }
    return true;
  };
}

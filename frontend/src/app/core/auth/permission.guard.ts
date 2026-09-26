import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Landing pages in the order a user should be sent to. The first one the
 * current user is permitted to see wins — used instead of redirecting to
 * `/dashboard`, which is a permission-guarded route and used to create an
 * infinite `/dashboard -> /dashboard` redirect loop (frozen page) for roles
 * without `dashboard.view` (e.g. an instructor whose matrix lost it). */
const LANDING_CANDIDATES: { path: string; permission?: string }[] = [
  { path: '/dashboard', permission: 'dashboard.view' },
  { path: '/consultations', permission: 'consultations.view' },
  { path: '/lesson-plans', permission: 'lesson_plans.view' },
  { path: '/vehicles', permission: 'vehicles.view' },
  { path: '/products', permission: 'products.view' },
  { path: '/expenses', permission: 'expenses.view' },
  { path: '/permissions', permission: 'permissions.manage' },
];

/** Terminal route: rendered when a user has no permitted page at all, so the
 * guard always has somewhere to go and can never loop. */
export const NO_ACCESS_PATH = '/no-access';

/** The first landing page this user can actually open (`/no-access` if none). */
export function landingPathFor(auth: AuthService): string {
  for (const c of LANDING_CANDIDATES) {
    if (!c.permission || auth.hasPermission(c.permission)) return c.path;
  }
  return NO_ACCESS_PATH;
}

export function permissionGuard(): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.parseUrl('/login');
    }

    const single = route.data?.['permission'] as string | undefined;
    const many = route.data?.['permissions'] as string[] | undefined;

    const allowed = !single && !many
      ? true
      : single
        ? auth.hasPermission(single)
        : auth.hasAnyPermission(many!);

    if (allowed) return true;

    // Never redirect to the page we are already refusing — that loops forever.
    const target = landingPathFor(auth);
    const current = router.url.split('?')[0].split('#')[0];
    if (target && target !== current && target !== route.routeConfig?.path) {
      return router.parseUrl(target);
    }
    return router.parseUrl(NO_ACCESS_PATH);
  };
}

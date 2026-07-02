import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then((c) => c.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/layouts/main-layout').then((c) => c.MainLayout),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((c) => c.Dashboard),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/auth/users/users').then((c) => c.Users),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/products/products').then((c) => c.Products),
      },
      {
        path: 'lesson-plans',
        loadComponent: () =>
          import('./features/lesson-plans/lesson-plans').then((c) => c.LessonPlans),
      },
      {
        path: 'lesson-library',
        loadComponent: () =>
          import('./features/lesson-library/lesson-library').then((c) => c.LessonLibraryCmp),
      },
      {
        path: 'video-library',
        loadComponent: () =>
          import('./features/video-library/video-library').then((c) => c.VideoLibraryCmp),
      },
      {
        path: 'consultations',
        loadComponent: () =>
          import('./features/clients/clients').then((c) => c.Clients),
      },
      {
        path: 'consultations/:id',
        loadComponent: () =>
          import('./features/clients/client-profile').then((c) => c.ClientProfile),
      },
      {
        path: 'clients',
        redirectTo: '/consultations',
        pathMatch: 'full',
      },
      {
        path: 'clients/:id',
        redirectTo: '/consultations/:id',
      },
      { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];

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
        path: 'expenses',
        loadComponent: () =>
          import('./features/expenses/expenses').then((c) => c.ExpensesCmp),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/payments/payments').then((c) => c.PaymentsCmp),
      },
      {
        path: 'companies',
        loadComponent: () =>
          import('./features/companies/companies').then((c) => c.CompaniesCmp),
      },
      {
        path: 'branches',
        loadComponent: () =>
          import('./features/branches/branches').then((c) => c.BranchesCmp),
      },
      {
        path: 'vehicles',
        loadComponent: () =>
          import('./features/vehicles/vehicles').then((c) => c.VehiclesCmp),
      },
      {
        path: 'vehicle-schedule',
        loadComponent: () =>
          import('./features/vehicle-schedule/vehicle-schedule').then((c) => c.VehicleScheduleCmp),
      },
      {
        path: 'weekly-schedule',
        loadComponent: () =>
          import('./features/weekly-schedule/weekly-schedule').then((c) => c.WeeklyScheduleCmp),
      },
      {
        path: 'schedule-breaks',
        loadComponent: () =>
          import('./features/schedule-breaks/schedule-breaks').then((c) => c.ScheduleBreaksCmp),
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

import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'sales',
        loadComponent: () => import('./features/sales/sales').then((m) => m.Sales),
      },
      {
        path: 'consultations/:id',
        loadComponent: () =>
          import('./features/consultations/consultations').then((m) => m.Consultations),
      },
      {
        path: 'payments',
        loadComponent: () => import('./features/payments/payments').then((m) => m.Payments),
      },
      {
        path: 'lessons',
        loadComponent: () => import('./features/lessons/lessons').then((m) => m.Lessons),
      },
      {
        path: 'schedule',
        loadComponent: () => import('./features/schedule/schedule').then((m) => m.Schedule),
      },
      {
        path: 'sms',
        loadComponent: () => import('./features/sms/sms').then((m) => m.Sms),
      },
      {
        path: 'expenses',
        loadComponent: () => import('./features/expenses/expenses').then((m) => m.Expenses),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/auth/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then((c) => c.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [permissionGuard()],
    loadComponent: () =>
      import('./shared/layouts/main-layout').then((c) => c.MainLayout),
    children: [
      {
        path: 'dashboard',
        data: { permission: 'dashboard.view' },
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((c) => c.Dashboard),
      },
      {
        path: 'users',
        data: { permission: 'users.view' },
        loadComponent: () =>
          import('./features/auth/users/users').then((c) => c.Users),
      },
      {
        path: 'users/transfers',
        data: { permission: 'users.view' },
        loadComponent: () =>
          import('./features/auth/users/transfer-history').then((c) => c.TransferHistory),
      },
      {
        path: 'discounts',
        data: { permission: 'discounts.view' },
        loadComponent: () =>
          import('./features/discounts/discounts').then((c) => c.DiscountsCmp),
      },
      {
        path: 'products',
        data: { permission: 'products.view' },
        loadComponent: () =>
          import('./features/products/products').then((c) => c.Products),
      },
      {
        path: 'lesson-plans',
        data: { permission: 'lesson_plans.view' },
        loadComponent: () =>
          import('./features/lesson-plans/lesson-plans').then((c) => c.LessonPlans),
      },
      {
        path: 'lesson-library',
        data: { permission: 'lesson_library.view' },
        loadComponent: () =>
          import('./features/lesson-library/lesson-library').then((c) => c.LessonLibraryCmp),
      },
      {
        path: 'video-library',
        data: { permission: 'video_library.view' },
        loadComponent: () =>
          import('./features/video-library/video-library').then((c) => c.VideoLibraryCmp),
      },
      {
        path: 'competency-catalogue',
        data: { permission: 'competency.view' },
        loadComponent: () =>
          import('./features/competency-catalogue/competency-catalogue').then((c) => c.CompetencyCatalogueCmp),
      },
      {
        path: 'expenses',
        data: { permission: 'expenses.view' },
        loadComponent: () =>
          import('./features/expenses/expenses').then((c) => c.ExpensesCmp),
      },
      {
        path: 'payments',
        data: { permission: 'payments.view' },
        loadComponent: () =>
          import('./features/payments/payments').then((c) => c.PaymentsCmp),
      },
      {
        path: 'training-schedule',
        data: { permission: 'training.view' },
        loadComponent: () =>
          import('./features/training-schedule/training-schedule').then((c) => c.TrainingScheduleCmp),
      },
      {
        path: 'collections-sheet',
        data: { permission: 'collections.view' },
        loadComponent: () =>
          import('./features/collections-sheet/collections-sheet').then((c) => c.CollectionsSheetCmp),
      },
      {
        path: 'transfers',
        data: { permission: 'transfers.view' },
        loadComponent: () =>
          import('./features/transfers/transfers').then((c) => c.TransfersCmp),
      },
      {
        path: 'cash-position',
        data: { permission: 'finance.view' },
        loadComponent: () =>
          import('./features/cash-position/cash-position').then((c) => c.CashPositionCmp),
      },
      {
        path: 'profit-loss',
        data: { permission: 'finance.manage' },
        loadComponent: () =>
          import('./features/profit-loss/profit-loss').then((c) => c.ProfitLossCmp),
      },
      {
        path: 'expense-categories',
        data: { permission: 'expenses.view' },
        loadComponent: () =>
          import('./features/expense-categories/expense-categories').then((c) => c.ExpenseCategoriesCmp),
      },
      {
        path: 'companies',
        data: { permission: 'companies.view' },
        loadComponent: () =>
          import('./features/companies/companies').then((c) => c.CompaniesCmp),
      },
      {
        path: 'branches',
        data: { permission: 'branches.view' },
        loadComponent: () =>
          import('./features/branches/branches').then((c) => c.BranchesCmp),
      },
      {
        path: 'vehicles',
        data: { permission: 'vehicles.view' },
        loadComponent: () =>
          import('./features/vehicles/vehicles').then((c) => c.VehiclesCmp),
      },
      {
        path: 'vehicle-schedule',
        data: { permission: 'vehicle_schedule.view' },
        loadComponent: () =>
          import('./features/vehicle-schedule/vehicle-schedule').then((c) => c.VehicleScheduleCmp),
      },
      {
        path: 'weekly-schedule',
        data: { permission: 'availabilities.view' },
        loadComponent: () =>
          import('./features/weekly-schedule/weekly-schedule').then((c) => c.WeeklyScheduleCmp),
      },
      {
        path: 'schedule-breaks',
        data: { permission: 'schedule_breaks.manage' },
        loadComponent: () =>
          import('./features/schedule-breaks/schedule-breaks').then((c) => c.ScheduleBreaksCmp),
      },
      {
        path: 'commissions',
        data: { permission: 'commissions.view' },
        loadComponent: () =>
          import('./features/commissions/commissions').then((c) => c.CommissionsCmp),
      },
      {
        path: 'fuel-tracking',
        data: { permission: 'fuel.view' },
        loadComponent: () =>
          import('./features/fuel-tracking/fuel-tracking').then((c) => c.FuelTrackingCmp),
      },
      {
        path: 'bulk-onboarding',
        data: { permission: 'bulk_onboarding.manage' },
        loadComponent: () =>
          import('./features/bulk-onboarding/bulk-onboarding').then((c) => c.BulkOnboardingCmp),
      },
      {
        path: 'reports',
        data: { permission: 'reports.view' },
        loadComponent: () =>
          import('./features/reports/reports').then((c) => c.ReportsCmp),
      },
      {
        path: 'company-settings',
        data: { permission: 'sms.view' },
        loadComponent: () =>
          import('./features/company-settings/company-settings').then((c) => c.CompanySettingsCmp),
      },
      {
        path: 'sms-logs',
        data: { permission: 'sms.view' },
        loadComponent: () =>
          import('./features/sms-logs/sms-logs').then((c) => c.SmsLogsCmp),
      },
      {
        path: 'permissions',
        data: { permission: 'permissions.manage' },
        loadComponent: () =>
          import('./features/permissions/permissions').then((c) => c.PermissionsCmp),
      },
      {
        path: 'consultations',
        data: { permission: 'consultations.view' },
        loadComponent: () =>
          import('./features/clients/clients').then((c) => c.Clients),
      },
      {
        path: 'consultations/:id',
        data: { permission: 'consultations.view' },
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

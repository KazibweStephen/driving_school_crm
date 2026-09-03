import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface HomeTile {
  label: string;
  icon: string;
  route: string;
  color: string;
  permission?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
})
export class Home {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.currentUserName;

  tiles = computed<HomeTile[]>(() => {
    const perms = this.auth.permissions();
    const all: HomeTile[] = [
      { label: 'Dashboard', icon: 'pi-chart-bar', route: '/dashboard', color: 'bg-slate-900 text-white' },
      { label: 'Sales', icon: 'pi-tags', route: '/sales', color: 'bg-blue-600 text-white', permission: 'consultations.create' },
      { label: 'Payments', icon: 'pi-wallet', route: '/payments', color: 'bg-green-600 text-white', permission: 'payments.record' },
      { label: 'Finance', icon: 'pi-building', route: '/finance', color: 'bg-indigo-600 text-white', permission: 'finance.view' },
      { label: 'Expenses', icon: 'pi-money-bill', route: '/expenses', color: 'bg-amber-600 text-white', permission: 'expenses.view' },
      { label: 'Lessons', icon: 'pi-calendar', route: '/lessons', color: 'bg-purple-600 text-white', permission: 'lesson_plans.edit' },
      { label: 'Schedule', icon: 'pi-plus-circle', route: '/schedule', color: 'bg-teal-600 text-white', permission: 'lesson_plans.create' },
      { label: 'SMS', icon: 'pi-comments', route: '/sms', color: 'bg-pink-600 text-white', permission: 'sms.send' },
      { label: 'Bulk Onboard', icon: 'pi-users', route: '/bulk-onboarding', color: 'bg-indigo-600 text-white', permission: 'bulk_onboarding.manage' },
    ];
    return all.filter((t) => !t.permission || perms.includes(t.permission));
  });

  goTo(route: string) {
    this.router.navigate([route]);
  }
}

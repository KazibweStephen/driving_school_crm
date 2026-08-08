import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService, MobileDashboard } from '../../core/services/dashboard.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney } from '../../shared/format';

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, ProgressBarModule, LoadingOverlay],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private auth = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private router = inject(Router);

  currency = this.auth.currencyCode;
  data = signal<MobileDashboard | null>(null);
  loading = signal(true);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.dashboardService.getMobileDashboard().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.data.set({
          sales_today: 0,
          sales_month: 0,
          monthly_target: 0,
          daily_collection_total: 0,
          daily_collection_new: 0,
          daily_collection_previous: 0,
          pending_collections: 0,
          commission_earned: 0,
          commission_pending: 0,
          today_training_sessions: 0,
          month_training_sessions: 0,
          days_trained: 0,
        });
        this.loading.set(false);
      },
    });
  }

  money(value: number) {
    return formatMoney(value, this.currency());
  }

  progressPct(): number {
    const d = this.data();
    if (!d || !d.monthly_target) return 0;
    return Math.min(100, Math.round((d.sales_month / d.monthly_target) * 100));
  }

  goTo(route: string) {
    this.router.navigate([route]);
  }

  openExpense() {
    this.router.navigate(['/expenses']);
  }
}

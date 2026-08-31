import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface FinanceTile {
  label: string;
  icon: string;
  route: string;
  color: string;
  permission: string;
  testId: string;
}

@Component({
  selector: 'app-finance',
  templateUrl: './finance.html',
})
export class Finance {
  private auth = inject(AuthService);
  private router = inject(Router);

  tiles = computed<FinanceTile[]>(() => {
    const perms = this.auth.permissions();
    const all: FinanceTile[] = [
      { label: 'Cash Position', icon: 'pi-wallet', route: '/finance/cash-position', color: 'bg-slate-900 text-white', permission: 'finance.cash_position', testId: 'finance-cash-position' },
      { label: 'Branch Transfers', icon: 'pi-arrow-right-arrow-left', route: '/finance/transfers', color: 'bg-blue-600 text-white', permission: 'transfers.view', testId: 'finance-branch-transfers' },
      { label: 'Profit & Loss', icon: 'pi-chart-line', route: '/finance/profit-loss', color: 'bg-green-600 text-white', permission: 'finance.pnl', testId: 'finance-profit-loss' },
    ];
    return all.filter((t) => perms.includes(t.permission));
  });

  goTo(route: string) {
    this.router.navigate([route]);
  }
}

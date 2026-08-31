import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney } from '../../shared/format';

interface ProfitLossItem {
  branch_id?: string;
  branch_name?: string;
  revenue: number;
  expenses: number;
  commissions: number;
  net: number;
}

interface ProfitLossResponse {
  items: ProfitLossItem[];
  total_revenue: number;
  total_expenses: number;
  total_commissions: number;
  total_net: number;
}

@Component({
  selector: 'app-profit-loss',
  imports: [RouterLink, LoadingOverlay],
  templateUrl: './profit-loss.html',
})
export class ProfitLoss implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  currency = this.auth.currencyCode;
  loading = signal(true);
  items = signal<ProfitLossItem[]>([]);
  totals = { revenue: 0, expenses: 0, commissions: 0, net: 0 };

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    const params = new HttpParams();
    this.http.get<ProfitLossResponse>('/api/v1/finance/profit-loss', { params }).subscribe({
      next: (res) => {
        this.items.set(res.items ?? []);
        this.totals = {
          revenue: res.total_revenue ?? 0,
          expenses: res.total_expenses ?? 0,
          commissions: res.total_commissions ?? 0,
          net: res.total_net ?? 0,
        };
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  money(value: number) {
    return formatMoney(Number(value || 0), this.currency());
  }

  netColor(n: number): string {
    return n < 0 ? 'text-red-600' : 'text-green-600';
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney } from '../../shared/format';

interface PoolPosition {
  pool: string;
  collected: number;
  received: number;
  remitted: number;
  pending_remitted: number;
  expenses: number;
  net_in_hand: number;
  outstanding: number;
}

interface BranchCashPosition {
  branch_id: string;
  branch_name: string;
  pools: PoolPosition[];
}

@Component({
  selector: 'app-cash-position',
  imports: [RouterLink, LoadingOverlay],
  templateUrl: './cash-position.html',
})
export class CashPosition implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  currency = this.auth.currencyCode;
  loading = signal(true);
  positions = signal<BranchCashPosition[]>([]);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.http.get<BranchCashPosition[]>('/api/v1/finance/cash-position').subscribe({
      next: (res) => {
        this.positions.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.positions.set([]);
        this.loading.set(false);
      },
    });
  }

  money(value: number) {
    return formatMoney(value, this.currency());
  }

  pool(branch: BranchCashPosition, name: string): PoolPosition {
    return branch.pools?.find((p) => p.pool === name) || { pool: name, collected: 0, received: 0, remitted: 0, pending_remitted: 0, expenses: 0, net_in_hand: 0, outstanding: 0 };
  }
}

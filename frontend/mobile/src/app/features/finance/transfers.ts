import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney } from '../../shared/format';

interface BranchTransfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  amount: string | number;
  reason?: string;
  pool?: string;
  status: 'initiated' | 'received' | 'cancelled';
  initiated_by_name?: string;
  initiated_at: string;
  from_branch_name?: string;
  to_branch_name?: string;
}

interface TransferListResponse {
  items: BranchTransfer[];
  total: number;
}

@Component({
  selector: 'app-transfers',
  imports: [RouterLink, LoadingOverlay],
  templateUrl: './transfers.html',
})
export class Transfers implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  currency = this.auth.currencyCode;
  loading = signal(true);
  transfers = signal<BranchTransfer[]>([]);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    const params = new HttpParams().set('page_size', '50');
    this.http.get<TransferListResponse>('/api/v1/finance/transfers', { params }).subscribe({
      next: (res) => {
        this.transfers.set(res.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.transfers.set([]);
        this.loading.set(false);
      },
    });
  }

  money(value: string | number) {
    return formatMoney(Number(value || 0), this.currency());
  }

  datetime(value?: string): string {
    return value ? new Date(value).toLocaleString() : '';
  }

  statusClass(s: string): string {
    switch (s) {
      case 'received': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-amber-100 text-amber-700';
    }
  }
}

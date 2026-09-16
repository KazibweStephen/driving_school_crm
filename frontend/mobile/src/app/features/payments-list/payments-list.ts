import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import {
  PaymentService,
  PaymentGroup,
  PaymentGroupTotals,
  BranchInfo,
} from '../../core/services/payment.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney, toISODate } from '../../shared/format';

interface Preset {
  label: string;
  key: string;
}

@Component({
  selector: 'app-payments-list',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    DatePickerModule,
    SelectModule,
    MultiSelectModule,
    LoadingOverlay,
    PageHeader,
  ],
  providers: [MessageService],
  templateUrl: './payments-list.html',
})
export class PaymentsList {
  private auth = inject(AuthService);
  private paymentService = inject(PaymentService);
  private catalog = inject(CatalogService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  currency = this.auth.currencyCode;

  groups = signal<PaymentGroup[]>([]);
  loading = signal(false);
  total = signal(0);
  page = signal(1);
  pageSize = 15;

  search = '';
  dateRangeValue: Date[] = [];
  activePreset = 'this_month';
  totals = signal<PaymentGroupTotals>({ total_amount_sum: '0', total_paid_sum: '0', total_balance_sum: '0' });

  branches = signal<BranchInfo[]>([]);
  selectedBranchIds = signal<string[]>([]);

  presets: Preset[] = [
    { label: 'Today', key: 'today' },
    { label: 'Yesterday', key: 'yesterday' },
    { label: 'This Week', key: 'this_week' },
    { label: 'This Month', key: 'this_month' },
    { label: 'Last Month', key: 'last_month' },
    { label: 'This Year', key: 'this_year' },
  ];

  hasMore = computed(() => this.groups().length < this.total());

  constructor() {
    this.loadBranches();
    this.setPreset('this_month');
    this.loadGroups();
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        if (branches.length === 1) {
          this.selectedBranchIds.set([branches[0].id]);
        } else if (branches.length > 1) {
          this.selectedBranchIds.set(branches.map((b) => b.id));
        }
      },
      error: () => {},
    });
  }

  setPreset(key: string) {
    this.activePreset = key;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (key) {
      case 'today':
        this.dateRangeValue = [new Date(y, m, now.getDate()), new Date(y, m, now.getDate())];
        break;
      case 'yesterday': {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        this.dateRangeValue = [new Date(d.getFullYear(), d.getMonth(), d.getDate()), new Date(d.getFullYear(), d.getMonth(), d.getDate())];
        break;
      }
      case 'this_week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(now);
        mon.setDate(diff);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        this.dateRangeValue = [mon, sun];
        break;
      }
      case 'this_month':
        this.dateRangeValue = [new Date(y, m, 1), new Date(y, m + 1, 0)];
        break;
      case 'last_month':
        this.dateRangeValue = [new Date(y, m - 1, 1), new Date(y, m, 0)];
        break;
      case 'this_year':
        this.dateRangeValue = [new Date(y, 0, 1), new Date(y, 11, 31)];
        break;
    }
  }

  onCustomRangeSelect() {
    this.activePreset = '';
  }

  private getDateRange(): { date_from?: string; date_to?: string } {
    if (!this.dateRangeValue || this.dateRangeValue.length === 0) return {};
    return {
      date_from: toISODate(this.dateRangeValue[0]),
      date_to: toISODate(this.dateRangeValue[this.dateRangeValue.length - 1] || this.dateRangeValue[0]),
    };
  }

  applyFilters() {
    this.page.set(1);
    this.loadGroups();
  }

  clearFilters() {
    this.search = '';
    this.setPreset('this_month');
    this.page.set(1);
    this.loadGroups();
  }

  loadGroups() {
    this.loading.set(true);
    const dr = this.getDateRange();
    const branchIds = this.selectedBranchIds();
    this.paymentService
      .listPaymentGroups({
        search: this.search || undefined,
        date_from: dr.date_from,
        date_to: dr.date_to,
        branch_ids: branchIds.length ? branchIds : undefined,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.groups.set(this.page() === 1 ? res.groups : [...this.groups(), ...res.groups]);
          this.total.set(res.total);
          this.totals.set(res.totals);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({ severity: 'error', summary: 'Could not load payments' });
        },
      });
  }

  loadMore() {
    this.page.update((p) => p + 1);
    this.loadGroups();
  }

  goToConsultation(cid: string) {
    this.router.navigate(['/consultations', cid]);
  }

  goCollect() {
    this.router.navigate(['/payments']);
  }

  packageLabel(g: PaymentGroup): string {
    return g.package_name || g.product_name;
  }

  statusLabel(g: PaymentGroup): string {
    const bal = parseFloat(String(g.balance));
    if (bal <= 0) return 'Paid';
    if (bal >= parseFloat(String(g.total_amount))) return 'Unpaid';
    return 'Partial';
  }

  statusClass(g: PaymentGroup): string {
    const bal = parseFloat(String(g.balance));
    if (bal <= 0) return 'bg-green-100 text-green-700';
    if (bal >= parseFloat(String(g.total_amount))) return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  }

  durationSince(d: string | null): string {
    if (!d) return '';
    const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'today';
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? '1w ago' : `${weeks}w ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return months === 1 ? '1mo ago' : `${months}mo ago`;
    }
    const years = Math.floor(diffDays / 365);
    return years === 1 ? '1y ago' : `${years}y ago`;
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }

  amount(val: string): string {
    const n = parseFloat(val);
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
}

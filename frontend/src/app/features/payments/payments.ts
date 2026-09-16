import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { PaymentService, PaymentGroup, PaymentGroupTotals, BranchInfo } from '../../core/services/payment.service';

interface Preset {
  label: string;
  key: string;
}

@Component({
  selector: 'app-payments',
  imports: [
    CommonModule, FormsModule, RouterLink, ButtonModule, TableModule,
    TagModule, ToastModule, InputTextModule, SelectModule, MultiSelectModule,
    DatePickerModule, TooltipModule, CardModule,
  ],
  providers: [MessageService],
  templateUrl: './payments.html',
  styleUrls: ['./payments.css'],
})
export class PaymentsCmp implements OnInit {
  groups = signal<PaymentGroup[]>([]);
  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;
  search = '';
  dateRangeValue: Date[] = [];
  activePreset = 'this_week';
  totals: PaymentGroupTotals = { total_amount_sum: '0', total_paid_sum: '0', total_balance_sum: '0' };

  branches: BranchInfo[] = [];
  selectedBranchIds: string[] = [];

  canViewAllBranches = computed(() => {
    const role = this.authService.currentUserRole();
    return role === 'super_user' || role === 'office_admin' || role === 'manager' || role === 'branch_supervisor';
  });

  presets: Preset[] = [
    { label: 'Today', key: 'today' },
    { label: 'This Week', key: 'this_week' },
    { label: 'This Month', key: 'this_month' },
    { label: 'Last Month', key: 'last_month' },
    { label: 'This Year', key: 'this_year' },
  ];

  constructor(
    private paymentService: PaymentService,
    private authService: AuthService,
    private messageService: MessageService,
  ) {}

  async ngOnInit() {
    try {
      this.branches = await this.paymentService.getAccessibleBranches().toPromise() || [];
      this.selectedBranchIds = this.branches.map(b => b.id);
    } catch {
      this.branches = [];
      this.selectedBranchIds = [];
    }
    this.setPreset('this_week');
    this.loadGroups();
  }

  setPreset(key: string) {
    this.activePreset = key;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (key) {
      case 'today':
        this.dateRangeValue = [now, now];
        break;
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
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    return {
      date_from: fmt(this.dateRangeValue[0]),
      date_to: this.dateRangeValue[1] ? fmt(this.dateRangeValue[1]) : fmt(this.dateRangeValue[0]),
    };
  }

  applyFilters() {
    this.page = 1;
    this.loadGroups();
  }

  clearFilters() {
    const today = new Date();
    this.search = '';
    this.activePreset = 'this_week';
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now);
    mon.setDate(diff);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    this.dateRangeValue = [mon, sun];
    this.selectedBranchIds = this.branches.map(b => b.id);
    this.page = 1;
    this.loadGroups();
  }

  async loadGroups() {
    this.loading.set(true);
    try {
      const dr = this.getDateRange();
      const branch_ids = this.selectedBranchIds.length
        ? this.selectedBranchIds.join(',')
        : undefined;
      const res = await this.paymentService.listPaymentGroups({
        search: this.search || undefined,
        date_from: dr.date_from,
        date_to: dr.date_to,
        branch_ids,
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.groups.set(res.groups);
        this.total = res.total;
        this.totals = res.totals;
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load payments' });
    } finally {
      this.loading.set(false);
    }
  }

  onPage(event: any) {
    this.page = (event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadGroups();
  }

  onSearch() {
    this.applyFilters();
  }

  packageLabel(g: PaymentGroup): string {
    return g.package_name || g.product_name;
  }

  formatAmount(val: string): string {
    const n = parseFloat(val);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString();
  }

  statusSeverity(g: PaymentGroup): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined {
    const bal = parseFloat(g.balance);
    if (bal <= 0) return 'success';
    if (bal >= parseFloat(g.total_amount)) return 'danger';
    return 'warn';
  }

  statusLabel(g: PaymentGroup): string {
    const bal = parseFloat(g.balance);
    if (bal <= 0) return 'Paid';
    if (bal >= parseFloat(g.total_amount)) return 'Unpaid';
    return 'Partial';
  }

  hasBalance(g: PaymentGroup): boolean {
    return parseFloat(g.balance) > 0;
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
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return months === 1 ? '1 month ago' : `${months} months ago`;
    }
    const years = Math.floor(diffDays / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
}
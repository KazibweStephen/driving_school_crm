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
import { PaymentService, PaymentWithClient, PaymentTotals, BranchInfo } from '../../core/services/payment.service';

interface Preset {
  label: string;
  key: string;
}

interface ClientTypeOption {
  label: string;
  value: string;
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
  payments = signal<PaymentWithClient[]>([]);
  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;
  search = '';
  dateRangeValue: Date[] = [];
  clientType = 'all';
  activePreset = 'today';
  totals: PaymentTotals = { total_amount_sum: '0', total_paid_sum: '0', total_balance_sum: '0' };

  branches: BranchInfo[] = [];
  selectedBranchIds: string[] = [];

  canPrint = computed(() => {
    const role = this.authService.currentUserRole();
    return role === 'office_admin' || role === 'branch_supervisor' || role === 'manager';
  });

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

  clientTypeOptions: ClientTypeOption[] = [
    { label: 'All', value: 'all' },
    { label: 'New Clients', value: 'new' },
    { label: 'Collections', value: 'collection' },
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
    this.setPreset('today');
    this.loadPayments();
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
    this.loadPayments();
  }

  clearFilters() {
    const today = new Date();
    this.search = '';
    this.dateRangeValue = [today, today];
    this.activePreset = 'today';
    this.clientType = 'all';
    this.selectedBranchIds = this.branches.map(b => b.id);
    this.page = 1;
    this.loadPayments();
  }

  async loadPayments() {
    this.loading.set(true);
    try {
      const dr = this.getDateRange();
      const branch_ids = this.selectedBranchIds.length
        ? this.selectedBranchIds.join(',')
        : undefined;
      const res = await this.paymentService.listAllPayments({
        search: this.search || undefined,
        date_from: dr.date_from,
        date_to: dr.date_to,
        client_type: this.clientType || undefined,
        branch_ids,
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.payments.set(res.payments);
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
    this.loadPayments();
  }

  onSearch() {
    this.applyFilters();
  }

  async printReport() {
    const dr = this.getDateRange();
    const params = new URLSearchParams();
    if (dr.date_from) params.set('date_from', dr.date_from);
    if (dr.date_to) params.set('date_to', dr.date_to);
    if (this.clientType && this.clientType !== 'all') params.set('client_type', this.clientType);
    if (this.search) params.set('search', this.search);
    const branch_ids = this.selectedBranchIds.length
      ? this.selectedBranchIds.join(',')
      : undefined;
    if (branch_ids) params.set('branch_ids', branch_ids);
    const url = `/api/v1/payments/report?${params.toString()}`;
    const token = this.authService.getToken();
    try {
      const html = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.text());
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.setTimeout(() => win.print(), 500);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate report' });
    }
  }

  formatAmount(val: string): string {
    const n = parseFloat(val);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleString();
  }

  statusSeverity(p: PaymentWithClient): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined {
    const bal = parseFloat(p.balance);
    if (bal <= 0) return 'success';
    if (bal >= parseFloat(p.total_amount)) return 'danger';
    return 'warn';
  }

  statusLabel(p: PaymentWithClient): string {
    const bal = parseFloat(p.balance);
    if (bal <= 0) return 'Paid';
    if (bal >= parseFloat(p.total_amount)) return 'Unpaid';
    return 'Partial';
  }

  hasBalance(p: PaymentWithClient): boolean {
    return parseFloat(p.balance) > 0;
  }

  openReceipt(p: PaymentWithClient) {
    this.paymentService.getReceipt(p.id).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }
}

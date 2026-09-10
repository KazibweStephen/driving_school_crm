import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/auth/auth.service';
import {
  FinanceService, Branch, EndOfDayRead, EndOfDayReport, EndOfDaySummary,
} from '../../core/services/finance.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney, todayISO, toISODate } from '../../shared/format';

@Component({
  selector: 'app-end-of-day',
  imports: [
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    ToastModule,
    LoadingOverlay,
    PageHeader,
  ],
  providers: [MessageService],
  templateUrl: './end-of-day.html',
})
export class EndOfDay {
  private finance = inject(FinanceService);
  private auth = inject(AuthService);
  private messageService = inject(MessageService);

  currency = this.auth.currencyCode;

  loading = signal(false);
  saving = signal(false);
  branches = signal<Branch[]>([]);
  branchId = signal<string>('');
  reportDate = signal<string>(todayISO());
  reportDateObject = computed(() =>
    this.reportDate() ? new Date(this.reportDate() + 'T00:00:00') : new Date(),
  );

  summary = signal<EndOfDaySummary | null>(null);
  savedReport = signal<EndOfDayReport | null>(null);

  cashAtHand = signal<number | null>(null);
  totalExpenses = signal<number | null>(null);
  consultationsCount = signal<number>(0);
  newClientsCount = signal<number>(0);
  notes = signal('');

  constructor() {
    this.loadBranches();
  }

  private loadBranches() {
    this.finance.myBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        if (!this.branchId() && branches.length > 0) {
          this.branchId.set(branches[0].id);
          this.load();
        }
      },
      error: () => this.branches.set([]),
    });
  }

  onBranchChange(id: string) {
    this.branchId.set(id);
    this.load();
  }

  onDateChange(d: Date | null) {
    if (d) {
      this.reportDate.set(toISODate(d));
      this.load();
    }
  }

  load() {
    if (!this.branchId()) return;
    this.loading.set(true);
    this.savedReport.set(null);
    this.finance.getEndOfDay(this.reportDate(), this.branchId()).subscribe({
      next: (res: EndOfDayRead) => {
        this.summary.set(res.summary);
        const rep = res.report;
        this.savedReport.set(rep);
        if (rep) {
          this.cashAtHand.set(Number(rep.cash_at_hand));
          this.totalExpenses.set(Number(rep.total_expenses));
          this.consultationsCount.set(rep.consultations_count);
          this.newClientsCount.set(rep.new_clients_count);
          this.notes.set(rep.notes || '');
        } else if (res.summary) {
          this.cashAtHand.set(null);
          this.totalExpenses.set(Number(res.summary.cash_expenses));
          this.consultationsCount.set(res.summary.system_consultations_count);
          this.newClientsCount.set(res.summary.system_new_clients_count);
          this.notes.set('');
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Could not load end-of-day data' });
      },
    });
  }

  liveVariation(): number | null {
    const expected = this.summary()?.expected_cash_at_hand ?? 0;
    const cash = this.cashAtHand();
    if (cash === null || cash === undefined || isNaN(Number(cash))) return null;
    return Number(cash) - expected;
  }

  liveMatched(): boolean {
    const v = this.liveVariation();
    return v !== null && Math.abs(v) < 0.005;
  }

  expenseLiveVariation(): number | null {
    const system = this.summary()?.cash_expenses ?? 0;
    const te = this.totalExpenses();
    if (te === null || te === undefined || isNaN(Number(te))) return null;
    return Number(te) - system;
  }

  expenseLiveMatched(): boolean {
    const v = this.expenseLiveVariation();
    return v !== null && Math.abs(v) < 0.005;
  }

  formValid(): boolean {
    return (
      !!this.branchId() &&
      this.cashAtHand() !== null &&
      !isNaN(Number(this.cashAtHand())) &&
      Number(this.cashAtHand()) >= 0 &&
      this.totalExpenses() !== null &&
      !isNaN(Number(this.totalExpenses())) &&
      Number(this.totalExpenses()) >= 0
    );
  }

  save() {
    if (!this.formValid()) {
      this.messageService.add({ severity: 'warn', summary: 'Incomplete', detail: 'Enter the cash at hand and total expenses' });
      return;
    }
    this.saving.set(true);
    this.finance.saveEndOfDay({
      branch_id: this.branchId(),
      report_date: this.reportDate(),
      cash_at_hand: Number(this.cashAtHand()),
      total_expenses: Number(this.totalExpenses()),
      consultations_count: Number(this.consultationsCount() || 0),
      new_clients_count: Number(this.newClientsCount() || 0),
      notes: this.notes() || undefined,
    }).subscribe({
      next: (report) => {
        this.savedReport.set(report);
        this.saving.set(false);
        if (report.status === 'matched') {
          this.messageService.add({
            severity: 'success',
            summary: 'Matched',
            detail: `Cash reconciles: variation ${this.money(report.variation)}`,
          });
        } else {
          const reasons = (report.reasons || []).join(', ');
          this.messageService.add({
            severity: 'warn',
            summary: 'Saved as draft',
            detail: `Variations on ${reasons || 'cash'} — Cash variation ${this.money(report.variation)} · Expense variation ${this.money(report.expense_variation)}`,
          });
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not save report',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  money(value: string | number | null | undefined) {
    return formatMoney(value, this.currency());
  }
}
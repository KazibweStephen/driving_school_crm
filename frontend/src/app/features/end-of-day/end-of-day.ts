import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CompanyService, Branch } from '../../core/services/company.service';
import {
  FinanceService, EndOfDayRead, EndOfDayReport, EndOfDaySummary,
} from '../../core/services/finance.service';
import { CurrencyService } from '../../core/services/currency.service';

@Component({
  selector: 'app-end-of-day',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DatePickerModule,
    InputNumberModule, InputTextModule, TextareaModule, SelectModule, TagModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './end-of-day.html',
})
export class EndOfDayCmp implements OnInit {
  branches: Branch[] = [];
  branchId = '';
  reportDate: Date = new Date();

  loading = signal(false);
  saving = signal(false);
  savedReport = signal<EndOfDayReport | null>(null);
  summary = signal<EndOfDaySummary | null>(null);

  cashAtHand: number | null = null;
  consultationsCount: number | null = null;
  newClientsCount: number | null = null;
  notes = '';

  readonly Math = Math;

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private messageService: MessageService,
    public currencyService: CurrencyService,
  ) {}

  async ngOnInit() {
    try {
      this.branches = (await this.companyService.myBranches().toPromise()) || [];
    } catch {
      this.branches = [];
    }
    this.branchId = this.branches[0]?.id || '';
    await this.load();
  }

  async onBranchChange() {
    this.resetForm();
    await this.load();
  }

  async onDateChange() {
    this.resetForm();
    await this.load();
  }

  private resetForm() {
    this.cashAtHand = null;
    this.consultationsCount = null;
    this.newClientsCount = null;
    this.notes = '';
    this.savedReport.set(null);
  }

  onCashAtHandChange() {
    // Live flagging while the admin types the physical cash count.
    const v = this.liveVariation();
    if (v !== null) {
      this.messageService.clear();
    }
  }

  async load() {
    if (!this.branchId) return;
    this.loading.set(true);
    try {
      const res = await this.financeService.getEndOfDay(
        this.isoDate(this.reportDate), this.branchId,
      ).toPromise();
      this.summary.set(res?.summary ?? null);
      const rep = res?.report ?? null;
      this.savedReport.set(rep);
      if (rep) {
        this.cashAtHand = Number(rep.cash_at_hand);
        this.consultationsCount = rep.consultations_count;
        this.newClientsCount = rep.new_clients_count;
        this.notes = rep.notes || '';
      } else if (res?.summary) {
        this.consultationsCount = res.summary.system_consultations_count;
        this.newClientsCount = res.summary.system_new_clients_count;
      }
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to load end-of-day data' });
    } finally {
      this.loading.set(false);
    }
  }

  isoDate(d: Date): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  liveVariation(): number | null {
    const expected = this.summary()?.expected_cash_at_hand ?? 0;
    if (this.cashAtHand === null || this.cashAtHand === undefined || isNaN(Number(this.cashAtHand))) return null;
    return Number(this.cashAtHand) - expected;
  }

  liveMatched(): boolean {
    const v = this.liveVariation();
    return v !== null && Math.abs(v) < 0.005;
  }

  formValid(): boolean {
    return !!this.branchId &&
      this.cashAtHand !== null && !isNaN(Number(this.cashAtHand)) && Number(this.cashAtHand) >= 0;
  }

  async save() {
    if (!this.formValid()) {
      this.messageService.add({ severity: 'warn', summary: 'Incomplete', detail: 'Enter the cash at hand' });
      return;
    }
    this.saving.set(true);
    try {
      const report = await this.financeService.saveEndOfDay({
        branch_id: this.branchId,
        report_date: this.isoDate(this.reportDate),
        cash_at_hand: Number(this.cashAtHand),
        consultations_count: Number(this.consultationsCount || 0),
        new_clients_count: Number(this.newClientsCount || 0),
        notes: this.notes || undefined,
      }).toPromise();
      if (report) {
      this.savedReport.set(report);
      if (report.status === 'matched') {
        this.messageService.add({ severity: 'success', summary: 'Matched', detail: `Cash reconciles: variation ${this.formatAmount(report.variation)}` });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Discrepancy', detail: `Variation ${this.formatAmount(report.variation)} — cash at hand does not match the expected figure` });
      }
      }
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save report' });
    } finally {
      this.saving.set(false);
    }
  }

  formatAmount(n: number | null | undefined): string {
    return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
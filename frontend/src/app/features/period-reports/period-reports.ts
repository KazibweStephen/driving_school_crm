import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { CompanyService, Branch } from '../../core/services/company.service';
import { CurrencyService } from '../../core/services/currency.service';
import {
  PeriodKind, PeriodReport, PeriodReportService,
} from '../../core/services/period-report.service';

interface PeriodOption {
  value: PeriodKind;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-period-reports',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DatePickerModule,
    MultiSelectModule, TableModule, TagModule, ProgressBarModule, TooltipModule,
  ],
  templateUrl: './period-reports.html',
})
export class PeriodReportsCmp implements OnInit {
  private companyService = inject(CompanyService);
  private reportService = inject(PeriodReportService);
  private messageService = inject(MessageService);

  public currencyService = inject(CurrencyService);

  periodOptions: PeriodOption[] = [
    { value: 'week', label: 'Week', icon: 'pi pi-calendar' },
    { value: 'month', label: 'Month', icon: 'pi pi-calendar' },
    { value: 'quarter', label: 'Quarter', icon: 'pi pi-calendar' },
    { value: 'year', label: 'Year', icon: 'pi pi-calendar' },
  ];

  period = signal<PeriodKind>('month');
  anchor = new Date();
  branches: Branch[] = [];
  selectedBranchIds: string[] = [];

  report = signal<PeriodReport | null>(null);
  loading = signal(false);

  ngOnInit(): void {
    this.loadBranches();
    this.load();
  }

  private async loadBranches(): Promise<void> {
    try {
      this.branches = (await this.companyService.myBranches().toPromise()) || [];
    } catch {
      this.branches = [];
    }
    this.selectedBranchIds = this.branches.map((b) => b.id);
  }

  setPeriod(period: PeriodKind): void {
    if (this.period() === period) return;
    this.period.set(period);
    this.load();
  }

  goToPeriod(step: number): void {
    const next = new Date(this.anchor);
    switch (this.period()) {
      case 'week': next.setDate(next.getDate() + 7 * step); break;
      case 'month': next.setMonth(next.getMonth() + step); break;
      case 'quarter': next.setMonth(next.getMonth() + 3 * step); break;
      case 'year': next.setFullYear(next.getFullYear() + step); break;
    }
    this.anchor = next;
    this.load();
  }

  goToCurrent(): void {
    this.anchor = new Date();
    this.load();
  }

  onAnchorChange(value: Date | null): void {
    if (!value) return;
    this.anchor = value;
    this.load();
  }

  clearBranches(): void {
    this.selectedBranchIds = this.branches.map((b) => b.id);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reportService
      .getReport({
        period: this.period(),
        anchor: this.toISODate(this.anchor),
        branchIds: this.selectedBranchIds,
      })
      .subscribe({
        next: (r) => {
          this.report.set(r);
          this.loading.set(false);
        },
        error: () => {
          this.report.set(null);
          this.loading.set(false);
          this.messageService.add({
            severity: 'error', summary: 'Failed', detail: 'Could not load the period report.',
          });
        },
      });
  }

  print(): void {
    window.print();
  }

  toISODate(d: Date | null | undefined): string {
    if (!d) return '';
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }

  formatAmount(n: number | null | undefined): string {
    return Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime())
      ? value
      : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  goalSeverity(status: string): 'success' | 'warn' | 'danger' {
    if (status === 'met') return 'success';
    if (status === 'at_risk') return 'warn';
    return 'danger';
  }

  goalLabel(status: string): string {
    if (status === 'met') return 'Target met';
    if (status === 'at_risk') return 'At risk';
    return 'Behind';
  }

  attainmentPct(pct: number): number {
    return Math.max(0, Math.min(100, Number(pct ?? 0)));
  }
}

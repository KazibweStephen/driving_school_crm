import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CompanyService, Branch } from '../../core/services/company.service';
import { FinanceService, ProfitLossItem } from '../../core/services/finance.service';
import { CurrencyService } from '../../core/services/currency.service';

@Component({
  selector: 'app-profit-loss',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DatePickerModule,
    MultiSelectModule, TableModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './profit-loss.html',
})
export class ProfitLossCmp implements OnInit {
  items = signal<ProfitLossItem[]>([]);
  loading = signal(false);
  branches: Branch[] = [];
  selectedBranchIds: string[] = [];
  startDate: Date | null = null;
  endDate: Date | null = null;
  loaded = false;
  totals = { revenue: 0, expenses: 0, commissions: 0, net: 0 };

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private messageService: MessageService,
    public currencyService: CurrencyService,
  ) {}

  async ngOnInit() {
    try {
      this.branches = (await this.companyService.myBranches().toPromise()) || [];
      this.selectedBranchIds = this.branches.map(b => b.id);
    } catch {
      this.branches = [];
    }
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const from = this.startDate ? this.startDate.toISOString().slice(0, 10) : undefined;
      const to = this.endDate ? this.endDate.toISOString().slice(0, 10) : undefined;
      const res = await this.financeService.getProfitLoss({
        from_date: from,
        to_date: to,
        branch_ids: this.selectedBranchIds,
      }).toPromise();
      this.items.set(res?.items || []);
      this.totals = {
        revenue: res?.total_revenue ?? 0,
        expenses: res?.total_expenses ?? 0,
        commissions: res?.total_commissions ?? 0,
        net: res?.total_net ?? 0,
      };
      this.loaded = true;
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load P&L report' });
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters() {
    this.startDate = null;
    this.endDate = null;
    this.selectedBranchIds = this.branches.map(b => b.id);
    this.load();
  }

  netColor(n: number): string {
    return n < 0 ? 'text-red-600' : 'text-green-600';
  }

  formatAmount(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { FinanceService } from '../../core/services/finance.service';

type Period = 'daily' | 'weekly' | 'monthly';

@Component({
  selector: 'app-collections-sheet',
  imports: [
    FormsModule,
    DatePipe,
    CurrencyPipe,
    RouterLink,
    ButtonModule,
    SelectModule,
    TableModule,
    ToastModule,
    DatePickerModule,
  ],
  providers: [MessageService],
  templateUrl: './collections-sheet.html',
})
export class CollectionsSheetCmp implements OnInit {
  private financeService = inject(FinanceService);
  private messageService = inject(MessageService);
  items = signal<any[]>([]);
  loading = signal(false);
  period = signal<Period>('daily');
  startDate = signal<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  endDate = signal<string>(new Date().toISOString().split('T')[0]);

  periodOptions = [
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
  ];

  totalAmount = computed(() =>
    this.items().reduce((sum: number, p: any) => sum + Number(p.total_paid || p.amount || 0), 0),
  );

  ngOnInit() {
    this.loadSheet();
  }

  async loadSheet() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.financeService.getCollectionsSheet({
        period: this.period(),
        start_date: this.startDate(),
        end_date: this.endDate(),
      }));
      this.items.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load collections sheet' });
    } finally {
      this.loading.set(false);
    }
  }

  onStartDateChange(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.startDate.set(`${y}-${m}-${day}`);
  }

  onEndDateChange(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.endDate.set(`${y}-${m}-${day}`);
  }

  onPeriodChange(p: Period) {
    this.period.set(p);
    this.loadSheet();
  }
}

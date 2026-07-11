import { Component, OnInit, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { MessageService } from 'primeng/api';
import { TrainingService } from '../../core/services/training.service';
import { PaymentService } from '../../core/services/payment.service';
import { AuthService } from '../../core/auth/auth.service';

type Period = 'daily' | 'weekly' | 'monthly';

interface PaymentSession {
  session: any;
  payNow: number;
  balance: number;
}

@Component({
  selector: 'app-training-schedule',
  imports: [
    FormsModule,
    DatePipe,
    CurrencyPipe,
    RouterLink,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    InputGroupModule,
    InputGroupAddonModule,
    DatePickerModule,
    DividerModule,
  ],
  providers: [MessageService],
  templateUrl: './training-schedule.html',
})
export class TrainingScheduleCmp implements OnInit, OnDestroy {
  private trainingService = inject(TrainingService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);
  authService = inject(AuthService);

  sessions = signal<any[]>([]);
  loading = signal(false);
  period = signal<Period>('daily');

  today = new Date();
  todayStr = this.today.toISOString().split('T')[0];
  startDate = signal<string>(this.todayStr);
  endDate = signal<string>(this.todayStr);

  periodOptions = [
    { label: 'Today', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
  ];

  // ── Multi-timer support ──
  private timerIntervals = new Map<string, any>();
  timerDisplay = signal<Record<string, string>>({});

  // Summary
  totalSessions = computed(() => this.sessions().length);
  totalDrivingMin = computed(() => this.sessions().reduce((s: number, x: any) => s + (x.driving_minutes || 0), 0));
  totalTheoryMin = computed(() => this.sessions().reduce((s: number, x: any) => s + (x.theory_minutes || 0), 0));
  totalStudents = computed(() => new Set(this.sessions().map((s: any) => s.student_phone)).size);
  totalBalance = computed(() => this.sessions().reduce((s: number, x: any) => s + (x.balance || 0), 0));

  // ── Manage Dialog ──
  showManageDialog = signal(false);
  manageTarget = signal<any>(null);

  // ── Payment (Pay All Pending style) ──
  paySessions = signal<PaymentSession[]>([]);
  payReceiptNumber = signal('');
  payInstallments: { due_date: Date | null; amount: number }[] = [];
  payDocumentDate = signal<Date | null>(null);
  receiptChecking = signal(false);
  receiptAvailable = signal<boolean | null>(null);
  paymentProcessing = signal(false);

  ngOnInit() {
    this.loadSchedule();
  }

  ngOnDestroy() {
    this.stopAllTimers();
  }

  async loadSchedule() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.trainingService.getDailySchedule(undefined, undefined, {
        period: this.period(),
        start_date: this.startDate(),
        end_date: this.endDate(),
      }));
      this.sessions.set(res || []);
      for (const s of res || []) {
        if (s.status === 'in_progress' && s.timer_started_at) {
          this.startTimer(s);
        }
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedule' });
    } finally {
      this.loading.set(false);
    }
  }

  onDateRangeChange(dates: Date[]) {
    if (!dates || dates.length < 2) return;
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    this.startDate.set(fmt(dates[0]));
    this.endDate.set(fmt(dates[1]));
  }

  onPeriodChange(p: Period) {
    this.period.set(p);
    this.loadSchedule();
  }

  // ── Lessons Progress ──
  lessonsProgress(s: any): { trained: number; total: number } {
    const drivingTotal = Math.ceil((s.expected_driving_minutes || 0) / 30);
    const theoryTotal = Math.ceil((s.expected_theory_minutes || 0) / 60);
    const total = drivingTotal + theoryTotal;
    const remaining = (s.driving_lessons_left || 0) + (s.theory_lessons_left || 0);
    return { trained: Math.max(0, total - remaining), total };
  }

  // ── Manage Dialog ──
  openManage(session: any) {
    this.manageTarget.set(session);

    // Init payment fields for this session's consultation
    this.paySessions.set([{ session, payNow: session.balance || 0, balance: session.balance || 0 }]);
    this.payReceiptNumber.set('');
    this.payInstallments = [];
    this.payDocumentDate.set(null);
    this.receiptAvailable.set(null);
    this.receiptChecking.set(false);

    if ((session.balance || 0) > 0) {
      this.initPayInstallments();
    }

    this.showManageDialog.set(true);
  }

  closeManage() {
    this.showManageDialog.set(false);
    this.manageTarget.set(null);
    this.paySessions.set([]);
    this.payInstallments = [];
  }

  onPayNowChange() {
    this.initPayInstallments();
  }

  get payTotalNow(): number {
    return this.paySessions().reduce((s, it) => s + (it.payNow || 0), 0);
  }

  get payTotalBalance(): number {
    return this.paySessions().reduce((s, it) => s + Math.max(0, it.balance - (it.payNow || 0)), 0);
  }

  get payInstallmentSum(): number {
    return this.payInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
  }

  get payInstallmentBalanceMatch(): boolean {
    return this.payInstallmentSum >= this.payTotalBalance;
  }

  initPayInstallments() {
    const balance = this.payTotalBalance;
    if (balance <= 0) {
      this.payInstallments = [];
      return;
    }
    const now = new Date();
    const half = Math.ceil(balance / 2);
    this.payInstallments = [
      { due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), amount: half },
      { due_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), amount: balance - half },
    ];
  }

  addPayInstallment() {
    const balance = this.payTotalBalance;
    if (balance <= 0) return;
    const sumExisting = this.payInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    const last = this.payInstallments[this.payInstallments.length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.payInstallments = [...this.payInstallments, { due_date: nextDate, amount: prefill }];
  }

  removePayInstallment(index: number) {
    this.payInstallments = this.payInstallments.filter((_, i) => i !== index);
  }

  async validatePayReceipt() {
    const rcp = this.payReceiptNumber();
    if (!rcp || rcp.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await firstValueFrom(this.paymentService.checkReceipt(rcp.trim()));
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  async doPay() {
    const target = this.manageTarget();
    if (!target) return;
    const items = this.paySessions().filter(it => it.payNow > 0);
    if (!items.length) return;
    const receipt = this.payReceiptNumber();
    if (receipt && receipt.trim().length >= 2 && this.receiptAvailable() !== true) return;

    this.paymentProcessing.set(true);
    try {
      const dateStr = this.formatDate(new Date());
      const totalRemaining = this.payTotalBalance;

      for (const it of items) {
        const s = it.session;
        const amount = it.payNow;
        const remaining = Math.max(0, it.balance - amount);

        const installments: { due_date: string; amount: number }[] = [
          { due_date: dateStr, amount },
        ];

        if (totalRemaining > 0 && remaining > 0) {
          const scheduled = this.payInstallments
            .filter(inst => inst.amount > 0 && inst.due_date)
            .map(inst => ({
              due_date: this.formatDate(inst.due_date!),
              amount: Math.round(inst.amount * (remaining / totalRemaining)),
            }))
            .filter(inst => inst.amount > 0);
          installments.push(...scheduled);
        }

        const paymentResult = await firstValueFrom(
          this.paymentService.createPayment(s.consultation_id, {
            product_id: s.product_id,
            package_id: s.package_id || undefined,
            total_amount: amount + remaining,
            notes: `Payment from Training Schedule`,
            receipt_number: receipt || undefined,
            installments,
            document_date: this.payDocumentDate()?.toISOString().split('T')[0] || undefined,
          })
        );

        if (paymentResult?.installments?.length) {
          await firstValueFrom(
            this.paymentService.updateInstallment(
              paymentResult.id,
              paymentResult.installments[0].id,
              {
                paid_date: dateStr,
                paid_amount: amount,
                notes: 'Paid',
              }
            )
          );
        }
      }

      this.closeManage();
      await this.loadSchedule();
      this.messageService.add({
        severity: 'success',
        summary: 'Payment Recorded',
        detail: `Payment of ${this.payTotalNow} recorded`,
      });
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.error?.detail || 'Failed to process payment',
      });
    } finally {
      this.paymentProcessing.set(false);
    }
  }

  private formatDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Session Start / End / Multi-Timer ──

  async startSession(session: any) {
    try {
      const updated = await firstValueFrom(this.trainingService.startSession(session.id));
      if (updated) {
        this.updateSessionInList(updated as any);
        this.startTimer(updated as any);
        if (this.manageTarget()?.id === session.id) {
          this.manageTarget.set(updated as any);
        }
      }
      this.messageService.add({ severity: 'success', summary: 'Started', detail: 'Session started' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to start session' });
    }
  }

  async endSession(session: any) {
    try {
      const updated = await firstValueFrom(this.trainingService.endSession(session.id));
      if (updated) {
        this.updateSessionInList(updated as any);
        this.stopTimer(session.id);
        if (this.manageTarget()?.id === session.id) {
          this.manageTarget.set(updated as any);
        }
      }
      this.messageService.add({ severity: 'success', summary: 'Ended', detail: 'Session ended' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to end session' });
    }
  }

  startTimer(session: any) {
    if (!session.timer_started_at) return;
    if (this.timerIntervals.has(session.id)) {
      clearInterval(this.timerIntervals.get(session.id));
    }
    const startedAt = new Date(session.timer_started_at).getTime();

    const interval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.timerDisplay.update(d => ({ ...d, [session.id]: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` }));

      if (elapsed % 30 === 0) {
        try {
          const updated = await firstValueFrom(this.trainingService.updateTimer(session.id, elapsed));
          if (updated) this.updateSessionInList(updated as any);
        } catch { /* skip */ }
      }
    }, 1000);

    this.timerIntervals.set(session.id, interval);
  }

  stopTimer(sessionId: string) {
    if (this.timerIntervals.has(sessionId)) {
      clearInterval(this.timerIntervals.get(sessionId));
      this.timerIntervals.delete(sessionId);
    }
    this.timerDisplay.update(d => { const r = { ...d }; delete r[sessionId]; return r; });
  }

  stopAllTimers() {
    for (const [id, interval] of this.timerIntervals) {
      clearInterval(interval);
    }
    this.timerIntervals.clear();
  }

  private updateSessionInList(updated: any) {
    this.sessions.update(list =>
      list.map(s => s.id === updated.id ? { ...s, ...updated } : s)
    );
  }

  formatTimer(seconds: number | null): string {
    if (seconds == null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  statusSeverity(status: string): 'success' | 'warn' | 'info' | 'secondary' | 'danger' {
    switch (status) {
      case 'in_progress': return 'info';
      case 'completed': return 'success';
      default: return 'secondary';
    }
  }

  sessionType(s: any): string {
    if (s.driving_minutes && s.driving_minutes > 0 && s.theory_minutes && s.theory_minutes > 0) return 'Combined';
    if (s.driving_minutes && s.driving_minutes > 0) return 'Driving';
    if (s.theory_minutes && s.theory_minutes > 0) return 'Theory';
    return 'General';
  }

  transmissionTag(t: string | null): string {
    if (!t) return '—';
    return t === 'manual' ? 'Manual' : t === 'automatic' ? 'Automatic' : t === 'both' ? 'Both' : t;
  }
}

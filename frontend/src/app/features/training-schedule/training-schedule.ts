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
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { TrainingService } from '../../core/services/training.service';
import { PaymentService } from '../../core/services/payment.service';
import { AuthService } from '../../core/auth/auth.service';
import { CurrencyService } from '../../core/services/currency.service';

type Period = 'today' | 'this_week' | 'this_month' | 'last_month';

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
    TextareaModule,
  ],
  providers: [MessageService],
  templateUrl: './training-schedule.html',
})
export class TrainingScheduleCmp implements OnInit, OnDestroy {
  private trainingService = inject(TrainingService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);
  authService = inject(AuthService);
  currencyService = inject(CurrencyService);

  sessions = signal<any[]>([]);
  loading = signal(false);

  // ── Period & Date Range ──
  activePreset = signal<Period>('today');
  fromDate = signal<Date>(new Date());
  toDate = signal<Date>(new Date());

  presets: { label: string; key: Period }[] = [
    { label: 'Today', key: 'today' },
    { label: 'This Week', key: 'this_week' },
    { label: 'This Month', key: 'this_month' },
    { label: 'Last Month', key: 'last_month' },
  ];

  setPreset(key: Period) {
    this.activePreset.set(key);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (key) {
      case 'today':
        this.fromDate.set(now);
        this.toDate.set(now);
        break;
      case 'this_week': {
        const dow = now.getDay();
        const mon = new Date(now);
        mon.setDate(now.getDate() - ((dow + 6) % 7));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        this.fromDate.set(mon);
        this.toDate.set(sun);
        break;
      }
      case 'this_month':
        this.fromDate.set(new Date(y, m, 1));
        this.toDate.set(new Date(y, m + 1, 0));
        break;
      case 'last_month':
        this.fromDate.set(new Date(y, m - 1, 1));
        this.toDate.set(new Date(y, m, 0));
        break;
    }
    this.loadSchedule();
  }

  get fmtFrom(): string {
    return this._fmt(this.fromDate());
  }
  get fmtTo(): string {
    return this._fmt(this.toDate());
  }

  private _fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  onFromChange(d: Date | null) {
    if (d) { this.fromDate.set(d); this.activePreset.set('today'); this.loadSchedule(); }
  }
  onToChange(d: Date | null) {
    if (d) { this.toDate.set(d); this.activePreset.set('today'); this.loadSchedule(); }
  }

  // ── Multi-timer ──
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

  // ── End Session Dialog ──
  showEndDialog = signal(false);
  endTarget = signal<any>(null);
  endFeedback = signal('');

  // ── Payment (Pay All Pending style) ──
  paySessions = signal<PaymentSession[]>([]);
  payReceiptNumber = signal('');
  payInstallments: { due_date: Date | null; amount: number }[] = [];
  payDocumentDate = signal<Date | null>(null);
  receiptChecking = signal(false);
  receiptAvailable = signal<boolean | null>(null);
  paymentProcessing = signal(false);

  ngOnInit() {
    this.setPreset('today');
  }

  ngOnDestroy() {
    this.stopAllTimers();
  }

  async loadSchedule() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.trainingService.getDailySchedule(undefined, undefined, {
        period: 'daily',
        start_date: this.fmtFrom,
        end_date: this.fmtTo,
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
    this.paySessions.set([{ session, payNow: session.balance || 0, balance: session.balance || 0 }]);
    this.payReceiptNumber.set('');
    this.payInstallments = [];
    this.payDocumentDate.set(null);
    this.receiptAvailable.set(null);
    this.receiptChecking.set(false);
    if ((session.balance || 0) > 0) this.initPayInstallments();
    this.showManageDialog.set(true);
  }

  closeManage() {
    this.showManageDialog.set(false);
    this.manageTarget.set(null);
    this.paySessions.set([]);
    this.payInstallments = [];
  }

  onPayNowChange() { this.initPayInstallments(); }

  get payTotalNow(): number { return this.paySessions().reduce((s, it) => s + (it.payNow || 0), 0); }
  get payTotalBalance(): number { return this.paySessions().reduce((s, it) => s + Math.max(0, it.balance - (it.payNow || 0)), 0); }
  get payInstallmentSum(): number { return this.payInstallments.reduce((s, inst) => s + (inst.amount || 0), 0); }
  get payInstallmentBalanceMatch(): boolean { return this.payInstallmentSum >= this.payTotalBalance; }

  initPayInstallments() {
    const balance = this.payTotalBalance;
    if (balance <= 0) { this.payInstallments = []; return; }
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

  removePayInstallment(index: number) { this.payInstallments = this.payInstallments.filter((_, i) => i !== index); }

  async validatePayReceipt() {
    const rcp = this.payReceiptNumber();
    if (!rcp || rcp.trim().length < 2) { this.receiptAvailable.set(null); return; }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await firstValueFrom(this.paymentService.checkReceipt(rcp.trim()));
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch { this.receiptAvailable.set(null); }
    finally { this.receiptChecking.set(false); }
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
      const dateStr = this._fmt(new Date());
      const totalRemaining = this.payTotalBalance;

      // Pre-open receipt windows synchronously while still inside the user gesture,
      // so popup blockers do not block them after the async payment calls complete.
      const receiptWindows: (Window | null)[] = [];
      if (receipt && receipt.trim().length >= 2) {
        receiptWindows.push(window.open('', '_blank'));
      } else {
        for (const _ of items) receiptWindows.push(window.open('', '_blank'));
      }

      const receiptIds: string[] = [];
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
              due_date: this._fmt(inst.due_date!),
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
            notes: 'Payment from Training Schedule',
            receipt_number: receipt || undefined,
            installments,
            document_date: this.payDocumentDate()?.toISOString().split('T')[0] || undefined,
          })
        );

        if (paymentResult?.installments?.length) {
          await firstValueFrom(
            this.paymentService.updateInstallment(
              paymentResult.id, paymentResult.installments[0].id,
              { paid_date: dateStr, paid_amount: amount, notes: 'Paid' }
            )
          );
        }
        if (paymentResult?.id) receiptIds.push(paymentResult.id);
      }

      this.closeManage();
      await this.loadSchedule();

      if (receipt && receipt.trim().length >= 2) {
        const consultationId = items[0]?.session?.consultation_id;
        const win = receiptWindows[0];
        if (consultationId && win) {
          this.paymentService.getConsolidatedReceipt(receipt, consultationId).subscribe({
            next: (html: string) => { win.document.write(html); win.document.close(); },
            error: () => {
              win.close();
              this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' });
            },
          });
        } else if (win) {
          win.close();
        }
      } else {
        let winIndex = 0;
        for (const id of receiptIds) {
          if (id) {
            const win = receiptWindows[winIndex++];
            if (win) {
              this.paymentService.getReceipt(id).subscribe({
                next: (html: string) => { win.document.write(html); win.document.close(); },
                error: () => {
                  win.close();
                  this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' });
                },
              });
            }
          }
        }
        // Close any pre-opened windows that did not get used
        for (let i = winIndex; i < receiptWindows.length; i++) {
          const win = receiptWindows[i];
          if (win) win.close();
        }
      }

      this.messageService.add({
        severity: 'success', summary: 'Payment Recorded',
        detail: `Payment of ${this.payTotalNow} recorded`,
      });
    } catch (err: any) {
      this.messageService.add({
        severity: 'error', summary: 'Error',
        detail: err?.error?.detail || 'Failed to process payment',
      });
    } finally { this.paymentProcessing.set(false); }
  }

  // ── Session Start / End / Timer ──

  /** Maximum duration in seconds before warning (duration_minutes * 60 + 60s grace) */
  private _durationWarned = new Set<string>();

  openEndConfirm(session: any) {
    this.endTarget.set(session);
    this.endFeedback.set('');
    this.showEndDialog.set(true);
  }

  closeEndConfirm() {
    this.showEndDialog.set(false);
    this.endTarget.set(null);
    this.endFeedback.set('');
  }

  async confirmEndSession() {
    const session = this.endTarget();
    if (!session) return;
    try {
      const updated = await firstValueFrom(this.trainingService.endSession(session.id, this.endFeedback() || undefined));
      if (updated) {
        this.updateSessionInList(updated as any);
        this.stopTimer(session.id);
        if (this.manageTarget()?.id === session.id) this.manageTarget.set(updated as any);
      }
      this.closeEndConfirm();
      this.messageService.add({ severity: 'success', summary: 'Session Ended', detail: 'Session marked as completed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to end session' });
    }
  }

  async startSession(session: any) {
    try {
      const updated = await firstValueFrom(this.trainingService.startSession(session.id));
      if (updated) {
        this.updateSessionInList(updated as any);
        this.startTimer(updated as any);
        this.manageTarget.set(updated as any);
      }
      this.messageService.add({ severity: 'success', summary: 'Started', detail: 'Session started' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to start session' });
    }
  }

  durationExceeded(sessionId: string): boolean {
    const entry = this.timerDisplay()[sessionId];
    if (!entry) return false;
    const session = this.sessions().find(s => s.id === sessionId);
    if (!session?.duration_minutes) return false;
    const maxSecs = session.duration_minutes * 60 + 60;
    const [m, sec] = entry.split(':').map(Number);
    return m * 60 + sec > maxSecs;
  }

  startTimer(session: any) {
    if (!session.timer_started_at) return;
    if (this.timerIntervals.has(session.id)) clearInterval(this.timerIntervals.get(session.id));
    this._durationWarned.delete(session.id);
    const startedAt = new Date(session.timer_started_at).getTime();
    const maxSecs = (session.duration_minutes || 30) * 60 + 60;
    const interval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.timerDisplay.update(d => ({ ...d, [session.id]: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` }));
      if (elapsed > maxSecs && !this._durationWarned.has(session.id)) {
        this._durationWarned.add(session.id);
        this.messageService.add({
          severity: 'warn', sticky: true,
          summary: 'Duration Exceeded',
          detail: `Session ${session.id.slice(0, 8)} has exceeded ${session.duration_minutes || 30} min. Please end the session.`,
        });
      }
      if (elapsed % 30 === 0) {
        try {
          const updated = await firstValueFrom(this.trainingService.updateTimer(session.id, elapsed));
          if (updated) {
            this.updateSessionInList(updated as any);
            if (this.manageTarget()?.id === session.id) this.manageTarget.set(updated as any);
          }
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
    for (const [, interval] of this.timerIntervals) clearInterval(interval);
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

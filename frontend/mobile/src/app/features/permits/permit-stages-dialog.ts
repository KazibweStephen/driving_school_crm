import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  PermitAuditLog,
  PermitProgress,
  PermitService,
  PermitTracker,
} from '../../core/services/permit.service';

interface StageDef {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-permit-stages-dialog',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule,
    DatePickerModule, SelectModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './permit-stages-dialog.html',
})
export class PermitStagesDialog {

  @Output() changed = new EventEmitter<void>();

  visible = signal(false);
  tracker: PermitTracker | null = null;
  progress: PermitProgress | null = null;
  auditLogs = signal<PermitAuditLog[]>([]);
  saving = signal(false);

  overrideEligible = true;
  overrideReason = '';

  newTestDate: Date | null = null;
  testedOnDate: Date | null = null;
  gotLearnersDate: Date | null = null;
  learnersDueDate: Date | null = null;
  learnersExpiryDate: Date | null = null;
  permitReceivedDate: Date | null = null;

  stages: StageDef[] = [
    { key: 'not_qualified', label: 'Not Qualified', desc: 'A learner\'s permit requires at least 50% of the package paid.' },
    { key: 'eligible', label: 'Eligible', desc: 'Client qualifies. Record the Learner Permit Payment expense, then enter the issue date.' },
    { key: 'learners_active', label: 'Learners Active', desc: 'Permit issued. Must mature 30 days before testing.' },
    { key: 'due_for_testing', label: 'Due For Testing', desc: 'Permit matured. Pay testing expenses (Test/Police/IOV).' },
    { key: 'test_ready', label: 'Testing Booked', desc: 'Testing expenses paid. Book a test date.' },
    { key: 'waiting_for_permit', label: 'Waiting For Permit', desc: 'Test done. Confirm tested-on date, then pay Permit Payment.' },
    { key: 'permit_paid', label: 'Permit Paid', desc: 'Permit payment made. Record permit received when it arrives.' },
    { key: 'permit_received', label: 'Permit Received', desc: 'Workflow complete.' },
  ];

  constructor(
    private permitService: PermitService,
    private messageService: MessageService,
    private router: Router,
  ) {}

  get status(): string {
    return this.tracker?.status ?? 'not_qualified';
  }

  get stageIndex(): number {
    return this.stages.findIndex(s => s.key === this.status);
  }

  get isPaidRatioEligible(): boolean {
    return !!this.tracker && this.tracker.paid_ratio >= 0.5;
  }

  get learnerExpensePaid(): boolean {
    return !!this.tracker?.learner_expense_paid;
  }

  get testingExpensePaid(): boolean {
    return !!this.tracker?.testing_expense_paid;
  }

  get permitExpensePaid(): boolean {
    return !!this.tracker?.permit_expense_paid;
  }

  get showLearnerExpense(): boolean {
    return !!this.tracker && (this.status === 'not_qualified' || this.status === 'eligible') && !this.learnerExpensePaid;
  }

  get showTestingExpenses(): boolean {
    return !!this.tracker && this.status === 'due_for_testing' && !this.testingExpensePaid;
  }

  get showPermitExpense(): boolean {
    return !!this.tracker && this.status === 'waiting_for_permit' && !this.permitExpensePaid;
  }

  get stageExpenseCategories(): string[] {
    if (this.showLearnerExpense) return ['Learner Permit Payment'];
    if (this.showTestingExpenses) return ['Test Booking', 'Police Booking', 'IOV Fees'];
    if (this.showPermitExpense) return ['Permit Payment'];
    return [];
  }

  // Journey steps: only the current stage's action is enabled; future steps stay visible (but locked).
  get learnerExpenseEnabled(): boolean {
    return this.stageIndex >= 0 && this.stageIndex <= 1 && !this.learnerExpensePaid;
  }
  get learnerExpenseDone(): boolean {
    return this.learnerExpensePaid;
  }

  get learnerDatesEnabled(): boolean {
    return this.stageIndex === 1 || this.stageIndex === 2
      || (!!this.tracker?.learner_expense_paid && !this.progress?.got_learners_permit_date);
  }
  get learnerDatesDone(): boolean {
    return !!this.progress?.got_learners_permit_date;
  }

  get testingDueEnabled(): boolean {
    return this.stageIndex === 3 && !this.testingExpensePaid;
  }
  get testingDueDone(): boolean {
    return this.testingExpensePaid;
  }

  get testDateEnabled(): boolean {
    return this.stageIndex === 4 || (this.stageIndex === 3 && this.testingExpensePaid);
  }
  get testDateDone(): boolean {
    return !!this.progress?.test_date;
  }

  get testedOnEnabled(): boolean {
    return this.stageIndex === 5;
  }
  get testedOnDone(): boolean {
    return !!this.progress?.tested_on_date;
  }

  get permitExpenseEnabled(): boolean {
    return this.stageIndex === 5 && !this.permitExpensePaid;
  }
  get permitExpenseDone(): boolean {
    return this.permitExpensePaid;
  }

  get permitReceivedEnabled(): boolean {
    return this.stageIndex === 6;
  }
  get permitReceivedDone(): boolean {
    return !!this.progress?.permit_received_date;
  }

  open(tracker: PermitTracker) {
    this.tracker = tracker;
    this.overrideEligible = true;
    this.overrideReason = '';
    this.visible.set(true);
    this.loadProgress();
  }

  close() {
    this.visible.set(false);
    this.tracker = null;
  }

  async loadProgress() {
    if (!this.tracker) return;
    try {
      const pp = await this.permitService.getPermitProgress(this.tracker.cart_item_id).toPromise();
      this.progress = pp ?? null;
      if (pp) {
        this.gotLearnersDate = this.dateOrNull(pp.got_learners_permit_date);
        this.learnersDueDate = this.dateOrNull(pp.learners_due_date);
        this.learnersExpiryDate = this.dateOrNull(pp.learners_expiry_date);
        this.newTestDate = this.dateOrNull(pp.test_date);
        this.testedOnDate = this.dateOrNull(pp.tested_on_date);
        this.permitReceivedDate = this.dateOrNull(pp.permit_received_date);
      }
      const logs = await this.permitService.getAuditLogs(this.tracker.cart_item_id).toPromise();
      this.auditLogs.set(logs || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load permit progress' });
    }
  }

  dateOrNull(v: string | null): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  localIso(d: Date | null): string | undefined {
    if (!d) return undefined;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  suggestDueDate() {
    if (this.gotLearnersDate && !this.learnersDueDate) {
      const d = new Date(this.gotLearnersDate);
      d.setDate(d.getDate() + 30);
      this.learnersDueDate = d;
    }
  }

  async saveLearnerDates() {
    await this.saveFields({
      got_learners_permit_date: this.localIso(this.gotLearnersDate),
      learners_due_date: this.localIso(this.learnersDueDate),
      learners_expiry_date: this.localIso(this.learnersExpiryDate),
    });
  }

  async saveTestDate() {
    await this.saveFields({ test_date: this.localIso(this.newTestDate) });
  }

  async saveTestedOnDate() {
    await this.saveFields({ tested_on_date: this.localIso(this.testedOnDate) });
  }

  async savePermitReceivedDate() {
    await this.saveFields({ permit_received_date: this.localIso(this.permitReceivedDate) });
  }

  private async saveFields(fields: Record<string, string | undefined>) {
    if (!this.tracker) return;
    this.saving.set(true);
    try {
      const updated = await this.permitService.updatePermitProgress(this.tracker.cart_item_id, fields as any).toPromise();
      if (updated) this.progress = updated;
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Permit dates updated' });
      this.changed.emit();
      await this.loadProgress();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save permit dates' });
    } finally {
      this.saving.set(false);
    }
  }

  async overrideEligibilityNow() {
    if (!this.tracker) return;
    if (!this.overrideReason.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Reason required', detail: 'Please explain why you are overriding this client\'s eligibility' });
      return;
    }
    this.saving.set(true);
    try {
      const updated = await this.permitService.overrideEligibility(
        this.tracker.cart_item_id, this.overrideEligible, this.overrideReason.trim()
      ).toPromise();
      if (updated) this.progress = updated;
      this.messageService.add({ severity: 'success', summary: 'Overridden', detail: 'Eligibility updated with audit trail' });
      this.overrideReason = '';
      this.changed.emit();
      await this.loadProgress();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to override eligibility' });
    } finally {
      this.saving.set(false);
    }
  }

  goToExpenses() {
    if (!this.tracker) return;
    const consultationId = this.tracker.consultation_id;
    const cartItemId = this.tracker.cart_item_id;
    const category = this.showLearnerExpense ? 'Learner Permit Payment'
      : this.showPermitExpense ? 'Permit Payment'
      : '';
    const back = this.router.url && !this.router.url.startsWith('/expenses')
      ? this.router.url
      : '/permits';
    this.close();
    this.router.navigate(['expenses'], {
      queryParams: {
        consultation_id: consultationId,
        cart_item_id: cartItemId,
        category: category || undefined,
        back,
      },
    });
  }

  auditLabel(field: string): string {
    const map: Record<string, string> = {
      got_learners_permit_date: 'Learner\'s permit issue date',
      learners_due_date: 'Due-for-testing date',
      learners_expiry_date: 'Permit expiry date',
      test_date: 'Scheduled test date',
      tested_on_date: 'Tested-on date',
      permit_received_date: 'Permit received date',
      test_ready: 'Testing booked',
      permit_paid: 'Permit payment marked',
      waiting_for_permit: 'Waiting for permit',
      eligibility: 'Eligibility',
      notes: 'Notes',
    };
    return map[field] || field;
  }
}

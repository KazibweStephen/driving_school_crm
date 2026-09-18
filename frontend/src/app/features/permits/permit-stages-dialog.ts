import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { PermitAuditLog, PermitProgress, PermitProgressService, PermitTracker } from '../../core/services/permit-progress.service';

interface StageDef {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-permit-stages-dialog',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule,
    DatePickerModule, SelectModule, TagModule, ToastModule,
  ],
  templateUrl: './permit-stages-dialog.html',
})
export class PermitStagesDialog {

  @Output() changed = new EventEmitter<void>();

  visible = signal(false);
  tracker: PermitTracker | null = null;
  progress: PermitProgress | null = null;
  auditLogs = signal<PermitAuditLog[]>([]);
  saving = signal(false);

  // Eligibility override
  overrideEligible = true;
  overrideReason = '';

  // Booked test date + actual test date
  newTestDate: Date | null = null;
  testedOnDate: Date | null = null;
  gotLearnersDate: Date | null = null;
  learnersDueDate: Date | null = null;
  learnersExpiryDate: Date | null = null;
  permitReceivedDate: Date | null = null;

  stages: StageDef[] = [
    { key: 'not_qualified', label: 'Not Qualified', desc: 'Client has not yet qualified. A Learner\'s Permit application requires at least 50% of the package paid.' },
    { key: 'eligible', label: 'Eligible', desc: 'Client qualifies for a Learner\'s Permit. Record the Learner Permit Payment expense, then enter the issue date.' },
    { key: 'learners_active', label: 'Learners Active', desc: 'Learner\'s Permit issued. The permit must mature (30 days) before testing can happen.' },
    { key: 'due_for_testing', label: 'Due For Testing', desc: 'The Learner\'s Permit has matured. Pay testing expenses (Test Booking, Police Booking, IOV Fees) to become test-ready.' },
    { key: 'test_ready', label: 'Testing Booked', desc: 'Testing expenses are paid. Book a testing date and reserve IOV fees, then record the scheduled test date.' },
    { key: 'waiting_for_permit', label: 'Waiting For Permit', desc: 'The test has been completed. Confirm the tested-on date, then pay the Permit Payment expense.' },
    { key: 'permit_paid', label: 'Permit Paid', desc: 'The permit payment has been made. Record the expected receipt date and mark the permit received when it arrives.' },
    { key: 'permit_received', label: 'Permit Received', desc: 'The permit has been received. This completes the tracking workflow.' },
  ];

  constructor(
    private permitService: PermitProgressService,
    private messageService: MessageService,
    private router: Router,
  ) {}

  get today(): Date {
    return new Date();
  }

  get status(): string {
    return this.tracker?.status ?? 'not_qualified';
  }

  // Expense-status-aware statuses map onto the base stage they belong to, so the
  // stepper highlights the stage whose expense is being processed.
  private readonly statusStageIndexMap: Record<string, number> = {
    learner_pending_approval: 1,
    learner_pending_payment: 1,
    learner_paid: 1,
    test_pending_approval: 3,
    test_pending_payment: 3,
    permit_pending_approval: 5,
    permit_pending_payment: 5,
  };

  get stageIndex(): number {
    if (this.status in this.statusStageIndexMap) {
      return this.statusStageIndexMap[this.status];
    }
    return this.stages.findIndex(s => s.key === this.status);
  }

  get learnerExpensePaid(): boolean {
    return !!this.tracker?.learner_expense_paid;
  }

  get learnerExpensePending(): boolean {
    const s = this.tracker?.learner_expense_status;
    return s === 'pending' || s === 'approved';
  }

  get testingExpensePending(): boolean {
    const s = this.tracker?.testing_expense_status;
    return s === 'pending' || s === 'approved';
  }

  get permitExpensePending(): boolean {
    const s = this.tracker?.permit_expense_status;
    return s === 'pending' || s === 'approved';
  }

  get testingExpensePaid(): boolean {
    return !!this.tracker?.testing_expense_paid;
  }

  get permitExpensePaid(): boolean {
    return !!this.tracker?.permit_expense_paid;
  }

  get isPaidRatioEligible(): boolean {
    return !!this.tracker && this.tracker.paid_ratio >= 0.5;
  }

  get eligiblePending(): boolean {
    // Either they already qualify by payment or the testing/permit expense is
    // already paid — an admin just needs to add the corresponding date.
    return !!this.tracker && (
      this.tracker.paid_ratio >= 0.5 ||
      this.tracker.learner_expense_paid ||
      this.tracker.testing_expense_paid ||
      this.tracker.permit_expense_paid
    );
  }

  get showLearnerExpense(): boolean {
    return !!this.tracker && (this.status === 'not_qualified' || this.status === 'eligible'
      || this.status === 'learner_pending_approval' || this.status === 'learner_pending_payment')
      && !this.learnerExpensePaid;
  }

  get showTestingExpenses(): boolean {
    return !!this.tracker && (this.status === 'due_for_testing'
      || this.status === 'test_pending_approval' || this.status === 'test_pending_payment')
      && !this.testingExpensePaid;
  }

  get showPermitExpense(): boolean {
    return !!this.tracker && (this.status === 'waiting_for_permit'
      || this.status === 'permit_pending_approval' || this.status === 'permit_pending_payment')
      && !this.permitExpensePaid;
  }

  get stageExpenseCategories(): string[] {
    if (this.showLearnerExpense) return ['Learner Permit Payment'];
    if (this.showTestingExpenses) return ['Test Booking', 'Police Booking', 'IOV Fees'];
    if (this.showPermitExpense) return ['Permit Payment'];
    return [];
  }

  // Journey steps: each is enabled only when it is the current stage's action.
  // Future steps stay visible (but disabled) so admins can see the path ahead.
  get learnerExpenseEnabled(): boolean {
    return this.stageIndex >= 0 && this.stageIndex <= 1 && !this.learnerExpensePaid;
  }
  get learnerExpenseDone(): boolean {
    return this.learnerExpensePaid;
  }

  get learnerDatesEnabled(): boolean {
    if (this.learnerExpensePending) return false;
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
    if (this.permitExpensePending) return false;
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
    if (this.permitExpensePending) return false;
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
      const pp = await this.permitService.get(this.tracker.cart_item_id).toPromise();
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

  // Suggest due date = issue date + 30 days
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
      const updated = await this.permitService.update(this.tracker.cart_item_id, {
        ...fields,
        test_ready: this.testingExpensePaid,
        permit_paid: this.permitExpensePaid,
      } as any).toPromise();
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
    this.router.navigate(['/expenses'], {
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
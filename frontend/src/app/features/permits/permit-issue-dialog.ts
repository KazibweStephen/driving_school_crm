import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/auth/auth.service';
import { FinanceService } from '../../core/services/finance.service';
import {
  PermitExpenseChecklistItem,
  PermitExpenseChecklistResponse,
  PermitIssueReadiness,
  PermitProgressService,
  PermitTracker,
} from '../../core/services/permit-progress.service';

@Component({
  selector: 'app-permit-issue-dialog',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    DatePickerModule, InputNumberModule, TextareaModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './permit-issue-dialog.html',
})
export class PermitIssueDialog {
  @Output() changed = new EventEmitter<void>();

  visible = signal(false);
  tracker: PermitTracker | null = null;
  checklist = signal<PermitExpenseChecklistResponse | null>(null);
  readiness = signal<PermitIssueReadiness | null>(null);
  loading = signal(false);
  saving = signal(false);

  issueDate: Date | null = null;
  issueNotes = '';
  rejectTarget: PermitExpenseChecklistItem | null = null;
  rejectReason = '';
  showReject = signal(false);

  constructor(
    private permitService: PermitProgressService,
    private financeService: FinanceService,
    private authService: AuthService,
    private messageService: MessageService,
  ) {}

  get items(): PermitExpenseChecklistItem[] {
    return this.checklist()?.items ?? [];
  }

  get canCreateExpense(): boolean { return this.authService.hasPermission('expenses.create'); }
  get canApproveExpense(): boolean { return this.authService.hasPermission('expenses.approve'); }
  get canRejectExpense(): boolean { return this.authService.hasPermission('expenses.reject'); }
  get canPayExpense(): boolean { return this.authService.hasPermission('expenses.pay'); }
  get canIssuePermit(): boolean { return this.authService.hasPermission('training.edit'); }

  /** A permit stage is a real fee — never file it at zero (or blank). */
  canFile(item: PermitExpenseChecklistItem): boolean {
    return item.can_file && !!item.draft_amount && item.draft_amount > 0;
  }

  get balanceOk(): boolean {
    return !!this.readiness()?.has_zero_balance;
  }

  get canSubmit(): boolean {
    return this.canIssuePermit && this.balanceOk && !this.readiness()?.unsettled?.length
      && !!this.issueDate;
  }

  open(tracker: PermitTracker) {
    this.tracker = tracker;
    this.issueNotes = '';
    this.issueDate = null;
    this.visible.set(true);
    this.load();
  }

  close() {
    this.visible.set(false);
    this.tracker = null;
  }

  async load() {
    if (!this.tracker) return;
    this.loading.set(true);
    try {
      const [checklist, readiness] = await Promise.all([
        this.permitService.getPermitExpenses(this.tracker.cart_item_id).toPromise(),
        this.permitService.getPermitIssueReadiness(this.tracker.cart_item_id).toPromise(),
      ]);
      if (checklist) {
        for (const it of checklist.items) {
          it.draft_amount = it.can_file ? (it.expected_amount ?? null) : it.amount;
          it.draft_date = it.default_date ? this.dateOrNull(it.default_date) : null;
        }
        this.checklist.set(checklist);
      }
      this.readiness.set(readiness ?? null);
      this.issueDate = readiness?.suggested_issue_date
        ? this.dateOrNull(readiness.suggested_issue_date)
        : this.dateOrNull(readiness?.permit_received_date ?? null);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load permit details' });
    } finally {
      this.loading.set(false);
    }
  }

  // ── Checklist actions (same as the client profile) ───────────────

  async fileExpense(item: PermitExpenseChecklistItem) {
    if (!item.can_file) return;
    if (!this.canFile(item)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Amount required',
        detail: `Enter an amount greater than zero for ${item.category_name}`,
      });
      return;
    }
    const branchId = this.tracker?.branch_id;
    if (!branchId) {
      this.messageService.add({ severity: 'error', summary: 'No branch', detail: 'This client has no branch; assign one first.' });
      return;
    }
    this.saving.set(true);
    try {
      await this.financeService.createExpense({
        branch_id: branchId,
        amount: item.draft_amount as number,
        category: item.category_name,
        consultation_id: this.tracker?.consultation_id,
        cart_item_id: this.tracker?.cart_item_id,
        account: item.account,
        expense_date: item.draft_date ? this.localIso(item.draft_date) : undefined,
        description: `${item.category_name} — ${this.readiness()?.client_name ?? ''}`.trim(),
      }).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Filed', detail: `${item.category_name} filed for approval` });
      await this.load();
      this.changed.emit();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || `Failed to file ${item.category_name}` });
    } finally {
      this.saving.set(false);
    }
  }

  async approveExpense(item: PermitExpenseChecklistItem) {
    if (!item.expense_id) return;
    this.saving.set(true);
    try {
      await this.financeService.approveExpense(item.expense_id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Approved', detail: `${item.category_name} approved` });
      await this.load();
      this.changed.emit();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || `Failed to approve ${item.category_name}` });
    } finally {
      this.saving.set(false);
    }
  }

  openReject(item: PermitExpenseChecklistItem) {
    this.rejectTarget = item;
    this.rejectReason = '';
    this.showReject.set(true);
  }

  async submitReject() {
    const item = this.rejectTarget;
    if (!item?.expense_id || !this.rejectReason.trim()) return;
    this.saving.set(true);
    try {
      await this.financeService.rejectExpense(item.expense_id, this.rejectReason.trim()).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Declined', detail: `${item.category_name} declined` });
      this.showReject.set(false);
      await this.load();
      this.changed.emit();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to decline expense' });
    } finally {
      this.saving.set(false);
    }
  }

  async payExpense(item: PermitExpenseChecklistItem) {
    if (!item.expense_id) return;
    this.saving.set(true);
    try {
      await this.financeService.markExpensePaid(item.expense_id, {}).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Paid', detail: `${item.category_name} marked paid` });
      await this.load();
      this.changed.emit();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || `Failed to pay ${item.category_name}` });
    } finally {
      this.saving.set(false);
    }
  }

  // ── Issuing ─────────────────────────────────────────────────────

  async submitIssue() {
    if (!this.tracker || !this.canSubmit || !this.issueDate) return;
    this.saving.set(true);
    try {
      await this.permitService.issuePermit(
        this.tracker.cart_item_id,
        this.localIso(this.issueDate) as string
      ).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Permit issued', detail: 'The permit has been issued to the client' });
      this.changed.emit();
      this.close();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Cannot issue permit', detail: e?.error?.detail || 'Failed to issue the permit' });
    } finally {
      this.saving.set(false);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  statusLabel(status: string | null): string {
    switch (status) {
      case 'pending': return 'Pending Approval';
      case 'approved': return 'Pending Payment';
      case 'paid': return 'Paid';
      case 'rejected': return 'Declined';
      default: return 'Not Filed';
    }
  }

  statusClass(status: string | null): string {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'approved': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
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
}

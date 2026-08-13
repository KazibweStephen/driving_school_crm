import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { UserService, UserTransfer } from '../../../core/services/user.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CompanyService, Company, Branch } from '../../../core/services/company.service';

@Component({
  selector: 'app-transfer-history',
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './transfer-history.html',
})
export class TransferHistory implements OnInit {
  transfers = signal<UserTransfer[]>([]);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  pageSize = signal(50);
  loading = signal(false);

  companies = signal<Company[]>([]);
  branches = signal<Branch[]>([]);
  companyFilter = signal<string | null>(null);
  userPhoneFilter = signal('');

  reversingId = signal<string | null>(null);

  get isSuperUser(): boolean {
    return this.auth.currentUserRole() === 'super_user';
  }

  get canReverse(): boolean {
    return this.auth.hasPermission('users.manage');
  }

  get companyOptions() {
    return this.companies().map((c) => ({ label: c.name, value: c.id }));
  }

  constructor(
    private userService: UserService,
    private auth: AuthService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadCompanies();
    this.loadAllBranches();
    this.loadTransfers();
  }

  async loadCompanies() {
    try {
      const res = await this.companyService.list().toPromise();
      this.companies.set(res || []);
    } catch {}
  }

  async loadAllBranches() {
    try {
      const res = await this.companyService.listBranches('').toPromise();
      this.branches.set(res || []);
    } catch {
      try {
        const companies = await this.companyService.list().toPromise();
        const all: Branch[] = [];
        if (companies) {
          for (const c of companies) {
            const branches = await this.companyService.listBranches(c.id).toPromise();
            if (branches) all.push(...branches);
          }
        }
        this.branches.set(all);
      } catch {}
    }
  }

  async loadTransfers() {
    this.loading.set(true);
    try {
      const res = await this.userService.getTransferHistory({
        company_id: this.isSuperUser ? (this.companyFilter() || undefined) : undefined,
        user_phone: this.userPhoneFilter() || undefined,
        page: this.page(),
        page_size: this.pageSize(),
      }).toPromise();
      if (res) {
        this.transfers.set(res.transfers);
        this.total.set(res.total);
        this.totalPages.set(res.total_pages);
      }
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load transfer history',
      });
    } finally {
      this.loading.set(false);
    }
  }

  onSearch() {
    this.page.set(1);
    this.loadTransfers();
  }

  onPageChange(event: { first: number; rows: number }) {
    this.page.set(Math.floor(event.first / event.rows) + 1);
    this.loadTransfers();
  }

  companyName(id: string | null): string {
    if (!id) return '-';
    return this.companies().find(c => c.id === id)?.name || id.substring(0, 8);
  }

  branchNames(ids: string[] | null | undefined): string {
    if (!ids || ids.length === 0) return '-';
    const names = ids
      .map(id => this.branches().find(b => b.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : `${ids.length} branch(es)`;
  }

  confirmReverse(transfer: UserTransfer) {
    this.confirmationService.confirm({
      message: `Reverse the transfer of ${transfer.user_phone} back to ${transfer.from_company.name}? This will restore their original company and branch assignments.`,
      header: 'Reverse Transfer',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.reverseTransfer(transfer),
    });
  }

  async reverseTransfer(transfer: UserTransfer) {
    this.reversingId.set(transfer.id);
    try {
      await this.userService.reverseTransfer(transfer.id).toPromise();
      await this.loadTransfers();
      this.messageService.add({
        severity: 'success',
        summary: 'Reversed',
        detail: 'Transfer has been reversed successfully',
      });
    } catch (e: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: e?.error?.detail || 'Failed to reverse transfer',
      });
    } finally {
      this.reversingId.set(null);
    }
  }

  statusSeverity(isReversed: boolean): 'success' | 'warn' {
    return isReversed ? 'warn' : 'success';
  }
}

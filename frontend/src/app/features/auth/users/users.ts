import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { UserService, User } from '../../../core/services/user.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CompanyService, Company, Branch } from '../../../core/services/company.service';
import { ChangePinDialog } from '../../../shared/components/change-pin-dialog';

@Component({
  selector: 'app-users',
  imports: [
    FormsModule,
    DatePipe,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    ChangePinDialog,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users implements OnInit {
  users = signal<User[]>([]);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  pageSize = signal(50);
  search = signal('');
  roleFilter = signal<string | null>(null);
  statusFilter = signal<string | null>(null);
  companyFilter = signal<string | null>(null);
  loading = signal(false);

  showCreateDialog = signal(false);
  showEditDialog = signal(false);
  showResetPinDialog = signal(false);

  editingUser = signal<User | null>(null);

  companies = signal<Company[]>([]);
  branches = signal<Branch[]>([]);
  newUser: { phone: string; first_name: string; last_name: string; role: string; company_id: string | null; is_company_admin: boolean; can_backdate: boolean; branch_ids: string[] } = { phone: '', first_name: '', last_name: '', role: 'office_admin', company_id: null, is_company_admin: false, can_backdate: false, branch_ids: [] };
  editData: { first_name: string; last_name: string; role: string; company_id: string | null; is_company_admin: boolean; can_backdate: boolean; branch_ids: string[] } = { first_name: '', last_name: '', role: '', company_id: null, is_company_admin: false, can_backdate: false, branch_ids: [] };
  get isSuperUser(): boolean {
    return this.auth.currentUserRole() === 'super_user';
  }
  get roleOptions() {
    return this.isSuperUser ? this.roles : this.roles.filter(r => r.value !== 'company_super_user');
  }
  get companyOptions() {
    return this.companies().map((c) => ({ label: c.name, value: c.id }));
  }
  resetPinResult = signal<string | null>(null);
  @ViewChild('changePinDialog') changePinDialog!: ChangePinDialog;

  roles = [
    { label: 'Super User', value: 'super_user' },
    { label: 'Company Super User', value: 'company_super_user' },
    { label: 'Branch Supervisor', value: 'branch_supervisor' },
    { label: 'Office Admin', value: 'office_admin' },
    { label: 'Instructor', value: 'instructor' },
    { label: 'Manager', value: 'manager' },
    { label: 'Reception', value: 'reception' },
  ];

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

  statuses = [
    { label: 'Active', value: 'active' },
    { label: 'Pending Approval', value: 'pending_approval' },
    { label: 'Blocked', value: 'blocked' },
    { label: 'Deactivated', value: 'deactivated' },
  ];

  constructor(
    private userService: UserService,
    private auth: AuthService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.companyFilter.set(this.isSuperUser ? this.auth.currentUserCompanyId() : null);
    this.loadUsers();
    this.loadCompanies();
    this.loadBranches();
  }

  async loadBranches() {
    try {
      const res = await this.companyService.myBranches().toPromise();
      this.branches.set(res || []);
    } catch {}
  }

  async loadCompanies() {
    try {
      const res = await this.companyService.list().toPromise();
      this.companies.set(res || []);
    } catch {}
  }

  async loadUsers() {
    this.loading.set(true);
    try {
      const res = await this.userService
        .list({
          search: this.search() || undefined,
          role: this.roleFilter() || undefined,
          status: this.statusFilter() || undefined,
          company_id: this.isSuperUser ? this.companyFilter() || undefined : undefined,
          page: this.page(),
          page_size: this.pageSize(),
        })
        .toPromise();
      if (res) {
        this.users.set(res.users);
        this.total.set(res.total);
        this.totalPages.set(res.total_pages);
      }
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load users',
      });
    } finally {
      this.loading.set(false);
    }
  }

  onSearch() {
    this.page.set(1);
    this.loadUsers();
  }

  clearFilters() {
    this.search.set('');
    this.roleFilter.set(null);
    this.statusFilter.set(null);
    this.companyFilter.set(this.isSuperUser ? this.auth.currentUserCompanyId() : null);
    this.page.set(1);
    this.loadUsers();
  }

  onPageChange(event: { first: number; rows: number }) {
    this.page.set(Math.floor(event.first / event.rows) + 1);
    this.loadUsers();
  }

  async createUser() {
    this.loading.set(true);
    try {
      await this.userService
        .create({
          phone: this.newUser.phone,
          name: this.fullName(this.newUser.first_name, this.newUser.last_name),
          first_name: this.newUser.first_name,
          last_name: this.newUser.last_name,
          role: this.newUser.role,
          company_id: this.newUser.company_id,
          is_company_admin: this.newUser.is_company_admin,
          can_backdate: this.newUser.can_backdate,
          branch_ids: this.newUser.branch_ids,
        })
        .toPromise();
      this.showCreateDialog.set(false);
      this.newUser = { phone: '', first_name: '', last_name: '', role: 'office_admin', company_id: null, is_company_admin: false, can_backdate: false, branch_ids: [] };
      await this.loadUsers();
      this.messageService.add({
        severity: 'success',
        summary: 'Created',
        detail: 'User created successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create user',
      });
    } finally {
      this.loading.set(false);
    }
  }

  fullName(first: string, last: string): string {
    return [first.trim(), last.trim()].filter(Boolean).join(' ');
  }

  openEdit(user: User) {
    this.editingUser.set(user);
    this.editData = { first_name: user.first_name, last_name: user.last_name, role: user.role, company_id: user.company_id, is_company_admin: user.is_company_admin, can_backdate: user.can_backdate, branch_ids: user.branch_ids || [] };
    this.showEditDialog.set(true);
  }

  async saveEdit() {
    const user = this.editingUser();
    if (!user) return;
    this.loading.set(true);
    try {
      await this.userService
        .update(user.phone, {
          name: this.fullName(this.editData.first_name, this.editData.last_name),
          first_name: this.editData.first_name,
          last_name: this.editData.last_name,
          role: this.editData.role,
          company_id: this.editData.company_id,
          is_company_admin: this.editData.is_company_admin,
          can_backdate: this.editData.can_backdate,
          branch_ids: this.editData.branch_ids,
        })
        .toPromise();
      this.showEditDialog.set(false);
      this.editingUser.set(null);
      await this.loadUsers();
      this.messageService.add({
        severity: 'success',
        summary: 'Updated',
        detail: 'User updated successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update user',
      });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDeactivate(user: User) {
    this.confirmationService.confirm({
      message: `Deactivate ${user.name} (${user.phone})? They will not be able to log in.`,
      header: 'Deactivate User',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deactivateUser(user),
    });
  }

  async deactivateUser(user: User) {
    try {
      await this.userService.deactivate(user.phone).toPromise();
      await this.loadUsers();
      this.messageService.add({
        severity: 'success',
        summary: 'Deactivated',
        detail: `${user.name} has been deactivated`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to deactivate user',
      });
    }
  }

  async activateUser(user: User) {
    try {
      await this.userService
        .update(user.phone, { status: 'active' })
        .toPromise();
      await this.loadUsers();
      this.messageService.add({
        severity: 'success',
        summary: 'Activated',
        detail: `${user.name} has been activated`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to activate user',
      });
    }
  }

  async approveUser(user: User) {
    try {
      await this.userService.approve(user.phone).toPromise();
      await this.loadUsers();
      this.messageService.add({
        severity: 'success',
        summary: 'Approved',
        detail: `${user.name} has been approved`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to approve user',
      });
    }
  }

  confirmResetPin(user: User) {
    this.confirmationService.confirm({
      message: `Reset PIN for ${user.name} (${user.phone})? The user will need the new PIN to log in.`,
      header: 'Reset PIN',
      icon: 'pi pi-key',
      accept: () => this.resetPin(user),
    });
  }

  async resetPin(user: User) {
    try {
      const res = await this.userService.resetPin(user.phone).toPromise();
      if (res) {
        this.resetPinResult.set(res.new_pin);
        this.showResetPinDialog.set(true);
        this.messageService.add({
          severity: 'success',
          summary: 'PIN Reset',
          detail: `New PIN generated for ${user.name}`,
        });
      }
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to reset PIN',
      });
    }
  }

  roleLabel(value: string): string {
    return this.roles.find((r) => r.value === value)?.label || value;
  }

  statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'info' {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending_approval':
        return 'info';
      case 'blocked':
        return 'warn';
      default:
        return 'danger';
    }
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  PermissionService,
  PermissionGroup,
  ROLE_LABELS,
} from '../../core/services/permission.service';
import { CompanyService, Company } from '../../core/services/company.service';
import { AuthService } from '../../core/auth/auth.service';

const EDITABLE_ROLES = [
  'company_super_user',
  'manager',
  'branch_supervisor',
  'supervisor',
  'office_admin',
  'instructor',
  'reception',
];

@Component({
  selector: 'app-permissions',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, CheckboxModule, ToastModule],
  providers: [MessageService],
  templateUrl: './permissions.html',
})
export class PermissionsCmp implements OnInit {
  groups = signal<PermissionGroup[]>([]);
  companies = signal<Company[]>([]);
  roles = EDITABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r] || r, value: r }));
  isSuperUser = false;
  selectedCompanyId = signal<string | null>(null);
  selectedRole = signal<string | null>(null);
  selectedCodes = signal<string[]>([]);
  loading = signal(false);
  saving = signal(false);

  constructor(
    private permissionService: PermissionService,
    private companyService: CompanyService,
    private auth: AuthService,
    private messageService: MessageService,
  ) {}

  async ngOnInit() {
    this.isSuperUser = this.auth.currentUserRole() === 'super_user';
    try {
      const groups = await this.permissionService.catalog().toPromise();
      this.groups.set(groups || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load permission catalog' });
    }

    if (this.isSuperUser) {
      try {
        const list = await this.companyService.list().toPromise();
        this.companies.set(list || []);
        const activeCompanyId = this.auth.currentUserCompanyId();
        if (list?.length) {
          const active = list.find((c) => c.id === activeCompanyId);
          this.selectedCompanyId.set(active ? active.id : list[0].id);
        }
      } catch {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load companies' });
      }
    } else {
      this.selectedCompanyId.set(this.auth.currentUserCompanyId());
    }

    if (this.selectedCompanyId()) {
      await this.loadRole();
    }
  }

  async onCompanyChange() {
    await this.loadRole();
  }

  async loadRole() {
    const companyId = this.selectedCompanyId();
    if (!companyId) return;
    this.loading.set(true);
    try {
      const res = await this.permissionService.matrix(companyId).toPromise();
      if (res) {
        const existing = this.selectedRole();
        this.selectedRole.set(existing && res.matrix[existing] ? existing : 'company_super_user');
        this.selectedCodes.set(res.matrix[this.selectedRole()!] || []);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load role matrix' });
    } finally {
      this.loading.set(false);
    }
  }

  async onRoleChange() {
    const role = this.selectedRole();
    const companyId = this.selectedCompanyId();
    if (!role || !companyId) return;
    this.loading.set(true);
    try {
      const res = await this.permissionService.rolePermissions(role, companyId).toPromise();
      this.selectedCodes.set(res?.permissions || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load role permissions' });
    } finally {
      this.loading.set(false);
    }
  }

  has(code: string): boolean {
    return this.selectedCodes().includes(code);
  }

  manageCode(group: PermissionGroup): string {
    return group.codes.find((c) => c.endsWith('.manage')) || group.codes[0];
  }

  actionCodes(group: PermissionGroup): string[] {
    const mc = this.manageCode(group);
    return group.codes.filter((c) => c !== mc);
  }

  hasManage(group: PermissionGroup): boolean {
    return this.has(this.manageCode(group));
  }

  toggle(code: string) {
    this.selectedCodes.update((codes) =>
      codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code],
    );
  }

  toggleAllActions(group: PermissionGroup) {
    const mc = this.manageCode(group);
    if (this.hasManage(group)) {
      this.selectedCodes.update((cur) =>
        cur.filter((c) => c !== mc && !group.codes.includes(c)),
      );
    } else {
      this.selectedCodes.update((cur) => Array.from(new Set([...cur, ...group.codes])));
    }
  }

  toggleAction(group: PermissionGroup, code: string, checked: boolean) {
    if (checked) {
      if (!this.hasManage(group)) this.toggle(code);
    } else if (this.hasManage(group)) {
      this.selectedCodes.update((cur) => {
        const set = new Set(cur);
        set.delete(this.manageCode(group));
        for (const c of group.codes) set.add(c);
        set.delete(code);
        return Array.from(set);
      });
    } else {
      this.toggle(code);
    }
  }

  groupHasAny(group: PermissionGroup): boolean {
    return group.codes.some((c) => this.has(c));
  }

  async save() {
    const role = this.selectedRole();
    const companyId = this.selectedCompanyId();
    if (!role || !companyId) return;
    this.saving.set(true);
    try {
      const res = await this.permissionService
        .updateRole(role, this.selectedCodes(), companyId)
        .toPromise();
      this.selectedCodes.set(res?.permissions || []);
      this.messageService.add({
        severity: 'success',
        summary: 'Saved',
        detail: `${ROLE_LABELS[role] || role} permissions updated`,
      });
    } catch (e: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: e?.error?.detail || 'Failed to save permissions',
      });
    } finally {
      this.saving.set(false);
    }
  }
}

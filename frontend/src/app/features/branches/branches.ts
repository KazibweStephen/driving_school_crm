import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  CompanyService, Company, Branch, BranchCreate, BranchUpdate, BranchMonthlyTarget,
} from '../../core/services/company.service';
import { CurrencyService } from '../../core/services/currency.service';

@Component({
  selector: 'app-branches',
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, DialogModule,
    InputTextModule, InputNumberModule, DatePickerModule, ToggleSwitchModule, SelectModule,
    TagModule, TooltipModule, ToastModule, ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast></p-toast>
    <p-confirmDialog />

    <div class="p-4">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Branches</h1>
        <div class="flex gap-2">
          <p-select [(ngModel)]="selectedCompanyId" [options]="companies()" optionLabel="name" optionValue="id"
            placeholder="Filter by company" styleClass="w-56" appendTo="body" (onChange)="load()" />
          <p-button label="New Branch" icon="pi pi-plus" (onClick)="showCreate()" />
        </div>
      </div>

      <p-table [value]="branches()" [loading]="loading()" dataKey="id"
        [paginator]="true" [rows]="20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Company</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Target ({{ currentMonthLabel }})</th>
            <th>Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-b>
          <tr>
            <td>{{ b.name }}</td>
            <td><span class="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">{{ b.code }}</span></td>
            <td>{{ companyName(b.company_id) }}</td>
            <td>{{ b.phone || '-' }}</td>
            <td><p-tag [value]="b.is_active ? 'Active' : 'Inactive'" [severity]="b.is_active ? 'success' : 'danger'" /></td>
            <td>
              @if (monthlyTargets()[b.id]) {
                <span class="font-medium">{{ currencyService.symbol() }} {{ money(monthlyTargets()[b.id].target_amount) }}</span>
              } @else {
                <span class="text-gray-400">-</span>
              }
            </td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-bullseye" severity="secondary" text (onClick)="openTargetDialog(b)" pTooltip="Set monthly target" />
                <p-button icon="pi pi-pencil" severity="secondary" text (onClick)="showEdit(b)" pTooltip="Edit" />
                <p-button icon="pi pi-trash" severity="danger" text (onClick)="confirmDelete(b)" pTooltip="Delete" />
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog [(visible)]="dialogVisible" [header]="editId ? 'Edit Branch' : 'New Branch'"
      [modal]="true" [style]="{ width: '450px' }" appendTo="body">
      <div class="flex flex-col gap-3">
        @if (!editId) {
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Company</label>
            <p-select [(ngModel)]="form.company_id" [options]="companies()" optionLabel="name" optionValue="id"
              placeholder="Select company" styleClass="w-full" appendTo="body" />
          </div>
        }
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input pInputText [(ngModel)]="form.name" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Code</label>
          <input pInputText [(ngModel)]="form.code" class="w-full" placeholder="e.g. kampala-main" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Phone</label>
          <input pInputText [(ngModel)]="form.phone" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Address</label>
          <textarea pInputTextarea [(ngModel)]="form.address" class="w-full" rows="2"></textarea>
        </div>
        @if (editId) {
          <div class="flex items-center gap-2">
            <p-toggleswitch [(ngModel)]="form.is_active" />
            <span class="text-sm">{{ form.is_active ? 'Active' : 'Inactive' }}</span>
          </div>
        }
        <p-button label="Save" [loading]="saving()" (onClick)="save()" styleClass="w-full justify-center" />
      </div>
    </p-dialog>

    <p-dialog [(visible)]="targetDialogVisible" header="Branch Monthly Target" [modal]="true"
      [style]="{ width: '450px' }" appendTo="body">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-gray-600">
          Expected New Sales for <span class="font-semibold">{{ targetBranch?.name }}</span> in the selected month.
        </p>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Month</label>
          <p-datepicker [(ngModel)]="targetMonth" view="month" dateFormat="mm/yy" [showIcon]="true"
            styleClass="w-full" appendTo="body" (ngModelChange)="onTargetMonthChange()" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Target amount</label>
          <p-inputnumber [(ngModel)]="targetAmount" mode="currency" [currency]="currencyService.code()"
            [min]="0" [maxFractionDigits]="0" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <p-button label="Save Target" [loading]="saving()" (onClick)="saveTarget()" styleClass="w-full justify-center" />
      </div>
    </p-dialog>
  `,
})
export class BranchesCmp implements OnInit {
  companies = signal<Company[]>([]);
  branches = signal<Branch[]>([]);
  monthlyTargets = signal<Record<string, BranchMonthlyTarget>>({});
  loading = signal(false);
  saving = signal(false);
  dialogVisible = false;
  editId: string | null = null;
  selectedCompanyId: string | null = null;
  form: BranchCreate & { is_active?: boolean } = { company_id: '', name: '', code: '', address: '', phone: '', is_active: true };

  targetDialogVisible = false;
  targetBranch: Branch | null = null;
  targetMonth = new Date();
  targetAmount: number | null = null;

  constructor(
    private service: CompanyService,
    public currencyService: CurrencyService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
  ) {}

  get currentMonthLabel(): string {
    return this.targetMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }

  ngOnInit() {
    this.loadCompanies();
  }

  money(value: string | number | null | undefined): string {
    const n = Number(value ?? 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  private toISO(month: Date): string {
    const m = new Date(month.getFullYear(), month.getMonth(), 1);
    return m.toISOString().slice(0, 10);
  }

  async loadCompanies() {
    try {
      const companies = await this.service.list().toPromise();
      this.companies.set(companies || []);
      if (this.companies().length > 0 && !this.selectedCompanyId) {
        this.selectedCompanyId = this.companies()[0].id;
      }
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load companies' });
    }
  }

  companyName(id: string): string {
    return this.companies().find(c => c.id === id)?.name || id.substring(0, 8);
  }

  async load() {
    this.loading.set(true);
    try {
      if (this.selectedCompanyId) {
        const branches = await this.service.listBranches(this.selectedCompanyId).toPromise();
        this.branches.set(branches || []);
        await this.loadTargets();
      } else {
        this.branches.set([]);
        this.monthlyTargets.set({});
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load branches' });
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTargets() {
    const month = this.toISO(new Date());
    const targets: Record<string, BranchMonthlyTarget> = {};
    for (const b of this.branches()) {
      try {
        const list = await this.service.getBranchMonthlyTargets(b.id, month).toPromise();
        if (list && list.length > 0) targets[b.id] = list[0];
      } catch {
        // ignore per-branch fetch errors
      }
    }
    this.monthlyTargets.set(targets);
  }

  async openTargetDialog(b: Branch) {
    this.targetBranch = b;
    this.targetMonth = new Date();
    this.targetAmount = null;
    this.targetDialogVisible = true;
    try {
      const list = await this.service.getBranchMonthlyTargets(b.id, this.toISO(this.targetMonth)).toPromise();
      if (list && list.length > 0) this.targetAmount = Number(list[0].target_amount);
    } catch {
      // no existing target for the month
    }
  }

  onTargetMonthChange() {
    if (!this.targetBranch) return;
    this.targetAmount = null;
    this.service.getBranchMonthlyTargets(this.targetBranch.id, this.toISO(this.targetMonth)).subscribe({
      next: (list) => {
        if (list && list.length > 0) this.targetAmount = Number(list[0].target_amount);
      },
      error: () => {},
    });
  }

  async saveTarget() {
    if (!this.targetBranch || this.targetAmount == null) return;
    this.saving.set(true);
    try {
      await this.service.upsertBranchMonthlyTarget(this.targetBranch.id, {
        month: this.toISO(this.targetMonth),
        target_amount: this.targetAmount,
      }).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Target saved' });
      this.targetDialogVisible = false;
      await this.loadTargets();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save target' });
    } finally {
      this.saving.set(false);
    }
  }

  showCreate() {
    this.editId = null;
    this.form = { company_id: this.selectedCompanyId || '', name: '', code: '', address: '', phone: '', is_active: true };
    this.dialogVisible = true;
  }

  showEdit(b: Branch) {
    this.editId = b.id;
    this.form = { company_id: b.company_id, name: b.name, code: b.code, address: b.address, phone: b.phone, is_active: b.is_active };
    this.dialogVisible = true;
  }

  async save() {
    if (!this.form.name || !this.form.code || (!this.editId && !this.form.company_id)) return;
    this.saving.set(true);
    try {
      if (this.editId) {
        await this.service.updateBranch(this.editId, this.form as BranchUpdate).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated' });
      } else {
        await this.service.createBranch(this.form.company_id, this.form as BranchCreate).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created' });
      }
      this.dialogVisible = false;
      await this.load();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save' });
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(b: Branch) {
    this.confirmationService.confirm({
      message: `Delete branch "${b.name}"?`,
      accept: async () => {
        try {
          await this.service.deleteBranch(b.id).toPromise();
          this.messageService.add({ severity: 'success', summary: 'Deleted' });
          await this.load();
        } catch {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' });
        }
      },
    });
  }
}

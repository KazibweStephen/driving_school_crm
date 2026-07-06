import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  CompanyService, Company, Branch, BranchCreate, BranchUpdate,
} from '../../core/services/company.service';

@Component({
  selector: 'app-branches',
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, DialogModule,
    InputTextModule, ToggleSwitchModule, SelectModule, TagModule, ToastModule, ConfirmDialogModule,
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
              <div class="flex gap-1">
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
  `,
})
export class BranchesCmp implements OnInit {
  companies = signal<Company[]>([]);
  branches = signal<Branch[]>([]);
  loading = signal(false);
  saving = signal(false);
  dialogVisible = false;
  editId: string | null = null;
  selectedCompanyId: string | null = null;
  form: BranchCreate & { is_active?: boolean } = { company_id: '', name: '', code: '', address: '', phone: '', is_active: true };

  constructor(
    private service: CompanyService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
  ) {}

  ngOnInit() {
    this.loadCompanies();
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
      } else {
        this.branches.set([]);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load branches' });
    } finally {
      this.loading.set(false);
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

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CompanyService, Company, CompanyCreate, CompanyUpdate } from '../../core/services/company.service';

@Component({
  selector: 'app-companies',
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, DialogModule,
    InputTextModule, TextareaModule, ToggleSwitchModule, TagModule, ToastModule, ConfirmDialogModule, SelectModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast></p-toast>
    <p-confirmDialog />

    <div class="p-4">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Companies</h1>
        <p-button label="New Company" icon="pi pi-plus" (onClick)="showCreate()" />
      </div>

      <p-table [value]="companies()" [loading]="loading()" dataKey="id"
        [paginator]="true" [rows]="20" [rowsPerPageOptions]="[10,20,50]"
        styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Currency</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-c>
          <tr>
            <td>{{ c.name }}</td>
            <td><span class="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">{{ c.code }}</span></td>
            <td>{{ c.phone || '-' }}</td>
            <td>{{ c.email || '-' }}</td>
            <td><span class="font-medium">{{ c.currency }}</span></td>
            <td><p-tag [value]="c.is_active ? 'Active' : 'Inactive'" [severity]="c.is_active ? 'success' : 'danger'" /></td>
            <td class="text-sm text-gray-500">{{ c.created_at | date:'dd/MM/yy' }}</td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-pencil" severity="secondary" text (onClick)="showEdit(c)" pTooltip="Edit" />
                <p-button icon="pi pi-trash" severity="danger" text (onClick)="confirmDelete(c)" pTooltip="Delete" />
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog [(visible)]="dialogVisible" [header]="editId ? 'Edit Company' : 'New Company'"
      [modal]="true" [style]="{ width: '450px' }" appendTo="body">
      <div class="flex flex-col gap-3">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input pInputText [(ngModel)]="form.name" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Code</label>
          <input pInputText [(ngModel)]="form.code" class="w-full" placeholder="e.g. acme-driving" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Phone</label>
          <input pInputText [(ngModel)]="form.phone" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input pInputText [(ngModel)]="form.email" class="w-full" type="email" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Address</label>
          <textarea pInputTextarea [(ngModel)]="form.address" class="w-full" rows="2"></textarea>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Currency</label>
          <p-select [(ngModel)]="form.currency" [options]="currencyOptions" optionLabel="label" optionValue="value"
            placeholder="Select currency" styleClass="w-full" appendTo="body" />
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
export class CompaniesCmp implements OnInit {
  companies = signal<Company[]>([]);
  loading = signal(false);
  saving = signal(false);
  dialogVisible = false;
  editId: string | null = null;

  currencyOptions = [
    { label: 'USD ($)', value: 'USD' },
    { label: 'UGX (Sh)', value: 'UGX' },
    { label: 'EUR (€)', value: 'EUR' },
    { label: 'GBP (£)', value: 'GBP' },
    { label: 'KES (KSh)', value: 'KES' },
    { label: 'TZS (TSh)', value: 'TZS' },
    { label: 'RWF (FRw)', value: 'RWF' },
  ];

  form: CompanyCreate & { is_active?: boolean } = { name: '', code: '', address: '', phone: '', email: '', currency: 'USD', is_active: true };

  constructor(
    private service: CompanyService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
  ) {}

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.service.list().toPromise();
      this.companies.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load companies' });
    } finally {
      this.loading.set(false);
    }
  }

  showCreate() {
    this.editId = null;
    this.form = { name: '', code: '', address: '', phone: '', email: '', currency: 'USD', is_active: true };
    this.dialogVisible = true;
  }

  showEdit(c: Company) {
    this.editId = c.id;
    this.form = { name: c.name, code: c.code, address: c.address, phone: c.phone, email: c.email, currency: c.currency, is_active: c.is_active };
    this.dialogVisible = true;
  }

  async save() {
    if (!this.form.name || !this.form.code) return;
    this.saving.set(true);
    try {
      if (this.editId) {
        await this.service.update(this.editId, this.form as CompanyUpdate).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated' });
      } else {
        await this.service.create(this.form as CompanyCreate).toPromise();
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

  confirmDelete(c: Company) {
    this.confirmationService.confirm({
      message: `Delete company "${c.name}"?`,
      accept: async () => {
        try {
          await this.service.delete(c.id).toPromise();
          this.messageService.add({ severity: 'success', summary: 'Deleted' });
          await this.load();
        } catch {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' });
        }
      },
    });
  }
}

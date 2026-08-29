import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FinanceService, ExpenseCategory, ExpenseCategoryCreate } from '../../core/services/finance.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { TooltipModule } from 'primeng/tooltip';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

@Component({
  selector: 'app-expense-categories',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, SelectModule, TableModule,
    TagModule, ToastModule, ConfirmDialogModule, CheckboxModule,
    TooltipModule, HasPermissionDirective,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './expense-categories.html',
})
export class ExpenseCategoriesCmp implements OnInit {
  categories = signal<ExpenseCategory[]>([]);
  loading = signal(false);
  syncing = signal(false);
  showDialog = signal(false);
  editing = signal<ExpenseCategory | null>(null);
  saving = signal(false);

  form = signal({
    name: '',
    code: '',
    requires_client: false,
    is_operating: true,
    account: 'petty_cash',
    sort_order: 0,
    is_active: true,
  });

  accountOptions = [
    { label: 'Petty Cash', value: 'petty_cash' },
    { label: 'Client Accounts', value: 'client_accounts' },
  ];

  constructor(
    private financeService: FinanceService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  async loadCategories() {
    this.loading.set(true);
    try {
      const res = await this.financeService.listExpenseCategories({ active: false }).toPromise();
      this.categories.set(res?.items || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load categories' });
    } finally {
      this.loading.set(false);
    }
  }

  async syncUsed() {
    this.syncing.set(true);
    try {
      const res = await this.financeService.syncUsedExpenseCategories().toPromise();
      this.messageService.add({
        severity: 'success',
        summary: 'Synced',
        detail: res && res.created > 0 ? `${res.created} used categor${res.created === 1 ? 'y' : 'ies'} added` : 'All used categories already in the catalogue',
      });
      await this.loadCategories();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to sync categories' });
    } finally {
      this.syncing.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.form.set({ name: '', code: '', requires_client: false, is_operating: true, account: 'petty_cash', sort_order: 0, is_active: true });
    this.showDialog.set(true);
  }

  openEdit(c: ExpenseCategory) {
    this.editing.set(c);
    this.form.set({
      name: c.name,
      code: c.code,
      requires_client: c.requires_client,
      is_operating: c.is_operating,
      account: c.account || 'petty_cash',
      sort_order: c.sort_order,
      is_active: c.is_active,
    });
    this.showDialog.set(true);
  }

  formValid(): boolean {
    const f = this.form();
    return !!f.name.trim();
  }

  async save() {
    const f = this.form();
    if (!f.name.trim() || this.saving()) return;
    this.saving.set(true);
    try {
      const editing = this.editing();
      if (editing) {
        await this.financeService.updateExpenseCategory(editing.id, {
          name: f.name.trim(),
          code: f.code.trim() || slugify(f.name),
          requires_client: f.requires_client,
          is_operating: f.is_operating,
          account: f.account,
          sort_order: f.sort_order,
          is_active: f.is_active,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Category updated' });
      } else {
        const payload: ExpenseCategoryCreate = {
          name: f.name.trim(),
          code: f.code.trim() || slugify(f.name),
          requires_client: f.requires_client,
          is_operating: f.is_operating,
          account: f.account,
          sort_order: f.sort_order,
          is_active: f.is_active,
        };
        await this.financeService.createExpenseCategory(payload).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Category created' });
      }
      this.showDialog.set(false);
      await this.loadCategories();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save category' });
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(c: ExpenseCategory) {
    this.confirmationService.confirm({
      message: `Delete category "${c.name}"? This cannot be undone.`,
      header: 'Delete Category',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.remove(c),
    });
  }

  async remove(c: ExpenseCategory) {
    try {
      await this.financeService.deleteExpenseCategory(c.id).toPromise();
      this.categories.update(list => list.filter(x => x.id !== c.id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Category deleted' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to delete category' });
    }
  }

  toggleActive(c: ExpenseCategory) {
    this.financeService.updateExpenseCategory(c.id, { is_active: !c.is_active }).subscribe({
      next: () => {
        this.categories.update(list => list.map(x => x.id === c.id ? { ...x, is_active: !c.is_active } : x));
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Category updated' });
      },
      error: (e) => this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to update category' }),
    });
  }
}

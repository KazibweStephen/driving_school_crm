import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FinanceService, Expense, ExpenseCreate } from '../../core/services/finance.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserDisplayCmp } from '../../shared/components/user-display';

@Component({
  selector: 'app-expenses',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, ConfirmDialogModule, TableModule, TagModule, TooltipModule, DatePickerModule, UserDisplayCmp,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './expenses.html',
})
export class ExpensesCmp implements OnInit {
  expenses = signal<Expense[]>([]);
  branches = signal<Branch[]>([]);
  vehicles = signal<Vehicle[]>([]);
  vehicleOptions = computed(() =>
    this.vehicles().map(v => ({ id: v.id, label: `${v.plate_number} · ${v.transmission}` }))
  );
  loading = signal(false);
  showDialog = signal(false);
  editing = signal<Expense | null>(null);
  total = 0;
  page = 1;
  pageSize = 20;
  filterStatus = signal<string>('');
  filterBranch = signal<string>('');
  receiptFile = signal<File | null>(null);
  uploading = signal(false);

  categoryOptions = [
    { label: 'Fuel', value: 'Fuel' },
    { label: 'Repair', value: 'Repair' },
    { label: 'Data', value: 'Data' },
    { label: 'Airtime', value: 'Airtime' },
    { label: 'Allowance', value: 'Allowance' },
    { label: 'Salary', value: 'Salary' },
    { label: 'Bonus', value: 'Bonus' },
    { label: 'Car Service', value: 'Car Service' },
    { label: 'Other', value: '__other__' },
  ];

  form = {
    branch_id: '',
    amount: 0,
    description: '',
    category: '',
    otherDetail: '',
    vehicle_id: '',
    mileage: null as number | null,
    expense_date: new Date(),
  };

  severityMap: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
    pending: 'warn',
    approved: 'success',
    rejected: 'danger',
    paid: 'info',
  };

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private vehicleService: VehicleService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    public currencyService: CurrencyService,
  ) {}

  ngOnInit() {
    this.loadBranches();
    this.loadExpenses();
  }

  private loadBranches() {
    this.companyService.list().subscribe({
      next: (companies) => {
        for (const c of companies) {
          this.companyService.listBranches(c.id).subscribe({
            next: (branches) => this.branches.set([...this.branches(), ...branches]),
          });
        }
      },
    });
  }

  async loadExpenses() {
    this.loading.set(true);
    try {
      const res = await this.financeService.listExpenses({
        branch_id: this.filterBranch() || undefined,
        status: this.filterStatus() || undefined,
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.expenses.set(res.items);
        this.total = res.total;
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load expenses' });
    } finally {
      this.loading.set(false);
    }
  }

  onPage(event: any) {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadExpenses();
  }

  openCreate() {
    this.editing.set(null);
    this.form = {
      branch_id: '',
      amount: 0,
      description: '',
      category: '',
      otherDetail: '',
      vehicle_id: '',
      mileage: null,
      expense_date: new Date(),
    };
    this.receiptFile.set(null);
    this.vehicles.set([]);
    this.showDialog.set(true);
  }

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.receiptFile.set(input.files[0]);
    }
  }

  removeReceipt() {
    this.receiptFile.set(null);
  }

  async save() {
    this.loading.set(true);
    try {
      let receipt_url: string | undefined;
      if (this.receiptFile()) {
        this.uploading.set(true);
        const uploadRes = await this.financeService.uploadReceipt(this.receiptFile()!).toPromise();
        receipt_url = uploadRes?.url;
        this.uploading.set(false);
      }

      const category = this.form.category === '__other__' ? this.form.otherDetail.trim() : this.form.category;
      const payload: ExpenseCreate = {
        branch_id: this.form.branch_id,
        amount: this.form.amount,
        description: this.form.description,
        category,
        mileage: this.form.mileage ?? undefined,
        vehicle_id: this.form.vehicle_id || undefined,
        expense_date: this.form.expense_date instanceof Date
          ? this.form.expense_date.toISOString().slice(0, 10)
          : this.form.expense_date,
      };
      await this.financeService.createExpense(payload).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Expense created' });
      this.showDialog.set(false);
      await this.loadExpenses();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create expense' });
    } finally {
      this.loading.set(false);
      this.uploading.set(false);
    }
  }

  confirmApprove(e: Expense) {
    this.confirmationService.confirm({
      message: `Approve expense "${e.description || e.category || 'Untitled'}" for $${e.amount}?`,
      header: 'Approve Expense',
      icon: 'pi pi-check-circle',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.updateStatus(e.id, 'approved'),
    });
  }

  confirmReject(e: Expense) {
    this.confirmationService.confirm({
      message: `Reject this expense?`,
      header: 'Reject Expense',
      icon: 'pi pi-times-circle',
      rejectButtonStyleClass: 'p-button-danger',
      accept: () => this.updateStatus(e.id, 'rejected'),
    });
  }

  async updateStatus(id: string, status: string) {
    try {
      const updated = await this.financeService.updateExpense(id, { status }).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: `Expense ${status}` });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${status} expense` });
    }
  }

  formIsValid(): boolean {
    if (!this.form.branch_id || (this.form.amount ?? 0) <= 0) return false;
    if (this.form.category === '__other__' && !this.form.otherDetail.trim()) return false;
    return true;
  }

  loadVehiclesForBranch() {
    if (!this.form.branch_id) return;
    this.vehicleService.list({ status: 'available' }).subscribe({
      next: (vehicles) => {
        this.vehicles.set(vehicles.filter(v => v.branch_ids?.includes(this.form.branch_id)));
      },
    });
  }

  formatDate(d: string): string {
    return d ? new Date(d).toLocaleDateString() : '';
  }

  formatDateTime(d: string | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

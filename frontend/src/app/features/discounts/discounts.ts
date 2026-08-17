import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DiscountService, Discount, DiscountCreate, DiscountType, DiscountAppliesTo } from '../../core/services/discount.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Company, Branch } from '../../core/services/company.service';
import { ProductService, Product } from '../../core/services/product.service';

@Component({
  selector: 'app-discounts',
  imports: [
    FormsModule,
    DatePipe,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './discounts.html',
})
export class DiscountsCmp implements OnInit {
  discounts = signal<Discount[]>([]);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  pageSize = signal(50);
  loading = signal(false);

  companies = signal<Company[]>([]);
  branches = signal<Branch[]>([]);
  products = signal<Product[]>([]);

  search = signal('');
  statusFilter = signal<string | null>(null);
  branchFilter = signal<string | null>(null);

  showCreateDialog = signal(false);
  showEditDialog = signal(false);
  showRejectDialog = signal(false);
  editingDiscount = signal<Discount | null>(null);
  rejectingDiscount = signal<Discount | null>(null);

  newDiscount: DiscountCreate = {
    code: '',
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 0,
    applies_to: 'all',
    product_ids: [],
    package_ids: [],
    start_date: this.formatDate(new Date()),
    end_date: '',
    is_active: true,
    branch_ids: [],
    max_uses: undefined,
  };

  editData: Partial<DiscountCreate> = {};
  rejectReason = '';

  get canCreate(): boolean { return this.auth.hasPermission('discounts.create'); }
  get canEdit(): boolean { return this.auth.hasPermission('discounts.edit'); }
  get canApprove(): boolean { return this.auth.hasPermission('discounts.approve'); }
  get canReject(): boolean { return this.auth.hasPermission('discounts.reject'); }
  get canApply(): boolean { return this.auth.hasPermission('discounts.apply'); }

  discountTypes = [
    { label: 'Fixed Amount', value: 'fixed' },
    { label: 'Percentage', value: 'percentage' },
  ];
  appliesToOptions = [
    { label: 'All Products', value: 'all' },
    { label: 'Specific Products', value: 'product' },
    { label: 'Specific Packages', value: 'package' },
  ];
  statusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Expired', value: 'expired' },
  ];

  constructor(
    private discountService: DiscountService,
    private auth: AuthService,
    private companyService: CompanyService,
    private productService: ProductService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadDiscounts();
    this.loadBranches();
    this.loadProducts();
  }

  formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  async loadBranches() {
    try {
      const res = await this.companyService.myBranches().toPromise();
      this.branches.set(res || []);
    } catch {}
  }

  async loadProducts() {
    try {
      const res = await this.productService.listProducts({ status: 'active', page_size: 100 }).toPromise();
      this.products.set(res?.products || []);
    } catch {}
  }

  async loadDiscounts() {
    this.loading.set(true);
    try {
      const res = await this.discountService.list({
        search: this.search() || undefined,
        status: this.statusFilter() || undefined,
        branch_ids: this.branchFilter() || undefined,
        page: this.page(),
        page_size: this.pageSize(),
      }).toPromise();
      if (res) {
        this.discounts.set(res.discounts);
        this.total.set(res.total);
        this.totalPages.set(res.total_pages);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load discounts' });
    } finally {
      this.loading.set(false);
    }
  }

  onSearch() {
    this.page.set(1);
    this.loadDiscounts();
  }

  onPageChange(event: { first: number; rows: number }) {
    this.page.set(Math.floor(event.first / event.rows) + 1);
    this.loadDiscounts();
  }

  clearFilters() {
    this.search.set('');
    this.statusFilter.set(null);
    this.branchFilter.set(null);
    this.page.set(1);
    this.loadDiscounts();
  }

  branchName(id: string): string {
    return this.branches().find(b => b.id === id)?.name || id.substring(0, 8);
  }

  branchNames(d: Discount): string {
    if (d.branch_names && d.branch_names.length > 0) {
      return d.branch_names.join(', ');
    }
    if (d.branch_id) return this.branchName(d.branch_id);
    return '—';
  }

  productOptions() {
    return this.products().map(p => ({ label: p.name, value: p.id }));
  }

  packageOptions() {
    const options: { label: string; value: string }[] = [];
    for (const p of this.products()) {
      for (const pkg of p.packages || []) {
        options.push({ label: `${p.name} - ${pkg.name}`, value: pkg.id });
      }
    }
    return options;
  }

  resetNewDiscount() {
    this.newDiscount = {
      code: '',
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 0,
      applies_to: 'all',
      product_ids: [],
      package_ids: [],
      start_date: this.formatDate(new Date()),
      end_date: '',
      is_active: true,
      branch_ids: [],
      max_uses: undefined,
    };
  }

  async createDiscount() {
    const payload: DiscountCreate = {
      ...this.newDiscount,
      end_date: this.newDiscount.end_date || undefined,
      max_uses: this.newDiscount.max_uses || undefined,
    };
    if (payload.applies_to !== 'product') payload.product_ids = undefined;
    if (payload.applies_to !== 'package') payload.package_ids = undefined;

    this.loading.set(true);
    try {
      await this.discountService.create(payload).toPromise();
      this.showCreateDialog.set(false);
      this.resetNewDiscount();
      await this.loadDiscounts();
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Discount request submitted for approval' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to create discount' });
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(discount: Discount) {
    this.editingDiscount.set(discount);
    this.editData = {
      code: discount.code,
      name: discount.name,
      description: discount.description,
      discount_value: discount.discount_value,
      applies_to: discount.applies_to,
      product_ids: discount.product_ids,
      package_ids: discount.package_ids,
      start_date: discount.start_date,
      end_date: discount.end_date,
      is_active: discount.is_active,
      branch_ids: discount.branch_ids || [],
      max_uses: discount.max_uses,
    };
    this.showEditDialog.set(true);
  }

  async saveEdit() {
    const discount = this.editingDiscount();
    if (!discount) return;
    const payload: DiscountUpdate = { ...this.editData };
    if (payload.applies_to !== 'product') payload.product_ids = undefined;
    if (payload.applies_to !== 'package') payload.package_ids = undefined;
    if (!payload.end_date) payload.end_date = undefined;
    if (!payload.max_uses) payload.max_uses = undefined;

    this.loading.set(true);
    try {
      await this.discountService.update(discount.id, payload).toPromise();
      this.showEditDialog.set(false);
      this.editingDiscount.set(null);
      await this.loadDiscounts();
      this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Discount updated' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to update discount' });
    } finally {
      this.loading.set(false);
    }
  }

  async approveDiscount(discount: Discount) {
    this.loading.set(true);
    try {
      await this.discountService.approve(discount.id).toPromise();
      await this.loadDiscounts();
      this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Discount approved' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to approve discount' });
    } finally {
      this.loading.set(false);
    }
  }

  openReject(discount: Discount) {
    this.rejectingDiscount.set(discount);
    this.rejectReason = '';
    this.showRejectDialog.set(true);
  }

  async confirmReject() {
    const discount = this.rejectingDiscount();
    if (!discount || !this.rejectReason.trim()) return;
    this.loading.set(true);
    try {
      await this.discountService.reject(discount.id, this.rejectReason).toPromise();
      this.showRejectDialog.set(false);
      this.rejectingDiscount.set(null);
      await this.loadDiscounts();
      this.messageService.add({ severity: 'success', summary: 'Rejected', detail: 'Discount rejected' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to reject discount' });
    } finally {
      this.loading.set(false);
    }
  }

  async toggleActive(discount: Discount) {
    this.loading.set(true);
    try {
      await this.discountService.toggleActive(discount.id).toPromise();
      await this.loadDiscounts();
      this.messageService.add({ severity: 'success', summary: 'Toggled', detail: 'Discount active state changed' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to toggle discount' });
    } finally {
      this.loading.set(false);
    }
  }

  typeLabel(type: string): string {
    return this.discountTypes.find(t => t.value === type)?.label || type;
  }

  appliesToLabel(value: string): string {
    return this.appliesToOptions.find(o => o.value === value)?.label || value;
  }

  statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warn';
      case 'rejected': return 'danger';
      case 'expired': return 'secondary';
      default: return 'info';
    }
  }

  discountDescription(d: Discount): string {
    if (d.discount_type === 'fixed') {
      return `${d.discount_value.toLocaleString()} UGX off`;
    }
    return `${d.discount_value}% off`;
  }
}

interface DiscountUpdate extends Partial<DiscountCreate> {}

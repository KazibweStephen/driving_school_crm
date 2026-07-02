import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ProductService, Product, Package } from '../../core/services/product.service';
import { LessonPlanService, LessonPlanTemplate, LessonPlanTemplateCreate, LessonTemplateItem } from '../../core/services/lesson-plan.service';
import { LessonLibraryService, LessonLibrary } from '../../core/services/lesson-library.service';

@Component({
  selector: 'app-products',
  imports: [
    CommonModule, DecimalPipe,
    CheckboxModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    TagModule,
    TooltipModule,
    ToastModule,
    SelectModule,
    ConfirmDialogModule,
    TableModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products implements OnInit {
  products = signal<Product[]>([]);
  loading = signal(false);
  search = signal('');
  statusFilter = signal<string | null>(null);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(0);

  showCreateProductDialog = signal(false);
  showEditProductDialog = signal(false);
  showCreatePackageDialog = signal(false);
  showEditPackageDialog = signal(false);

  expandedProducts = signal<Set<string>>(new Set());
  editingProduct = signal<Product | null>(null);
  editingPackage = signal<Package | null>(null);
  selectedProductForPackage = signal<Product | null>(null);

  productForm = { name: '', duration_label: '', description: '' };
  packageForm = {
    name: '', price: 0, duration_label: '',
    requires_driving_training: false,
    requires_theory_training: false,
    requires_permit_processing: false,
    driving_training_duration_days: null as number | null,
    theory_training_hours: null as number | null,
    permit_processing_duration_days: null as number | null,
  };

  statuses = [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ];

  // ── Lesson Plan Templates ──
  showTemplatesDialog = signal(false);
  templates = signal<LessonPlanTemplate[]>([]);
  showCreateTemplateDialog = signal(false);
  editingTemplate = signal<LessonPlanTemplate | null>(null);
  templateForm: { name: string; transmission_type: string; description: string; total_days: number; total_weeks: number; items: { day_number: number; week_number: number; title: string; lesson_objectives: string[]; practical_objectives: string[]; estimated_minutes: number; estimated_distance_km: number; order: number; lesson_library_id?: string }[] } = {
    name: '', transmission_type: 'manual', description: '', total_days: 20, total_weeks: 4, items: [],
  };

  // Item picker
  showTemplateItemPicker = signal(false);
  editingTemplateItemIndex = signal(-1);
  templatePickerMode: 'library' | 'create' = 'library';
  libraryLessons = signal<LessonLibrary[]>([]);
  librarySearch = signal('');
  libraryLoading = signal(false);
  templateItemForm: { day_number: number; week_number: number; title: string; lesson_objectives: string[]; practical_objectives: string[]; estimated_minutes: number; estimated_distance_km: number; order: number; lesson_library_id: string | null } = {
    day_number: 1, week_number: 1, title: '', lesson_objectives: [''], practical_objectives: [''], estimated_minutes: 30, estimated_distance_km: 3, order: 1, lesson_library_id: null,
  };
  transmissionTypes = [
    { label: 'Manual', value: 'manual' },
    { label: 'Automatic', value: 'automatic' },
    { label: 'Both', value: 'both' },
  ];

  constructor(
    private productService: ProductService,
    private lessonPlanService: LessonPlanService,
    private lessonLibraryService: LessonLibraryService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadProducts();
  }

  async loadProducts() {
    this.loading.set(true);
    try {
      const res = await this.productService
        .listProducts({
          search: this.search() || undefined,
          status: this.statusFilter() || undefined,
          page: this.page(),
          page_size: this.pageSize(),
        })
        .toPromise();
      if (res) {
        this.products.set(res.products);
        this.total.set(res.total);
        this.totalPages.set(res.total_pages);
      }
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load products',
      });
    } finally {
      this.loading.set(false);
    }
  }

  onSearch() {
    this.page.set(1);
    this.loadProducts();
  }

  clearFilters() {
    this.search.set('');
    this.statusFilter.set(null);
    this.page.set(1);
    this.loadProducts();
  }

  onPageChange(event: { first: number; rows: number }) {
    this.page.set(Math.floor(event.first / event.rows) + 1);
    this.loadProducts();
  }

  toggleExpanded(productId: string) {
    this.expandedProducts.update((set) => {
      const next = new Set(set);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  isExpanded(productId: string): boolean {
    return this.expandedProducts().has(productId);
  }

  openCreateProduct() {
    this.productForm = { name: '', duration_label: '', description: '' };
    this.showCreateProductDialog.set(true);
  }

  async createProduct() {
    this.loading.set(true);
    try {
      await this.productService
        .createProduct({
          name: this.productForm.name,
          duration_label: this.productForm.duration_label || undefined,
          description: this.productForm.description || undefined,
        })
        .toPromise();
      this.showCreateProductDialog.set(false);
      this.productForm = { name: '', duration_label: '', description: '' };
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Created',
        detail: 'Product created successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create product',
      });
    } finally {
      this.loading.set(false);
    }
  }

  openEditProduct(product: Product) {
    this.editingProduct.set(product);
    this.productForm = {
      name: product.name,
      duration_label: product.duration_label || '',
      description: product.description || '',
    };
    this.showEditProductDialog.set(true);
  }

  async saveEditProduct() {
    const product = this.editingProduct();
    if (!product) return;
    this.loading.set(true);
    try {
      await this.productService
        .updateProduct(product.id, {
          name: this.productForm.name,
          duration_label: this.productForm.duration_label || undefined,
          description: this.productForm.description || undefined,
        })
        .toPromise();
      this.showEditProductDialog.set(false);
      this.editingProduct.set(null);
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Updated',
        detail: 'Product updated successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update product',
      });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDeactivateProduct(product: Product) {
    this.confirmationService.confirm({
      message: `Deactivate "${product.name}"? It will no longer be available.`,
      header: 'Deactivate Product',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deactivateProduct(product),
    });
  }

  async deactivateProduct(product: Product) {
    try {
      await this.productService.deactivateProduct(product.id).toPromise();
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Deactivated',
        detail: `${product.name} has been deactivated`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to deactivate product',
      });
    }
  }

  openCreatePackage(product: Product) {
    this.selectedProductForPackage.set(product);
    this.packageForm = {
      name: '', price: 0, duration_label: '',
      requires_driving_training: false,
      requires_theory_training: false,
      requires_permit_processing: false,
      driving_training_duration_days: null,
      theory_training_hours: null,
      permit_processing_duration_days: null,
    };
    this.showCreatePackageDialog.set(true);
  }

  async createPackage() {
    const product = this.selectedProductForPackage();
    if (!product) return;
    this.loading.set(true);
    try {
      await this.productService
        .createPackage({
          product_id: product.id,
          name: this.packageForm.name,
          price: this.packageForm.price,
          duration_label: this.packageForm.duration_label || undefined,
          requires_driving_training: this.packageForm.requires_driving_training,
          requires_theory_training: this.packageForm.requires_theory_training,
          requires_permit_processing: this.packageForm.requires_permit_processing,
          driving_training_duration_days: this.packageForm.driving_training_duration_days,
          theory_training_hours: this.packageForm.theory_training_hours,
          permit_processing_duration_days: this.packageForm.permit_processing_duration_days,
        })
        .toPromise();
      this.showCreatePackageDialog.set(false);
      this.selectedProductForPackage.set(null);
      this.packageForm = {
        name: '', price: 0, duration_label: '',
        requires_driving_training: false,
        requires_theory_training: false,
        requires_permit_processing: false,
        driving_training_duration_days: null,
        theory_training_hours: null,
        permit_processing_duration_days: null,
      };
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Created',
        detail: 'Package created successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create package',
      });
    } finally {
      this.loading.set(false);
    }
  }

  openEditPackage(pkg: Package) {
    this.editingPackage.set(pkg);
    this.packageForm = {
      name: pkg.name,
      price: pkg.price,
      duration_label: pkg.duration_label || '',
      requires_driving_training: pkg.requires_driving_training,
      requires_theory_training: pkg.requires_theory_training,
      requires_permit_processing: pkg.requires_permit_processing,
      driving_training_duration_days: pkg.driving_training_duration_days,
      theory_training_hours: pkg.theory_training_hours,
      permit_processing_duration_days: pkg.permit_processing_duration_days,
    };
    this.showEditPackageDialog.set(true);
  }

  async saveEditPackage() {
    const pkg = this.editingPackage();
    if (!pkg) return;
    this.loading.set(true);
    try {
      await this.productService
        .updatePackage(pkg.id, {
          name: this.packageForm.name,
          price: this.packageForm.price,
          duration_label: this.packageForm.duration_label || undefined,
          requires_driving_training: this.packageForm.requires_driving_training,
          requires_theory_training: this.packageForm.requires_theory_training,
          requires_permit_processing: this.packageForm.requires_permit_processing,
          driving_training_duration_days: this.packageForm.driving_training_duration_days,
          theory_training_hours: this.packageForm.theory_training_hours,
          permit_processing_duration_days: this.packageForm.permit_processing_duration_days,
        })
        .toPromise();
      this.showEditPackageDialog.set(false);
      this.editingPackage.set(null);
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Updated',
        detail: 'Package updated successfully',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update package',
      });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDeactivatePackage(pkg: Package) {
    this.confirmationService.confirm({
      message: `Deactivate package "${pkg.name}"? It will no longer be available.`,
      header: 'Deactivate Package',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deactivatePackage(pkg),
    });
  }

  async deactivatePackage(pkg: Package) {
    try {
      await this.productService.deactivatePackage(pkg.id).toPromise();
      await this.loadProducts();
      this.messageService.add({
        severity: 'success',
        summary: 'Deactivated',
        detail: `Package "${pkg.name}" has been deactivated`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to deactivate package',
      });
    }
  }

  productStatusSeverity(status: string): 'success' | 'warn' | 'danger' {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'danger';
      default:
        return 'warn';
    }
  }

  packageStatusSeverity(status: string): 'success' | 'warn' | 'danger' {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'danger';
      default:
        return 'warn';
    }
  }

  // ── Lesson Plan Template Methods ──

  async openTemplatesDialog() {
    this.loading.set(true);
    try {
      const res = await this.lessonPlanService.listTemplates().toPromise();
      this.templates.set(res || []);
      this.showTemplatesDialog.set(true);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load templates' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadTemplates() {
    try {
      const res = await this.lessonPlanService.listTemplates().toPromise();
      this.templates.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load templates' });
    }
  }

  openCreateTemplate() {
    this.editingTemplate.set(null);
    this.templateForm = { name: '', transmission_type: 'manual', description: '', total_days: 20, total_weeks: 4, items: [] };
    this.showCreateTemplateDialog.set(true);
  }

  openEditTemplate(tpl: LessonPlanTemplate) {
    this.editingTemplate.set(tpl);
    this.templateForm = {
      name: tpl.name,
      transmission_type: tpl.transmission_type,
      description: tpl.description || '',
      total_days: tpl.total_days,
      total_weeks: tpl.total_weeks,
      items: tpl.lesson_items.map(i => ({
        day_number: i.day_number,
        week_number: i.week_number,
        title: i.title,
        lesson_objectives: i.lesson_objectives?.length ? [...i.lesson_objectives] : [''],
        practical_objectives: i.practical_objectives?.length ? [...i.practical_objectives] : [''],
        estimated_minutes: i.estimated_minutes ?? 30,
        estimated_distance_km: i.estimated_distance_km ?? 3,
        order: i.order,
        lesson_library_id: i.lesson_library_id ?? undefined,
      })),
    };
    this.showCreateTemplateDialog.set(true);
  }

  // ── Template item picker ──

  async loadLibraryLessons() {
    this.libraryLoading.set(true);
    try {
      const params: any = {};
      if (this.librarySearch()) params.search = this.librarySearch();
      const res = await this.lessonLibraryService.list(params).toPromise();
      this.libraryLessons.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load library lessons' });
    } finally {
      this.libraryLoading.set(false);
    }
  }

  openAddTemplateItem() {
    this.editingTemplateItemIndex.set(-1);
    this.templateItemForm = {
      day_number: 1, week_number: 1, title: '',
      lesson_objectives: [''], practical_objectives: [''],
      estimated_minutes: 30, estimated_distance_km: 3,
      order: this.templateForm.items.length + 1, lesson_library_id: null,
    };
    this.templatePickerMode = 'library';
    this.loadLibraryLessons();
    this.showTemplateItemPicker.set(true);
  }

  openEditTemplateItem(index: number) {
    this.editingTemplateItemIndex.set(index);
    const item = this.templateForm.items[index];
    this.templateItemForm = {
      day_number: item.day_number,
      week_number: item.week_number,
      title: item.title,
      lesson_objectives: [...item.lesson_objectives],
      practical_objectives: [...item.practical_objectives],
      estimated_minutes: item.estimated_minutes,
      estimated_distance_km: item.estimated_distance_km,
      order: item.order,
      lesson_library_id: item.lesson_library_id ?? null,
    };
    this.templatePickerMode = 'create';
    this.showTemplateItemPicker.set(true);
  }

  selectLibraryLesson(lesson: LessonLibrary) {
    this.templateItemForm = {
      day_number: this.templateItemForm.day_number,
      week_number: this.templateItemForm.week_number,
      title: lesson.title,
      lesson_objectives: lesson.lesson_objectives?.length ? [...lesson.lesson_objectives] : [''],
      practical_objectives: lesson.practical_objectives?.length ? [...lesson.practical_objectives] : [''],
      estimated_minutes: lesson.estimated_minutes,
      estimated_distance_km: lesson.estimated_distance_km,
      order: this.templateItemForm.order,
      lesson_library_id: lesson.id,
    };
    this.templatePickerMode = 'create';
  }

  switchTemplatePickerToCreate() {
    this.templatePickerMode = 'create';
    if (!this.templateItemForm.title) {
      this.templateItemForm.lesson_library_id = null;
    }
  }

  switchTemplatePickerToLibrary() {
    this.templatePickerMode = 'library';
    this.loadLibraryLessons();
  }

  addTemplateItemArrayItem(key: string) {
    (this.templateItemForm as any)[key] = [...((this.templateItemForm as any)[key] || []), ''];
  }

  removeTemplateItemArrayItem(key: string, idx: number) {
    (this.templateItemForm as any)[key] = ((this.templateItemForm as any)[key] || []).filter((_: any, i: number) => i !== idx);
  }

  confirmTemplateItem() {
    const data = {
      day_number: this.templateItemForm.day_number,
      week_number: this.templateItemForm.week_number,
      title: this.templateItemForm.title,
      lesson_objectives: this.templateItemForm.lesson_objectives.filter(s => s.trim()),
      practical_objectives: this.templateItemForm.practical_objectives.filter(s => s.trim()),
      estimated_minutes: this.templateItemForm.estimated_minutes,
      estimated_distance_km: this.templateItemForm.estimated_distance_km,
      order: this.templateItemForm.order,
      lesson_library_id: this.templateItemForm.lesson_library_id ?? undefined,
    };
    const idx = this.editingTemplateItemIndex();
    if (idx >= 0) {
      this.templateForm.items = this.templateForm.items.map((item, i) => i === idx ? data : item);
    } else {
      this.templateForm.items = [...this.templateForm.items, data];
    }
    this.showTemplateItemPicker.set(false);
  }

  removeTemplateItem(index: number) {
    this.templateForm.items = this.templateForm.items.filter((_, i) => i !== index);
  }

  async saveTemplate() {
    const editing = this.editingTemplate();
    this.loading.set(true);
    try {
      if (editing) {
        await this.lessonPlanService.updateTemplate(editing.id, {
          name: this.templateForm.name,
          description: this.templateForm.description || undefined,
          total_days: this.templateForm.total_days,
          total_weeks: this.templateForm.total_weeks,
        }).toPromise();
      } else {
        await this.lessonPlanService.createTemplate({
          name: this.templateForm.name,
          transmission_type: this.templateForm.transmission_type,
          description: this.templateForm.description || undefined,
          total_days: this.templateForm.total_days,
          total_weeks: this.templateForm.total_weeks,
          items: this.templateForm.items.map(i => ({
            day_number: i.day_number,
            week_number: i.week_number,
            title: i.title,
            lesson_objectives: i.lesson_objectives.filter(s => s.trim()) || undefined,
            practical_objectives: i.practical_objectives.filter(s => s.trim()) || undefined,
            estimated_minutes: i.estimated_minutes,
            estimated_distance_km: i.estimated_distance_km,
            order: i.order,
            lesson_library_id: i.lesson_library_id || undefined,
          })),
        }).toPromise();
      }
      this.showCreateTemplateDialog.set(false);
      await this.loadTemplates();
      this.messageService.add({ severity: 'success', summary: editing ? 'Updated' : 'Created', detail: `Template ${editing ? 'updated' : 'created'} successfully` });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${editing ? 'update' : 'create'} template` });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDeleteTemplate(tpl: LessonPlanTemplate) {
    this.confirmationService.confirm({
      message: `Delete template "${tpl.name}"? This cannot be undone.`,
      header: 'Delete Template',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteTemplate(tpl),
    });
  }

  async deleteTemplate(tpl: LessonPlanTemplate) {
    try {
      await this.lessonPlanService.deleteTemplate(tpl.id).toPromise();
      await this.loadTemplates();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Template deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete template' });
    }
  }
}

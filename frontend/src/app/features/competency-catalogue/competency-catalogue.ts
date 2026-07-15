import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  CompetencyCatalogueService,
  CompetencyVersion,
  CompetencyCategory,
  Competency,
  PaginatedCompetencies,
} from '../../core/services/competency-catalogue.service';
import { CompanyService, Company } from '../../core/services/company.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-competency-catalogue',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, TagModule, TooltipModule,
    ToastModule, SelectModule, CheckboxModule, MultiSelectModule,
    ConfirmDialogModule, TableModule, TabsModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './competency-catalogue.html',
})
export class CompetencyCatalogueCmp implements OnInit {
  loading = signal(false);
  activeTab = signal('versions');

  // Company selector (super_user only)
  companies = signal<Company[]>([]);
  selectedCompanyId = signal<string | null>(null);
  isSuperUser = computed(() => this.auth.currentUserRole() === 'super_user');
  companyOptions = computed(() =>
    this.companies().map(c => ({ label: c.name, value: c.id }))
  );

  // Versions
  versions = signal<CompetencyVersion[]>([]);
  showVersionDialog = signal(false);
  editingVersion = signal<CompetencyVersion | null>(null);
  versionForm = { version: '', name: '', description: '' };

  // Categories
  categories = signal<CompetencyCategory[]>([]);
  showCategoryDialog = signal(false);
  editingCategory = signal<CompetencyCategory | null>(null);
  categoryForm: any = { name: '', description: '', display_order: 0, is_active: true };

  // Competencies
  competencies = signal<Competency[]>([]);
  totalCompetencies = signal(0);
  page = signal(1);
  pageSize = 20;
  search = signal('');
  filterCategory = signal<string | null>(null);
  filterDifficulty = signal<string | null>(null);
  filterTrainingCategory = signal<string | null>(null);
  filterVersion = signal<string | null>(null);
  filterActive = signal<boolean | null>(null);

  showCompetencyDialog = signal(false);
  editingCompetency = signal<Competency | null>(null);
  compForm: any = this.emptyCompForm();

  // Bulk import
  showImportDialog = signal(false);
  importData = '';

  // Lookups
  difficultyOptions = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];
  trainingCategoryOptions = [
    { label: 'Driving', value: 'driving' },
    { label: 'Motorcycle', value: 'motorcycle' },
    { label: 'Truck', value: 'truck' },
    { label: 'Bus', value: 'bus' },
    { label: 'General', value: 'general' },
  ];
  versionOptions = computed(() =>
    this.versions().map(v => ({ label: `${v.version} (${v.status})`, value: v.id }))
  );
  categoryOptions = computed(() =>
    this.categories().map(c => ({ label: c.name, value: c.id }))
  );
  isAdmin = computed(() => {
    const role = this.auth.currentUserRole();
    return role === 'super_user' || role === 'company_super_user';
  });

  constructor(
    private service: CompetencyCatalogueService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    if (this.isSuperUser()) {
      this.loadCompanies();
    } else {
      this.loadAll();
    }
  }

  private loadAll() {
    this.loadVersions();
    this.loadCategories();
    this.loadCompetencies();
  }

  async loadCompanies() {
    try {
      const res = await this.companyService.list().toPromise();
      this.companies.set(res || []);
      if (res?.length && !this.selectedCompanyId()) {
        this.selectedCompanyId.set(res[0].id);
        this.loadAll();
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load companies' });
    }
  }

  onCompanyChange() {
    this.page.set(1);
    this.loadAll();
  }

  private get companyIdParam(): string | undefined {
    return this.selectedCompanyId() || undefined;
  }

  // ── Versions ──

  async loadVersions() {
    try {
      const res = await this.service.listVersions(undefined, this.companyIdParam).toPromise();
      this.versions.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load versions' });
    }
  }

  openCreateVersion() {
    this.editingVersion.set(null);
    this.versionForm = { version: '', name: '', description: '' };
    this.showVersionDialog.set(true);
  }

  openEditVersion(v: CompetencyVersion) {
    this.editingVersion.set(v);
    this.versionForm = { version: v.version, name: v.name, description: v.description || '' };
    this.showVersionDialog.set(true);
  }

  async saveVersion() {
    const editing = this.editingVersion();
    try {
      if (editing) {
        await this.service.updateVersion(editing.id, this.versionForm).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Version updated' });
      } else {
        await this.service.createVersion(this.versionForm).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Version created' });
      }
      this.showVersionDialog.set(false);
      await this.loadVersions();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save version' });
    }
  }

  async activateVersion(v: CompetencyVersion) {
    try {
      await this.service.activateVersion(v.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Activated', detail: `Version ${v.version} activated` });
      await this.loadVersions();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to activate' });
    }
  }

  confirmDeleteVersion(v: CompetencyVersion) {
    this.confirmationService.confirm({
      message: `Delete version "${v.version}"? Only draft versions can be deleted.`,
      header: 'Delete Version',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.service.deleteVersion(v.id).toPromise();
          this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Version deleted' });
          await this.loadVersions();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to delete' });
        }
      },
    });
  }

  versionStatusColor(s: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (s) {
      case 'active': return 'success';
      case 'draft': return 'warn';
      case 'archived': return 'secondary';
      default: return 'info';
    }
  }

  // ── Categories ──

  async loadCategories() {
    try {
      const res = await this.service.listCategories(true, this.companyIdParam).toPromise();
      this.categories.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load categories' });
    }
  }

  openCreateCategory() {
    this.editingCategory.set(null);
    this.categoryForm = { name: '', description: '', display_order: 0, is_active: true };
    this.showCategoryDialog.set(true);
  }

  openEditCategory(c: CompetencyCategory) {
    this.editingCategory.set(c);
    this.categoryForm = { name: c.name, description: c.description || '', display_order: c.display_order, is_active: c.is_active };
    this.showCategoryDialog.set(true);
  }

  async saveCategory() {
    const editing = this.editingCategory();
    try {
      if (editing) {
        await this.service.updateCategory(editing.id, this.categoryForm).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Category updated' });
      } else {
        await this.service.createCategory(this.categoryForm).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Category created' });
      }
      this.showCategoryDialog.set(false);
      await this.loadCategories();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save category' });
    }
  }

  confirmDeleteCategory(c: CompetencyCategory) {
    this.confirmationService.confirm({
      message: `Delete category "${c.name}"? It must have no competencies.`,
      header: 'Delete Category',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.service.deleteCategory(c.id).toPromise();
          this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Category deleted' });
          await this.loadCategories();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to delete' });
        }
      },
    });
  }

  // ── Competencies ──

  async loadCompetencies() {
    this.loading.set(true);
    try {
      const params: any = { page: this.page(), page_size: this.pageSize };
      if (this.search()) params.search = this.search();
      if (this.filterCategory()) params.category_id = this.filterCategory();
      if (this.filterDifficulty()) params.difficulty = this.filterDifficulty();
      if (this.filterTrainingCategory()) params.training_category = this.filterTrainingCategory();
      if (this.filterVersion()) params.version_id = this.filterVersion();
      if (this.filterActive() !== null) params.is_active = this.filterActive();
      if (this.companyIdParam) params.company_id = this.companyIdParam;
      const res = await this.service.listCompetencies(params).toPromise();
      if (res) {
        this.competencies.set(res.items);
        this.totalCompetencies.set(res.total);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load competencies' });
    } finally {
      this.loading.set(false);
    }
  }

  onSearchCompetencies() {
    this.page.set(1);
    this.loadCompetencies();
  }

  onPageChange(newPage: number) {
    this.page.set(newPage);
    this.loadCompetencies();
  }

  emptyCompForm() {
    return {
      version_id: '', category_id: '', code: '', name: '', description: '',
      learning_outcome: '', assessment_criteria: [''], difficulty: 'beginner',
      estimated_practice_minutes: null, training_category: 'driving', display_order: 0,
      prerequisite_ids: [],
    };
  }

  openCreateCompetency() {
    this.editingCompetency.set(null);
    this.compForm = this.emptyCompForm();
    if (this.versions().length) this.compForm.version_id = this.versions().find(v => v.status === 'active')?.id || this.versions()[0].id;
    this.showCompetencyDialog.set(true);
  }

  openEditCompetency(c: Competency) {
    this.editingCompetency.set(c);
    this.compForm = {
      version_id: c.version_id,
      category_id: c.category_id,
      code: c.code,
      name: c.name,
      description: c.description || '',
      learning_outcome: c.learning_outcome || '',
      assessment_criteria: c.assessment_criteria?.length ? [...c.assessment_criteria] : [''],
      difficulty: c.difficulty,
      estimated_practice_minutes: c.estimated_practice_minutes,
      training_category: c.training_category,
      display_order: c.display_order,
      prerequisite_ids: c.prerequisites?.map(p => p.id) || [],
    };
    this.showCompetencyDialog.set(true);
  }

  addAssessmentItem() {
    this.compForm.assessment_criteria = [...this.compForm.assessment_criteria, ''];
  }

  removeAssessmentItem(idx: number) {
    this.compForm.assessment_criteria = this.compForm.assessment_criteria.filter((_: any, i: number) => i !== idx);
  }

  async saveCompetency() {
    const editing = this.editingCompetency();
    const data = {
      ...this.compForm,
      assessment_criteria: this.compForm.assessment_criteria.filter((s: string) => s.trim()),
    };
    try {
      if (editing) {
        await this.service.updateCompetency(editing.id, data).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Competency updated' });
      } else {
        await this.service.createCompetency(data).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Competency created' });
      }
      this.showCompetencyDialog.set(false);
      await this.loadCompetencies();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save competency' });
    }
  }

  confirmDeactivateCompetency(c: Competency) {
    this.confirmationService.confirm({
      message: `Deactivate competency "${c.code} - ${c.name}"?`,
      header: 'Deactivate Competency',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.service.deactivateCompetency(c.id).toPromise();
          this.messageService.add({ severity: 'info', summary: 'Deactivated', detail: 'Competency deactivated' });
          await this.loadCompetencies();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to deactivate' });
        }
      },
    });
  }

  difficultyColor(d: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (d) {
      case 'beginner': return 'info';
      case 'intermediate': return 'warn';
      case 'advanced': return 'danger';
      default: return 'info';
    }
  }

  trainingCategoryLabel(tc: string): string {
    return this.trainingCategoryOptions.find(o => o.value === tc)?.label || tc;
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  // ── Bulk Import ──

  openImport() {
    this.importData = '';
    this.showImportDialog.set(true);
  }

  async runImport() {
    try {
      const parsed = JSON.parse(this.importData);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const res = await this.service.bulkImport(items).toPromise();
      if (res) {
        this.messageService.add({
          severity: res.errors.length ? 'warn' : 'success',
          summary: 'Import Complete',
          detail: `Created: ${res.created}, Skipped: ${res.skipped}, Errors: ${res.errors.length}`,
        });
        if (res.errors.length) {
          console.warn('Import errors:', res.errors);
        }
      }
      this.showImportDialog.set(false);
      await this.loadCompetencies();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Import Error', detail: e?.message || 'Invalid JSON' });
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalCompetencies() / this.pageSize);
  }
}

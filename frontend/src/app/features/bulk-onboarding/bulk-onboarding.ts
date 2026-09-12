import { Component, OnInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MenuItem } from 'primeng/api';
import { ConsultationService } from '../../core/services/consultation.service';
import { ProductService } from '../../core/services/product.service';
import { UserService } from '../../core/services/user.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { LessonPlanService, LessonPlanTemplate, LessonTemplateItem } from '../../core/services/lesson-plan.service';
import { DiscountService, Discount } from '../../core/services/discount.service';

interface LessonDraft {
  date: Date | null;
  duration_minutes: number | null;
  lesson_type: string;
  instructor_id: string;
  vehicle_id: string;
  notes: string;
  template_item_id: string | null;
  title: string | null;
  lesson_objectives: string[];
  practical_objectives: string[];
  status: 'completed' | 'scheduled';
}

interface InstallmentDraft {
  receipt_number: string;
  document_date: Date | null;
  amount: number | null;
  received_by_phone: string;
}

interface PackageDraft {
  product_id: string;
  package_id: string;
  installments: InstallmentDraft[];
  lessons: LessonDraft[];
  transmission_type: string;
  lesson_plan_template_id: string | null;
  discount_id: string;
}

interface QuickGenForm {
  practicalDays: number | null;
  theoryLessons: number | null;
  startDate: Date | null;
  lastDate: Date | null;
  transmission: string;
  lesson_plan_template_id: string | null;
  instructor_id: string;
  vehicle_id: string;
}

type QuickGenSeed = Pick<QuickGenLesson, 'template_item_id' | 'title' | 'lesson_objectives' | 'practical_objectives' | 'status'>;

interface QuickGenLesson {
  date: Date;
  lesson_type: 'practical' | 'theory';
  dayLabel: string;
  template_item_id: string | null;
  title: string | null;
  lesson_objectives: string[];
  practical_objectives: string[];
  status: 'completed' | 'scheduled';
}

interface ClientDraft {
  phone: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  location: string;
  branch_id: string;
  document_date: Date | null;
  converter_id: string;
  primary_recommender_id: string;
  secondary_recommender_id: string;
  packages: PackageDraft[];
}

interface OnboardedPayment {
  id: string;
  document_date: string | null;
  docDateObj?: Date | null;
  receipt_number: string | null;
  amount: number;
  balance: number;
  received_by_phone: string | null;
}

interface OnboardedLesson {
  id: string;
  day_number: number;
  title: string;
  scheduled_date: string | null;
  dateObj?: Date | null;
  duration_minutes: number;
  lesson_type: string;
  status: string;
  instructor_id: string | null;
  vehicle_id: string | null;
  notes: string | null;
}

interface OnboardedPlan {
  id: string;
  start_date: string | null;
  transmission_type: string | null;
  template_id: string | null;
  lessons: OnboardedLesson[];
}

interface OnboardedPackage {
  cart_item_id: string;
  product_id: string;
  package_id: string | null;
  status: string;
  total_amount: number;
  total_paid: number;
  balance: number;
  discount_id: string | null;
  discount_amount: number;
  payments: OnboardedPayment[];
  plan: OnboardedPlan | null;
}

interface OnboardedClient {
  id: string;
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  location: string | null;
  branch_id: string | null;
  branch_name: string | null;
  document_date: string | null;
  status: string;
  packages: OnboardedPackage[];
}

const STORAGE_KEY = 'bulk_onboarding_draft';

@Component({
  selector: 'app-bulk-onboarding',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, ConfirmDialogModule, DatePickerModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './bulk-onboarding.html',
})
export class BulkOnboardingCmp implements OnInit, OnDestroy {
  private routerSub: Subscription | null = null;
  clients = signal<ClientDraft[]>([]);
  products = signal<any[]>([]);
  users = signal<any[]>([]);
  vehicles = signal<any[]>([]);
  branches = signal<Branch[]>([]);
  lessonTemplates = signal<LessonPlanTemplate[]>([]);
  branchId = signal('');
  submitting = signal(false);
  draftRestored = signal(false);
  draftSavedAt = signal('');
  showSuccessDialog = signal(false);
  successResult = signal<{ created: number; ids: string[] } | null>(null);
  phoneWarnings = signal<Record<number, string>>({});
  receiptWarnings = signal<Record<string, string>>({});
  dateErrors = signal<Record<string, string>>({});
  private phoneTimers: Record<number, ReturnType<typeof setTimeout>> = {};
  private receiptTimers: ReturnType<typeof setTimeout>[] = [];
  clientStepIndex = signal<Record<number, number>>({});
  discountsForProduct = signal<Record<string, Discount[]>>({});

  showQuickGen = signal(false);
  quickGenClientIndex = signal(0);
  quickGenPkgIndex = signal(0);
  quickGenForm = signal<QuickGenForm>({
    practicalDays: null,
    theoryLessons: null,
    startDate: null,
    lastDate: null,
    transmission: 'manual',
    lesson_plan_template_id: null,
    instructor_id: '',
    vehicle_id: '',
  });
  quickGenPreview = signal<QuickGenLesson[]>([]);
  quickGenSelectedItemIds = signal<string[]>([]);
  quickGenItemDates = signal<Record<string, Date | null>>({});
  quickGenItemStatus = signal<Record<string, 'completed' | 'scheduled'>>({});
  quickGenDateError = computed(() => this.quickGenRangeError() || this.quickGenLessonsError());

  showTemplatePicker = signal(false);
  templatePickerClientIndex = signal(0);
  templatePickerPkgIndex = signal(0);
  templatePickerTemplateId = signal<string | null>(null);
  templatePickerTransmission = signal('manual');
  templatePickerSelectedIds = signal<string[]>([]);

  quickGenBusy = signal(false);
  pickerBusy = signal(false);

  savedClients = signal<OnboardedClient[]>([]);
  savedTotal = signal(0);
  savedLoading = signal(false);
  savedFromModel = signal<Date | null>(null);
  savedToModel = signal<Date | null>(null);
  savedSearch = signal('');
  showEditDialog = signal(false);
  editDocSignal = signal<Date | null>(null);
  editingClient = signal<OnboardedClient | null>(null);
  editBusy = signal(false);
  removedPaymentIds = signal<string[]>([]);
  showRegenDialog = signal(false);
  regenPkgIdx = signal(0);
  regenBusy = signal(false);
  regenForm = signal({
    startDate: null as Date | null,
    transmission: 'manual',
    practicalDays: null as number | null,
    theoryLessons: null as number | null,
  });

  totalClients = computed(() => this.clients().length);
  totalPackages = computed(() =>
    this.clients().reduce((sum, c) => sum + c.packages.length, 0)
  );
  totalInstallments = computed(() =>
    this.clients().reduce((sum, c) =>
      sum + c.packages.reduce((s, p) => s + p.installments.length, 0), 0)
  );
  totalLessons = computed(() =>
    this.clients().reduce((sum, c) =>
      sum + c.packages.reduce((s, p) => s + this.countExpandedLessons(p.lessons), 0), 0)
  );

  productOptions = computed(() =>
    this.products().map(p => ({ label: p.name, value: p.id }))
  );

  packageMap = computed(() => {
    const map = new Map<string, any[]>();
    for (const p of this.products()) {
      if (p.packages) {
        map.set(p.id, p.packages.map((pkg: any) => ({
          label: `${pkg.name} — ${pkg.price}`,
          value: pkg.id,
          price: pkg.price,
        })));
      }
    }
    return map;
  });

  userOptions = computed(() => {
    const phone = this.auth.currentUser();
    const name = this.auth.currentUserName();
    const options = this.users().map(u => ({
      label: u.name || u.phone,
      value: u.phone,
    }));
    if (phone && !options.some(o => o.value === phone)) {
      options.unshift({ label: name || phone, value: phone });
    }
    return options;
  });

  instructorOptions = computed(() =>
    this.users()
      .filter(u => u.role === 'instructor')
      .map(u => ({ label: u.name || u.phone, value: u.phone }))
  );

  quickGenVehicleOptions = computed(() => {
    const trans = this.quickGenForm().transmission;
    return this.vehicles()
      .filter(v => trans === 'both' || v.transmission === trans)
      .map(v => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
  });

  vehicleOptionsFor(transmission: string) {
    return this.vehicles()
      .filter(v => transmission === 'both' || v.transmission === transmission)
      .map(v => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
  }

  branchOptions = computed(() =>
    this.branches().map(b => ({ label: b.name, value: b.id }))
  );

  branchStatus = computed(() => {
    const b = this.branches();
    if (b.length === 0) return 'none';
    if (b.length === 1) return 'single';
    return 'multi';
  });

  get savedSectionVisible(): boolean {
    return this.auth.hasPermission('bulk_onboarding.manage') && this.auth.hasPermission('bulk_onboarding.edit');
  }

  get canEditOnboarded(): boolean {
    return this.auth.currentUserCanEditOnboardedClients();
  }

  get today(): Date {
    return new Date();
  }

  lessonStatusOptions() {
    return [
      { label: 'Pending', value: 'pending' },
      { label: 'Unlocked', value: 'unlocked' },
      { label: 'In Progress', value: 'in_progress' },
      { label: 'Completed', value: 'completed' },
      { label: 'Partially Completed', value: 'partially_completed' },
      { label: 'Cancelled', value: 'cancelled' },
      { label: 'Skipped', value: 'skipped' },
    ];
  }

  constructor(
    private consultationService: ConsultationService,
    private productService: ProductService,
    private userService: UserService,
    private vehicleService: VehicleService,
    private companyService: CompanyService,
    private lessonPlanService: LessonPlanService,
    private discountService: DiscountService,
    private auth: AuthService,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadData();
    this.restoreDraft();
    this.routerSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.persistDraft();
      }
    });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload() {
    this.persistDraft();
  }

  loadData() {
    this.productService.listProducts().subscribe((res: any) => {
      this.products.set(res.products || []);
    });
    this.userService.list({ page_size: 100 }).subscribe((res: any) => {
      this.users.set(res.users || []);
    });
    this.vehicleService.list().subscribe((res: any) => {
      this.vehicles.set(Array.isArray(res) ? res : res.vehicles || []);
    });
    this.loadLessonTemplates();
    this.loadBranches();
  }

  loadLessonTemplates() {
    this.lessonPlanService.listTemplates().subscribe({
      next: (templates: any) => {
        this.lessonTemplates.set(templates || []);
      },
      error: () => {
        this.lessonTemplates.set([]);
      },
    });
  }

  lessonTemplateOptions() {
    const trans = this.templatePickerTransmission();
    return this.lessonTemplates()
      .filter(t => trans === 'both' || !t.transmission_type || t.transmission_type === 'both' || t.transmission_type === trans)
      .map(t => ({ label: t.name, value: t.id }));
  }

  quickGenTemplateOptions() {
    const trans = this.quickGenForm().transmission;
    return this.lessonTemplates()
      .filter(t => trans === 'both' || !t.transmission_type || t.transmission_type === 'both' || t.transmission_type === trans)
      .map(t => ({ label: t.name, value: t.id }));
  }

  onQuickGenTransmissionChange(transmission: string) {
    this.quickGenForm.update(f => ({ ...f, transmission }));
    const selectedId = this.quickGenForm().lesson_plan_template_id;
    if (selectedId) {
      const tpl = this.lessonTemplates().find(t => t.id === selectedId);
      if (tpl && tpl.transmission_type && tpl.transmission_type !== 'both' && tpl.transmission_type !== transmission) {
        this.quickGenForm.update(f => ({ ...f, lesson_plan_template_id: null }));
        this.quickGenSelectedItemIds.set([]);
        this.quickGenItemStatus.set({});
        this.quickGenPreview.set([]);
      }
    }
  }

  templateItems(templateId: string | null): LessonTemplateItem[] {
    if (!templateId) return [];
    return this.lessonTemplates().find(t => t.id === templateId)?.lesson_items || [];
  }

  loadBranches() {
    this.companyService.myBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches || []);
        if (branches?.length === 1) {
          this.branchId.set(branches[0].id);
        } else if (branches?.length > 1) {
          this.applyDefaultBranch(branches);
        }
      },
      error: () => {
        this.branches.set([]);
      },
    });
  }

  private applyDefaultBranch(branches: Branch[]) {
    const phone = this.getCurrentUserPhone();
    if (!phone) return;
    this.userService.getByPhone(phone).subscribe({
      next: (me) => {
        const assigned = (me.branch_ids || []).filter(id => branches.some(b => b.id === id));
        if (assigned.length === 1) {
          this.branchId.set(assigned[0]);
        } else if (branches.length === 1) {
          this.branchId.set(branches[0].id);
        }
      },
      error: () => {
        if (branches.length === 1) {
          this.branchId.set(branches[0].id);
        }
      },
    });
  }

  onBranchChange(id: string) {
    this.branchId.set(id);
    this.clients.update(clients => clients.map(c => ({ ...c, branch_id: id })));
  }

  getPackagesForProduct(productId: string): any[] {
    return this.packageMap().get(productId) || [];
  }

  getCurrentUserPhone(): string {
    return this.auth.currentUser() || '';
  }

  receiptKey(ci: number, pi: number, ii: number): string {
    return `${ci}-${pi}-${ii}`;
  }

  dateKey(ci: number, pi: number, type: string, idx: number): string {
    return `${ci}-${pi}-${type}-${idx}`;
  }

  checkPhone(clientIndex: number, phone: string) {
    if (this.phoneTimers[clientIndex]) {
      clearTimeout(this.phoneTimers[clientIndex]);
    }
    this.phoneWarnings.update(w => { const n = { ...w }; delete n[clientIndex]; return n; });
    if (!phone || phone.length < 5) return;
    this.phoneTimers[clientIndex] = setTimeout(() => {
      this.consultationService.clientSearch(phone).subscribe({
        next: (results) => {
          const match = results.find(r => r.phone === phone);
          if (match) {
            this.phoneWarnings.update(w => ({ ...w, [clientIndex]: `Client exists: ${match.first_name} ${match.last_name || ''} (${match.latest_status})` }));
          }
        },
      });
    }, 500);
  }

  checkReceipt(ci: number, pi: number, ii: number, receiptNumber: string) {
    const key = this.receiptKey(ci, pi, ii);
    const timerIdx = ci * 1000 + pi * 100 + ii;
    if (this.receiptTimers[timerIdx]) {
      clearTimeout(this.receiptTimers[timerIdx]);
    }
    this.receiptWarnings.update(w => { const n = { ...w }; delete n[key]; return n; });
    if (!receiptNumber || receiptNumber.length < 2) return;
    this.receiptTimers[timerIdx] = setTimeout(() => {
      this.consultationService.checkBulkReceipts([receiptNumber]).subscribe({
        next: (res) => {
          if (res.existing.includes(receiptNumber)) {
            this.receiptWarnings.update(w => ({ ...w, [key]: `Receipt "${receiptNumber}" already exists` }));
          }
        },
      });
    }, 400);
  }

  onLessonTypeChange(clientIndex: number, pkgIndex: number, lessonIndex: number, newType: string) {
    const defaultDuration = newType === 'theory' ? 120 : 30;
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      const lessons = [...pkgs[pkgIndex].lessons];
      lessons[lessonIndex] = { ...lessons[lessonIndex], lesson_type: newType, duration_minutes: defaultDuration };
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
  }

  validateInstallmentDate(ci: number, pi: number, ii: number) {
    const key = this.dateKey(ci, pi, 'inst', ii);
    this.dateErrors.update(e => { const n = { ...e }; delete n[key]; return n; });
    const client = this.clients()[ci];
    if (!client?.document_date) return;
    const inst = client.packages[pi]?.installments[ii];
    if (!inst?.document_date) return;
    if (inst.document_date < client.document_date) {
      this.dateErrors.update(e => ({ ...e, [key]: `Date cannot be before client document date (${client.document_date!.toISOString().split('T')[0]})` }));
    }
  }

  validateLessonDate(ci: number, pi: number, li: number) {
    const key = this.dateKey(ci, pi, 'lesson', li);
    this.dateErrors.update(e => { const n = { ...e }; delete n[key]; return n; });
    const client = this.clients()[ci];
    const lesson = client?.packages[pi]?.lessons[li];
    if (!lesson) return;
    if (!lesson.date) {
      this.dateErrors.update(e => ({ ...e, [key]: 'Date is required' }));
      return;
    }
    const docDate = client?.document_date;
    if (docDate && lesson.date < docDate) {
      this.dateErrors.update(e => ({ ...e, [key]: `Date cannot be before client document date (${docDate.toISOString().split('T')[0]})` }));
      return;
    }
    const firstPay = this.packageFirstPaymentDate(ci, pi);
    if (firstPay && lesson.date < firstPay) {
      this.dateErrors.update(e => ({ ...e, [key]: `Date cannot be before the first payment date (${firstPay.toISOString().split('T')[0]})` }));
    }
  }

  validateAllLessons() {
    const clients = this.clients();
    clients.forEach((_, ci) => {
      (clients[ci]?.packages || []).forEach((_, pi) => {
        (clients[ci]?.packages[pi]?.lessons || []).forEach((_, li) => {
          this.validateLessonDate(ci, pi, li);
        });
      });
    });
  }

  hasDateErrors(): boolean {
    return Object.keys(this.dateErrors()).length > 0;
  }

  hasReceiptWarnings(): boolean {
    return Object.keys(this.receiptWarnings()).length > 0;
  }

  hasPhoneWarnings(): boolean {
    return Object.keys(this.phoneWarnings()).length > 0;
  }

  restoreDraft() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        this.draftSavedAt.set(draft.saved_at || '');
        const restored = draft.clients.map((c: any) => this.restoreClientDraft(c));
        this.clients.set(restored);
        this.draftRestored.set(true);
        const stepIdx: Record<number, number> = {};
        restored.forEach((_: any, i: number) => { stepIdx[i] = 0; });
        this.clientStepIndex.set(stepIdx);
        this.validateAllLessons();
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  private restoreClientDraft(c: any): ClientDraft {
    const currentPhone = this.auth.currentUser() || '';
    return {
      phone: c.phone || '',
      first_name: c.first_name || '',
      middle_name: c.middle_name || '',
      last_name: c.last_name || '',
      location: c.location || '',
      branch_id: c.branch_id || '',
      document_date: c.document_date ? new Date(c.document_date) : null,
      converter_id: c.converter_id || currentPhone,
      primary_recommender_id: c.primary_recommender_id || currentPhone,
      secondary_recommender_id: c.secondary_recommender_id || currentPhone,
      packages: (c.packages || []).map((p: any) => ({
        product_id: p.product_id || '',
        package_id: p.package_id || '',
        installments: (p.installments || []).map((i: any) => ({
          receipt_number: i.receipt_number || '',
          document_date: i.document_date ? new Date(i.document_date) : null,
          amount: i.amount || null,
          received_by_phone: i.received_by_phone || '',
        })),
        lessons: (p.lessons || []).map((l: any) => ({
          date: l.date ? new Date(l.date) : null,
          duration_minutes: l.duration_minutes || null,
          lesson_type: l.lesson_type || 'practical',
          instructor_id: l.instructor_id || '',
          vehicle_id: l.vehicle_id || '',
          notes: l.notes || '',
          template_item_id: l.template_item_id || null,
          title: l.title || null,
          lesson_objectives: l.lesson_objectives || [],
          practical_objectives: l.practical_objectives || [],
          status: l.status === 'scheduled' ? 'scheduled' : 'completed',
        })),
        transmission_type: p.transmission_type || 'manual',
        lesson_plan_template_id: p.lesson_plan_template_id || null,
        discount_id: p.discount_id || '',
      })),
    };
  }

  saveDraft() {
    this.persistDraft();
    this.msg.add({ severity: 'success', summary: 'Draft saved' });
  }

  private persistDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.draftPayload()));
  }

  private draftPayload() {
    return {
      saved_at: new Date().toISOString(),
      clients: this.clients().map(c => ({
        phone: c.phone,
        first_name: c.first_name,
        middle_name: c.middle_name,
        last_name: c.last_name,
        location: c.location,
        branch_id: c.branch_id,
        document_date: c.document_date?.toISOString()?.split('T')[0] || null,
        converter_id: c.converter_id,
        primary_recommender_id: c.primary_recommender_id,
        secondary_recommender_id: c.secondary_recommender_id,
        packages: c.packages.map(p => ({
          product_id: p.product_id,
          package_id: p.package_id,
          installments: p.installments.map(i => ({
            receipt_number: i.receipt_number,
            document_date: i.document_date?.toISOString()?.split('T')[0] || null,
            amount: i.amount,
            received_by_phone: i.received_by_phone,
          })),
          lessons: p.lessons.map(l => ({
            date: l.date?.toISOString()?.split('T')[0] || null,
            duration_minutes: l.duration_minutes,
            lesson_type: l.lesson_type,
            instructor_id: l.instructor_id,
            vehicle_id: l.vehicle_id,
            notes: l.notes,
            template_item_id: l.template_item_id,
            title: l.title,
            lesson_objectives: l.lesson_objectives,
            practical_objectives: l.practical_objectives,
            status: l.status || 'completed',
          })),
          transmission_type: p.transmission_type || 'manual',
          lesson_plan_template_id: p.lesson_plan_template_id || null,
          discount_id: p.discount_id || '',
        })),
      })),
    };
  }

  clearDraft() {
    this.confirm.confirm({
      message: 'Clear the saved draft? This cannot be undone.',
      header: 'Clear Draft',
      acceptLabel: 'Clear',
      accept: () => {
        localStorage.removeItem(STORAGE_KEY);
        this.clients.set([]);
        this.draftRestored.set(false);
        this.draftSavedAt.set('');
        this.msg.add({ severity: 'info', summary: 'Draft cleared' });
      },
    });
  }

  dismissDraftRestore() {
    this.draftRestored.set(false);
  }

  addClient() {
    const currentPhone = this.auth.currentUser() || '';
    this.clients.update(clients => [
      ...clients,
      {
        phone: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        location: '',
        branch_id: this.branchId(),
        document_date: null,
        converter_id: currentPhone,
        primary_recommender_id: currentPhone,
        secondary_recommender_id: currentPhone,
        packages: [],
      },
    ]);
    const idx = this.clients().length - 1;
    this.clientStepIndex.update(s => ({ ...s, [idx]: 0 }));
  }

  onStepChange(clientIndex: number, stepIndex: number) {
    const current = this.clientStepIndex()[clientIndex] ?? 0;
    if (stepIndex > current) {
      for (let s = 0; s < stepIndex; s++) {
        if (!this.stepValid(clientIndex, s)) {
          this.msg.add({
            severity: 'warn',
            summary: 'Complete step ' + (s + 1) + ' first',
            detail: 'Validate all fields in each step before moving forward.',
          });
          return;
        }
      }
    }
    this.clientStepIndex.update(s => ({ ...s, [clientIndex]: stepIndex }));
  }

  private stepValid(clientIndex: number, step: number): boolean {
    const c = this.clients()[clientIndex];
    if (!c) return false;
    switch (step) {
      case 0: return this.clientInfoComplete(c);
      case 1: return this.clientPaymentsComplete(c);
      case 2: return this.clientLessonsComplete(c);
      default: return true;
    }
  }

  getStepItems(): MenuItem[] {
    return [
      { label: 'Info', icon: 'pi pi-user' },
      { label: 'Payments', icon: 'pi pi-wallet' },
      { label: 'Lessons', icon: 'pi pi-book' },
      { label: 'Preview', icon: 'pi pi-eye' },
    ];
  }

  productNameById(id: string): string {
    return this.products().find(p => p.id === id)?.name || '';
  }

  userNameByPhone(phone: string): string {
    const u = this.users().find(x => x.phone === phone);
    return u ? (u.name || u.phone) : phone;
  }

  branchNameById(id: string): string {
    return this.branches().find(b => b.id === id)?.name || '';
  }

  vehicleNameById(id: string): string {
    return this.vehicles().find(v => v.id === id)?.name || id;
  }

  packageNameById(productId: string, packageId: string): string {
    const p = this.products().find(pr => pr.id === productId);
    const pkg = p?.packages.find((pk: any) => pk.id === packageId);
    return pkg?.name || '';
  }

  packagePriceById(productId: string, packageId: string): number {
    const p = this.products().find(pr => pr.id === productId);
    const pkg = p?.packages.find((pk: any) => pk.id === packageId);
    return pkg?.price ?? 0;
  }

  packageTrainingInfo(productId: string, packageId: string): { days: number | null; hours: number | null } {
    const p = this.products().find(pr => pr.id === productId);
    const pkg = p?.packages.find((pk: any) => pk.id === packageId);
    return {
      days: pkg?.driving_training_duration_days ?? null,
      hours: pkg?.theory_training_hours ?? null,
    };
  }

  packageNeedsLessons(pkg: PackageDraft): boolean {
    const info = this.packageTrainingInfo(pkg.product_id, pkg.package_id);
    return (info.days ?? 0) > 0 || (info.hours ?? 0) > 0;
  }

  clientInitials(c: ClientDraft): string {
    const parts = [c.first_name, c.last_name].filter(Boolean);
    return parts.length ? parts.map(n => n[0].toUpperCase()).slice(0, 2).join('') : '?';
  }

  packageTotalAmount(pkg: PackageDraft): number {
    return pkg.installments.reduce((s, i) => s + (i.amount || 0), 0);
  }

  clientInfoComplete(c: ClientDraft): boolean {
    return !!c.phone && !!c.first_name;
  }

  clientPaymentsComplete(c: ClientDraft): boolean {
    return c.packages.length > 0 && c.packages.every(pkg =>
      !!pkg.product_id &&
      pkg.installments.length > 0 &&
      pkg.installments.every(inst =>
        !!inst.receipt_number && !!inst.document_date && !!inst.amount && !!inst.received_by_phone
      )
    );
  }

  clientLessonsComplete(c: ClientDraft): boolean {
    if (c.packages.length === 0) return false;
    const needsLessons = c.packages.some(pkg => this.packageNeedsLessons(pkg));
    if (!needsLessons) return true;
    return c.packages.some(pkg =>
      this.packageNeedsLessons(pkg) && pkg.lessons.length > 0 && pkg.lessons.every(l => !!l.date && !!l.duration_minutes && l.duration_minutes > 0)
    );
  }

  stepState(ci: number, step: number): 'done' | 'active' | 'pending' | 'error' {
    const c = this.clients()[ci];
    if (!c) return 'pending';
    if (this.stepErrorsFor(ci, step).length > 0) return 'error';
    const done = step === 0 ? this.clientInfoComplete(c)
      : step === 1 ? this.clientPaymentsComplete(c)
      : step === 2 ? this.clientLessonsComplete(c)
      : this.clientInfoComplete(c) && this.clientPaymentsComplete(c) && this.clientLessonsComplete(c);
    if (done) return 'done';
    return this.clientStepIndex()[ci] === step ? 'active' : 'pending';
  }

  private stepErrorsFor(ci: number, step: number): string[] {
    const c = this.clients()[ci];
    if (!c) return [];
    const out: string[] = [];
    if (step === 0 || step === 3) {
      if (this.phoneWarnings()[ci]) out.push(this.phoneWarnings()[ci]);
    }
    if (step === 1 || step === 3) {
      const prefix = `${ci}-`;
      Object.keys(this.receiptWarnings()).filter(k => k.startsWith(prefix)).forEach(k => out.push(this.receiptWarnings()[k]));
      Object.keys(this.dateErrors()).filter(k => k.startsWith(prefix) && k.includes('-inst-')).forEach(k => out.push(this.dateErrors()[k]));
    }
    if (step === 2 || step === 3) {
      const prefix = `${ci}-`;
      Object.keys(this.dateErrors()).filter(k => k.startsWith(prefix) && k.includes('-lesson-')).forEach(k => out.push(this.dateErrors()[k]));
    }
    return out;
  }

  stepError(ci: number, step: number): string {
    return this.stepErrorsFor(ci, step)[0] || '';
  }

  validationIssues(): string[] {
    const issues: string[] = [];
    const clients = this.clients();
    clients.forEach((_, ci) => {
      const labels = ['Info', 'Payments', 'Lessons', 'Preview'];
      for (let s = 0; s < 4; s++) {
        for (const msg of this.stepErrorsFor(ci, s)) {
          issues.push(`Client ${ci + 1} (${labels[s]}): ${msg}`);
        }
      }
    });
    return issues;
  }

  removeClient(index: number) {
    this.clients.update(clients => clients.filter((_, i) => i !== index));
    this.clientStepIndex.update(s => {
      const n: Record<number, number> = {};
      let newIdx = 0;
      for (let i = 0; i < this.clients().length + 1; i++) {
        if (i === index) continue;
        n[newIdx] = s[i] ?? 0;
        newIdx++;
      }
      return n;
    });
  }

  addPackage(clientIndex: number) {
    this.clients.update(clients => {
      const updated = [...clients];
      updated[clientIndex] = {
        ...updated[clientIndex],
        packages: [
          ...updated[clientIndex].packages,
          { product_id: '', package_id: '', installments: [], lessons: [], transmission_type: 'manual', lesson_plan_template_id: null, discount_id: '' },
        ],
      };
      return updated;
    });
  }

  discountKey(productId: string, packageId: string): string {
    return `${productId}::${packageId || ''}`;
  }

  discountOptionsFor(pkg: PackageDraft): { label: string; value: string }[] {
    const result: { label: string; value: string }[] = [{ label: 'No discount', value: '' }];
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    for (const d of this.discountsForProduct()[key] || []) {
      const amount = d.discount_type === 'fixed' ? `${d.discount_value.toLocaleString()} UGX` : `${d.discount_value}%`;
      result.push({ label: `${d.name} (${d.code}) — ${amount}`, value: d.id });
    }
    return result;
  }

  loadDiscountsForPackage(pkg: PackageDraft) {
    if (!pkg.product_id) return;
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    this.discountService.getApplicableDiscountsForProduct(pkg.product_id, pkg.package_id || null).subscribe({
      next: (discounts) => {
        this.discountsForProduct.update(m => ({ ...m, [key]: discounts || [] }));
      },
    });
  }

  onPackageProductChange(clientIndex: number, pkgIndex: number, productId: string) {
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], product_id: productId, package_id: '', discount_id: '' };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
    this.loadDiscountsForPackage(this.clients()[clientIndex].packages[pkgIndex]);
  }

  onPackageChange(clientIndex: number, pkgIndex: number, packageId: string) {
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], package_id: packageId, discount_id: '' };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
    this.loadDiscountsForPackage(this.clients()[clientIndex].packages[pkgIndex]);
  }

  discountApplied(pkg: PackageDraft): number {
    if (!pkg.discount_id) return 0;
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    const d = (this.discountsForProduct()[key] || []).find(x => x.id === pkg.discount_id);
    if (!d) return 0;
    const price = this.packagePriceById(pkg.product_id, pkg.package_id);
    if (d.discount_type === 'fixed') return Math.min(d.discount_value, price);
    return Math.round((price * d.discount_value) / 100);
  }

  removePackage(clientIndex: number, pkgIndex: number) {
    this.clients.update(clients => {
      const updated = [...clients];
      updated[clientIndex] = {
        ...updated[clientIndex],
        packages: updated[clientIndex].packages.filter((_, i) => i !== pkgIndex),
      };
      return updated;
    });
  }

  addInstallment(clientIndex: number, pkgIndex: number) {
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      const insts = [...pkgs[pkgIndex].installments];
      insts.push({ receipt_number: '', document_date: null, amount: null, received_by_phone: this.getCurrentUserPhone() });
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], installments: insts };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
  }

  removeInstallment(clientIndex: number, pkgIndex: number, instIndex: number) {
    const key = this.receiptKey(clientIndex, pkgIndex, instIndex);
    this.receiptWarnings.update(w => { const n = { ...w }; delete n[key]; return n; });
    const dkey = this.dateKey(clientIndex, pkgIndex, 'inst', instIndex);
    this.dateErrors.update(e => { const n = { ...e }; delete n[dkey]; return n; });
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      pkgs[pkgIndex] = {
        ...pkgs[pkgIndex],
        installments: pkgs[pkgIndex].installments.filter((_, i) => i !== instIndex),
      };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
  }

  addLesson(clientIndex: number, pkgIndex: number) {
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      const lessons = [...pkgs[pkgIndex].lessons];
      lessons.push({
        date: null,
        duration_minutes: 30,
        lesson_type: 'practical',
        instructor_id: '',
        vehicle_id: '',
        notes: '',
        template_item_id: null,
        title: null,
        lesson_objectives: [],
        practical_objectives: [],
        status: 'completed',
      });
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
    this.validateAllLessons();
  }

  removeLesson(clientIndex: number, pkgIndex: number, lessonIndex: number) {
    const dkey = this.dateKey(clientIndex, pkgIndex, 'lesson', lessonIndex);
    this.dateErrors.update(e => { const n = { ...e }; delete n[dkey]; return n; });
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[clientIndex].packages];
      pkgs[pkgIndex] = {
        ...pkgs[pkgIndex],
        lessons: pkgs[pkgIndex].lessons.filter((_, i) => i !== lessonIndex),
      };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
  }

  openQuickGen(clientIndex: number, pkgIndex: number) {
    const pkg = this.clients()[clientIndex]?.packages[pkgIndex];
    this.quickGenClientIndex.set(clientIndex);
    this.quickGenPkgIndex.set(pkgIndex);
    this.quickGenForm.set({
      practicalDays: null,
      theoryLessons: null,
      startDate: null,
      lastDate: null,
      transmission: pkg?.transmission_type || 'manual',
      lesson_plan_template_id: pkg?.lesson_plan_template_id || null,
      instructor_id: '',
      vehicle_id: '',
    });
    this.quickGenPreview.set([]);
    this.quickGenSelectedItemIds.set([]);
    this.quickGenItemDates.set({});
    this.quickGenItemStatus.set({});
    this.showQuickGen.set(true);
  }

  openQuickGenEdit(clientIndex: number, pkgIndex: number) {
    const pkg = this.clients()[clientIndex]?.packages[pkgIndex];
    const lessons = pkg?.lessons || [];
    this.quickGenClientIndex.set(clientIndex);
    this.quickGenPkgIndex.set(pkgIndex);

    let startDate: Date | null = null;
    let lastDate: Date | null = null;
    for (const l of lessons) {
      if (!l.date) continue;
      const d = this.startOfDay(l.date);
      if (!startDate || d < startDate) startDate = d;
      if (!lastDate || d > lastDate) lastDate = d;
    }

    this.quickGenForm.set({
      practicalDays: lessons.filter(l => l.lesson_type === 'practical' && l.status === 'completed').length,
      theoryLessons: lessons.filter(l => l.lesson_type === 'theory' && l.status === 'completed').length,
      startDate,
      lastDate,
      transmission: pkg?.transmission_type || 'manual',
      lesson_plan_template_id: pkg?.lesson_plan_template_id || null,
      instructor_id: lessons.find(l => l.instructor_id)?.instructor_id || '',
      vehicle_id: lessons.find(l => l.vehicle_id)?.vehicle_id || '',
    });

    const template = this.quickGenSelectedTemplate();
    if (template && template.lesson_items?.length) {
      const selected = new Set<string>();
      const dates: Record<string, Date | null> = {};
      const statuses: Record<string, 'completed' | 'scheduled'> = {};
      for (const l of lessons) {
        if (!l.template_item_id) continue;
        selected.add(l.template_item_id);
        if (l.date && !dates[l.template_item_id]) dates[l.template_item_id] = l.date;
        if (!statuses[l.template_item_id]) {
          statuses[l.template_item_id] = l.status === 'completed' ? 'completed' : 'scheduled';
        }
      }
      this.quickGenSelectedItemIds.set([...selected]);
      this.quickGenItemDates.set(dates);
      this.quickGenItemStatus.set(statuses);
      this.quickGenPreview.set([]);
    } else {
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const preview: QuickGenLesson[] = lessons
        .filter(l => l.date)
        .map(l => {
          const d = this.startOfDay(l.date!);
          return {
            date: d,
            lesson_type: (l.lesson_type === 'theory' ? 'theory' : 'practical'),
            dayLabel: DAYS[d.getDay()],
            template_item_id: l.template_item_id || null,
            title: l.title || null,
            lesson_objectives: l.lesson_objectives || [],
            practical_objectives: l.practical_objectives || [],
            status: l.status === 'scheduled' ? 'scheduled' : 'completed',
          };
        });
      this.quickGenPreview.set(preview);
      this.quickGenSelectedItemIds.set([]);
      this.quickGenItemDates.set({});
      this.quickGenItemStatus.set({});
    }
    this.showQuickGen.set(true);
  }

  private startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private quickGenDocDate(): Date | null {
    const d = this.clients()[this.quickGenClientIndex()]?.document_date;
    return d ? this.startOfDay(d) : null;
  }

  private packageFirstPaymentDate(ci: number, pi: number): Date | null {
    const pkg = this.clients()[ci]?.packages[pi];
    if (!pkg) return null;
    const dates = pkg.installments
      .map(i => i.document_date)
      .filter((d): d is Date => !!d)
      .map(d => this.startOfDay(d))
      .sort((a, b) => a.getTime() - b.getTime());
    return dates[0] || null;
  }

  private quickGenFirstPaymentDate(): Date | null {
    return this.packageFirstPaymentDate(this.quickGenClientIndex(), this.quickGenPkgIndex());
  }

  private quickGenRangeError(): string {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const form = this.quickGenForm();
    const start = form.startDate ? this.startOfDay(form.startDate) : null;
    const last = form.lastDate ? this.startOfDay(form.lastDate) : null;
    const docDate = this.quickGenDocDate();
    const firstPay = this.quickGenFirstPaymentDate();

    if (start && docDate && start < docDate) {
      return `Start date cannot be before the client's document date (${fmt(docDate)})`;
    }
    if (start && firstPay && start < firstPay) {
      return `Start date cannot be before the first payment date (${fmt(firstPay)})`;
    }
    if (last && start && last < start) {
      return 'Last date must be after start date';
    }
    return '';
  }

  private quickGenLessonsError(): string {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const template = this.quickGenSelectedTemplate();
    const docDate = this.quickGenDocDate();
    const firstPay = this.quickGenFirstPaymentDate();

    const lower = (msgDate: Date | null) => {
      if (docDate && msgDate && msgDate < docDate) {
        return `cannot be before the client's document date (${fmt(docDate)})`;
      }
      if (firstPay && msgDate && msgDate < firstPay) {
        return `cannot be before the first payment date (${fmt(firstPay)})`;
      }
      return '';
    };

    if (template) {
      const selectedIds = this.quickGenSelectedItemIds();
      const items = (template.lesson_items || []).filter(i => selectedIds.includes(i.id));
      for (const item of items) {
        const date = this.quickGenItemDates()[item.id];
        if (!date) return `Set a date for "${item.title}"`;
        const d = this.startOfDay(date);
        const msg = lower(d);
        if (msg) return `Date for "${item.title}" ${msg}`;
      }
    } else {
      for (const lesson of this.quickGenPreview()) {
        const d = this.startOfDay(lesson.date);
        const msg = lower(d);
        if (msg) return `Generated lesson date ${msg}`;
      }
    }
    return '';
  }

  computeQuickGen() {
    this.quickGenBusy.set(true);
    try {
      const form = this.quickGenForm();
      const start = form.startDate ? this.startOfDay(form.startDate) : null;
      const last = form.lastDate ? this.startOfDay(form.lastDate) : null;
      if (!start || !last) return;
      const rangeErr = this.quickGenRangeError();
      if (rangeErr) {
        this.msg.add({ severity: 'warn', summary: rangeErr });
        return;
      }

      const template = this.lessonTemplates().find(t => t.id === form.lesson_plan_template_id);
      const templateItems = template?.lesson_items || [];
      const isTemplateMode = !!template && templateItems.length > 0;

      let practical: QuickGenSeed[] = [];
      let theory: QuickGenSeed[] = [];

      if (isTemplateMode) {
        const selectedIds = this.quickGenSelectedItemIds();
        const selectedItems = templateItems.filter(i => selectedIds.includes(i.id));
        if (selectedItems.length === 0) {
          this.msg.add({ severity: 'warn', summary: 'Tick at least one lesson in the plan to compute' });
          return;
        }
        practical = selectedItems
          .filter(i => !i.is_theory)
          .map(i => ({
            template_item_id: i.id,
            title: i.title,
            lesson_objectives: i.lesson_objectives || [],
            practical_objectives: i.practical_objectives || [],
            status: this.quickGenItemStatus()[i.id] || 'completed',
          }));
        theory = selectedItems
          .filter(i => i.is_theory)
          .map(i => ({
            template_item_id: i.id,
            title: i.title,
            lesson_objectives: i.lesson_objectives || [],
            practical_objectives: i.practical_objectives || [],
            status: this.quickGenItemStatus()[i.id] || 'completed',
          }));
      } else {
        const { practical: effectivePractical, theory: effectiveTheory } = this.quickGenEffectiveCounts();
        const trainedPractical = form.practicalDays ?? 0;
        const trainedTheory = form.theoryLessons ?? 0;
        if (effectivePractical + effectiveTheory === 0) {
          this.msg.add({ severity: 'warn', summary: 'Add at least one practical or theory lesson' });
          return;
        }
        practical = Array.from({ length: effectivePractical }, (_, i) => ({
          template_item_id: null,
          title: null,
          lesson_objectives: [],
          practical_objectives: [],
          status: i < trainedPractical ? 'completed' : 'scheduled',
        }));
        theory = Array.from({ length: effectiveTheory }, (_, i) => ({
          template_item_id: null,
          title: null,
          lesson_objectives: [],
          practical_objectives: [],
          status: i < trainedTheory ? 'completed' : 'scheduled',
        }));
      }

      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      // Working days between start and last (Mon–Fri, 5 days a week — exclude weekends)
      const practicalDates: Date[] = [];
      const cursor = new Date(start);
      while (cursor <= last) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) practicalDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      // Only schedule practical lessons within the start–last window.
      // If there are fewer working days than practical lessons, cut short.
      const practicalCount = Math.min(practical.length, practicalDates.length);
      const practicalGenerated: QuickGenLesson[] = practical.slice(0, practicalCount).map((p, i) => ({
        ...p,
        date: practicalDates[i],
        lesson_type: 'practical',
        dayLabel: DAYS[practicalDates[i].getDay()],
      }));

      // Theory always on Saturday, starting from the first Saturday >= start,
      // overflowing past the last date if needed.
      const theoryDates: Date[] = [];
      const firstSat = new Date(start);
      while (firstSat.getDay() !== 6) firstSat.setDate(firstSat.getDate() + 1);
      let satCursor = new Date(firstSat);
      while (theoryDates.length < theory.length) {
        theoryDates.push(new Date(satCursor));
        satCursor.setDate(satCursor.getDate() + 7);
      }

      const theoryGenerated: QuickGenLesson[] = theory.map((t, i) => ({
        ...t,
        date: theoryDates[i],
        lesson_type: 'theory',
        dayLabel: DAYS[theoryDates[i].getDay()],
      }));

      const generated = [...practicalGenerated, ...theoryGenerated];
      generated.sort((a, b) => a.date.getTime() - b.date.getTime());
      this.quickGenPreview.set(generated);
    } finally {
      setTimeout(() => this.quickGenBusy.set(false), 400);
    }
  }

  confirmQuickGen() {
    this.quickGenBusy.set(true);
    const rangeErr = this.quickGenDateError();
    if (rangeErr) {
      this.msg.add({ severity: 'warn', summary: rangeErr });
      this.quickGenBusy.set(false);
      return;
    }
    const ci = this.quickGenClientIndex();
    const pi = this.quickGenPkgIndex();
    const form = this.quickGenForm();
    const template = this.quickGenSelectedTemplate();

    let lessons: LessonDraft[];
    const instructorId = form.instructor_id || '';
    const vehicleId = form.vehicle_id || '';
    if (template) {
      const selectedIds = this.quickGenSelectedItemIds();
      const items = (template.lesson_items || []).filter(i => selectedIds.includes(i.id));
      if (items.length === 0) {
        this.quickGenBusy.set(false);
        return;
      }
      const dates = this.quickGenItemDates();
      lessons = items.map(item => {
        const date = dates[item.id];
        return {
          date: date ? new Date(date) : null,
          duration_minutes: item.is_theory ? 120 : 30,
          lesson_type: item.is_theory ? 'theory' : 'practical',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          notes: '',
          template_item_id: item.id,
          title: item.title,
          lesson_objectives: item.lesson_objectives || [],
          practical_objectives: item.practical_objectives || [],
          status: this.quickGenItemStatus()[item.id] || 'completed',
        };
      });
    } else {
      const preview = this.quickGenPreview();
      if (preview.length === 0) {
        this.quickGenBusy.set(false);
        return;
      }
      lessons = preview.map(l => ({
        date: new Date(l.date),
        duration_minutes: l.lesson_type === 'theory' ? 120 : 30,
        lesson_type: l.lesson_type,
        instructor_id: instructorId,
        vehicle_id: vehicleId,
        notes: '',
        template_item_id: l.template_item_id || null,
        title: l.title || null,
        lesson_objectives: l.lesson_objectives || [],
        practical_objectives: l.practical_objectives || [],
        status: l.status || 'completed',
      }));
    }

    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[ci].packages];
      pkgs[pi] = {
        ...pkgs[pi],
        lessons,
        transmission_type: form.transmission || 'manual',
        lesson_plan_template_id: form.lesson_plan_template_id || pkgs[pi].lesson_plan_template_id || null,
      };
      updated[ci] = { ...updated[ci], packages: pkgs };
      return updated;
    });
    this.showQuickGen.set(false);
    this.quickGenPreview.set([]);
    this.quickGenItemDates.set({});
    this.validateAllLessons();
    this.persistDraft();
    setTimeout(() => this.quickGenBusy.set(false), 400);
  }

  private quickGenEffectiveCounts(): { practical: number; theory: number } {
    const form = this.quickGenForm();
    const pkg = this.clients()[this.quickGenClientIndex()]?.packages[this.quickGenPkgIndex()];
    const info = pkg && pkg.product_id && pkg.package_id
      ? this.packageTrainingInfo(pkg.product_id, pkg.package_id)
      : { days: null, hours: null };
    const practical = info.days != null ? info.days : (form.practicalDays ?? 0);
    const theorySessions = info.hours ? Math.ceil(info.hours / 2) : 0;
    const theory = Math.max(form.theoryLessons ?? 0, theorySessions);
    return { practical, theory };
  }

  quickGenMaxPracticalDays(): number {
    const pkg = this.clients()[this.quickGenClientIndex()]?.packages[this.quickGenPkgIndex()];
    if (!pkg || !pkg.product_id || !pkg.package_id) return 999;
    return this.packageTrainingInfo(pkg.product_id, pkg.package_id).days ?? 999;
  }

  quickGenPackageInfo(): { days: number | null; hours: number | null } {
    const pkg = this.clients()[this.quickGenClientIndex()]?.packages[this.quickGenPkgIndex()];
    if (!pkg || !pkg.product_id || !pkg.package_id) return { days: null, hours: null };
    return this.packageTrainingInfo(pkg.product_id, pkg.package_id);
  }

  quickGenCompletedCount(): number {
    return Object.values(this.quickGenItemStatus()).filter(s => s === 'completed').length;
  }

  quickGenScheduledCount(): number {
    return Object.values(this.quickGenItemStatus()).filter(s => s === 'scheduled').length;
  }

  quickGenPreviewCompletedCount(): number {
    return this.quickGenPreview().filter(l => l.status !== 'scheduled').length;
  }

  quickGenPreviewScheduledCount(): number {
    return this.quickGenPreview().filter(l => l.status === 'scheduled').length;
  }

  onQuickGenDateChange(lesson: QuickGenLesson, value: Date) {
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    lesson.date = value;
    lesson.dayLabel = DAYS[value.getDay()];
    this.quickGenPreview.update(list => [...list]);
  }

  onQuickGenTypeChange(lesson: QuickGenLesson, value: string) {
    lesson.lesson_type = value === 'theory' ? 'theory' : 'practical';
    this.quickGenPreview.update(list => [...list]);
  }

  removeQuickGenLesson(index: number) {
    this.quickGenPreview.update(list => list.filter((_, i) => i !== index));
  }

  quickGenSelectedTemplate(): LessonPlanTemplate | null {
    return this.lessonTemplates().find(t => t.id === this.quickGenForm().lesson_plan_template_id) || null;
  }

  isQuickGenItemSelected(itemId: string): boolean {
    return this.quickGenSelectedItemIds().includes(itemId);
  }

  toggleQuickGenItem(itemId: string) {
    const template = this.quickGenSelectedTemplate();
    const item = template?.lesson_items?.find(i => i.id === itemId);
    if (item && !item.is_theory && !this.isQuickGenItemSelected(itemId)) {
      const max = this.quickGenMaxPracticalDays();
      if (max !== 999) {
        const selected = this.quickGenSelectedItemIds();
        const selectedPractical = selected.filter(id =>
          template?.lesson_items?.find(i => i.id === id) && !template.lesson_items.find(i => i.id === id)!.is_theory
        ).length;
        if (selectedPractical >= max) {
          this.msg.add({ severity: 'warn', summary: `This package allows a maximum of ${max} practical lesson(s)` });
          return;
        }
      }
    }
    this.quickGenSelectedItemIds.update(ids =>
      ids.includes(itemId) ? ids.filter(id => id !== itemId) : [...ids, itemId]
    );
    this.quickGenItemStatus.update(m => {
      const n = { ...m };
      if (!n[itemId]) n[itemId] = 'completed';
      return n;
    });
    this.assignQuickGenDates(false);
  }

  onQuickGenItemDateChange(itemId: string, value: Date | null) {
    this.quickGenItemDates.update(m => ({ ...m, [itemId]: value }));
  }

  onQuickGenDateRangeChange() {
    if (this.quickGenDateError()) return;
    this.assignQuickGenDates(true);
  }

  private assignQuickGenDates(force: boolean) {
    const form = this.quickGenForm();
    const template = this.quickGenSelectedTemplate();
    if (!template) return;
    const start = form.startDate ? this.startOfDay(form.startDate) : null;
    const last = form.lastDate ? this.startOfDay(form.lastDate) : null;
    if (!start || !last) return;
    const selectedIds = this.quickGenSelectedItemIds();
    const selectedItems = (template.lesson_items || []).filter(i => selectedIds.includes(i.id));
    const practicals = selectedItems.filter(i => !i.is_theory);
    const theories = selectedItems.filter(i => i.is_theory);

    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const practicalDates: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= last) {
      const dow = cursor.getDay();
      if (dow >= 1 && dow <= 5) practicalDates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    let overflow = new Date(last);
    while (practicalDates.length < practicals.length) {
      overflow.setDate(overflow.getDate() + 1);
      if (overflow.getDay() >= 1 && overflow.getDay() <= 5) practicalDates.push(new Date(overflow));
    }

    const theoryDates: Date[] = [];
    const firstSat = new Date(start);
    while (firstSat.getDay() !== 6) firstSat.setDate(firstSat.getDate() + 1);
    let satCursor = new Date(firstSat);
    while (theoryDates.length < theories.length) {
      theoryDates.push(new Date(satCursor));
      satCursor.setDate(satCursor.getDate() + 7);
    }

    this.quickGenItemDates.update(map => {
      const next = { ...map };
      practicals.forEach((it, i) => {
        if (force || !next[it.id]) next[it.id] = practicalDates[i] || null;
      });
      theories.forEach((it, i) => {
        if (force || !next[it.id]) next[it.id] = theoryDates[i] || null;
      });
      return next;
    });
  }

  onQuickGenCountsChange() {
    this.syncQuickGenSelection();
  }

  onQuickGenTemplateChange(templateId: string | null) {
    const prev = this.quickGenForm().lesson_plan_template_id;
    this.quickGenForm.update(f => ({ ...f, lesson_plan_template_id: templateId }));
    this.syncQuickGenSelection();
    if (templateId !== prev) {
      const ci = this.quickGenClientIndex();
      const pi = this.quickGenPkgIndex();
      const pkg = this.clients()[ci]?.packages[pi];
      if (pkg && pkg.lessons.length > 0) {
        this.clearPackageLessons(ci, pi);
        this.msg.add({
          severity: 'info',
          summary: 'Previous lessons removed',
          detail: 'Changing the lesson plan removed this package\'s existing lessons.',
        });
      }
      if (!templateId) {
        this.quickGenPreview.set([]);
      }
    }
  }

  private clearPackageLessons(ci: number, pi: number) {
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[ci].packages];
      pkgs[pi] = { ...pkgs[pi], lessons: [] };
      updated[ci] = { ...updated[ci], packages: pkgs };
      return updated;
    });
    this.persistDraft();
  }

  private syncQuickGenSelection() {
    const form = this.quickGenForm();
    const template = this.lessonTemplates().find(t => t.id === form.lesson_plan_template_id);
    if (!template || !template.lesson_items?.length) {
      this.quickGenSelectedItemIds.set([]);
      this.quickGenItemDates.set({});
      this.quickGenItemStatus.set({});
      return;
    }
    const practicalItems = template.lesson_items.filter(i => !i.is_theory);
    const theoryItems = template.lesson_items.filter(i => i.is_theory);
    const { practical, theory } = this.quickGenEffectiveCounts();
    const trainedPractical = form.practicalDays ?? 0;
    const trainedTheory = form.theoryLessons ?? 0;
    const selected: string[] = [];
    const status: Record<string, 'completed' | 'scheduled'> = {};
    practicalItems.slice(0, practical).forEach((i, idx) => {
      selected.push(i.id);
      status[i.id] = idx < trainedPractical ? 'completed' : 'scheduled';
    });
    theoryItems.slice(0, theory).forEach((i, idx) => {
      selected.push(i.id);
      status[i.id] = idx < trainedTheory ? 'completed' : 'scheduled';
    });
    this.quickGenSelectedItemIds.set(selected);
    this.quickGenItemStatus.set(status);
    this.assignQuickGenDates(true);
  }

  openTemplatePicker(clientIndex: number, pkgIndex: number) {
    const pkg = this.clients()[clientIndex]?.packages[pkgIndex];
    this.templatePickerClientIndex.set(clientIndex);
    this.templatePickerPkgIndex.set(pkgIndex);
    this.templatePickerTemplateId.set(pkg?.lesson_plan_template_id || null);
    this.templatePickerTransmission.set(pkg?.transmission_type || 'manual');
    this.templatePickerSelectedIds.set([]);
    this.showTemplatePicker.set(true);
  }

  onTemplatePickerTransmissionChange(transmission: string) {
    this.templatePickerTransmission.set(transmission);
    const id = this.templatePickerTemplateId();
    if (id) {
      const tpl = this.lessonTemplates().find(t => t.id === id);
      if (tpl && tpl.transmission_type && tpl.transmission_type !== 'both' && tpl.transmission_type !== transmission) {
        this.templatePickerTemplateId.set(null);
        this.templatePickerSelectedIds.set([]);
      }
    }
  }

  templatePickerItems(): LessonTemplateItem[] {
    return this.templateItems(this.templatePickerTemplateId());
  }

  isTemplateItemSelected(itemId: string): boolean {
    return this.templatePickerSelectedIds().includes(itemId);
  }

  toggleTemplateItem(itemId: string) {
    this.templatePickerSelectedIds.update(ids =>
      ids.includes(itemId) ? ids.filter(id => id !== itemId) : [...ids, itemId]
    );
  }

  confirmTemplatePicker() {
    this.pickerBusy.set(true);
    const ids = this.templatePickerSelectedIds();
    if (ids.length === 0) {
      this.pickerBusy.set(false);
      return;
    }
    const ci = this.templatePickerClientIndex();
    const pi = this.templatePickerPkgIndex();
    const templateId = this.templatePickerTemplateId();
    const transmission = this.templatePickerTransmission();
    const items = this.templatePickerItems().filter(i => ids.includes(i.id));
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[ci].packages];
      const isNewPlan = !!templateId && templateId !== pkgs[pi].lesson_plan_template_id;
      const lessons = isNewPlan ? [] : [...pkgs[pi].lessons];
      for (const item of items) {
        lessons.push({
          date: null,
          duration_minutes: item.is_theory ? 120 : 30,
          lesson_type: item.is_theory ? 'theory' : 'practical',
          instructor_id: '',
          vehicle_id: '',
          notes: '',
          template_item_id: item.id,
          title: item.title,
          lesson_objectives: item.lesson_objectives || [],
          practical_objectives: item.practical_objectives || [],
          status: 'completed',
        });
      }
      pkgs[pi] = {
        ...pkgs[pi],
        lessons,
        lesson_plan_template_id: templateId || pkgs[pi].lesson_plan_template_id || null,
        transmission_type: transmission || pkgs[pi].transmission_type || 'manual',
      };
      updated[ci] = { ...updated[ci], packages: pkgs };
      return updated;
    });
    this.showTemplatePicker.set(false);
    this.templatePickerSelectedIds.set([]);
    this.validateAllLessons();
    this.persistDraft();
    setTimeout(() => this.pickerBusy.set(false), 400);
  }

  expandLessons(lessons: LessonDraft[]): { date: Date | null; duration: number; chunk: number; total: number }[] {
    const expanded: { date: Date | null; duration: number; chunk: number; total: number }[] = [];
    for (const lesson of lessons) {
      if (!lesson.duration_minutes || lesson.duration_minutes <= 0) continue;
      if (lesson.lesson_type === 'theory') {
        expanded.push({
          date: lesson.date,
          duration: lesson.duration_minutes,
          chunk: 1,
          total: 1,
        });
        continue;
      }
      const chunks = Math.ceil(lesson.duration_minutes / 30);
      for (let i = 0; i < chunks; i++) {
        const remaining = lesson.duration_minutes - i * 30;
        expanded.push({
          date: lesson.date,
          duration: Math.min(30, remaining),
          chunk: i + 1,
          total: chunks,
        });
      }
    }
    return expanded;
  }

  countExpandedLessons(lessons: LessonDraft[]): number {
    let count = 0;
    for (const lesson of lessons) {
      if (!lesson.duration_minutes || lesson.duration_minutes <= 0) continue;
      if (lesson.lesson_type === 'theory') {
        count += 1;
        continue;
      }
      count += Math.ceil(lesson.duration_minutes / 30);
    }
    return count;
  }

  canSubmit(): boolean {
    if (this.clients().length === 0) return false;
    if (!this.branchId()) return false;
    if (this.hasReceiptWarnings() || this.hasPhoneWarnings() || this.hasDateErrors()) return false;
    for (const client of this.clients()) {
      if (!client.phone || !client.first_name) return false;
      for (const pkg of client.packages) {
        if (!pkg.product_id) return false;
        if (pkg.installments.length === 0) return false;
        for (const inst of pkg.installments) {
          if (!inst.receipt_number || !inst.document_date || !inst.amount || !inst.received_by_phone) return false;
        }
        for (const lesson of pkg.lessons) {
          if (!lesson.date || !lesson.duration_minutes || lesson.duration_minutes <= 0) return false;
        }
      }
    }
    return true;
  }

  submit() {
    if (!this.canSubmit()) return;

    this.confirm.confirm({
      message: `Onboard ${this.totalClients()} client(s) with ${this.totalPackages()} package(s), ${this.totalInstallments()} installment(s), and ${this.totalLessons()} lesson(s)?`,
      header: 'Confirm Bulk Onboarding',
      acceptLabel: 'Submit',
      accept: () => {
        this.submitting.set(true);

        const payload: any = {
          clients: this.clients().map(c => ({
        phone: c.phone,
        first_name: c.first_name,
        middle_name: c.middle_name || undefined,
        last_name: c.last_name || undefined,
        location: c.location || undefined,
        branch_id: this.branchId() || c.branch_id || undefined,
        document_date: c.document_date?.toISOString()?.split('T')[0] || undefined,
        converter_id: c.converter_id || undefined,
        primary_recommender_id: c.primary_recommender_id || undefined,
        secondary_recommender_id: c.secondary_recommender_id || undefined,
        packages: c.packages.map(p => ({
              product_id: p.product_id,
              package_id: p.package_id || undefined,
              transmission_type: p.transmission_type || 'manual',
              lesson_plan_template_id: p.lesson_plan_template_id || undefined,
              discount_id: p.discount_id || undefined,
              installments: p.installments.map(i => ({
                receipt_number: i.receipt_number,
                document_date: i.document_date!.toISOString().split('T')[0],
                amount: i.amount!,
                received_by_phone: i.received_by_phone,
              })),
              lessons: p.lessons.filter(l => l.date && l.duration_minutes).map(l => ({
                date: l.date!.toISOString().split('T')[0],
                duration_minutes: l.duration_minutes!,
                lesson_type: l.lesson_type,
                instructor_id: l.instructor_id || undefined,
                vehicle_id: l.vehicle_id || undefined,
                notes: l.notes || undefined,
                template_item_id: l.template_item_id || undefined,
                title: l.title || undefined,
                lesson_objectives: l.lesson_objectives?.length ? l.lesson_objectives : undefined,
                practical_objectives: l.practical_objectives?.length ? l.practical_objectives : undefined,
                status: l.status === 'scheduled' ? 'scheduled' : undefined,
              })),
            })),
          })),
        };

        this.consultationService.bulkOnboard(payload).subscribe({
          next: (res) => {
            localStorage.removeItem(STORAGE_KEY);
            this.submitting.set(false);
            this.successResult.set({ created: res.created, ids: res.consultation_ids });
            this.showSuccessDialog.set(true);
            this.clients.set([]);
            this.draftRestored.set(false);
            this.msg.add({ severity: 'success', summary: `${res.created} client(s) onboarded successfully` });
          },
          error: (err) => {
            this.submitting.set(false);
            this.msg.add({
              severity: 'error',
              summary: 'Onboarding failed',
              detail: err.error?.detail || 'An error occurred. Your draft has been preserved.',
            });
          },
        });
      },
    });
  }

  editOriginal = signal<OnboardedClient | null>(null);
  regenPlans = signal<Record<number, any>>({});

  defaultSavedDates() {
    if (this.savedFromModel()) return;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    this.savedFromModel.set(from);
    this.savedToModel.set(to);
  }

  loadSavedClients() {
    if (!this.branchId()) return;
    this.defaultSavedDates();
    this.savedLoading.set(true);
    this.consultationService
      .listOnboardedClients({
        branch_id: this.branchId(),
        from_date: this.dateStr(this.savedFromModel()) || undefined,
        to_date: this.dateStr(this.savedToModel()) || undefined,
        search: this.savedSearch() || undefined,
        page_size: 50,
      })
      .subscribe({
        next: (res) => {
          this.savedClients.set(res.clients || []);
          this.savedTotal.set(res.total || 0);
          this.savedLoading.set(false);
        },
        error: () => {
          this.savedClients.set([]);
          this.savedTotal.set(0);
          this.savedLoading.set(false);
        },
      });
  }

  onSavedBranchChange() {
    if (this.branchId()) this.loadSavedClients();
  }

  clientDisplayName(c: OnboardedClient): string {
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || c.phone;
  }

  private dateStr(d: Date | null): string | null {
    if (!d) return null;
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString().split('T')[0];
  }

  private isoToDate(iso: string | null): Date | null {
    if (!iso) return null;
    return this.startOfDay(new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')));
  }

  payDocDate(p: OnboardedPayment): Date | null {
    return this.isoToDate(p.document_date);
  }

  onPayDocDateChange(p: OnboardedPayment, d: Date | null) {
    p.docDateObj = d;
    p.document_date = this.dateStr(d);
  }

  lessonDate(l: OnboardedLesson): Date | null {
    return this.isoToDate(l.scheduled_date);
  }

  onLessonDateChange(l: OnboardedLesson, d: Date | null) {
    l.dateObj = d;
    l.scheduled_date = this.dateStr(d);
  }

  private toMoney(v: any): number {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  editDocDate(): Date | null {
    return this.editDocSignal();
  }

  onEditDocDateChange(d: Date | null) {
    this.editDocSignal.set(d);
    const c = this.editingClient();
    if (c) c.document_date = this.dateStr(d);
  }

  openEditClient(c: OnboardedClient) {
    const copy: OnboardedClient = JSON.parse(JSON.stringify(c));
    copy.packages.forEach((pkg) => {
      pkg.payments.forEach((p) => { p.docDateObj = this.isoToDate(p.document_date); });
      if (pkg.plan) {
        pkg.plan.lessons.forEach((l) => { l.dateObj = this.isoToDate(l.scheduled_date); });
      }
    });
    this.editOriginal.set(JSON.parse(JSON.stringify(c)));
    this.editingClient.set(copy);
    this.editDocSignal.set(this.isoToDate(c.document_date || null));
    this.removedPaymentIds.set([]);
    this.regenPlans.set({});
    this.showEditDialog.set(true);
  }

  closeEditDialog() {
    this.showEditDialog.set(false);
    this.editingClient.set(null);
    this.editOriginal.set(null);
    this.editDocSignal.set(null);
  }

  addPayment(pkg: OnboardedPackage) {
    pkg.payments.push({
      id: '',
      document_date: this.dateStr(new Date()),
      receipt_number: '',
      amount: 0,
      balance: 0,
      received_by_phone: this.auth.currentUser(),
    });
  }

  removePayment(pkg: OnboardedPackage, idx: number) {
    const pay = pkg.payments[idx];
    if (!pay) return;
    if (pay.id) {
      this.removedPaymentIds.update((ids) => [...ids, pay.id]);
    }
    pkg.payments.splice(idx, 1);
  }

  isPayRemoved(pay: OnboardedPayment): boolean {
    return pay.id !== '' && this.removedPaymentIds().includes(pay.id);
  }

  openRegen(pkgIdx: number) {
    this.regenPkgIdx.set(pkgIdx);
    const pkg = this.editingClient()?.packages[pkgIdx];
    this.regenForm.set({
      startDate: null,
      transmission: pkg?.plan?.transmission_type || 'manual',
      practicalDays: null,
      theoryLessons: null,
    });
    this.showRegenDialog.set(true);
  }

  confirmRegen() {
    const form = this.regenForm();
    if (!form.startDate || (!form.practicalDays && !form.theoryLessons)) return;
    this.regenBusy.set(true);
    try {
      const lessons = this.buildRegenLessons(form);
      const pkg = this.editingClient()?.packages[this.regenPkgIdx()];
      if (!pkg || !pkg.plan) {
        this.msg.add({ severity: 'error', summary: 'No plan found for this package' });
        return;
      }
      const plan = pkg.plan;
      this.regenPlans.update((r) => ({
        ...r,
        [this.regenPkgIdx()]: {
          plan_id: plan.id,
          template_id: null,
          transmission_type: form.transmission,
          start_date: this.dateStr(form.startDate),
          lessons,
        },
      }));
      this.msg.add({
        severity: 'success',
        summary: `${form.practicalDays || 0} practical + ${form.theoryLessons || 0} theory planned. Save to apply.`,
      });
      this.showRegenDialog.set(false);
    } finally {
      this.regenBusy.set(false);
    }
  }

  private buildRegenLessons(form: { startDate: Date | null; practicalDays: number | null; theoryLessons: number | null }) {
    const lessons: any[] = [];
    if (!form.startDate) return lessons;
    let cursor = this.startOfDay(form.startDate);
    const weekdays: Date[] = [];
    const saturdays: Date[] = [];
    let seen = 0;
    while (weekdays.length < (form.practicalDays || 0) || saturdays.length < (form.theoryLessons || 0)) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6 && weekdays.length < (form.practicalDays || 0)) {
        weekdays.push(new Date(cursor));
      } else if (day === 6 && saturdays.length < (form.theoryLessons || 0)) {
        saturdays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      if (++seen > 2000) break;
    }
    let order = 0;
    for (const d of weekdays) {
      order += 1;
      lessons.push({
        day_number: order,
        week_number: Math.ceil(order / 5),
        order,
        title: `Practical Session ${order}`,
        lesson_objectives: [],
        practical_objectives: [],
        is_active: true,
        is_theory: false,
        is_locked: false,
        enforce_prerequisites: true,
        scheduled_date: this.dateStr(d),
        duration_minutes: 30,
        instructor_id: null,
        vehicle_id: null,
        template_item_id: null,
        status: 'pending',
      });
    }
    for (const d of saturdays) {
      order += 1;
      lessons.push({
        day_number: order,
        week_number: Math.ceil(order / 5),
        order,
        title: `Theory Session ${order}`,
        lesson_objectives: [],
        practical_objectives: [],
        is_active: true,
        is_theory: true,
        is_locked: false,
        enforce_prerequisites: true,
        scheduled_date: this.dateStr(d),
        duration_minutes: 120,
        instructor_id: null,
        vehicle_id: null,
        template_item_id: null,
        status: 'pending',
      });
    }
    return lessons;
  }

  private lessonChanged(origL: OnboardedLesson | undefined, l: OnboardedLesson): boolean {
    if (!origL) return true;
    return (
      (l.scheduled_date || null) !== (origL.scheduled_date || null) ||
      this.toMoney(l.duration_minutes) !== this.toMoney(origL.duration_minutes) ||
      (l.status || null) !== (origL.status || null) ||
      (l.notes || null) !== (origL.notes || null)
    );
  }

  saveCorrections() {
    const c = this.editingClient();
    if (!c) return;
    const orig = this.editOriginal();

    const payments: any[] = [];
    const removePaymentIds: string[] = [];
    for (const pkg of c.packages) {
      for (const pay of pkg.payments) {
        const origPay = orig?.packages
          .flatMap((p) => p.payments)
          .find((x) => x.id === pay.id);
        if (pay.id) {
          if (this.removedPaymentIds().includes(pay.id)) continue;
          const changed =
            !origPay ||
            (pay.document_date || null) !== (origPay.document_date || null) ||
            this.toMoney(pay.amount) !== this.toMoney(origPay.amount) ||
            (pay.receipt_number || null) !== (origPay.receipt_number || null) ||
            (pay.received_by_phone || null) !== (origPay.received_by_phone || null);
          if (changed) {
            payments.push({
              id: pay.id,
              document_date: pay.document_date || undefined,
              amount: this.toMoney(pay.amount),
              receipt_number: pay.receipt_number || undefined,
              received_by_phone: pay.received_by_phone || undefined,
            });
          }
        } else {
          payments.push({
            product_id: pkg.product_id,
            package_id: pkg.package_id || undefined,
            document_date: pay.document_date || undefined,
            amount: this.toMoney(pay.amount),
            receipt_number: pay.receipt_number || undefined,
            received_by_phone: pay.received_by_phone || undefined,
          });
        }
      }
    }
    removePaymentIds.push(...this.removedPaymentIds());

    const plans: any[] = [];
    c.packages.forEach((pkg, pkgIdx) => {
      const origPkg = orig?.packages[pkgIdx];
      if (!pkg.plan) return;
      const lessonEdits: any[] = [];
      for (const l of pkg.plan.lessons) {
        const origL = origPkg?.plan?.lessons.find((x) => x.id === l.id);
        if (this.lessonChanged(origL, l)) {
          lessonEdits.push({
            id: l.id,
            scheduled_date: l.scheduled_date || undefined,
            status: l.status || undefined,
            duration_minutes: l.duration_minutes || undefined,
          });
        }
      }
      if (lessonEdits.length > 0) {
        plans.push({ plan_id: pkg.plan.id, lessons: lessonEdits });
      }
    });

    const payload: any = { payments, remove_payment_ids: removePaymentIds };
    if (c.document_date) payload.document_date = this.dateStr(this.isoToDate(c.document_date));
    if (plans.length > 0) payload.plans = plans;
    const regenEntries = Object.values(this.regenPlans());
    if (regenEntries.length > 0) payload.regenerate_plans = regenEntries;

    if (
      !payload.document_date &&
      payments.length === 0 &&
      removePaymentIds.length === 0 &&
      !payload.plans &&
      !payload.regenerate_plans
    ) {
      this.msg.add({ severity: 'info', summary: 'No changes to save' });
      return;
    }

    this.editBusy.set(true);
    this.consultationService.correctOnboardedClient(c.id, payload).subscribe({
      next: (res: any) => {
        this.editBusy.set(false);
        this.msg.add({ severity: 'success', summary: 'Corrections saved' });
        this.closeEditDialog();
        this.loadSavedClients();
      },
      error: (err) => {
        this.editBusy.set(false);
        this.msg.add({
          severity: 'error',
          summary: 'Failed to save corrections',
          detail: err.error?.detail || 'An error occurred',
        });
      },
    });
  }

  goToConsultations() {
    this.showSuccessDialog.set(false);
    this.router.navigate(['/consultations']);
  }

  goToFirstConsultation() {
    this.showSuccessDialog.set(false);
    const ids = this.successResult()?.ids;
    if (ids && ids.length > 0) {
      this.router.navigate(['/consultations', ids[0]]);
    } else {
      this.router.navigate(['/consultations']);
    }
  }
}

import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { StepsModule } from 'primeng/steps';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogService, Product, Branch, LessonPlanTemplate } from '../../core/services/catalog.service';
import { ConsultationService, BulkOnboardingRequest } from '../../core/services/consultation.service';
import { DiscountService, Discount } from '../../core/services/discount.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { firstValueFrom } from 'rxjs';

interface InstallmentDraft {
  receipt_number: string;
  document_date: Date | null;
  amount: number | null;
  received_by_phone: string;
}

interface LessonDraft {
  date: Date | null;
  duration_minutes: number | null;
  lesson_type: string;
  instructor_id: string;
  vehicle_id: string;
  notes: string;
  status: 'completed' | 'scheduled';
}

interface PackageDraft {
  product_id: string;
  package_id: string;
  transmission_type: string;
  lesson_plan_template_id: string;
  discount_id: string;
  installments: InstallmentDraft[];
  lessons: LessonDraft[];
}

interface ClientDraft {
  phone: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  location: string;
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

const STORAGE_KEY = 'mobile_bulk_onboarding_draft';

@Component({
  selector: 'app-bulk-onboarding',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    StepsModule,
    DialogModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './bulk-onboarding.html',
})
export class BulkOnboarding implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  private catalog = inject(CatalogService);
  private consultationService = inject(ConsultationService);
  private discountService = inject(DiscountService);
  private msg = inject(MessageService);

  clients = signal<ClientDraft[]>([]);
  products = signal<Product[]>([]);
  templates = signal<LessonPlanTemplate[]>([]);
  vehicles = signal<{ id: string; name: string; plate_number: string; transmission: string }[]>([]);
  instructors = signal<{ phone: string; name: string }[]>([]);
  users = signal<{ phone: string; name: string }[]>([]);
  branches = signal<Branch[]>([]);
  branchId = signal('');
  submitting = signal(false);
  showSuccess = signal(false);
  successCreated = signal(0);

  // Wizard state (single client being added/edited)
  wizardOpen = signal(false);
  wizardStep = signal(0);
  editIndex = signal(-1);
  wizardClient = signal<ClientDraft | null>(null);
  wizardPhoneWarning = signal('');
  receiptWarnings = signal<Record<string, string>>({});
  collapsedLessons = signal<Set<number>>(new Set());

  // Quick Generate lessons
  quickGenOpen = signal(false);
  quickGenPkgIndex = signal(0);
  quickGenStartDate = signal<Date | null>(new Date());
  quickGenEndDate = signal<Date | null>(null);
  quickGenPlannedPractical = signal<number>(0);
  quickGenPlannedTheory = signal<number>(0);
  quickGenPracticalCovered = signal<number>(0);
  quickGenTheoryCovered = signal<number>(0);
  quickGenInstructorId = signal('');
  quickGenVehicleId = signal('');
  quickGenTemplateId = signal('');
  quickGenPreview = signal<LessonDraft[]>([]);
  quickGenBusy = signal(false);
  validatingStep = signal(false);

  savedClients = signal<OnboardedClient[]>([]);
  savedTotal = signal(0);
  savedLoading = signal(false);
  savedFromModel = signal<Date | null>(null);
  savedToModel = signal<Date | null>(null);
  savedSearch = signal('');
  showEditDialog = signal(false);
  editDocSignal = signal<Date | null>(null);
  editingClient = signal<OnboardedClient | null>(null);
  editOriginal = signal<OnboardedClient | null>(null);
  editBusy = signal(false);
  removedPaymentIds = signal<string[]>([]);
  regenPlans = signal<Record<number, any>>({});
  showRegenDialog = signal(false);
  regenPkgIdx = signal(0);
  regenBusy = signal(false);
  regenForm = signal({
    startDate: null as Date | null,
    transmission: 'manual',
    practicalDays: null as number | null,
    theoryLessons: null as number | null,
  });

  private productById = computed(() => {
    const map = new Map<string, Product>();
    for (const p of this.products()) map.set(p.id, p);
    return map;
  });

  productOptions = computed(() =>
    this.products().map((p) => ({ label: p.name, value: p.id })),
  );

  packageMap = computed(() => {
    this.productById();
    const map = new Map<string, { label: string; value: string }[]>();
    for (const p of this.products()) {
      if (p.packages?.length) {
        map.set(
          p.id,
          p.packages.map((pkg) => ({
            label: `${pkg.name} — ${pkg.price}`,
            value: pkg.id,
          })),
        );
      }
    }
    return map;
  });

  instructorOptions = computed(() =>
    this.instructors().map((u) => ({ label: u.name || u.phone, value: u.phone })),
  );

  userOptions = computed(() => {
    const phone = this.auth.currentUserPhone();
    const name = this.auth.currentUserName();
    const options = this.users().map((u) => ({ label: u.name || u.phone, value: u.phone }));
    if (phone && !options.some((o) => o.value === phone)) {
      options.unshift({ label: name || phone, value: phone });
    }
    return options;
  });

  branchOptions = computed(() =>
    this.branches().map((b) => ({ label: b.name, value: b.id })),
  );

  discountsForProduct = signal<Map<string, Discount[]>>(new Map());

  discountOptionsFor(pkg: PackageDraft): { label: string; value: string }[] {
    const result: { label: string; value: string }[] = [{ label: 'No discount', value: '' }];
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    for (const d of this.discountsForProduct().get(key) || []) {
      const amount =
        d.discount_type === 'fixed'
          ? `${d.discount_value.toLocaleString()} UGX`
          : `${d.discount_value}%`;
      result.push({ label: `${d.name} (${d.code}) — ${amount}`, value: d.id });
    }
    return result;
  }

  private discountKey(productId: string, packageId: string): string {
    return `${productId}::${packageId || ''}`;
  }

  quickGenTransmission(): string {
    return this.wizardClient()?.packages[this.quickGenPkgIndex()]?.transmission_type || 'manual';
  }

  documentDateMin = computed(() => this.wizardClient()?.document_date || new Date());

  quickGenRemainingPractical = computed(() =>
    Math.max(0, (this.quickGenPlannedPractical() || 0) - (this.quickGenPracticalCovered() || 0)),
  );

  quickGenRemainingTheory = computed(() =>
    Math.max(0, (this.quickGenPlannedTheory() || 0) - (this.quickGenTheoryCovered() || 0)),
  );

  loadDiscountsForPackage(pkg: PackageDraft) {
    if (!pkg.product_id) return;
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    this.discountService
      .getApplicableDiscountsForProduct(pkg.product_id, pkg.package_id || null)
      .subscribe({
        next: (discounts) => {
          const map = new Map(this.discountsForProduct());
          map.set(key, discounts);
          this.discountsForProduct.set(map);
        },
      });
  }

  discountApplied(pkg: PackageDraft, packagePrice: number): number {
    if (!pkg.discount_id) return 0;
    const key = this.discountKey(pkg.product_id, pkg.package_id);
    const d = (this.discountsForProduct().get(key) || []).find((x) => x.id === pkg.discount_id);
    if (!d) return 0;
    if (d.discount_type === 'fixed') return Math.min(d.discount_value, packagePrice);
    return Math.round((packagePrice * d.discount_value) / 100);
  }

  packagePriceFor(productId: string, packageId: string): number {
    const p = this.productById().get(productId);
    const pkg = p?.packages?.find((x) => x.id === packageId);
    return pkg ? Number(pkg.price) || 0 : 0;
  }

  packageEffectivePrice(pkg: PackageDraft): number {
    const price = this.packagePriceFor(pkg.product_id, pkg.package_id);
    return Math.max(0, price - this.discountApplied(pkg, price));
  }

  packagePaid(pkg: PackageDraft): number {
    return pkg.installments.reduce((s, i) => s + (i.amount || 0), 0);
  }

  packageBalance(pkg: PackageDraft): number {
    return Math.max(0, this.packageEffectivePrice(pkg) - this.packagePaid(pkg));
  }

  vehicleOptionsFor(transmission: string) {
    return this.vehicles()
      .filter((v) => transmission === 'both' || v.transmission === transmission)
      .map((v) => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
  }

  templateOptions() {
    const trans = this.quickGenTransmission();
    return this.templates()
      .filter((t) => trans === 'both' || !t.transmission_type || t.transmission_type === 'both' || t.transmission_type === trans)
      .map((t) => ({ label: t.name, value: t.id }));
  }

  onQuickGenTransmissionChange(transmission: string) {
    const tplId = this.quickGenTemplateId();
    if (tplId) {
      const tpl = this.templates().find((t) => t.id === tplId);
      if (tpl && tpl.transmission_type && tpl.transmission_type !== 'both' && tpl.transmission_type !== transmission) {
        this.quickGenTemplateId.set('');
      }
    }
  }

  wizardItems = computed(() => {
    const infoIncomplete = !this.infoValid();
    const phoneDuplicate = this.wizardPhoneWarning().length > 0;
    const info = infoIncomplete || phoneDuplicate;
    const pay = !this.paymentsValid();
    const lessons = this.hasStepError(2);
    return [
      { label: 'Info', icon: info ? 'pi pi-exclamation-circle' : 'pi pi-user', danger: info },
      { label: 'Payments', icon: pay ? 'pi pi-exclamation-circle' : 'pi pi-wallet', danger: pay },
      { label: 'Lessons', icon: lessons ? 'pi pi-exclamation-circle' : 'pi pi-book', danger: lessons },
      { label: 'Preview', icon: 'pi pi-eye', danger: false },
    ];
  });

  totalClients = computed(() => this.clients().length);
  totalPackages = computed(() =>
    this.clients().reduce((s, c) => s + c.packages.length, 0),
  );
  totalInstallments = computed(() =>
    this.clients().reduce(
      (s, c) => s + c.packages.reduce((x, p) => x + p.installments.length, 0),
      0,
    ),
  );
  totalLessons = computed(() =>
    this.clients().reduce(
      (s, c) => s + c.packages.reduce((x, p) => x + this.countExpandedLessons(p.lessons), 0),
      0,
    ),
  );

  ngOnInit() {
    this.loadData();
    this.restoreDraft();
  }

  private currentPhone(): string {
    return this.auth.currentUserPhone() || '';
  }

  async loadData() {
    try {
      const res = await this.catalog.listProducts({ status: 'active', page_size: 100 }).toPromise();
      if (res?.products) this.products.set(res.products);
    } catch {
      /* ignore */
    }
    try {
      const res = await this.catalog.listVehicles().toPromise();
      if (res) this.vehicles.set(res);
    } catch {
      /* ignore */
    }
    try {
      const res = await this.catalog.listTemplates().toPromise();
      if (res) this.templates.set(res);
    } catch {
      /* ignore */
    }
    try {
      const res = await this.catalog.listInstructors().toPromise();
      if (res?.users) this.instructors.set(res.users);
    } catch {
      /* ignore */
    }
    try {
      const res = await this.catalog.listUsers({ page_size: 100 }).toPromise();
      if (res?.users) this.users.set(res.users);
      else if (this.instructors().length) this.users.set(this.instructors());
    } catch {
      /* ignore */
    }
    try {
      const branches = await this.catalog.listMyBranches().toPromise();
      if (branches && branches.length) {
        this.branches.set(branches);
        if (branches.length === 1) this.branchId.set(branches[0].id);
      }
    } catch {
      /* ignore */
    }
  }

  restoreDraft() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      this.clients.set((draft.clients || []).map((c: any) => this.deserializeClient(c)));
      if (draft.branch_id) this.branchId.set(draft.branch_id);
      if (draft.wizard && draft.wizard.client) {
        this.wizardClient.set(this.deserializeClient(draft.wizard.client));
        this.wizardStep.set(draft.wizard.step ?? 0);
        this.editIndex.set(draft.wizard.editIndex ?? -1);
        this.wizardOpen.set(true);
      }
      this.msg.add({ severity: 'info', summary: 'Draft restored from local storage' });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private deserializeClient(c: any): ClientDraft {
    return {
      phone: c.phone || '',
      first_name: c.first_name || '',
      middle_name: c.middle_name || '',
      last_name: c.last_name || '',
      location: c.location || '',
      document_date: c.document_date ? new Date(c.document_date + 'T00:00:00') : null,
      converter_id: c.converter_id || this.currentPhone(),
      primary_recommender_id: c.primary_recommender_id || this.currentPhone(),
      secondary_recommender_id: c.secondary_recommender_id || this.currentPhone(),
      packages: (c.packages || []).map((p: any) => ({
        product_id: p.product_id || '',
        package_id: p.package_id || '',
        transmission_type: p.transmission_type || 'manual',
        lesson_plan_template_id: p.lesson_plan_template_id || '',
        discount_id: p.discount_id || '',
        installments: (p.installments || []).map((i: any) => ({
          receipt_number: i.receipt_number || '',
          document_date: i.document_date ? new Date(i.document_date + 'T00:00:00') : null,
          amount: i.amount ?? null,
          received_by_phone: i.received_by_phone || '',
        })),
        lessons: (p.lessons || []).map((l: any) => ({
          date: l.date ? new Date(l.date + 'T00:00:00') : null,
          duration_minutes: l.duration_minutes ?? null,
          lesson_type: l.lesson_type || 'practical',
          instructor_id: l.instructor_id || '',
          vehicle_id: l.vehicle_id || '',
          notes: l.notes || '',
          status: l.status === 'scheduled' ? 'scheduled' : 'completed',
        })),
      })),
    };
  }

  private persistDraft() {
    const wc = this.wizardClient();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        saved_at: new Date().toISOString(),
        branch_id: this.branchId(),
        clients: this.clients().map((c) => this.serializeClient(c)),
        wizard: this.wizardOpen() && wc
          ? {
              client: this.serializeClient(wc),
              step: this.wizardStep(),
              editIndex: this.editIndex(),
            }
          : null,
      }),
    );
  }

  private serializeClient(c: ClientDraft): any {
    return {
      phone: c.phone,
      first_name: c.first_name,
      middle_name: c.middle_name,
      last_name: c.last_name,
      location: c.location,
      document_date: c.document_date ? this.fmt(c.document_date) : null,
      converter_id: c.converter_id,
      primary_recommender_id: c.primary_recommender_id,
      secondary_recommender_id: c.secondary_recommender_id,
      packages: c.packages.map((p) => ({
        product_id: p.product_id,
        package_id: p.package_id,
        transmission_type: p.transmission_type,
        lesson_plan_template_id: p.lesson_plan_template_id,
        discount_id: p.discount_id,
        installments: p.installments.map((i) => ({
          receipt_number: i.receipt_number,
          document_date: i.document_date ? this.fmt(i.document_date) : null,
          amount: i.amount,
          received_by_phone: i.received_by_phone,
        })),
        lessons: p.lessons.map((l) => ({
          date: l.date ? this.fmt(l.date) : null,
          duration_minutes: l.duration_minutes,
          lesson_type: l.lesson_type,
          instructor_id: l.instructor_id,
          vehicle_id: l.vehicle_id,
          notes: l.notes,
          status: l.status,
        })),
      })),
    };
  }

  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  saveDraft() {
    this.persistDraft();
    this.msg.add({ severity: 'success', summary: 'Draft saved' });
  }

  clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
    this.clients.set([]);
    this.msg.add({ severity: 'info', summary: 'Draft cleared' });
  }

  // ── Wizard open / close ──
  private newBlankClient(): ClientDraft {
    const phone = this.currentPhone();
    return {
      phone: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      location: '',
      document_date: new Date(),
      converter_id: phone,
      primary_recommender_id: phone,
      secondary_recommender_id: phone,
      packages: [],
    };
  }

  addClient() {
    this.wizardClient.set(this.newBlankClient());
    this.editIndex.set(-1);
    this.wizardStep.set(0);
    this.wizardPhoneWarning.set('');
    this.wizardOpen.set(true);
  }

  editClient(index: number) {
    const c = this.clients()[index];
    if (!c) return;
    this.wizardClient.set(JSON.parse(JSON.stringify(c)));
    this.editIndex.set(index);
    this.wizardStep.set(0);
    this.wizardPhoneWarning.set('');
    this.wizardOpen.set(true);
  }

  removeClient(index: number) {
    this.clients.update((clients) => clients.filter((_, i) => i !== index));
  }

  cancelWizard() {
    this.wizardOpen.set(false);
    this.wizardClient.set(null);
    this.wizardPhoneWarning.set('');
  }

  // ── Wizard validation ──
  infoValid(): boolean {
    const c = this.wizardClient();
    return !!c && !!c.first_name && this.phoneValid();
  }

  paymentsValid(): boolean {
    const c = this.wizardClient();
    if (!c || c.packages.length === 0) return false;
    const receiptsOk = Object.keys(this.receiptWarnings()).length === 0;
    return (
      c.packages.every(
        (p) =>
          !!p.product_id &&
          p.installments.length > 0 &&
          p.installments.every(
            (i) => !!i.receipt_number && !!i.document_date && !!i.amount && !!i.received_by_phone,
          ),
      ) && receiptsOk
    );
  }

  packageTrainingInfo(productId: string, packageId: string): { days: number | null; hours: number | null } {
    const p = this.productById().get(productId);
    const pkg = p?.packages?.find((pkg) => pkg.id === packageId);
    return {
      days: pkg?.driving_training_duration_days ?? null,
      hours: pkg?.theory_training_hours ?? null,
    };
  }

  packageNeedsLessons(pkg: PackageDraft): boolean {
    const info = this.packageTrainingInfo(pkg.product_id, pkg.package_id);
    return (info.days ?? 0) > 0 || (info.hours ?? 0) > 0;
  }

  lessonsValid(): boolean {
    const c = this.wizardClient();
    if (!c || c.packages.length === 0) return false;
    const needsLessons = c.packages.some((p) => this.packageNeedsLessons(p));
    if (!needsLessons) return true;
    return c.packages.some(
      (p) =>
        this.packageNeedsLessons(p) &&
        p.lessons.length > 0 &&
        p.lessons.every((l) => !!l.date && !!l.duration_minutes && l.duration_minutes > 0),
    );
  }

  stepValid(step: number): boolean {
    if (step === 0) return this.infoValid();
    if (step === 1) return this.paymentsValid();
    if (step === 2) return this.lessonsValid();
    return this.infoValid() && this.paymentsValid() && this.lessonsValid();
  }

  phoneValid(): boolean {
    const c = this.wizardClient();
    return !!c?.phone && c.phone.trim().length > 0;
  }

  stepErrors(step: number): string[] {
    const errs: string[] = [];
    const c = this.wizardClient();
    if (step === 0) {
      if (!c) return errs;
      if (c.first_name && !this.phoneValid()) errs.push('Enter a valid phone number');
    } else if (step === 1) {
      if (!c || c.packages.length === 0) {
        errs.push('Add at least one package');
      } else {
        c.packages.forEach((p) => {
          if (!p.product_id) errs.push('Select a product for each package');
          if (p.installments.length === 0) errs.push('Add at least one payment per package');
          p.installments.forEach((i) => {
            if (!i.receipt_number) errs.push('Receipt number is required per payment');
            if (!i.document_date) errs.push('Payment date is required');
            if (!i.amount || i.amount <= 0) errs.push('Payment amount is required');
            if (!i.received_by_phone) errs.push('Received-by user is required');
          });
        });
      }
    } else if (step === 2) {
      if (!c) return errs;
      c.packages.forEach((p) => {
        if (!this.packageNeedsLessons(p)) return;
        p.lessons.forEach((l) => {
          if (!l.date) errs.push('Lesson date is required');
          if (!l.duration_minutes || l.duration_minutes <= 0) errs.push('Lesson duration is required');
        });
      });
    }
    return errs;
  }

  hasStepError(step: number): boolean {
    return this.stepErrors(step).length > 0;
  }

  async nextStep() {
    if (!this.stepValid(this.wizardStep())) {
      const errs = this.stepErrors(this.wizardStep());
      if (errs.length) {
        this.msg.add({ severity: 'warn', summary: 'Fix the issues on this step first' });
      } else {
        this.msg.add({ severity: 'warn', summary: 'Complete this step first' });
      }
      return;
    }
    const step = this.wizardStep();
    if (step === 0) {
      const ok = await this.validatePhoneAsync();
      if (!ok) return;
    } else if (step === 1) {
      const ok = await this.validateReceiptsAsync();
      if (!ok) return;
    }
    this.wizardStep.set(Math.min(3, step + 1));
    this.persistDraft();
  }

  prevStep() {
    this.wizardStep.update((s) => Math.max(0, s - 1));
    this.persistDraft();
  }

  async goStep(step: number) {
    if (step < this.wizardStep()) {
      this.wizardStep.set(step);
      this.persistDraft();
      return;
    }
    if (step === this.wizardStep()) return;
    for (let s = this.wizardStep(); s < step; s++) {
      if (!this.stepValid(s)) {
        this.msg.add({ severity: 'warn', summary: 'Complete previous steps first' });
        return;
      }
      if (s === 0) {
        const ok = await this.validatePhoneAsync();
        if (!ok) return;
      } else if (s === 1) {
        const ok = await this.validateReceiptsAsync();
        if (!ok) return;
      }
    }
    this.wizardStep.set(step);
    this.persistDraft();
  }

  private async validatePhoneAsync(): Promise<boolean> {
    const c = this.wizardClient();
    if (!c || !c.phone) return true;
    this.validatingStep.set(true);
    try {
      const results = await firstValueFrom(this.consultationService.clientSearch(c.phone));
      const match = results?.find((r) => r.phone === c.phone);
      if (match) {
        this.wizardPhoneWarning.set(
          `Client exists: ${match.first_name} ${match.last_name || ''} (${match.latest_status})`,
        );
        this.msg.add({
          severity: 'warn',
          summary: `Phone belongs to existing client — check before proceeding`,
        });
        return false;
      }
      this.wizardPhoneWarning.set('');
      return true;
    } catch {
      return true;
    } finally {
      this.validatingStep.set(false);
    }
  }

  private async validateReceiptsAsync(): Promise<boolean> {
    const c = this.wizardClient();
    if (!c) return true;
    const receipts: string[] = [];
    c.packages.forEach((p) =>
      p.installments.forEach((i) => {
        if (i.receipt_number) receipts.push(i.receipt_number);
      }),
    );
    if (receipts.length === 0) return true;

    // Repeat receipt numbers within the same submission are not allowed
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of receipts) {
      if (seen.has(r)) duplicates.add(r);
      seen.add(r);
    }
    if (duplicates.size > 0) {
      this.msg.add({
        severity: 'warn',
        summary: `Receipt repeated in this submission: ${[...duplicates].join(', ')}`,
      });
      return false;
    }

    this.validatingStep.set(true);
    try {
      const res = await firstValueFrom(this.consultationService.checkBulkReceipts(receipts));
      if (res.existing && res.existing.length > 0) {
        this.msg.add({
          severity: 'warn',
          summary: `Receipt(s) already exist: ${res.existing.join(', ')}`,
        });
        return false;
      }
      return true;
    } catch {
      return true;
    } finally {
      this.validatingStep.set(false);
    }
  }

  saveClientFromWizard() {
    const c = this.wizardClient();
    if (!c) return;
    if (!this.infoValid()) {
      this.msg.add({ severity: 'warn', summary: 'Complete client info first' });
      return;
    }
    if (!this.paymentsValid()) {
      this.msg.add({ severity: 'warn', summary: 'Add at least one payment before saving' });
      return;
    }
    const idx = this.editIndex();
    if (idx >= 0) {
      this.clients.update((clients) => {
        const updated = [...clients];
        updated[idx] = c;
        return updated;
      });
      this.msg.add({ severity: 'success', summary: 'Client updated' });
    } else {
      this.clients.update((clients) => [...clients, c]);
      this.msg.add({ severity: 'success', summary: 'Client added to onboarding list' });
    }
    this.wizardOpen.set(false);
    this.wizardClient.set(null);
    this.wizardPhoneWarning.set('');
    this.persistDraft();
  }

  // ── Wizard field helpers ──
  updateWizard(patch: Partial<ClientDraft>) {
    this.wizardClient.update((c) => (c ? { ...c, ...patch } : c));
    if (this.wizardOpen()) this.persistDraft();
  }

  checkPhone(phone: string) {
    this.wizardPhoneWarning.set('');
    if (!phone || phone.length < 5) return;
    this.consultationService.clientSearch(phone).subscribe({
      next: (results) => {
        const match = results.find((r) => r.phone === phone);
        if (match) {
          this.wizardPhoneWarning.set(
            `Client exists: ${match.first_name} ${match.last_name || ''} (${match.latest_status})`,
          );
        }
      },
    });
  }

  checkReceipt(pkgIndex: number, instIndex: number, receiptNumber: string) {
    const key = `${pkgIndex}-${instIndex}`;
    this.receiptWarnings.update((w) => {
      const n = { ...w };
      delete n[key];
      return n;
    });
    if (!receiptNumber || receiptNumber.length < 2) return;
    const c = this.wizardClient();
    const duplicate = c?.packages.some((p, pi) =>
      p.installments.some((i, ii) => {
        if (pi === pkgIndex && ii === instIndex) return false;
        return i.receipt_number === receiptNumber;
      }),
    );
    if (duplicate) {
      this.receiptWarnings.update((w) => ({
        ...w,
        [key]: `Receipt "${receiptNumber}" repeated in this submission`,
      }));
      return;
    }
    this.consultationService.checkBulkReceipts([receiptNumber]).subscribe({
      next: (res) => {
        if (res.existing && res.existing.includes(receiptNumber)) {
          this.receiptWarnings.update((w) => ({
            ...w,
            [key]: `Receipt "${receiptNumber}" already exists`,
          }));
        }
      },
    });
  }

  addPackage() {
    const c = this.wizardClient();
    if (!c) return;
    this.updateWizard({
      packages: [
        ...c.packages,
        { product_id: '', package_id: '', transmission_type: 'manual', lesson_plan_template_id: '', discount_id: '', installments: [], lessons: [] },
      ],
    });
  }

  removePackage(pkgIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs.splice(pkgIndex, 1);
    this.updateWizard({ packages: pkgs });
  }

  onPackageProductChange(pkgIndex: number, productId: string) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], product_id: productId, package_id: '', discount_id: '' };
    this.updateWizard({ packages: pkgs });
    this.loadDiscountsForPackage(pkgs[pkgIndex]);
  }

  onPackageUpdate(pkgIndex: number, patch: Partial<PackageDraft>) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    const prev = pkgs[pkgIndex];
    pkgs[pkgIndex] = { ...prev, ...patch };
    if ('package_id' in patch && patch.package_id !== prev.package_id) {
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], discount_id: '' };
    }
    if ('transmission_type' in patch && patch.transmission_type !== prev.transmission_type && pkgs[pkgIndex].lesson_plan_template_id) {
      const tpl = this.templates().find((t) => t.id === pkgs[pkgIndex].lesson_plan_template_id);
      if (tpl && tpl.transmission_type && tpl.transmission_type !== 'both' && tpl.transmission_type !== patch.transmission_type) {
        pkgs[pkgIndex] = { ...pkgs[pkgIndex], lesson_plan_template_id: '' };
      }
    }
    this.updateWizard({ packages: pkgs });
    if ('package_id' in patch) {
      this.loadDiscountsForPackage(pkgs[pkgIndex]);
    }
  }

  addInstallment(pkgIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs[pkgIndex] = {
      ...pkgs[pkgIndex],
      installments: [
        ...pkgs[pkgIndex].installments,
        { receipt_number: '', document_date: new Date(), amount: null, received_by_phone: this.currentPhone() },
      ],
    };
    this.updateWizard({ packages: pkgs });
  }

  removeInstallment(pkgIndex: number, instIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    const insts = [...pkgs[pkgIndex].installments];
    insts.splice(instIndex, 1);
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], installments: insts };
    this.updateWizard({ packages: pkgs });
  }

  onInstallmentUpdate(pkgIndex: number, instIndex: number, patch: Partial<InstallmentDraft>) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    const insts = [...pkgs[pkgIndex].installments];
    insts[instIndex] = { ...insts[instIndex], ...patch };
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], installments: insts };
    this.updateWizard({ packages: pkgs });
  }

  addLesson(pkgIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs[pkgIndex] = {
      ...pkgs[pkgIndex],
      lessons: [
        ...pkgs[pkgIndex].lessons,
        { date: new Date(), duration_minutes: 30, lesson_type: 'practical', instructor_id: '', vehicle_id: '', notes: '', status: 'completed' },
      ],
    };
    this.updateWizard({ packages: pkgs });
  }

  removeLesson(pkgIndex: number, lessonIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    const lessons = [...pkgs[pkgIndex].lessons];
    lessons.splice(lessonIndex, 1);
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
    this.updateWizard({ packages: pkgs });
  }

  clearLessons(pkgIndex: number) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons: [] };
    this.updateWizard({ packages: pkgs });
  }

  lessonsCollapsed(pkgIndex: number): boolean {
    return this.collapsedLessons().has(pkgIndex);
  }

  toggleLessons(pkgIndex: number) {
    this.collapsedLessons.update((s) => {
      const n = new Set(s);
      if (n.has(pkgIndex)) n.delete(pkgIndex);
      else n.add(pkgIndex);
      return n;
    });
  }

  onLessonTypeChange(pkgIndex: number, lessonIndex: number, type: string) {
    const c = this.wizardClient();
    if (!c) return;
    const defaultDuration = type === 'theory' ? 120 : 30;
    const pkgs = [...c.packages];
    const lessons = [...pkgs[pkgIndex].lessons];
    lessons[lessonIndex] = { ...lessons[lessonIndex], lesson_type: type, duration_minutes: defaultDuration };
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
    this.updateWizard({ packages: pkgs });
  }

  onLessonUpdate(pkgIndex: number, lessonIndex: number, patch: Partial<LessonDraft>) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    const lessons = [...pkgs[pkgIndex].lessons];
    lessons[lessonIndex] = { ...lessons[lessonIndex], ...patch };
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
    this.updateWizard({ packages: pkgs });
  }

  // ── Quick Generate lessons ──
  quickGenPackageConfig() {
    const c = this.wizardClient();
    const pkg = c?.packages[this.quickGenPkgIndex()];
    const config = this.productById()
      .get(pkg?.product_id || '')
      ?.packages?.find((x) => x.id === pkg?.package_id);
    return {
      practicalDays: config?.driving_training_duration_days ?? null,
      theoryLessons: config?.theory_training_hours
        ? Math.ceil(Number(config.theory_training_hours) / 2)
        : null,
    };
  }

  openQuickGen(pkgIndex: number) {
    this.quickGenPkgIndex.set(pkgIndex);
    const start = this.documentDateMin();
    this.quickGenStartDate.set(start);
    this.quickGenEndDate.set(new Date(start));
    const config = this.quickGenPackageConfig();
    const pkg = this.wizardClient()?.packages[pkgIndex];
    this.quickGenPlannedPractical.set(config.practicalDays ?? 0);
    this.quickGenPlannedTheory.set(config.theoryLessons ?? 0);
    this.quickGenPracticalCovered.set(0);
    this.quickGenTheoryCovered.set(0);
    this.quickGenInstructorId.set('');
    this.quickGenVehicleId.set('');
    this.quickGenTemplateId.set(pkg?.lesson_plan_template_id || '');
    this.quickGenPreview.set([]);
    this.quickGenOpen.set(true);
  }

  closeQuickGen() {
    this.quickGenOpen.set(false);
    this.quickGenPreview.set([]);
  }

  quickGenGenerate() {
    const remainingPrac = this.quickGenRemainingPractical();
    const remainingTheory = this.quickGenRemainingTheory();
    const coveredPrac = this.quickGenPracticalCovered() || 0;
    const coveredTheory = this.quickGenTheoryCovered() || 0;
    const instructorId = this.quickGenInstructorId();
    const vehicleId = this.quickGenVehicleId();
    const start = this.quickGenStartDate();
    const end = this.quickGenEndDate();
    if (!start) return;
    if (coveredPrac + remainingPrac + coveredTheory + remainingTheory === 0) {
      this.quickGenPreview.set([]);
      return;
    }
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = end ? new Date(end) : new Date(startDate);
    endDate.setHours(0, 0, 0, 0);
    if (endDate < startDate) endDate.setTime(startDate.getTime());
    const lastCovered = new Date(endDate);
    lastCovered.setHours(0, 0, 0, 0);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const lessons: LessonDraft[] = [];

    // Spread covered practical lessons across weekdays in [start, end]
    if (coveredPrac > 0) {
      const doneDates: Date[] = [];
      const cursor = new Date(startDate);
      while (cursor <= lastCovered && doneDates.length < coveredPrac) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) doneDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const d of doneDates) {
        lessons.push({
          date: d,
          duration_minutes: 30,
          lesson_type: 'practical',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          notes: `Practical ${weekdays[d.getDay()]}`,
          status: 'completed',
        });
      }
    }

    // Spread covered theory lessons across Saturdays in [start, end]
    if (coveredTheory > 0) {
      const doneTheory: Date[] = [];
      let sat = new Date(startDate);
      while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
      while (sat <= lastCovered && doneTheory.length < coveredTheory) {
        doneTheory.push(new Date(sat));
        sat.setDate(sat.getDate() + 7);
      }
      for (const d of doneTheory) {
        lessons.push({
          date: d,
          duration_minutes: 120,
          lesson_type: 'theory',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          notes: `Theory ${weekdays[6]}`,
          status: 'completed',
        });
      }
    }

    // Schedule remaining practical lessons on weekdays AFTER the last covered date
    if (remainingPrac > 0) {
      const scheduledDates: Date[] = [];
      const cursor = new Date(lastCovered);
      cursor.setDate(cursor.getDate() + 1);
      while (scheduledDates.length < remainingPrac) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) scheduledDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const d of scheduledDates) {
        lessons.push({
          date: d,
          duration_minutes: 30,
          lesson_type: 'practical',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          notes: `Practical ${weekdays[d.getDay()]}`,
          status: 'scheduled',
        });
      }
    }

    // Schedule remaining theory lessons on Saturdays AFTER the last covered date
    if (remainingTheory > 0) {
      let sat = new Date(lastCovered);
      sat.setDate(sat.getDate() + 1);
      while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
      const scheduledTheory: Date[] = [];
      while (scheduledTheory.length < remainingTheory) {
        scheduledTheory.push(new Date(sat));
        sat.setDate(sat.getDate() + 7);
      }
      for (const d of scheduledTheory) {
        lessons.push({
          date: d,
          duration_minutes: 120,
          lesson_type: 'theory',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          notes: `Theory ${weekdays[6]}`,
          status: 'scheduled',
        });
      }
    }

    lessons.sort((a, b) => (a.date!.getTime() - b.date!.getTime()));
    this.quickGenPreview.set(lessons);
  }

  quickGenApply() {
    const c = this.wizardClient();
    if (!c) return;
    const preview = this.quickGenPreview();
    if (preview.length === 0) {
      this.msg.add({ severity: 'warn', summary: 'Generate lessons first' });
      return;
    }
    const pi = this.quickGenPkgIndex();
    const pkgs = [...c.packages];
    const existing = pkgs[pi].lessons;
    const existingKeys = new Set(
      existing
        .filter((l) => l.date)
        .map((l) => `${this.fmt(l.date!)}::${l.lesson_type}`),
    );
    const toAdd = preview.filter((l) => l.date && !existingKeys.has(`${this.fmt(l.date!)}::${l.lesson_type}`));
    const merged = [...existing, ...toAdd].sort(
      (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
    );
    pkgs[pi] = { ...pkgs[pi], lessons: merged, lesson_plan_template_id: this.quickGenTemplateId() };
    this.updateWizard({ packages: pkgs });
    this.quickGenOpen.set(false);
    this.quickGenPreview.set([]);
    this.msg.add({
      severity: 'success',
      summary: `${toAdd.length} future lesson(s) scheduled (${existing.length} already covered)`,
    });
  }

  countExpandedLessons(lessons: LessonDraft[]): number {
    let count = 0;
    for (const lesson of lessons) {
      if (!lesson.duration_minutes || lesson.duration_minutes <= 0) continue;
      if (lesson.lesson_type === 'theory') {
        count += 1;
      } else {
        count += Math.ceil(lesson.duration_minutes / 30);
      }
    }
    return count;
  }

  lessonCounts(lessons: LessonDraft[]) {
    const expanded = lessons.flatMap((l) => {
      if (!l.duration_minutes || l.duration_minutes <= 0) return [];
      if (l.lesson_type === 'theory') return [{ ...l }];
      const n = Math.ceil(l.duration_minutes / 30);
      return Array.from({ length: n }, () => ({ ...l }));
    });
    const practicalDone = expanded.filter(
      (l) => l.lesson_type === 'practical' && l.status !== 'scheduled',
    ).length;
    const practicalScheduled = expanded.filter(
      (l) => l.lesson_type === 'practical' && l.status === 'scheduled',
    ).length;
    const theoryDone = expanded.filter(
      (l) => l.lesson_type === 'theory' && l.status !== 'scheduled',
    ).length;
    const theoryScheduled = expanded.filter(
      (l) => l.lesson_type === 'theory' && l.status === 'scheduled',
    ).length;
    return {
      total: expanded.length,
      practicalDone,
      practicalScheduled,
      theoryDone,
      theoryScheduled,
    };
  }

  productName(id: string): string {
    return this.productById().get(id)?.name || '';
  }

  packageName(productId: string, packageId: string): string {
    const p = this.productById().get(productId);
    return p?.packages?.find((pkg) => pkg.id === packageId)?.name || '';
  }

  initial(c: ClientDraft): string {
    const parts = [c.first_name, c.last_name].filter(Boolean);
    return parts.length ? parts.map((n) => n[0].toUpperCase()).slice(0, 2).join('') : '?';
  }

  isComplete(c: ClientDraft): boolean {
    if (!c.phone || !c.first_name) return false;
    if (c.packages.length === 0) return false;
    for (const p of c.packages) {
      if (!p.product_id) return false;
      if (p.installments.length === 0) return false;
      for (const i of p.installments) {
        if (!i.receipt_number || !i.document_date || !i.amount || !i.received_by_phone) return false;
      }
    }
    return true;
  }

  isValid(): boolean {
    if (this.clients().length === 0) return false;
    if (!this.branchId()) return false;
    return this.clients().every((c) => this.isComplete(c));
  }

  submit() {
    if (!this.isValid()) {
      this.msg.add({ severity: 'warn', summary: 'Complete all required fields' });
      return;
    }
    const payload: BulkOnboardingRequest = {
      clients: this.clients().map((c) => ({
        phone: c.phone,
        first_name: c.first_name,
        middle_name: c.middle_name || undefined,
        last_name: c.last_name || undefined,
        location: c.location || undefined,
        branch_id: this.branchId() || undefined,
        document_date: c.document_date ? this.fmt(c.document_date) : undefined,
        converter_id: c.converter_id || undefined,
        primary_recommender_id: c.primary_recommender_id || undefined,
        secondary_recommender_id: c.secondary_recommender_id || undefined,
        packages: c.packages.map((p) => ({
          product_id: p.product_id,
          package_id: p.package_id || undefined,
          transmission_type: p.transmission_type || 'manual',
          lesson_plan_template_id: p.lesson_plan_template_id || undefined,
          discount_id: p.discount_id || undefined,
          installments: p.installments.map((i) => ({
            receipt_number: i.receipt_number,
            document_date: i.document_date ? this.fmt(i.document_date) : '',
            amount: i.amount!,
            received_by_phone: i.received_by_phone,
          })),
          lessons: p.lessons.filter((l) => l.date && l.duration_minutes).map((l) => ({
            date: this.fmt(l.date!),
            duration_minutes: l.duration_minutes!,
            lesson_type: l.lesson_type,
            instructor_id: l.instructor_id || undefined,
            vehicle_id: l.vehicle_id || undefined,
            notes: l.notes || undefined,
            status: l.status === 'scheduled' ? 'scheduled' : undefined,
          })),
        })),
      })),
    };

    this.submitting.set(true);
    this.consultationService.bulkOnboard(payload).subscribe({
      next: (res) => {
        localStorage.removeItem(STORAGE_KEY);
        this.submitting.set(false);
        this.successCreated.set(res.created);
        this.showSuccess.set(true);
        this.clients.set([]);
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
  }

  goHome() {
    this.showSuccess.set(false);
    this.router.navigate(['/home']);
  }

  addMore() {
    this.showSuccess.set(false);
    this.clients.set([]);
    this.wizardClient.set(null);
    this.wizardOpen.set(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  viewClients() {
    this.showSuccess.set(false);
    this.router.navigate(['/payments']);
  }

  get canEditOnboarded(): boolean {
    return this.auth.currentUserCanEditOnboardedClients();
  }

  get mobileToday(): Date {
    return new Date();
  }

  defaultSavedDates() {
    if (!this.savedFromModel()) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      this.savedFromModel.set(from);
      this.savedToModel.set(to);
    }
  }

  loadSavedClients() {
    if (!this.branchId()) return;
    this.defaultSavedDates();
    this.savedLoading.set(true);
    this.consultationService
      .listOnboardedClients({
        branch_id: this.branchId(),
        from_date: this.savedFromModel() ? this.fmt(this.savedFromModel()!) : undefined,
        to_date: this.savedToModel() ? this.fmt(this.savedToModel()!) : undefined,
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

  savedClientName(c: OnboardedClient): string {
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || c.phone;
  }

  savedClientInitial(c: OnboardedClient): string {
    const parts = [c.first_name, c.last_name].filter((s): s is string => !!s);
    return parts.length ? parts.map((n) => n[0].toUpperCase()).slice(0, 2).join('') : '?';
  }

  private isoToDate(iso: string | null): Date | null {
    if (!iso) return null;
    const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
    return isNaN(d.getTime()) ? null : d;
  }

  payDocDate(p: OnboardedPayment): Date | null {
    return this.isoToDate(p.document_date);
  }

  onPayDocDateChange(p: OnboardedPayment, d: Date | null) {
    p.docDateObj = d;
    p.document_date = d ? this.fmt(d) : null;
  }

  lessonDate(l: OnboardedLesson): Date | null {
    return l.dateObj ?? null;
  }

  onLessonDateChange(l: OnboardedLesson, d: Date | null) {
    l.dateObj = d;
    l.scheduled_date = d ? this.fmt(d) : null;
  }

  editDocDate(): Date | null {
    return this.editDocSignal();
  }

  onEditDocDateChange(d: Date | null) {
    this.editDocSignal.set(d);
    const c = this.editingClient();
    if (c) c.document_date = d ? this.fmt(d) : null;
  }

  private toMoney(v: any): number {
    const n = Number(v);
    return isFinite(n) ? n : 0;
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
      document_date: this.fmt(new Date()),
      receipt_number: '',
      amount: 0,
      balance: 0,
      received_by_phone: this.auth.currentUserPhone(),
    });
  }

  removePayment(pkg: OnboardedPackage, idx: number) {
    const pay = pkg.payments[idx];
    if (!pay) return;
    if (pay.id) this.removedPaymentIds.update((ids) => [...ids, pay.id]);
    pkg.payments.splice(idx, 1);
  }

  isPayRemoved(pay: OnboardedPayment): boolean {
    return pay.id !== '' && this.removedPaymentIds().includes(pay.id);
  }

  openRegen(pkgIdx: number) {
    this.regenPkgIdx.set(pkgIdx);
    const pkg = this.editingClient()?.packages[pkgIdx];
    this.regenForm.set({
      startDate: new Date(),
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
      const pkg = this.editingClient()?.packages[this.regenPkgIdx()];
      if (!pkg || !pkg.plan) {
        this.msg.add({ severity: 'error', summary: 'No plan found for this package' });
        return;
      }
      const lessons = this.buildRegenLessons(form);
      this.regenPlans.update((r) => ({
        ...r,
        [this.regenPkgIdx()]: {
          plan_id: pkg.plan!.id,
          template_id: null,
          transmission_type: form.transmission,
          start_date: this.fmt(form.startDate!),
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
    const cursor = new Date(form.startDate);
    cursor.setHours(0, 0, 0, 0);
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
        scheduled_date: this.fmt(d),
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
        scheduled_date: this.fmt(d),
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
    const removePaymentIds: string[] = [...this.removedPaymentIds()];
    for (const pkg of c.packages) {
      for (const pay of pkg.payments) {
        const origPay = orig?.packages.flatMap((p) => p.payments).find((x) => x.id === pay.id);
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
      if (lessonEdits.length > 0) plans.push({ plan_id: pkg.plan.id, lessons: lessonEdits });
      void pkgIdx;
    });

    const payload: any = { payments, remove_payment_ids: removePaymentIds };
    if (c.document_date) payload.document_date = c.document_date;
    if (plans.length > 0) payload.plans = plans;
    const regenEntries = Object.values(this.regenPlans());
    if (regenEntries.length > 0) payload.regenerate_plans = regenEntries;

    if (!payload.document_date && payments.length === 0 && removePaymentIds.length === 0 && !plans.length && !regenEntries.length) {
      this.msg.add({ severity: 'info', summary: 'No changes to save' });
      return;
    }

    this.editBusy.set(true);
    this.consultationService.correctOnboardedClient(c.id, payload).subscribe({
      next: () => {
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
}

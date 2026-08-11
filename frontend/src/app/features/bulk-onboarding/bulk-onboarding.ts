import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  packages: PackageDraft[];
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
export class BulkOnboardingCmp implements OnInit {
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
  templatePickerSelectedIds = signal<string[]>([]);

  quickGenBusy = signal(false);
  pickerBusy = signal(false);

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

  vehicleOptions = computed(() =>
    this.vehicles().map(v => ({
      label: `${v.name} (${v.plate_number})`,
      value: v.id,
    }))
  );

  branchOptions = computed(() =>
    this.branches().map(b => ({ label: b.name, value: b.id }))
  );

  branchStatus = computed(() => {
    const b = this.branches();
    if (b.length === 0) return 'none';
    if (b.length === 1) return 'single';
    return 'multi';
  });

  constructor(
    private consultationService: ConsultationService,
    private productService: ProductService,
    private userService: UserService,
    private vehicleService: VehicleService,
    private companyService: CompanyService,
    private lessonPlanService: LessonPlanService,
    private auth: AuthService,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadData();
    this.restoreDraft();
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
    return this.lessonTemplates().map(t => ({ label: t.name, value: t.id }));
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
    return {
      phone: c.phone || '',
      first_name: c.first_name || '',
      middle_name: c.middle_name || '',
      last_name: c.last_name || '',
      location: c.location || '',
      branch_id: c.branch_id || '',
      document_date: c.document_date ? new Date(c.document_date) : null,
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
      })),
    };
  }

  saveDraft() {
    const data = {
      saved_at: new Date().toISOString(),
      clients: this.clients().map(c => ({
        phone: c.phone,
        first_name: c.first_name,
        middle_name: c.middle_name,
        last_name: c.last_name,
        location: c.location,
        branch_id: c.branch_id,
        document_date: c.document_date?.toISOString()?.split('T')[0] || null,
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
        })),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    this.msg.add({ severity: 'success', summary: 'Draft saved' });
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
    return c.packages.length > 0 && c.packages.some(pkg =>
      pkg.lessons.length > 0 && pkg.lessons.every(l => !!l.date && !!l.duration_minutes && l.duration_minutes > 0)
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
          { product_id: '', package_id: '', installments: [], lessons: [], transmission_type: 'manual', lesson_plan_template_id: null },
        ],
      };
      return updated;
    });
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
    const today = this.startOfDay(new Date());

    if (start && docDate && start < docDate) {
      return `Start date cannot be before the client's document date (${fmt(docDate)})`;
    }
    if (start && firstPay && start < firstPay) {
      return `Start date cannot be before the first payment date (${fmt(firstPay)})`;
    }
    if (last && start && last < start) {
      return 'Last date must be after start date';
    }
    if (last && last > today) {
      return 'Last date of training cannot be later than today';
    }
    return '';
  }

  private quickGenLessonsError(): string {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const template = this.quickGenSelectedTemplate();
    const docDate = this.quickGenDocDate();
    const firstPay = this.quickGenFirstPaymentDate();
    const today = this.startOfDay(new Date());

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
        if (d > today) {
          return `Date for "${item.title}" cannot be later than today`;
        }
      }
    } else {
      for (const lesson of this.quickGenPreview()) {
        const d = this.startOfDay(lesson.date);
        const msg = lower(d);
        if (msg) return `Generated lesson date ${msg}`;
        if (d > today) {
          return 'Generated lesson dates cannot be later than today';
        }
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
      // If not enough working days, continue past the last date
      let overflow = new Date(last);
      while (practicalDates.length < practical.length) {
        overflow.setDate(overflow.getDate() + 1);
        if (overflow.getDay() >= 1 && overflow.getDay() <= 5) practicalDates.push(new Date(overflow));
      }

      const practicalGenerated: QuickGenLesson[] = practical.map((p, i) => ({
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
    setTimeout(() => this.quickGenBusy.set(false), 400);
  }

  private quickGenEffectiveCounts(): { practical: number; theory: number } {
    const form = this.quickGenForm();
    const pkg = this.clients()[this.quickGenClientIndex()]?.packages[this.quickGenPkgIndex()];
    const info = pkg && pkg.product_id && pkg.package_id
      ? this.packageTrainingInfo(pkg.product_id, pkg.package_id)
      : { days: null, hours: null };
    const practical = Math.max(form.practicalDays ?? 0, info.days ?? 0);
    const theorySessions = info.hours ? Math.ceil(info.hours / 2) : 0;
    const theory = Math.max(form.theoryLessons ?? 0, theorySessions);
    return { practical, theory };
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
    this.quickGenForm.update(f => ({ ...f, lesson_plan_template_id: templateId }));
    this.syncQuickGenSelection();
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
    this.templatePickerSelectedIds.set([]);
    this.showTemplatePicker.set(true);
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
    const items = this.templatePickerItems().filter(i => ids.includes(i.id));
    this.clients.update(clients => {
      const updated = [...clients];
      const pkgs = [...updated[ci].packages];
      const lessons = [...pkgs[pi].lessons];
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
      };
      updated[ci] = { ...updated[ci], packages: pkgs };
      return updated;
    });
    this.showTemplatePicker.set(false);
    this.templatePickerSelectedIds.set([]);
    this.validateAllLessons();
    setTimeout(() => this.pickerBusy.set(false), 400);
  }

  expandLessons(lessons: LessonDraft[]): { date: Date | null; duration: number; chunk: number; total: number }[] {
    const expanded: { date: Date | null; duration: number; chunk: number; total: number }[] = [];
    for (const lesson of lessons) {
      if (!lesson.duration_minutes || lesson.duration_minutes <= 0) continue;
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
            packages: c.packages.map(p => ({
              product_id: p.product_id,
              package_id: p.package_id || undefined,
              transmission_type: p.transmission_type || 'manual',
              lesson_plan_template_id: p.lesson_plan_template_id || undefined,
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

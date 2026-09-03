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
import { AuthService } from '../../core/auth/auth.service';
import { CatalogService, Product, Branch } from '../../core/services/catalog.service';
import { ConsultationService, BulkOnboardingRequest } from '../../core/services/consultation.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

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
  private msg = inject(MessageService);

  clients = signal<ClientDraft[]>([]);
  products = signal<Product[]>([]);
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

  vehicleOptionsFor(transmission: string) {
    return this.vehicles()
      .filter((v) => transmission === 'both' || v.transmission === transmission)
      .map((v) => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
  }

  wizardItems = computed(() => [
    { label: 'Info', icon: 'pi pi-user' },
    { label: 'Payments', icon: 'pi pi-wallet' },
    { label: 'Lessons', icon: 'pi pi-book' },
    { label: 'Preview', icon: 'pi pi-eye' },
  ]);

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
      const res = await this.catalog.listInstructors().toPromise();
      if (res?.users) {
        this.instructors.set(res.users);
        this.users.set(res.users);
      }
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
      const restored: ClientDraft[] = (draft.clients || []).map((c: any) => ({
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
      }));
      this.clients.set(restored);
      this.msg.add({ severity: 'info', summary: 'Draft restored from local storage' });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private persistDraft() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        saved_at: new Date().toISOString(),
        clients: this.clients().map((c) => ({
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
        })),
      }),
    );
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
    return !!c && !!c.phone && !!c.first_name;
  }

  paymentsValid(): boolean {
    const c = this.wizardClient();
    if (!c || c.packages.length === 0) return false;
    return c.packages.every(
      (p) =>
        !!p.product_id &&
        p.installments.length > 0 &&
        p.installments.every(
          (i) => !!i.receipt_number && !!i.document_date && !!i.amount && !!i.received_by_phone,
        ),
    );
  }

  lessonsValid(): boolean {
    const c = this.wizardClient();
    if (!c || c.packages.length === 0) return false;
    return c.packages.some(
      (p) =>
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

  nextStep() {
    if (!this.stepValid(this.wizardStep())) {
      this.msg.add({ severity: 'warn', summary: 'Complete this step first' });
      return;
    }
    this.wizardStep.update((s) => Math.min(3, s + 1));
  }

  prevStep() {
    this.wizardStep.update((s) => Math.max(0, s - 1));
  }

  goStep(step: number) {
    if (step < this.wizardStep()) {
      this.wizardStep.set(step);
      return;
    }
    if (step === this.wizardStep()) return;
    for (let s = this.wizardStep(); s < step; s++) {
      if (!this.stepValid(s)) {
        this.msg.add({ severity: 'warn', summary: 'Complete previous steps first' });
        return;
      }
    }
    this.wizardStep.set(step);
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

  addPackage() {
    const c = this.wizardClient();
    if (!c) return;
    this.updateWizard({
      packages: [
        ...c.packages,
        { product_id: '', package_id: '', transmission_type: 'manual', installments: [], lessons: [] },
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
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], product_id: productId, package_id: '' };
    this.updateWizard({ packages: pkgs });
  }

  onPackageUpdate(pkgIndex: number, patch: Partial<PackageDraft>) {
    const c = this.wizardClient();
    if (!c) return;
    const pkgs = [...c.packages];
    pkgs[pkgIndex] = { ...pkgs[pkgIndex], ...patch };
    this.updateWizard({ packages: pkgs });
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

  goConsultations() {
    this.showSuccess.set(false);
    this.router.navigate(['/dashboard']);
  }
}

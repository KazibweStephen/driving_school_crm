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
import { StepperModule } from 'primeng/stepper';
import { StepsModule } from 'primeng/steps';
import { MenuItem } from 'primeng/api';
import { ConsultationService } from '../../core/services/consultation.service';
import { ProductService } from '../../core/services/product.service';
import { UserService } from '../../core/services/user.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AuthService } from '../../core/auth/auth.service';

interface LessonDraft {
  date: Date | null;
  duration_minutes: number | null;
  lesson_type: string;
  instructor_id: string;
  vehicle_id: string;
  notes: string;
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
    StepperModule, StepsModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './bulk-onboarding.html',
})
export class BulkOnboardingCmp implements OnInit {
  clients = signal<ClientDraft[]>([]);
  products = signal<any[]>([]);
  users = signal<any[]>([]);
  vehicles = signal<any[]>([]);
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

  userOptions = computed(() =>
    this.users().map(u => ({
      label: u.name || u.phone,
      value: u.phone,
    }))
  );

  vehicleOptions = computed(() =>
    this.vehicles().map(v => ({
      label: `${v.name} (${v.plate_number})`,
      value: v.id,
    }))
  );

  constructor(
    private consultationService: ConsultationService,
    private productService: ProductService,
    private userService: UserService,
    private vehicleService: VehicleService,
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
    this.userService.list().subscribe((res: any) => {
      this.users.set(res.users || []);
    });
    this.vehicleService.list().subscribe((res: any) => {
      this.vehicles.set(Array.isArray(res) ? res : res.vehicles || []);
    });
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
    if (!client?.document_date) return;
    const lesson = client.packages[pi]?.lessons[li];
    if (!lesson?.date) return;
    if (lesson.date < client.document_date) {
      this.dateErrors.update(e => ({ ...e, [key]: `Date cannot be before client document date (${client.document_date!.toISOString().split('T')[0]})` }));
    }
  }

  hasDateErrors(): boolean {
    return Object.keys(this.dateErrors()).length > 0;
  }

  hasReceiptWarnings(): boolean {
    return Object.keys(this.receiptWarnings()).length > 0;
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
        })),
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
          })),
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
        branch_id: '',
        document_date: null,
        packages: [],
      },
    ]);
    const idx = this.clients().length - 1;
    this.clientStepIndex.update(s => ({ ...s, [idx]: 0 }));
  }

  onStepChange(clientIndex: number, stepIndex: number) {
    this.clientStepIndex.update(s => ({ ...s, [clientIndex]: stepIndex }));
  }

  getStepItems(): MenuItem[] {
    return [
      { label: 'Info', icon: 'pi pi-user' },
      { label: 'Payments', icon: 'pi pi-wallet' },
      { label: 'Lessons', icon: 'pi pi-book' },
    ];
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
          { product_id: '', package_id: '', installments: [], lessons: [] },
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
      });
      pkgs[pkgIndex] = { ...pkgs[pkgIndex], lessons };
      updated[clientIndex] = { ...updated[clientIndex], packages: pkgs };
      return updated;
    });
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
    if (this.hasReceiptWarnings() || this.hasDateErrors()) return false;
    for (const client of this.clients()) {
      if (!client.phone || !client.first_name) return false;
      for (const pkg of client.packages) {
        if (!pkg.product_id) return false;
        if (pkg.installments.length === 0) return false;
        for (const inst of pkg.installments) {
          if (!inst.receipt_number || !inst.document_date || !inst.amount || !inst.received_by_phone) return false;
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
            branch_id: c.branch_id || undefined,
            document_date: c.document_date?.toISOString()?.split('T')[0] || undefined,
            packages: c.packages.map(p => ({
              product_id: p.product_id,
              package_id: p.package_id || undefined,
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

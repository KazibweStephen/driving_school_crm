import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConsultationService, Consultation, FollowUp } from '../../core/services/consultation.service';
import { CartItemService, CartItemRead, CartItemCreate } from '../../core/services/cart.service';
import { ProductService, Product } from '../../core/services/product.service';
import { PaymentService, PaymentRead } from '../../core/services/payment.service';
import { AuthService } from '../../core/auth/auth.service';
import { CurrencyService } from '../../core/services/currency.service';
import { TrainingService, TrainingSession, TrainingSummary, Skill, SkillCreate } from '../../core/services/training.service';
import { PermitProgressService, PermitProgress } from '../../core/services/permit-progress.service';
import { OrderListModule } from 'primeng/orderlist';
import { LessonPlanService, LessonPlanTemplate, ClientLessonPlan, ClientLesson, ClientLessonUpdate } from '../../core/services/lesson-plan.service';
import { LessonLibraryService } from '../../core/services/lesson-library.service';
import { VideoLibraryService } from '../../core/services/video-library.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';
import { UserService, User } from '../../core/services/user.service';
import { SchedulingService, ClientAvailability, FindAndLockResult } from '../../core/services/scheduling.service';
import { VehicleScheduleService } from '../../core/services/vehicle-schedule.service';

@Component({
  selector: 'app-client-profile',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    DecimalPipe,
    CurrencyPipe,
    DatePipe,
    DialogModule,
    InputTextModule,
    TagModule,
    ToastModule,
    SelectModule,
    MultiSelectModule,
    DatePickerModule,
    TooltipModule,
    ConfirmDialogModule,
    TableModule,
    CheckboxModule,
    InputNumberModule,
    ProgressBarModule,
    OrderListModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './client-profile.html',
})
export class ClientProfile implements OnInit {
  consultation = signal<Consultation | null>(null);
  loading = signal(false);

  products = signal<Product[]>([]);

  // Multi-step Add to Cart
  showAddProductDialog = signal(false);
  addStep = signal(1);
  selectedProduct = signal<Product | null>(null);
  selectedPackageId = signal<string | null>(null);
  addSelectedProducts = signal<{ product: Product; packageId: string | null; price: number; packageName: string; cartItemId?: string }[]>([]);
  addConvertNow = signal(false);
  // Step 1 per-item fields (reset each time a product is added to the list)
  addNote = signal('');
  addIsImportant = signal(false);
  addNextFollowUpDate = signal<Date | null>(null);
  // Step 2 payment
  addPackageAllocations = signal<{ productIndex: number; allocated: number }[]>([]);
  addPaymentReceiptNumber = signal('');
  addPaymentInstallments: { due_date: Date | null; amount: number }[] = [];
  // Step 3 receipt
  addReceiptItems = signal<{ productName: string; packageName: string; price: number; paid: number; balance: number }[]>([]);
  addReceiptInstallments = signal<{ due_date: string; amount: number; product_name: string }[]>([]);
  addReceiptSystemNumber = signal('');
  addReceiptManualNumber = signal('');
  addReceiptPaymentIds: string[] = [];
  addReceiptTotalPaid = signal(0);
  addReceiptDate = signal('');
  addReceiptUserName = signal('');

  showEditDialog = signal(false);
  editForm: any = {};

  showFollowUpDialog = signal(false);
  followUpForm: { follow_up_date: Date | null; note: string; type: string; cart_item_ids: string[] } = {
    follow_up_date: null, note: '', type: 'conversion', cart_item_ids: [],
  };

  showCompleteFollowUpDialog = signal(false);
  completingFollowUp = signal<FollowUp | null>(null);
  completeFollowUpForm: { note: string; next_follow_up_date: Date | null } = {
    note: '', next_follow_up_date: null,
  };

  followUpCheckIds = signal<string[]>([]);
  showCartItemFollowUpsDialog = signal(false);
  cartItemFollowUpsTarget = signal<CartItemRead | null>(null);

  showRecoverDialog = signal(false);
  recoverTarget = signal<CartItemRead | null>(null);
  recoverReason = signal('');

  showMarkLostDialog = signal(false);
  markLostTarget = signal<CartItemRead | null>(null);
  markLostNote = signal('');

  showCompleteSaleDialog = signal(false);
  completeSaleTarget = signal<CartItemRead | null>(null);
  completeSalePaidAmount = signal<number>(0);
  completeSaleInstallments: { due_date: Date | null; amount: number }[] = [];
  completeSaleTotal = signal<number>(0);
  completeSaleBalance = signal<number>(0);
  completeSaleReceiptNumber = signal('');
  completeSaleSystemReceiptNumber = signal('');
  completeSaleDocumentDate = signal<Date | null>(null);

  showMakePaymentDialog = signal(false);
  makePaymentTarget = signal<CartItemRead | null>(null);
  makePaymentAmount = signal<number>(0);
  makePaymentBalance = signal<number>(0);
  makePaymentReceiptNumber = signal('');
  makePaymentDocumentDate = signal<Date | null>(null);
  makePaymentInstallments: { due_date: Date | null; amount: number }[] = [];

  showPayAllDialog = signal(false);
  payAllItems = signal<{ cartItem: CartItemRead; payNow: number; balance: number; productName: string; packageName: string }[]>([]);
  payAllReceiptNumber = signal('');
  payAllInstallments: { due_date: Date | null; amount: number }[] = [];
  payAllDocumentDate = signal<Date | null>(null);

  showGuide = signal(false);
  guideContent = signal('');

  viewMode = signal<'detailed' | 'tabbed'>('tabbed');
  selectedTabIndex = signal(0);
  tabLabels = ['Products', 'Follow-ups', 'Payments', 'Training', 'Permit', 'Lesson Plans'];
  isMobile = signal(window.innerWidth < 640);
  today = new Date();

  showPrintPreview = signal(false);
  printPreviewData = signal<{ ci: CartItemRead | null; plan: ClientLessonPlan | null }>({ ci: null, plan: null });
  printShowObjectives = signal(true);
  printShowPractical = signal(true);
  printPreviewHtml = signal('');
  private _printPreviewObjectUrl: string | null = null;

  // Lesson Execution
  showExecutionDialog = signal(false);
  showNotificationsPanel = signal(false);

  notificationLessons = computed(() => {
    const all: { label: string; lesson: ClientLesson }[] = [];
    const plansMap = this.clientLessonPlans();
    for (const [, plans] of plansMap) {
      for (const plan of plans) {
        for (const lesson of plan.lessons || []) {
          if (lesson.status === 'started' || lesson.status === 'in_progress') {
            all.push({ label: 'Ongoing', lesson });
          } else if (lesson.status === 'pending') {
            all.push({ label: 'Upcoming', lesson });
          }
        }
      }
    }
    return all;
  });

  notificationCount = computed(() => {
    return this.notificationLessons().length;
  });
  executingLesson = signal<ClientLesson | null>(null);
  executionTimerDisplay = signal('00:00');
  executionProgress = signal(0);
  executionTotalSeconds = signal(1800);
  executionElapsedSeconds = signal(0);
  executionNotes = signal('');
  executionVideoUrl = signal<SafeResourceUrl | null>(null);
  executionVideoSource = signal<string | null>(null);
  executionUpcomingClients = signal<{ name: string; product: string; transmission: string }[]>([]);
  executionIsRunning = signal(false);
  executionTimeoutWarned = signal(false);
  executionIsPaused = signal(false);
  executionCheckedObjectives = signal<boolean[]>([]);
  executionCheckedPractical = signal<boolean[]>([]);
  private _executionTimerInterval: any = null;

  getPrintPreviewSafeUrl() {
    const url = this.printPreviewHtml();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  closePrintPreview() {
    if (this._printPreviewObjectUrl) {
      URL.revokeObjectURL(this._printPreviewObjectUrl);
      this._printPreviewObjectUrl = null;
    }
    this.printPreviewHtml.set('');
    this.showPrintPreview.set(false);
  }

  receiptChecking = signal(false);
  receiptAvailable = signal<boolean | null>(null);

  statuses = [
    { label: 'New', value: 'new' },
    { label: 'Consulting', value: 'consulting' },
    { label: 'Converted (New)', value: 'converted_new' },
    { label: 'Converted (Upsold)', value: 'converted_upsold' },
    { label: 'Converted (Completed)', value: 'converted_completed' },
    { label: 'Lost', value: 'lost' },
  ];

  interestLevels = [
    { label: 'Very High', value: 'very_high' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Undecided', value: 'undecided' },
    { label: 'Low', value: 'low' },
  ];

  howTheyKnewUsOptions = [
    { label: 'Friend/Family', value: 'Friend/Family' },
    { label: 'Social Media', value: 'Social Media' },
    { label: 'Google Search', value: 'Google Search' },
    { label: 'Walk-in', value: 'Walk-in' },
    { label: 'Radio', value: 'Radio' },
    { label: 'Billboard', value: 'Billboard' },
    { label: 'Other', value: 'Other' },
  ];

  payments = signal<PaymentRead[]>([]);

  followUpTypes = [
    { label: 'Conversion', value: 'conversion' },
    { label: 'Payment', value: 'payment' },
  ];

  constructor(
    private route: ActivatedRoute,
    private consultationService: ConsultationService,
    private cartItemService: CartItemService,
    private productService: ProductService,
    private paymentService: PaymentService,
    private trainingService: TrainingService,
    private lessonPlanService: LessonPlanService,
    private lessonLibraryService: LessonLibraryService,
    private videoLibraryService: VideoLibraryService,
    private vehicleService: VehicleService,
    private userService: UserService,
    private schedulingService: SchedulingService,
    private vehicleScheduleService: VehicleScheduleService,
    private permitProgressService: PermitProgressService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer,
    public authService: AuthService,
    public currencyService: CurrencyService,
  ) {}

  async ngOnInit() {
    window.addEventListener('resize', () => this.isMobile.set(window.innerWidth < 640));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loading.set(true);
      await this.loadProducts();
      await this.loadConsultation(id);
    }
  }

  async loadConsultation(id: string) {
    this.loading.set(true);
    try {
      const c = await this.consultationService.get(id).toPromise();
      if (c) {
        this.consultation.set(c);
        this.loadPayments();
        this.loadTrainingData();
        this.loadPermitProgress();
        this.loadLessonPlans();
        this.loadVehiclesAndInstructors();
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load consultation' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadProducts() {
    try {
      const res = await this.productService.listProducts({ status: 'active', page_size: 100 }).toPromise();
      if (res) this.products.set(res.products);
    } catch {
      /* products are non-critical for profile view */
    }
  }

  async loadPayments() {
    const c = this.consultation();
    if (!c) return;
    try {
      const res = await this.paymentService.getPaymentsByConsultation(c.id).toPromise();
      if (res) this.payments.set(res);
    } catch {
      /* payments are non-critical */
    }
  }

  // ── Training Sessions ──────────────────────────────────────

  trainingSessions = signal<TrainingSession[]>([]);
  trainingSummaries = signal<Map<string, TrainingSummary>>(new Map());
  showAddTrainingDialog = signal(false);
  showGenerateTrainingDialog = signal(false);
  showSkillsDialog = signal(false);
  selectedSessionForSkills = signal<TrainingSession | null>(null);
  editingTrainingSession = signal<TrainingSession | null>(null);

  generateForm: { cart_item_id: string; start_date: Date | null } = {
    cart_item_id: '',
    start_date: null,
  };

  trainingForm: {
    cart_item_id: string;
    session_date: Date | null;
    duration_minutes: number;
    theory_minutes: number | null;
    driving_minutes: number | null;
    notes: string;
    instructor_notes: string;
    video_url: string;
  } = {
    cart_item_id: '',
    session_date: null,
    duration_minutes: 120,
    theory_minutes: null,
    driving_minutes: null,
    notes: '',
    instructor_notes: '',
    video_url: '',
  };

  // Skills editing
  skillsFormList = signal<{ name: string; description: string; competency_level: number }[]>([]);

  showSkillEditDialog = signal(false);
  editingSkillIndex = signal<number | null>(null);
  skillEditForm: { name: string; description: string; competency_level: number } = {
    name: '',
    description: '',
    competency_level: 1,
  };

  // Timer
  timerInterval: any = null;
  activeTimerSessionId = signal<string | null>(null);
  timerDisplay = signal<string>('00:00');

  trainableCartItems(): CartItemRead[] {
    const items = this.consultation()?.cart_items || [];
    return items.filter(ci =>
      ci.status === 'converted' || ci.status === 'converted_paid' || ci.status === 'converted_paying'
    );
  }

  cartItemHasTraining(ci: CartItemRead): boolean {
    // Resolve training flags from Package at runtime if possible
    if (ci.requires_driving_training || ci.requires_theory_training) return true;
    if (!ci.package_id) return false;
    for (const p of this.products()) {
      const pkg = p.packages.find(pk => pk.id === ci.package_id);
      if (pkg) return pkg.requires_driving_training || pkg.requires_theory_training;
    }
    return false;
  }

  async loadTrainingData() {
    const items = this.trainableCartItems().filter(
      ci => this.cartItemHasTraining(ci)
    );
    const allSessions: TrainingSession[] = [];
    const summaries = new Map<string, TrainingSummary>();
    for (const ci of items) {
      try {
        const sessions = await this.trainingService.listByCartItem(ci.id).toPromise();
        if (sessions) {
          for (const s of sessions) {
            const stored = this.trainingSessions().find(x => x.id === s.id);
            if (stored) {
              s.timer_seconds = stored.timer_seconds;
              s.timer_started_at = stored.timer_started_at;
            }
          }
          allSessions.push(...sessions);
        }
        const summary = await this.trainingService.getSummary(ci.id).toPromise();
        if (summary) summaries.set(ci.id, summary);
      } catch { /* skip */ }
    }
    this.trainingSessions.set(allSessions);
    this.trainingSummaries.set(summaries);
  }

  sessionsForCartItem(cartItemId: string): TrainingSession[] {
    return this.trainingSessions().filter(s => s.cart_item_id === cartItemId);
  }

  trainingSummaryFor(cartItemId: string): TrainingSummary | undefined {
    return this.trainingSummaries().get(cartItemId);
  }

  packageForCartItem(ci: CartItemRead): any {
    if (!ci.package_id) return null;
    for (const p of this.products()) {
      const pkg = p.packages.find(pk => pk.id === ci.package_id);
      if (pkg) return pkg;
    }
    return null;
  }

  // ── Generate Sessions ──

  openGenerateSessions(ci: CartItemRead) {
    this.generateForm = { cart_item_id: ci.id, start_date: null };
    this.showGenerateTrainingDialog.set(true);
  }

  async doGenerateSessions() {
    if (!this.generateForm.start_date || !this.generateForm.cart_item_id) return;
    this.loading.set(true);
    try {
      await this.trainingService.generate(this.generateForm.cart_item_id, {
        start_date: this.generateForm.start_date.toISOString(),
      }).toPromise();
      this.showGenerateTrainingDialog.set(false);
      await this.loadTrainingData();
      this.messageService.add({ severity: 'success', summary: 'Generated', detail: 'Training sessions created from package durations' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate sessions' });
    } finally {
      this.loading.set(false);
    }
  }

  // ── Skills Dialog ──

  openSkillsDialog(session: TrainingSession) {
    this.selectedSessionForSkills.set(session);
    this.skillsFormList.set(
      session.skills.map(s => ({ name: s.name, description: s.description || '', competency_level: s.competency_level }))
    );
    this.showSkillsDialog.set(true);
  }

  addSkillToForm() {
    this.skillsFormList.update(list => [...list, { name: '', description: '', competency_level: 1 }]);
  }

  removeSkillFromForm(index: number) {
    this.skillsFormList.update(list => list.filter((_, i) => i !== index));
  }

  async saveSkills() {
    const session = this.selectedSessionForSkills();
    if (!session) return;
    this.loading.set(true);
    try {
      for (const existing of session.skills) {
        await this.trainingService.deleteSkill(existing.id).toPromise();
      }
      for (const sk of this.skillsFormList()) {
        if (sk.name.trim()) {
          await this.trainingService.createSkill(session.id, sk).toPromise();
        }
      }
      this.showSkillsDialog.set(false);
      await this.loadTrainingData();
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Skills updated' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save skills' });
    } finally {
      this.loading.set(false);
    }
  }

  formatTimer(seconds: number | null): string {
    if (seconds == null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  formatTime(t: string): string {
    return t ? t.substring(0, 5) : '';
  }

  // ── Open / Edit Session ──

  openAddTrainingSession() {
    this.editingTrainingSession.set(null);
    this.trainingForm = {
      cart_item_id: '',
      session_date: null,
      duration_minutes: 120,
      theory_minutes: null,
      driving_minutes: null,
      notes: '',
      instructor_notes: '',
      video_url: '',
    };
    this.showAddTrainingDialog.set(true);
  }

  openEditTrainingSession(session: TrainingSession) {
    this.editingTrainingSession.set(session);
    this.trainingForm = {
      cart_item_id: session.cart_item_id,
      session_date: new Date(session.session_date),
      duration_minutes: session.duration_minutes,
      theory_minutes: session.theory_minutes,
      driving_minutes: session.driving_minutes,
      notes: session.notes || '',
      instructor_notes: session.instructor_notes || '',
      video_url: session.video_url || '',
    };
    this.showAddTrainingDialog.set(true);
  }

  async saveTrainingSession() {
    if (!this.trainingForm.session_date || !this.trainingForm.cart_item_id) return;
    this.loading.set(true);
    try {
      const editing = this.editingTrainingSession();
      const payload: any = {
        session_date: this.trainingForm.session_date.toISOString(),
        duration_minutes: this.trainingForm.duration_minutes,
        theory_minutes: this.trainingForm.theory_minutes,
        driving_minutes: this.trainingForm.driving_minutes,
        notes: this.trainingForm.notes || null,
        instructor_notes: this.trainingForm.instructor_notes || null,
        video_url: this.trainingForm.video_url || null,
      };
      if (editing) {
        await this.trainingService.update(editing.id, payload).toPromise();
      } else {
        await this.trainingService.create(this.trainingForm.cart_item_id, payload).toPromise();
      }
      this.showAddTrainingDialog.set(false);
      await this.loadTrainingData();
      this.messageService.add({ severity: 'success', summary: editing ? 'Updated' : 'Created', detail: 'Training session saved' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save training session' });
    } finally {
      this.loading.set(false);
    }
  }

  async deleteTrainingSession(session: TrainingSession) {
    try {
      await this.trainingService.remove(session.id).toPromise();
      await this.loadTrainingData();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Training session removed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete training session' });
    }
  }

  // ── Video ──

  async cacheVideo(session: TrainingSession) {
    try {
      const updated = await this.trainingService.cacheVideo(session.id).toPromise();
      if (updated) this.updateSessionInList(updated);
      this.messageService.add({ severity: 'success', summary: 'Cached', detail: 'Video cached for offline use' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to cache video' });
    }
  }

  async invalidateVideo(session: TrainingSession) {
    try {
      const updated = await this.trainingService.invalidateVideo(session.id).toPromise();
      if (updated) this.updateSessionInList(updated);
      this.messageService.add({ severity: 'success', summary: 'Invalidated', detail: 'Video cache invalidated' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to invalidate video' });
    }
  }

  // ── Session Start / Timer ──

  async startSession(session: TrainingSession) {
    try {
      const updated = await this.trainingService.startSession(session.id).toPromise();
      if (updated) {
        this.updateSessionInList(updated);
        this.startTimer(updated);
      }
      this.messageService.add({ severity: 'success', summary: 'Started', detail: 'Session started for compliance' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to start session' });
    }
  }

  startTimer(session: TrainingSession) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (!session.timer_started_at) return;
    this.activeTimerSessionId.set(session.id);
    const startedAt = new Date(session.timer_started_at).getTime();
    this.timerInterval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.timerDisplay.set(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      if (elapsed % 30 === 0) {
        try {
          const updated = await this.trainingService.updateTimer(session.id, elapsed).toPromise();
          if (updated) this.updateSessionInList(updated);
        } catch { /* skip sync errors */ }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.activeTimerSessionId.set(null);
  }

  private updateSessionInList(updated: TrainingSession) {
    this.trainingSessions.update(list =>
      list.map(s => s.id === updated.id ? { ...s, ...updated } : s)
    );
  }

  // ── Lesson Plans ───────────────────────────────────────────

  clientLessonPlans = signal<Map<string, ClientLessonPlan[]>>(new Map());
  templates = signal<LessonPlanTemplate[]>([]);
  showCreateLessonPlanDialog = signal(false);
  showLessonDetailDialog = signal(false);
  createPlanCartItemId = signal<string | null>(null);
  lessonPlanForm: { template_id: string; theory_template_id: string; transmission_type: string; start_date: string | null; manual_days: number } = {
    template_id: '', theory_template_id: '', transmission_type: 'manual', start_date: null, manual_days: 5,
  };
  editingLesson = signal<ClientLesson | null>(null);
  lessonEditForm: ClientLessonUpdate = {};

  // ── Permit Progress ────────────────────────────────────────

  permitProgress = signal<Map<string, PermitProgress>>(new Map());

  async loadPermitProgress() {
    const items = this.trainableCartItems();
    const progress = new Map<string, PermitProgress>();
    for (const ci of items) {
      if (ci.requires_permit_processing) {
        try {
          const pp = await this.permitProgressService.get(ci.id).toPromise();
          if (pp) progress.set(ci.id, pp);
        } catch { /* skip */ }
      }
    }
    this.permitProgress.set(progress);
  }

  permitForCartItem(cartItemId: string): PermitProgress | undefined {
    return this.permitProgress().get(cartItemId);
  }

  async savePermitProgress(cartItemId: string) {
    const pp = this.permitForCartItem(cartItemId);
    if (!pp) return;
    this.loading.set(true);
    try {
      const updated = await this.permitProgressService.update(cartItemId, {
        start_date: pp.start_date,
        got_learners_permit_date: pp.got_learners_permit_date,
        learners_due_date: pp.learners_due_date,
        learners_expiry_date: pp.learners_expiry_date,
        tested_on_date: pp.tested_on_date,
        expecting_permit_on_date: pp.expecting_permit_on_date,
        delayed_days: pp.delayed_days,
        notes: pp.notes,
      }).toPromise();
      if (updated) {
        this.permitProgress.update(m => { m.set(cartItemId, updated); return new Map(m); });
      }
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Permit progress updated' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update permit progress' });
    } finally {
      this.loading.set(false);
    }
  }

  permitDaysRemaining(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    if (diff === 0) return 'Today';
    return `in ${diff} days`;
  }

  // ── Lesson Plan Methods ──

  lessonPlansForCartItem(cartItemId: string): ClientLessonPlan[] {
    return this.clientLessonPlans().get(cartItemId) || [];
  }

  selectedPlanForTemplateLessons = signal<ClientLessonPlan | null>(null);
  showAddFromTemplateLessonDialog = signal(false);

  async loadLessonPlans() {
    const items = this.trainableCartItems().filter(
      ci => this.cartItemHasTraining(ci)
    );
    const plans = new Map<string, ClientLessonPlan[]>();
    for (const ci of items) {
      try {
        const res = await this.lessonPlanService.listClientPlans(ci.id).toPromise();
        if (res) plans.set(ci.id, res);
      } catch { /* skip */ }
    }
    this.clientLessonPlans.set(plans);
  }

  async openCreateLessonPlan(cartItemId: string) {
    this.createPlanCartItemId.set(cartItemId);
    this.lessonPlanForm = { template_id: '', theory_template_id: '', transmission_type: 'manual', start_date: null, manual_days: 5 };
    this.loading.set(true);
    try {
      const res = await this.lessonPlanService.listTemplates().toPromise();
      this.templates.set(res || []);
      this.showCreateLessonPlanDialog.set(true);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load templates' });
    } finally {
      this.loading.set(false);
    }
  }

  practicalTemplates = computed(() =>
    this.templates().filter(t => t.template_type !== 'theory')
  );
  theoryTemplates = computed(() =>
    this.templates().filter(t => t.template_type === 'theory')
  );

  async createLessonPlan() {
    const cartItemId = this.createPlanCartItemId();
    if (!cartItemId) return;
    this.loading.set(true);
    try {
      const form = this.lessonPlanForm;
      if (form.template_id || form.theory_template_id) {
        await this.lessonPlanService.createClientPlan(cartItemId, {
          template_id: form.template_id || undefined,
          theory_template_id: form.theory_template_id || undefined,
          transmission_type: form.transmission_type,
          start_date: form.start_date || undefined,
          manual_days: form.manual_days,
        }).toPromise();
      }
      this.showCreateLessonPlanDialog.set(false);
      await this.loadLessonPlans();
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Lesson plan created' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create lesson plan' });
    } finally {
      this.loading.set(false);
    }
  }

  async deleteClientPlan(planId: string) {
    // Check if plan has started/completed lessons
    const plans = this.clientLessonPlans();
    let plan: ClientLessonPlan | undefined;
    for (const [, pList] of plans) {
      plan = pList.find(p => p.id === planId);
      if (plan) break;
    }
    if (!plan) return;

    const hasStarted = plan.lessons.some(l => l.status === 'in_progress');
    const hasCompleted = plan.lessons.some(l => l.status === 'completed');

    if (!hasStarted && !hasCompleted) {
      // No started or completed — simple confirmation
      this.confirmationService.confirm({
        message: 'Delete this lesson plan and all its lessons?',
        header: 'Delete Lesson Plan',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Delete All',
        rejectLabel: 'Cancel',
        accept: async () => {
          this.loading.set(true);
          try {
            await this.lessonPlanService.deleteClientPlan(planId, 'all').toPromise();
            this.removePlanFromList(planId);
            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Lesson plan deleted' });
          } catch {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete lesson plan' });
          } finally {
            this.loading.set(false);
          }
        }
      });
    } else {
      // Has started/completed — offer options sequentially
      const doDelete = async (mode: string, label: string) => {
        this.loading.set(true);
        try {
          await this.lessonPlanService.deleteClientPlan(planId, mode).toPromise();
          await this.loadLessonPlans();
          this.messageService.add({ severity: 'info', summary: 'Deleted', detail: `${label} removed` });
        } catch {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete lessons' });
        } finally {
          this.loading.set(false);
        }
      };

      this.confirmationService.confirm({
        message: 'This plan has lessons that are in progress or completed.',
        header: 'Delete Lesson Plan',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Delete Unstarted Only',
        rejectLabel: 'Cancel',
        accept: () => doDelete('unstarted', 'Unstarted lessons'),
      });
    }
  }

  private removePlanFromList(planId: string) {
    this.clientLessonPlans.update(map => {
      const next = new Map(map);
      for (const [key, plans] of next) {
        const filtered = plans.filter(p => p.id !== planId);
        if (filtered.length !== plans.length) next.set(key, filtered);
      }
      return next;
    });
  }

  getTemplateLessonsNotInPlan(plan: ClientLessonPlan): ClientLesson[] {
    if (!plan.template_id) return [];
    const tpl = this.templates().find(t => t.id === plan.template_id);
    if (!tpl) return [];
    const planTitles = new Set(plan.lessons.map(l => l.title));
    return tpl.lesson_items
      .filter(item => !planTitles.has(item.title))
      .map(item => ({
        id: '',
        lesson_plan_id: plan.id,
        template_item_id: item.id,
        lesson_library_id: null,
        day_number: item.day_number,
        week_number: item.week_number,
        title: item.title,
        lesson_objectives: typeof item.lesson_objectives === 'string' ? [item.lesson_objectives] : item.lesson_objectives ?? [],
        practical_objectives: typeof item.practical_objectives === 'string' ? [item.practical_objectives] : item.practical_objectives ?? [],
        order: 0,
        is_active: true,
        is_locked: false,
        status: 'pending',
        difficulty: null,
        vehicle_inspection_minutes: null,
        cockpit_drill_minutes: null,
        video_illustration_minutes: null,
        practical_driving_minutes: null,
        assessment_minutes: null,
        driving_minutes: null,
        theory_minutes: null,
        mileage_km: null,
        is_theory: item.is_theory ?? false,
        combined_with_next: false,
        skills_achieved: null,
        outcome: null,
        instructor_id: null,
        vehicle_id: null,
        completed_at: null,
        scheduled_date: null,
        scheduled_start_time: null,
        scheduled_end_time: null,
        duration_minutes: 30,
        plan_locked_time: null,
        notes: null,
        preferred_location: item.preferred_location ?? null,
        enforce_prerequisites: item.enforce_prerequisites ?? true,
        created_at: '',
        updated_at: '',
      }));
  }

  // ── Scheduling ──

  showScheduleDialog = signal(false);
  schedulingPlan = signal<ClientLessonPlan | null>(null);
  scheduleDate = signal<Date | null>(null);
  scheduleInstructorId = signal<string>('');
  scheduleVehicleId = signal<string>('');
  scheduleInstructorIdAuto = signal<string>('');
  scheduleVehicleIdAuto = signal<string>('');
  scheduleManualDays = signal<number>(5);
  schedulePreferredTimes = signal<string>('17:00,18:00');
  scheduleResult = signal<FindAndLockResult | null>(null);
  scheduleLoading = signal(false);
  availableInstructors = signal<User[]>([]);
  availableVehicles = signal<Vehicle[]>([]);
  scheduleAvailabilities = signal<ClientAvailability[]>([]);
  newAvailabilityDay = signal<number>(0);
  newAvailabilityTimes = signal<string[]>([]);
  manualVehicles = computed(() => this.availableVehicles().filter(v => v.transmission === 'manual'));
  autoVehicles = computed(() => this.availableVehicles().filter(v => v.transmission === 'automatic'));
  manualVehicleOptions = computed(() =>
    this.manualVehicles().map(v => ({ id: v.id, label: `${v.plate_number} · ${v.transmission}` }))
  );
  autoVehicleOptions = computed(() =>
    this.autoVehicles().map(v => ({ id: v.id, label: `${v.plate_number} · ${v.transmission}` }))
  );

  timeOptions = Array.from({length: 26}, (_, i) => {
    const h = Math.floor((i * 30) / 60) + 6;
    const m = (i * 30) % 60;
    const label = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    return { label, value: label };
  });

  async openScheduleDialog(plan: ClientLessonPlan) {
    this.schedulingPlan.set(plan);
    this.scheduleDate.set(null);
    this.scheduleInstructorId.set('');
    this.scheduleVehicleId.set('');
    this.scheduleInstructorIdAuto.set('');
    this.scheduleVehicleIdAuto.set('');
    this.scheduleManualDays.set(plan.manual_days ?? 5);
    this.schedulePreferredTimes.set('');
    this.scheduleResult.set(null);
    this.scheduleLoading.set(true);
    this.showScheduleDialog.set(true);
    try {
      const [instructors, vehicles, avails] = await Promise.all([
        this.userService.list({ role: 'instructor', status: 'active', page_size: 100 }).toPromise(),
        this.vehicleService.list({ status: 'available' }).toPromise(),
        this.schedulingService.listAvailabilities(plan.cart_item_id).toPromise(),
      ]);
      this.availableInstructors.set(instructors?.users?.filter(u => u.role === 'instructor') || []);
      this.availableVehicles.set(vehicles || []);
      this.scheduleAvailabilities.set(avails || []);
      if (avails?.length) {
        this.schedulePreferredTimes.set(avails.map(a => a.start_time.substring(0, 5)).join(','));
      }
      if (plan.start_date) {
        this.scheduleDate.set(new Date(plan.start_date));
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load scheduling data' });
    } finally {
      this.scheduleLoading.set(false);
    }
  }

  async addAvailability() {
    const plan = this.schedulingPlan();
    const times = this.newAvailabilityTimes();
    if (!plan || !times.length) return;
    try {
      const results = await Promise.all(
        times.map(t => this.schedulingService.createAvailability({
          cart_item_id: plan.cart_item_id,
          day_of_week: this.newAvailabilityDay(),
          start_time: t,
        }).toPromise())
      );
      const added = results.filter(Boolean) as ClientAvailability[];
      if (added.length) {
        this.scheduleAvailabilities.update(list => [...list, ...added]);
        this.schedulePreferredTimes.set(
          [...this.scheduleAvailabilities(), ...added].map(a => this.formatTime(a.start_time)).join(',')
        );
        this.newAvailabilityTimes.set([]);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add availability' });
    }
  }

  async removeAvailability(availId: string) {
    try {
      await this.schedulingService.deleteAvailability(availId).toPromise();
      this.scheduleAvailabilities.update(list => list.filter(a => a.id !== availId));
      this.schedulePreferredTimes.set(
        this.scheduleAvailabilities().filter(a => a.id !== availId).map(a => this.formatTime(a.start_time)).join(',')
      );
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove availability' });
    }
  }

  async findAndLock() {
    const plan = this.schedulingPlan();
    if (!plan || !this.scheduleDate()) return;
    // Auto-resolve instructor from vehicle if not set
    if (!this.scheduleInstructorId() && this.scheduleVehicleId()) {
      await this.onScheduleVehicleChange();
    }
    // If no instructor found, fall back to manual lock (skip availability check)
    if (!this.scheduleInstructorId()) {
      this.messageService.add({ severity: 'info', summary: 'No instructor', detail: 'No instructor in schedule — locking directly' });
      await this.lockManually();
      return;
    }
    this.scheduleLoading.set(true);
    this.scheduleResult.set(null);
    try {
      const times = this.schedulePreferredTimes()
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      const result = await this.schedulingService.findAndLock(plan.id, {
        instructor_id: this.scheduleInstructorId(),
        vehicle_id: this.scheduleVehicleId() || undefined,
        instructor_id_auto: this.scheduleInstructorIdAuto() || undefined,
        vehicle_id_auto: this.scheduleVehicleIdAuto() || undefined,
        start_date: this.formatDate(this.scheduleDate()!),
        preferred_times: times.length > 0 ? times : ['17:00'],
        manual_days: this.scheduleManualDays(),
      }).toPromise();
      this.scheduleResult.set(result ?? null);
      if (result?.locked) {
        await this.loadLessonPlans();
        this.messageService.add({ severity: 'success', summary: 'Locked', detail: `Schedule locked at ${result.start_time}` });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to find available slot' });
    } finally {
      this.scheduleLoading.set(false);
    }
  }

  async lockManually() {
    const plan = this.schedulingPlan();
    if (!plan || !this.scheduleDate()) return;
    if (this.scheduleManualDays() > 0 && !this.scheduleVehicleId()) {
      this.messageService.add({ severity: 'warn', summary: 'Missing', detail: 'Select a manual-phase vehicle first' });
      return;
    }
    // Try to resolve instructor from schedule as a convenience (optional)
    if (!this.scheduleInstructorId()) {
      await this.onScheduleVehicleChange();
    }
    this.scheduleLoading.set(true);
    try {
      const result = await this.schedulingService.lockSchedule(plan.id, {
        start_time: this.schedulePreferredTimes().split(',')[0]?.trim() || '17:00',
        instructor_id: this.scheduleInstructorId() || undefined,
        vehicle_id: this.scheduleVehicleId() || undefined,
        instructor_id_auto: this.scheduleInstructorIdAuto() || undefined,
        vehicle_id_auto: this.scheduleVehicleIdAuto() || undefined,
        start_date: this.formatDate(this.scheduleDate()!),
        manual_days: this.scheduleManualDays(),
      }).toPromise();
      await this.loadLessonPlans();
      this.messageService.add({ severity: 'success', summary: 'Locked', detail: `Schedule locked: ${result?.message}` });
      this.showScheduleDialog.set(false);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to lock schedule' });
    } finally {
      this.scheduleLoading.set(false);
    }
  }

  planIsLocked(plan: ClientLessonPlan): boolean {
    return plan.lessons.some(l => l.plan_locked_time != null);
  }

  async onScheduleVehicleChange() {
    const vid = this.scheduleVehicleId();
    const date = this.scheduleDate();
    if (!vid || !date) return;
    const times = this.schedulePreferredTimes().split(',').map(t => t.trim()).filter(t => t.length > 0);
    const firstTime = times[0] || '17:00';
    try {
      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1; // JS Sun=0 → Mon=0
      if (dayOfWeek > 4) return; // weekend
      const res = await this.vehicleScheduleService.resolveInstructor(vid, dayOfWeek, firstTime).toPromise();
      if (res?.instructor_id) {
        this.scheduleInstructorId.set(res.instructor_id);
      }
    } catch {
      // No instructor assigned for this time slot — leave as-is
    }
  }

  async onScheduleVehicleAutoChange() {
    const vid = this.scheduleVehicleIdAuto();
    const date = this.scheduleDate();
    if (!vid || !date) return;
    const times = this.schedulePreferredTimes().split(',').map(t => t.trim()).filter(t => t.length > 0);
    const firstTime = times[0] || '17:00';
    try {
      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
      if (dayOfWeek > 4) return;
      const res = await this.vehicleScheduleService.resolveInstructor(vid, dayOfWeek, firstTime).toPromise();
      if (res?.instructor_id) {
        this.scheduleInstructorIdAuto.set(res.instructor_id);
      }
    } catch {
      // No instructor assigned for this time slot — leave as-is
    }
  }

  planLockedTime(plan: ClientLessonPlan): string | null {
    const locked = plan.lessons.find(l => l.plan_locked_time != null);
    return locked?.plan_locked_time || null;
  }

  planScheduledDate(plan: ClientLessonPlan): string | null {
    const scheduled = plan.lessons.find(l => l.scheduled_date != null);
    return scheduled?.scheduled_date || null;
  }

  planInstructor(plan: ClientLessonPlan): string | null {
    const instructor = plan.lessons.find(l => l.instructor_id != null);
    return instructor?.instructor_id || null;
  }

  planVehicle(plan: ClientLessonPlan): string | null {
    const vehicle = plan.lessons.find(l => l.vehicle_id != null);
    return vehicle?.vehicle_id || null;
  }

  instructorName(phone: string | null): string {
    if (!phone) return '—';
    const user = this.availableInstructors().find(u => u.phone === phone);
    return user ? user.name : phone;
  }

  vehicleName(id: string | null): string {
    if (!id) return '—';
    const v = this.availableVehicles().find(v => v.id === id);
    return v ? `${v.name} (${v.plate_number})` : id;
  }

  async loadVehiclesAndInstructors() {
    try {
      const [instructors, vehicles] = await Promise.all([
        this.userService.list({ role: 'instructor', status: 'active', page_size: 100 }).toPromise(),
        this.vehicleService.list({ status: 'available' }).toPromise(),
      ]);
      this.availableInstructors.set(instructors?.users?.filter(u => u.role === 'instructor') || []);
      this.availableVehicles.set(vehicles || []);
    } catch { /* silent */ }
  }

  async addTemplateLessonToPlan(plan: ClientLessonPlan, templateItem: ClientLesson) {
    this.loading.set(true);
    try {
      await this.lessonPlanService.createClientPlan(plan.cart_item_id, {
        template_id: plan.template_id || undefined,
        transmission_type: plan.transmission_type,
        lessons: [{
          day_number: templateItem.day_number,
          week_number: templateItem.week_number,
          title: templateItem.title,
          lesson_objectives: templateItem.lesson_objectives || undefined,
          practical_objectives: templateItem.practical_objectives || undefined,
          order: plan.lessons.length + 1,
          is_active: true,
          preferred_location: templateItem.preferred_location ?? undefined,
          enforce_prerequisites: templateItem.enforce_prerequisites ?? true,
        }],
      }).toPromise();
      await this.loadLessonPlans();
      this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Lesson added to plan' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add lesson' });
    } finally {
      this.loading.set(false);
    }
  }

  async removeLessonFromPlan(lesson: ClientLesson) {
    this.confirmationService.confirm({
      message: `Remove "${lesson.title}" from the plan?`,
      header: 'Remove Lesson',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      accept: async () => {
        this.loading.set(true);
        try {
          await this.lessonPlanService.updateClientLesson(lesson.id, { is_active: false }).toPromise();
          this.updateLessonInList({ ...lesson, is_active: false });
          this.messageService.add({ severity: 'info', summary: 'Removed', detail: 'Lesson removed from plan' });
        } catch {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove lesson' });
        } finally {
          this.loading.set(false);
        }
      }
    });
  }

  async updateLessonStatus(lesson: ClientLesson, status: string) {
    try {
      const updated = await this.lessonPlanService.updateClientLesson(lesson.id, {
        status,
      }).toPromise();
      if (updated) this.updateLessonInList(updated);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update lesson status' });
    }
  }

  // ── Lesson Execution ──

  async openExecutionDialog(lesson: ClientLesson) {
    try {
      const updated = await this.lessonPlanService.startLesson(lesson.id).toPromise();
      if (!updated) { throw new Error('Failed to start lesson'); }
      this.updateLessonInList(updated);
      const timer = await this.lessonPlanService.startLessonTimer(lesson.id).toPromise();
      if (!timer) { throw new Error('Failed to start timer'); }
      this.executingLesson.set(updated);
      this.executionNotes.set('');
      this.executionTimeoutWarned.set(false);
      this.executionCheckedObjectives.set((updated.lesson_objectives || []).map(() => false));
      this.executionCheckedPractical.set((updated.practical_objectives || []).map(() => false));
      // Restore checked state from saved outcome if exists
      if (updated.outcome) {
        try {
          const saved = JSON.parse(updated.outcome);
          if (saved.objectives_checked?.length === (updated.lesson_objectives || []).length) {
            this.executionCheckedObjectives.set(saved.objectives_checked);
          }
          if (saved.practical_checked?.length === (updated.practical_objectives || []).length) {
            this.executionCheckedPractical.set(saved.practical_checked);
          }
        } catch {}
      }
      // Persist initial unchecked state
      this.syncCheckedObjectives();
      const totalSec = this._calcLessonTotalSeconds(updated);
      this.executionTotalSeconds.set(totalSec);
      this.executionElapsedSeconds.set(0);
      this.loadExecutionVideo(updated);
      this.loadUpcomingClients();
      this._startExecutionTimer();
      this.showExecutionDialog.set(true);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to start lesson' });
    }
  }

  async restoreExecutionDialog(lesson: ClientLesson) {
    try {
      const timer = await this.lessonPlanService.getLessonTimer(lesson.id).toPromise();
      if (!timer || !timer.started_at) { throw new Error('No saved timer'); }
      this.executingLesson.set(lesson);
      this.executionNotes.set(lesson.notes || '');
      this.executionTimeoutWarned.set(false);
      this.executionCheckedObjectives.set((lesson.lesson_objectives || []).map(() => false));
      this.executionCheckedPractical.set((lesson.practical_objectives || []).map(() => false));
      // Restore checked state from saved outcome
      if (lesson.outcome) {
        try {
          const saved = JSON.parse(lesson.outcome);
          if (saved.objectives_checked?.length === (lesson.lesson_objectives || []).length) {
            this.executionCheckedObjectives.set(saved.objectives_checked);
          }
          if (saved.practical_checked?.length === (lesson.practical_objectives || []).length) {
            this.executionCheckedPractical.set(saved.practical_checked);
          }
        } catch {}
      }
      const totalSec = this._calcLessonTotalSeconds(lesson);
      this.executionTotalSeconds.set(totalSec);
      const isPaused = !!timer.paused_at;
      this.executionIsPaused.set(isPaused);
      if (isPaused) {
        this.executionElapsedSeconds.set((timer.elapsed_minutes || 0) * 60);
        const total = this.executionTotalSeconds();
        const elapsed = this.executionElapsedSeconds();
        const remaining = Math.max(0, total - elapsed);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        this.executionTimerDisplay.set(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        this.executionProgress.set(total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0);
      } else {
        const startedAt = new Date(timer.started_at).getTime();
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        this.executionElapsedSeconds.set(elapsed);
      }
      this.loadExecutionVideo(lesson);
      this.loadUpcomingClients();
      if (!isPaused) {
        this._startExecutionTimer();
      }
      this.showExecutionDialog.set(true);
    } catch {
      this.openExecutionDialog(lesson);
    }
  }

  private _calcLessonTotalSeconds(lesson: ClientLesson): number {
    const total = (lesson.vehicle_inspection_minutes || 0)
      + (lesson.cockpit_drill_minutes || 0)
      + (lesson.video_illustration_minutes || 0)
      + (lesson.practical_driving_minutes || 0)
      + (lesson.assessment_minutes || 0);
    return (total > 0 ? total : 30) * 60;
  }

  private _startExecutionTimer() {
    this.executionIsRunning.set(true);
    this.executionIsPaused.set(false);
    if (this._executionTimerInterval) clearInterval(this._executionTimerInterval);
    this._executionTimerInterval = setInterval(() => {
      const elapsed = this.executionElapsedSeconds() + 1;
      this.executionElapsedSeconds.set(elapsed);
      const total = this.executionTotalSeconds();
      const remaining = Math.max(0, total - elapsed);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      this.executionTimerDisplay.set(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      this.executionProgress.set(total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0);
      if (remaining <= 300 && remaining > 0 && !this.executionTimeoutWarned()) {
        this.executionTimeoutWarned.set(true);
        this.messageService.add({ severity: 'warn', summary: 'Time', detail: '5 minutes remaining!' });
      }
      if (remaining <= 60 && remaining > 0) {
        this.messageService.add({ severity: 'warn', summary: 'Time', detail: '1 minute remaining!' });
      }
      if (remaining <= 0) {
        if (this.executionIsRunning()) {
          this.stopExecutionTimer();
          this.executionTimeoutWarned.set(true);
          this.messageService.add({ severity: 'warn', summary: 'Time Up', detail: 'Lesson time has expired. Enter notes and click End Lesson.' });
        }
        return;
      }
      if (elapsed % 15 === 0) {
        const execLesson = this.executingLesson();
        if (execLesson) {
          this.lessonPlanService.syncLessonTimer(execLesson.id, elapsed).subscribe({ error: () => {} });
        }
      }
    }, 1000);
  }

  stopExecutionTimer() {
    if (this._executionTimerInterval) {
      clearInterval(this._executionTimerInterval);
      this._executionTimerInterval = null;
    }
    this.executionIsRunning.set(false);
    this.executionIsPaused.set(false);
  }

  toggleObjectiveChecked(index: number) {
    this.executionCheckedObjectives.update(arr => {
      const a = [...arr];
      a[index] = !a[index];
      return a;
    });
    this.syncCheckedObjectives();
  }

  togglePracticalChecked(index: number) {
    this.executionCheckedPractical.update(arr => {
      const a = [...arr];
      a[index] = !a[index];
      return a;
    });
    this.syncCheckedObjectives();
  }

  private async syncCheckedObjectives() {
    const lesson = this.executingLesson();
    if (!lesson) return;
    const outcome = JSON.stringify({
      objectives_checked: this.executionCheckedObjectives(),
      practical_checked: this.executionCheckedPractical(),
    });
    try {
      const updated = await this.lessonPlanService.updateClientLesson(lesson.id, { outcome } as ClientLessonUpdate).toPromise();
      if (updated) this.updateLessonInList(updated);
    } catch {}
  }

  async pauseExecutionLesson() {
    await this.syncCheckedObjectives();
    this.stopExecutionTimer();
    this.executionIsPaused.set(true);
    const lesson = this.executingLesson();
    if (!lesson) return;
    try {
      await this.lessonPlanService.pauseLessonTimer(lesson.id).toPromise();
      this.messageService.add({ severity: 'info', summary: 'Paused', detail: 'Lesson timer paused' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to pause timer' });
    }
  }

  async resumeExecutionLesson() {
    const lesson = this.executingLesson();
    if (!lesson) return;
    try {
      await this.lessonPlanService.resumeLessonTimer(lesson.id).toPromise();
      this._startExecutionTimer();
      this.messageService.add({ severity: 'info', summary: 'Resumed', detail: 'Lesson timer resumed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to resume timer' });
    }
  }

  async endExecutionLesson() {
    this.stopExecutionTimer();
    const lesson = this.executingLesson();
    if (!lesson) return;
    // Auto-check any unchecked objectives
    const allChecked = this.executionCheckedObjectives().map(() => true);
    const allCheckedPractical = this.executionCheckedPractical().map(() => true);
    this.executionCheckedObjectives.set(allChecked);
    this.executionCheckedPractical.set(allCheckedPractical);
    const outcome = JSON.stringify({
      objectives_checked: allChecked,
      practical_checked: allCheckedPractical,
    });
    try {
      const updated = await this.lessonPlanService.completeLesson(lesson.id, outcome, this.executionNotes() || undefined).toPromise();
      if (updated) this.updateLessonInList(updated);
      this.messageService.add({ severity: 'success', summary: 'Completed', detail: 'Lesson completed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to complete lesson' });
    }
    this.closeExecutionDialog();
  }

  closeExecutionDialog() {
    this.stopExecutionTimer();
    this.showExecutionDialog.set(false);
    this.executingLesson.set(null);
    this.executionVideoUrl.set(null);
    this.executionVideoSource.set(null);
    this.showNotificationsPanel.set(false);
  }

  focusLesson(lesson: ClientLesson) {
    if (lesson.status === 'started') {
      this.restoreExecutionDialog(lesson);
    } else {
      this.openLessonDetail(lesson);
    }
  }

  async loadExecutionVideo(lesson: ClientLesson) {
    if (!lesson.lesson_library_id) return;
    try {
      const lib = await this.lessonLibraryService.get(lesson.lesson_library_id).toPromise();
      if (lib && lib.videos?.length) {
        const v = lib.videos[0];
        if (v.source === 'youtube' || v.source === 'vimeo') {
          this.executionVideoUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(v.url!));
          this.executionVideoSource.set(v.source);
        } else if (v.source === 'upload') {
          this.executionVideoUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.videoLibraryService.getStreamUrl(v.id)));
          this.executionVideoSource.set('upload');
        }
      }
    } catch { /* no video */ }
  }

  async loadUpcomingClients() {
    const current = this.consultation();
    if (!current) return;
    try {
      const res = await this.consultationService.list({ stage: 'active', page_size: 5 }).toPromise();
      const others = (res?.consultations || [])
        .filter(c => c.id !== current.id && c.cart_items?.some(ci => ci.requires_driving_training || ci.requires_theory_training))
        .slice(0, 2)
        .map(c => ({
          name: this.fullName(c),
          product: 'Training',
          transmission: '—',
        }));
      this.executionUpcomingClients.set(others);
    } catch { this.executionUpcomingClients.set([]); }
  }

  openLessonDetail(lesson: ClientLesson) {
    this.editingLesson.set(lesson);
    this.lessonEditForm = {
      day_number: lesson.day_number,
      week_number: lesson.week_number,
      title: lesson.title,
      lesson_objectives: lesson.lesson_objectives,
      practical_objectives: lesson.practical_objectives,
      is_active: lesson.is_active,
      status: lesson.status,
      vehicle_inspection_minutes: lesson.vehicle_inspection_minutes,
      cockpit_drill_minutes: lesson.cockpit_drill_minutes,
      video_illustration_minutes: lesson.video_illustration_minutes,
      practical_driving_minutes: lesson.practical_driving_minutes,
      assessment_minutes: lesson.assessment_minutes,
      driving_minutes: lesson.driving_minutes,
      theory_minutes: lesson.theory_minutes,
      mileage_km: lesson.mileage_km,
      is_theory: lesson.is_theory,
      combined_with_next: lesson.combined_with_next,
      skills_achieved: lesson.skills_achieved || [],
      notes: lesson.notes,
    };
    this.showLessonDetailDialog.set(true);
  }

  onLessonTheoryToggle() {
    // Reset session structure when toggling to theory
    if (this.lessonEditForm.is_theory) {
      this.lessonEditForm.vehicle_inspection_minutes = null;
      this.lessonEditForm.cockpit_drill_minutes = null;
      this.lessonEditForm.video_illustration_minutes = null;
      this.lessonEditForm.practical_driving_minutes = null;
      this.lessonEditForm.assessment_minutes = null;
    }
  }

  async saveLessonDetail() {
    const lesson = this.editingLesson();
    if (!lesson) return;
    this.loading.set(true);
    try {
      const updated = await this.lessonPlanService.updateClientLesson(lesson.id, this.lessonEditForm).toPromise();
      if (updated) {
        this.updateLessonInList(updated);
        this.editingLesson.set(updated);
      }
      this.showLessonDetailDialog.set(false);
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Lesson updated' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update lesson' });
    } finally {
      this.loading.set(false);
    }
  }

  async onPlanLessonsReorder(planId: string, event: any) {
    const reordered = event.value as ClientLesson[];
    const reorder = reordered.map((l, i) => ({
      id: l.id,
      order: i + 1,
    }));
    try {
      await this.lessonPlanService.bulkReorder(planId, { lessons: reorder }).toPromise();
      this.clientLessonPlans.update(map => {
        const next = new Map(map);
        for (const [key, plans] of next) {
          const idx = plans.findIndex(p => p.id === planId);
          if (idx !== -1) {
            const plan = { ...plans[idx] };
            plan.lessons = plan.lessons.map(l => {
              const updated = reordered.find(r => r.id === l.id);
              return updated ? { ...l, ...updated } : l;
            });
            const updatedPlans = [...plans];
            updatedPlans[idx] = plan;
            next.set(key, updatedPlans);
          }
        }
        return next;
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to reorder lessons' });
    }
  }

  selectedTemplateTpl() {
    const tid = this.lessonPlanForm.template_id;
    return this.templates().find(t => t.id === tid);
  }

  private updateLessonInList(updated: ClientLesson) {
    this.clientLessonPlans.update(map => {
      const next = new Map(map);
      const plans = [...(next.get(updated.lesson_plan_id) || [])];
      const planIdx = plans.findIndex(p => p.id === updated.lesson_plan_id);
      if (planIdx !== -1) {
        const plan = { ...plans[planIdx] };
        plan.lessons = plan.lessons.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        plans[planIdx] = plan;
        next.set(updated.lesson_plan_id, plans);
      }
      return next;
    });
  }

  fullName(c: { first_name: string; middle_name?: string | null; last_name?: string | null }): string {
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ');
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'contrast' {
    switch (s) {
      case 'new': return 'info';
      case 'consulting': return 'warn';
      case 'active': return 'success';
      case 'converted_new': case 'converted_upsold': case 'converted_completed': return 'success';
      case 'lost': return 'danger';
      default: return 'contrast';
    }
  }

  followUpStatusSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'contrast' {
    switch (s) {
      case 'pending': return 'warn';
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      default: return 'contrast';
    }
  }

  cartItemSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'contrast' {
    switch (s) {
      case 'interested': return 'info';
      case 'consulting': return 'warn';
      case 'converted': return 'success';
      case 'lost': return 'danger';
      default: return 'contrast';
    }
  }

  productName(ci: CartItemRead): string {
    const p = this.products().find(pr => pr.id === ci.product_id);
    return p?.name || ci.product_id;
  }

  packageName(ci: CartItemRead): string {
    if (!ci.package_id) return '';
    const p = this.products().find(pr => pr.id === ci.product_id);
    const pkg = p?.packages.find(pk => pk.id === ci.package_id);
    return pkg?.name || ci.package_id;
  }

  packagePrice(ci: CartItemRead): string {
    if (!ci.package_id) return '—';
    const p = this.products().find(pr => pr.id === ci.product_id);
    const pkg = p?.packages.find(pk => pk.id === ci.package_id);
    return pkg?.price != null ? `${pkg.price}` : '—';
  }

  cartItemTotal(ci: CartItemRead): number {
    if (!ci.package_id) return 0;
    const p = this.products().find(pr => pr.id === ci.product_id);
    const pkg = p?.packages.find(pk => pk.id === ci.package_id);
    return pkg?.price ?? 0;
  }

  cartItemPaid(ci: CartItemRead): number {
    return this.paidForProduct(ci);
  }

  cartItemBalance(ci: CartItemRead): number {
    return Math.max(0, this.cartItemTotal(ci) - this.cartItemPaid(ci));
  }

  productDuration(ci: CartItemRead): string {
    const p = this.products().find(pr => pr.id === ci.product_id);
    return p?.duration_label || '—';
  }

  packageDuration(ci: CartItemRead): string {
    if (!ci.package_id) return '—';
    const p = this.products().find(pr => pr.id === ci.product_id);
    const pkg = p?.packages.find(pk => pk.id === ci.package_id);
    return pkg?.duration_label || this.productDuration(ci);
  }

  cartItemActions(ci: CartItemRead): { label: string; status: string; severity: 'success' | 'warn' | 'danger' | 'info' | 'contrast'; icon: string }[] {
    switch (ci.status) {
      case 'interested':
        return [
          { label: 'Start Consulting', status: 'consulting', severity: 'warn', icon: 'pi pi-play' },
          { label: 'Mark Lost', status: 'lost', severity: 'danger', icon: 'pi pi-ban' },
        ];
      case 'consulting':
        return [
          { label: 'Complete Sale', status: 'convert', severity: 'success', icon: 'pi pi-check' },
          { label: 'Mark Lost', status: 'lost', severity: 'danger', icon: 'pi pi-ban' },
        ];
      case 'lost':
        return [
          { label: 'Recover', status: 'recover', severity: 'info', icon: 'pi pi-refresh' },
        ];
      default:
        return [];
    }
  }

  transitions(): { label: string; status: string; btnClass: string; icon: string }[] {
    const s = this.consultation()?.status;
    switch (s) {
      case 'new':
        return [
          { label: 'Start Consulting', status: 'consulting', btnClass: 'p-button-warning', icon: 'pi pi-play' },
          { label: 'Mark Lost', status: 'lost', btnClass: 'p-button-danger', icon: 'pi pi-ban' },
        ];
      case 'consulting':
        return [
          { label: 'Convert', status: 'active', btnClass: 'p-button-success', icon: 'pi pi-check' },
          { label: 'Mark Lost', status: 'lost', btnClass: 'p-button-danger', icon: 'pi pi-ban' },
        ];
      case 'active':
        return [
          { label: 'Complete Program', status: 'converted_completed', btnClass: 'p-button-success', icon: 'pi pi-check-circle' },
          { label: 'Mark Lost', status: 'lost', btnClass: 'p-button-danger', icon: 'pi pi-ban' },
        ];
      case 'converted_new':
        return [
          { label: 'Upsell', status: 'converted_upsold', btnClass: 'p-button-warning', icon: 'pi pi-plus' },
          { label: 'Complete', status: 'converted_completed', btnClass: 'p-button-success', icon: 'pi pi-check-circle' },
          { label: 'Mark Lost', status: 'lost', btnClass: 'p-button-danger', icon: 'pi pi-ban' },
        ];
      case 'converted_upsold':
        return [
          { label: 'Complete', status: 'converted_completed', btnClass: 'p-button-success', icon: 'pi pi-check-circle' },
          { label: 'Mark Lost', status: 'lost', btnClass: 'p-button-danger', icon: 'pi pi-ban' },
        ];
      default:
        return [];
    }
  }

  async transitionTo(status: string) {
    const c = this.consultation();
    if (!c) return;

    if (status === 'converted_new') {
      this.confirmationService.confirm({
        message: 'No products added yet. Add products before converting?',
        header: 'Convert Consultation',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Convert Anyway',
        rejectLabel: 'Add Products First',
        accept: () => this.doTransition(status),
        reject: () => this.openAddProduct(),
      });
      return;
    }

    if (status === 'converted_upsold') {
      this.openAddProduct();
      return;
    }

    this.doTransition(status);
  }

  private async doTransition(status: string) {
    const c = this.consultation();
    if (!c) return;
    this.loading.set(true);
    try {
      const updated = await this.consultationService.update(c.id, { status }).toPromise();
      if (updated) this.consultation.set(updated);
      this.messageService.add({ severity: 'success', summary: 'Status Updated', detail: `Transitioned to ${status}` });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to update status' });
    } finally {
      this.loading.set(false);
    }
  }

  // ── Multi-step Add to Cart ──────────────────────────────────────────

  openAddProduct() {
    if (this.followUpCheckIds().length > 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'Items Selected',
        detail: 'Click "Follow Up" to schedule a follow-up for selected products, or uncheck them to add new products.',
        life: 5000,
      });
      return;
    }

    // Pre-fill existing non-converted, non-lost cart items
    const existingItems = (this.consultation()?.cart_items || [])
      .filter(ci => ci.status === 'interested' || ci.status === 'consulting')
      .map(ci => {
        const p = this.products().find(pr => pr.id === ci.product_id);
        if (!p) return null;
        const pkg = ci.package_id ? p.packages.find(pk => pk.id === ci.package_id) : null;
        return {
          product: p,
          packageId: ci.package_id || null,
          price: pkg ? parseFloat(String(pkg.price)) || 0 : 0,
          packageName: pkg?.name || '',
          cartItemId: ci.id,
        };
      })
      .filter(Boolean) as { product: Product; packageId: string | null; price: number; packageName: string; cartItemId: string }[];

    this.selectedProduct.set(null);
    this.selectedPackageId.set(null);
    this.addSelectedProducts.set(existingItems);
    this.addNote.set('');
    this.addIsImportant.set(false);
    this.addNextFollowUpDate.set(null);
    this.addConvertNow.set(false);
    this.addPackageAllocations.set([]);
    this.addPaymentReceiptNumber.set('');
    this.addPaymentInstallments = [];
    this.addReceiptItems.set([]);
    this.addReceiptInstallments.set([]);
    this.addReceiptSystemNumber.set('');
    this.addReceiptManualNumber.set('');
    this.addReceiptPaymentIds = [];
    this.addReceiptTotalPaid.set(0);
    this.addReceiptDate.set('');
    this.addReceiptUserName.set('');
    this.addStep.set(1);
    this.showAddProductDialog.set(true);
  }

  addSelectedProductToList() {
    const product = this.selectedProduct();
    if (!product) return;
    const pkgId = this.selectedPackageId();

    // Check against current selection
    const inList = this.addSelectedProducts().some(
      sp => sp.product.id === product.id && sp.packageId === (pkgId || null)
    );
    if (inList) {
      this.messageService.add({ severity: 'warn', summary: 'Already added', detail: 'This product is already in the list' });
      return;
    }

    // Check against existing consultation cart items (to avoid backend rejection)
    const inCart = (this.consultation()?.cart_items || []).some(
      ci => ci.product_id === product.id && (ci.package_id ?? null) === (pkgId || null)
    );
    if (inCart) {
      this.messageService.add({ severity: 'warn', summary: 'Already in cart', detail: 'This product package already exists in the consultation. Remove it from the list first if you want to exclude it.' });
      return;
    }

    const pkg = pkgId ? product.packages.find(p => p.id === pkgId) : null;
    const price = pkg ? parseFloat(String(pkg.price)) || 0 : 0;
    const packageName = pkg?.name || '';
    this.addSelectedProducts.update(list => [...list, { product, packageId: pkgId || null, price, packageName }]);
    this.selectedProduct.set(null);
    this.selectedPackageId.set(null);
  }

  removeSelectedProduct(index: number) {
    this.addSelectedProducts.update(list => list.filter((_, i) => i !== index));
    this.addPackageAllocations.update(list => list.filter(a => a.productIndex !== index));
  }

  get addSelectedProductTotal(): number {
    return this.addSelectedProducts().reduce((sum, sp) => sum + sp.price, 0);
  }

  get addTotalAllocated(): number {
    return this.addPackageAllocations().reduce((sum, a) => sum + a.allocated, 0);
  }

  get addUnallocatedAmount(): number {
    return Math.max(0, this.addSelectedProductTotal - this.addTotalAllocated);
  }

  getAllocation(index: number): number {
    const alloc = this.addPackageAllocations().find(a => a.productIndex === index);
    return alloc?.allocated || 0;
  }

  updateAllocation(index: number, amount: number) {
    const sp = this.addSelectedProducts()[index];
    if (!sp) return;
    const maxForPackage = sp.price;
    const otherAllocations = this.addPackageAllocations()
      .filter(a => a.productIndex !== index)
      .reduce((sum, a) => sum + a.allocated, 0);
    const maxAllowed = this.addSelectedProductTotal - otherAllocations;
    const clamped = Math.max(0, Math.min(amount, maxForPackage, maxAllowed));
    this.addPackageAllocations.update(list => {
      const existing = list.findIndex(a => a.productIndex === index);
      if (existing >= 0) {
        const updated = [...list];
        updated[existing] = { ...updated[existing], allocated: clamped };
        return updated;
      } else {
        return [...list, { productIndex: index, allocated: clamped }];
      }
    });
  }

  onAllocationInput(index: number, event: any) {
    this.updateAllocation(index, event.value || 0);
    this.initAddPaymentInstallments();
  }

  get addTotalInstallmentAmount(): number {
    return this.addPaymentInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
  }

  get addInstallmentBalanceMatch(): boolean {
    return this.addTotalInstallmentAmount >= this.addUnallocatedAmount;
  }

  initAddPaymentInstallments() {
    const balance = this.addUnallocatedAmount;
    if (balance <= 0) {
      this.addPaymentInstallments = [];
      return;
    }
    const now = new Date();
    const half = Math.ceil(balance / 2);
    this.addPaymentInstallments = [
      { due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), amount: half },
      { due_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), amount: balance - half },
    ];
  }

  canCompleteAddPayment(): boolean {
    if (this.addTotalAllocated <= 0) return false;
    const receipt = this.addPaymentReceiptNumber();
    if (receipt && receipt.trim().length >= 2) {
      if (this.receiptChecking() || this.receiptAvailable() !== true) return false;
    }
    return true;
  }

  addPaymentInstallment() {
    const balance = this.addUnallocatedAmount;
    if (balance <= 0) return;
    const sumExisting = this.addPaymentInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    const last = this.addPaymentInstallments[this.addPaymentInstallments.length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.addPaymentInstallments = [...this.addPaymentInstallments, { due_date: nextDate, amount: prefill }];
  }

  removePaymentInstallment(index: number) {
    this.addPaymentInstallments = this.addPaymentInstallments.filter((_, i) => i !== index);
  }

  async validateAddReceipt() {
    const receipt = this.addPaymentReceiptNumber();
    if (!receipt || receipt.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await this.paymentService.checkReceipt(receipt.trim()).toPromise();
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  async nextAddStep() {
    if (this.addStep() === 1) {
      const products = this.addSelectedProducts();
      if (!products.length) {
        this.messageService.add({ severity: 'warn', summary: 'No products', detail: 'Add at least one product' });
        return;
      }
      if (this.addConvertNow()) {
        const allocs = products.map((sp, i) => ({
          productIndex: i,
          allocated: sp.price,
        }));
        this.addPackageAllocations.set(allocs);
        this.addPaymentInstallments = [];
        this.receiptChecking.set(false);
        this.receiptAvailable.set(null);
        this.addStep.set(2);
      } else {
        await this.finishAddProducts();
      }
    }
  }

  prevAddStep() {
    if (this.addStep() > 1) {
      this.addStep.update(s => s - 1);
    }
  }

  private async findOrCreateCartItem(
    c: Consultation,
    sp: { product: Product; packageId: string | null; packageName: string; price: number; cartItemId?: string },
  ): Promise<string | undefined> {
    if (sp.cartItemId) return sp.cartItemId;
    const existing = c.cart_items?.find(
      ci => ci.product_id === sp.product.id && (ci.package_id ?? null) === (sp.packageId ?? null),
    );
    if (existing) return existing.id;
    const item = await this.cartItemService.create(c.id, {
      product_id: sp.product.id,
      package_id: sp.packageId || undefined,
      notes: this.addNote() || undefined,
      is_important: this.addIsImportant(),
    }).toPromise();
    return item?.id;
  }

  async finishAddProducts() {
    const c = this.consultation();
    if (!c) return;
    this.loading.set(true);
    try {
      for (const sp of this.addSelectedProducts()) {
        const itemId = await this.findOrCreateCartItem(c, sp);

        if (itemId) {
          const userNote = this.addNote() || '';
          const isExistingItem = !!sp.cartItemId || !!(c.cart_items?.some(
            ci => ci.product_id === sp.product.id && (ci.package_id ?? null) === (sp.packageId ?? null),
          ));
          const note = isExistingItem ? (userNote || 'Still interested in this product') : (userNote || 'Follow up on this client');
          const convFu = await this.consultationService
            .createFollowUp(c.id, {
              follow_up_date: this.formatDate(new Date()),
              note,
              type: 'conversion',
              cart_item_ids: [itemId],
            })
            .toPromise();
          if (convFu) {
            await this.consultationService.updateFollowUp(convFu.id, { status: 'completed' }).toPromise();
          }
          if (this.addNextFollowUpDate()) {
            const nextDate = this.addNextFollowUpDate()!;
            await this.consultationService
              .createFollowUp(c.id, {
                follow_up_date: this.formatDate(nextDate),
                note: this.addNote() || undefined,
                type: 'conversion',
                cart_item_ids: [itemId],
              })
              .toPromise();
          }
        }
      }
      this.showAddProductDialog.set(false);
      await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Products added to cart' });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to add products' });
    } finally {
      this.loading.set(false);
    }
  }

  async completeAddPayment() {
    if (!this.canCompleteAddPayment()) return;
    const c = this.consultation();
    if (!c) return;

    this.loading.set(true);
    try {
      // Resolve cart item IDs: existing items use their ID, new items get created
      const itemIds: (string | undefined)[] = [];
      for (const sp of this.addSelectedProducts()) {
        const itemId = await this.findOrCreateCartItem(c, sp);
        itemIds.push(itemId);
      }

      // Create payments for each allocated product
      let systemReceipt = '';
      const paymentIds: string[] = [];
      const totalRemaining = this.addUnallocatedAmount;
      for (let i = 0; i < this.addSelectedProducts().length; i++) {
        const sp = this.addSelectedProducts()[i];
        const allocation = this.getAllocation(i);
        if (allocation <= 0) continue;

        const remaining = Math.max(0, sp.price - allocation);
        const isFullyPaid = remaining === 0;

        // Build installments: one immediate + proportionally distributed scheduled installments
        const installments: { due_date: string; amount: number }[] = [
          { due_date: this.formatDate(new Date()), amount: allocation },
        ];
        const scheduledInstallments = totalRemaining > 0
          ? this.addPaymentInstallments
              .filter(inst => inst.amount > 0 && inst.due_date)
              .map(inst => ({
                due_date: this.formatDate(inst.due_date!),
                amount: Math.round(inst.amount * (remaining / totalRemaining)),
              }))
              .filter(inst => inst.amount > 0)
          : [];
        installments.push(...scheduledInstallments);

        const paymentResult = await this.paymentService
          .createPayment(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
            total_amount: sp.price,
            notes: `Paid: ${allocation}, Balance: ${remaining}`,
            receipt_number: this.addPaymentReceiptNumber() || undefined,
            installments,
          })
          .toPromise();

        if (paymentResult) {
          paymentIds.push(paymentResult.id);
          if (!systemReceipt) {
            systemReceipt = paymentResult.system_receipt_number;
          }
        }

        // Mark first installment as paid
        if (paymentResult && paymentResult.installments.length) {
          await this.paymentService
            .updateInstallment(paymentResult.id, paymentResult.installments[0].id, {
              paid_date: this.formatDate(new Date()),
              paid_amount: allocation,
              notes: 'Paid in full',
            })
            .toPromise();
        }

        // Update cart item status
        const ciId = itemIds[i];
        if (ciId) {
          await this.cartItemService.update(ciId, {
            status: isFullyPaid ? 'converted_paid' : 'converted_paying',
          }).toPromise();
        }

        // Create payment follow-up if balance remains
        if (remaining > 0 && ciId) {
          const productLabel = `${sp.product.name}${sp.packageName ? ` (${sp.packageName})` : ''}`;
          if (scheduledInstallments.length) {
            for (const inst of scheduledInstallments) {
              await this.consultationService
                .createFollowUp(c.id, {
                  follow_up_date: inst.due_date,
                  note: `Collect installment of ${inst.amount} for ${productLabel}. Remaining: ${remaining}`,
                  type: 'payment',
                  cart_item_ids: [ciId],
                })
                .toPromise();
            }
          } else {
            const followUpDate = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
            await this.consultationService
              .createFollowUp(c.id, {
                follow_up_date: followUpDate,
                note: `Collect remaining balance of ${remaining} for ${productLabel}`,
                type: 'payment',
                cart_item_ids: [ciId],
              })
              .toPromise();
          }
        }
      }

      // Build receipt data
      const receiptItems = this.addSelectedProducts().map((sp, i) => {
        const allocation = this.getAllocation(i);
        return {
          productName: sp.product.name,
          packageName: sp.packageName,
          price: sp.price,
          paid: allocation,
          balance: Math.max(0, sp.price - allocation),
        };
      });

      // Build receipt installment data
      const receiptInsts = this.addPaymentInstallments
        .filter(inst => inst.due_date && inst.amount > 0)
        .map(inst => ({
          due_date: inst.due_date!.toLocaleDateString(),
          amount: inst.amount,
          product_name: this.addSelectedProducts().map(sp => sp.product.name).join(', '),
        }));

      this.addReceiptItems.set(receiptItems);
      this.addReceiptInstallments.set(receiptInsts);
      this.addReceiptSystemNumber.set(systemReceipt);
      this.addReceiptManualNumber.set(this.addPaymentReceiptNumber());
      this.addReceiptPaymentIds = paymentIds;
      this.addReceiptTotalPaid.set(this.addTotalAllocated);
      this.addReceiptDate.set(new Date().toLocaleDateString());
      const currentUser = (this as any).authService?.currentUser?.();
      this.addReceiptUserName.set(currentUser || 'System');
      this.addStep.set(3);

      await this.loadConsultation(c.id);
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to process payment' });
    } finally {
      this.loading.set(false);
    }
  }

  printAddReceipt() {
    const receiptContent = document.getElementById('add-receipt-content');
    if (!receiptContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: monospace; padding: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd; }
        .header { text-align: center; margin-bottom: 20px; }
        .total { font-weight: bold; border-top: 2px solid #000; }
      </style></head><body>
      ${receiptContent.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  printLessonPlan(ci: CartItemRead, plan: ClientLessonPlan) {
    this.printPreviewData.set({ ci, plan });
    this.printShowObjectives.set(true);
    this.printShowPractical.set(true);
    this.showPrintPreview.set(true);
    this.updatePrintPreviewUrl();
  }

  togglePrintOption(field: 'objectives' | 'practical') {
    if (field === 'objectives') this.printShowObjectives.update(v => !v);
    else this.printShowPractical.update(v => !v);
    this.updatePrintPreviewUrl();
  }

  private updatePrintPreviewUrl() {
    if (this._printPreviewObjectUrl) {
      URL.revokeObjectURL(this._printPreviewObjectUrl);
      this._printPreviewObjectUrl = null;
    }
    const html = this._buildFullPrintHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this._printPreviewObjectUrl = url;
    this.printPreviewHtml.set(url);
  }

  doPrint() {
    const html = this._buildFullPrintHtml();
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  private _buildFullPrintHtml(): string {
    const data = this.printPreviewData();
    const ci = data.ci;
    const plan = data.plan;
    if (!ci || !plan) return '';
    const consultation = this.consultation();
    if (!consultation) return '';
    const studentName = this.fullName(consultation);
    const prodName = this.productName(ci);
    const pkgName = this.packageName(ci);
    const startDate = plan.start_date ? new Date(plan.start_date).toLocaleDateString() : '—';
    const transmission = plan.transmission_type === 'manual' ? 'Manual'
      : plan.transmission_type === 'automatic' ? 'Automatic' : 'Manual/Automatic';
    const activeLessons = plan.lessons.filter(l => l.is_active).sort((a, b) => a.order - b.order);

    const statusLabel = (s: string) => {
      switch (s) {
        case 'completed': return 'Completed';
        case 'in_progress': return 'In Progress';
        case 'skipped': return 'Skipped';
        case 'cancelled': return 'Cancelled';
        case 'carried_over': return 'Carried Over';
        case 'makeup': return 'Makeup';
        case 'excused': return 'Excused';
        case 'partially_completed': return 'Partial';
        default: return 'Pending';
      }
    };

    const showObjectives = this.printShowObjectives();
    const showPractical = this.printShowPractical();

    const rows = activeLessons.map(l => {
      let extra = '';
      if ((showObjectives && l.lesson_objectives?.length) || (showPractical && l.practical_objectives?.length)) {
        extra += '<div style="margin-top:4px;font-size:11px;color:#555;">';
        if (showObjectives && l.lesson_objectives?.length) {
          extra += '<div><strong>Objectives:</strong> ' + l.lesson_objectives.join(', ') + '</div>';
        }
        if (showPractical && l.practical_objectives?.length) {
          extra += '<div><strong>Practical:</strong> ' + l.practical_objectives.join(', ') + '</div>';
        }
        extra += '</div>';
      }
      return `
      <tr>
        <td style="padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top;">${l.day_number}</td>
        <td style="padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top;">${l.week_number}</td>
        <td style="padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top;">${l.title}${l.difficulty ? ' <span style="color:#888;font-size:11px;">(' + l.difficulty + ')</span>' : ''}${l.is_theory ? ' <span style="color:#2563eb;font-size:11px;">[Theory]</span>' : ''}</td>
        <td style="padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top;">${statusLabel(l.status)}</td>
      </tr>
      ${extra ? `<tr><td colspan="4" style="padding:0 8px 6px; border-bottom: 1px solid #eee;">${extra}</td></tr>` : ''}`;
    }).join('');

    return `<!DOCTYPE html>
<html><head><title>Lesson Plan — ${studentName}</title>
<style>
  @page { size: A4 portrait; margin: 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 0; font-size: 12px; color: #333; margin: 0; }
  @media screen {
    body { max-width: 210mm; margin: 20mm auto; background: #fff; min-height: 297mm; padding: 0 20mm; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
  }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 12px; }
  .header h1 { font-size: 20px; margin: 0; }
  .header h2 { font-size: 14px; margin: 4px 0 0; color: #555; font-weight: normal; }
  .info-row { margin-bottom: 20px; }
  .info-row table { width: 100%; border-collapse: collapse; }
  .info-row td { padding: 4px 16px 4px 0; vertical-align: top; }
  .info-row label { font-weight: bold; font-size: 10px; color: #777; text-transform: uppercase; display: block; margin-bottom: 1px; letter-spacing: 0.5px; }
  .info-row span { font-size: 13px; }
  table.lessons { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.lessons th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #555; border-bottom: 2px solid #ddd; letter-spacing: 0.5px; }
  table.lessons td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
  .footer { margin-top: 24px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head><body>
  <div class="header">
    <h1>Lesson Plan</h1>
    <h2>${studentName}</h2>
  </div>
  <div class="info-row">
    <table><tr>
      <td><label>Product</label><span>${prodName}${pkgName ? ' — ' + pkgName : ''}</span></td>
      <td><label>Transmission</label><span>${transmission}</span></td>
      <td><label>Start Date</label><span>${startDate}</span></td>
      <td><label>Plan Status</label><span>${plan.status === 'completed' ? 'Completed' : 'Active'}${plan.is_extension ? ' (Extension)' : ''}</span></td>
    </tr></table>
  </div>
  <table class="lessons">
    <thead>
      <tr><th style="width:10%">Day</th><th style="width:10%">Week</th><th>Lesson</th><th style="width:14%">Status</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:20px;">No active lessons.</td></tr>'}
    </tbody>
  </table>
  <div class="footer">Generated on ${new Date().toLocaleDateString()} — Driving School CRM</div>
</body></html>`;
  }

  closeAddReceipt() {
    this.showAddProductDialog.set(false);
    this.addStep.set(1);
    this.addReceiptPaymentIds = [];
  }

  async updateCartItemStatus(ci: CartItemRead, status: string) {
    if (status === 'recover') {
      this.recoverTarget.set(ci);
      this.recoverReason.set('');
      this.showRecoverDialog.set(true);
      return;
    }
    if (status === 'lost') {
      this.markLostTarget.set(ci);
      this.markLostNote.set('');
      this.showMarkLostDialog.set(true);
      return;
    }
    if (status === 'convert') {
      this.openCompleteSaleDialog(ci);
      return;
    }
    this.loading.set(true);
    try {
      await this.cartItemService.update(ci.id, { status }).toPromise();
      const c = this.consultation();
      if (c) await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Updated', detail: `Cart item status changed to ${status}` });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to update cart item' });
    } finally {
      this.loading.set(false);
    }
  }

  async saveMarkLost() {
    const ci = this.markLostTarget();
    const c = this.consultation();
    if (!ci || !c) return;
    this.loading.set(true);
    try {
      const note = this.markLostNote() || 'Marked as lost';
      await this.consultationService
        .createFollowUp(c.id, {
          follow_up_date: this.formatDate(new Date()),
          note,
          type: 'conversion',
          cart_item_ids: [ci.id],
        })
        .toPromise();
      await this.cartItemService.update(ci.id, { status: 'lost' }).toPromise();
      this.showMarkLostDialog.set(false);
      this.markLostTarget.set(null);
      this.markLostNote.set('');
      await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Lost', detail: 'Cart item marked as lost' });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to mark as lost' });
    } finally {
      this.loading.set(false);
    }
  }

  openCompleteSaleDialog(ci: CartItemRead) {
    const p = this.products().find(pr => pr.id === ci.product_id);
    const pkg = ci.package_id ? p?.packages.find(pk => pk.id === ci.package_id) : null;
    const total = pkg?.price || 0;
    this.completeSaleTarget.set(ci);
    this.completeSaleTotal.set(total);
    this.completeSalePaidAmount.set(total);
    this.completeSaleBalance.set(0);
    this.completeSaleInstallments = [];
    this.completeSaleReceiptNumber.set('');
    this.completeSaleSystemReceiptNumber.set('');
    this.completeSaleDocumentDate.set(null);
    this.receiptChecking.set(false);
    this.receiptAvailable.set(null);
    this.showCompleteSaleDialog.set(true);
  }

  onCompleteSalePaidChange() {
    const total = this.completeSaleTotal();
    const paid = this.completeSalePaidAmount();
    const balance = Math.max(0, total - (paid || 0));
    this.completeSaleBalance.set(balance);
  }

  addCompleteSaleInstallment() {
    const balance = this.completeSaleBalance();
    const sumExisting = this.completeSaleInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    const last = this.completeSaleInstallments[this.completeSaleInstallments.length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.completeSaleInstallments = [...this.completeSaleInstallments, { due_date: nextDate, amount: prefill }];
  }

  removeCompleteSaleInstallment(index: number) {
    const removed = this.completeSaleInstallments[index];
    const rest = this.completeSaleInstallments.filter((_, i) => i !== index);
    if (rest.length && removed) {
      const balance = this.completeSaleBalance();
      const sumRest = rest.reduce((s, inst) => s + (inst.amount || 0), 0);
      const lastIdx = rest.length - 1;
      rest[lastIdx] = { ...rest[lastIdx], amount: Math.max(0, balance - (sumRest - (rest[lastIdx].amount || 0))) };
    }
    this.completeSaleInstallments = [...rest];
  }

  async validateReceipt() {
    const receipt = this.completeSaleReceiptNumber();
    if (!receipt || receipt.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await this.paymentService.checkReceipt(receipt.trim()).toPromise();
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  canCompleteSale(): boolean {
    const paid = this.completeSalePaidAmount();
    if (!paid || paid <= 0) return false;
    const receipt = this.completeSaleReceiptNumber();
    if (receipt && receipt.trim().length >= 2) {
      if (this.receiptChecking() || this.receiptAvailable() !== true) return false;
    }
    return true;
  }

  canAddCompleteSaleInstallment(): boolean {
    const balance = this.completeSaleBalance();
    if (balance <= 0) return false;
    const sum = this.completeSaleInstallments.reduce((s, i) => s + (i.amount || 0), 0);
    return sum < balance;
  }

  async completeSale() {
    const ci = this.completeSaleTarget();
    const c = this.consultation();
    if (!ci || !c) return;

    const total = this.completeSaleTotal();
    const paid = this.completeSalePaidAmount();
    if (paid === null || paid === undefined || paid < 0) return;

    const remaining = Math.max(0, total - paid);
    const status = remaining === 0 ? 'converted_paid' : 'converted_paying';

    this.loading.set(true);
    try {
      const installments = this.completeSaleInstallments
        .filter(inst => inst.amount > 0 && inst.due_date)
        .map(inst => ({
          due_date: this.formatDate(inst.due_date!),
          amount: inst.amount,
        }));

      const paymentResult = await this.paymentService
        .createPayment(c.id, {
          product_id: ci.product_id,
          package_id: ci.package_id || undefined,
          total_amount: total,
          notes: `Paid: ${paid}, Balance: ${remaining}`,
          receipt_number: this.completeSaleReceiptNumber() || undefined,
          installments,
          document_date: this.completeSaleDocumentDate() ? this.formatDate(this.completeSaleDocumentDate()!) : undefined,
        })
        .toPromise();

      const systemReceipt = paymentResult?.system_receipt_number || 'N/A';
      const receiptId = paymentResult?.id;
      this.completeSaleSystemReceiptNumber.set(systemReceipt);

      await this.cartItemService.update(ci.id, { status }).toPromise();

      this.showCompleteSaleDialog.set(false);
      this.completeSaleTarget.set(null);
      await this.loadConsultation(c.id);

      if (receiptId) {
        this.openReceipt(receiptId);
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Sale Completed',
        detail: `Receipt: ${systemReceipt}`,
      });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to complete sale' });
    } finally {
      this.loading.set(false);
    }
  }

  openMakePaymentDialog(ci: CartItemRead) {
    const balance = this.cartItemBalance(ci);
    if (balance <= 0) return;
    this.makePaymentTarget.set(ci);
    this.makePaymentAmount.set(balance);
    this.makePaymentBalance.set(balance);
    this.makePaymentReceiptNumber.set('');
    this.makePaymentDocumentDate.set(null);
    this.makePaymentInstallments = [];
    this.receiptChecking.set(false);
    this.receiptAvailable.set(null);
    this.showMakePaymentDialog.set(true);
  }

  async makePayment() {
    const ci = this.makePaymentTarget();
    const c = this.consultation();
    if (!ci || !c) return;
    const amount = this.makePaymentAmount();
    if (!amount || amount <= 0) return;

    this.loading.set(true);
    try {
      const installments = [
        { due_date: this.formatDate(new Date()), amount },
        ...this.makePaymentInstallments
          .filter(inst => inst.amount > 0 && inst.due_date)
          .map(inst => ({
            due_date: this.formatDate(inst.due_date!),
            amount: inst.amount,
          })),
      ];

      const paymentResult = await this.paymentService
        .createPayment(c.id, {
          product_id: ci.product_id,
          package_id: ci.package_id || undefined,
          total_amount: amount + this.makePaymentInstallmentTotal,
          notes: `Additional payment of ${amount}`,
          receipt_number: this.makePaymentReceiptNumber() || undefined,
          installments,
          document_date: this.makePaymentDocumentDate() ? this.formatDate(this.makePaymentDocumentDate()!) : undefined,
        })
        .toPromise();

      if (paymentResult?.installments.length) {
        await this.paymentService
          .updateInstallment(paymentResult.id, paymentResult.installments[0].id, {
            paid_date: this.formatDate(new Date()),
            paid_amount: amount,
            notes: 'Paid',
          })
          .toPromise();
      }

      this.showMakePaymentDialog.set(false);
      this.makePaymentTarget.set(null);
      this.makePaymentInstallments = [];
      await this.loadConsultation(c.id);

      // Check if fully paid after refresh
      const updatedCartItems = this.consultation()?.cart_items || [];
      const updatedCi = updatedCartItems.find(item => item.id === ci.id);
      const totalPaid = this.paidForProduct(ci);
      const totalAmt = this.cartItemTotal(ci);
      const receiptId = paymentResult?.id;
      if (totalPaid >= totalAmt && updatedCi?.status === 'converted_paying') {
        await this.cartItemService.update(ci.id, { status: 'converted_paid' }).toPromise();
        await this.loadConsultation(c.id);
      }

      if (receiptId) {
        this.openReceipt(receiptId);
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Payment Recorded',
        detail: `Payment of ${amount} recorded`,
      });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to process payment' });
    } finally {
      this.loading.set(false);
    }
  }

  closeMakePaymentDialog() {
    this.showMakePaymentDialog.set(false);
    this.makePaymentTarget.set(null);
    this.makePaymentInstallments = [];
  }

  get makePaymentRemainingBalance(): number {
    return Math.max(0, this.makePaymentBalance() - (this.makePaymentAmount() || 0));
  }

  get makePaymentInstallmentTotal(): number {
    return this.makePaymentInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
  }

  get makePaymentInstallmentBalanceMatch(): boolean {
    return this.makePaymentInstallmentTotal >= this.makePaymentRemainingBalance;
  }

  onMakePaymentAmountChange() {
    this.makePaymentInstallments = [];
    if (this.makePaymentRemainingBalance > 0) {
      this.addMakePaymentInstallment();
    }
  }

  addMakePaymentInstallment() {
    const balance = this.makePaymentRemainingBalance;
    const sumExisting = this.makePaymentInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    const last = this.makePaymentInstallments[this.makePaymentInstallments.length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.makePaymentInstallments = [...this.makePaymentInstallments, { due_date: nextDate, amount: prefill }];
  }

  removeMakePaymentInstallment(index: number) {
    const removed = this.makePaymentInstallments[index];
    const rest = this.makePaymentInstallments.filter((_, i) => i !== index);
    if (rest.length && removed) {
      const balance = this.makePaymentRemainingBalance;
      const sumRest = rest.reduce((s, inst) => s + (inst.amount || 0), 0);
      const lastIdx = rest.length - 1;
      rest[lastIdx] = { ...rest[lastIdx], amount: Math.max(0, balance - (sumRest - (rest[lastIdx].amount || 0))) };
    }
    this.makePaymentInstallments = [...rest];
  }

  async validateMakePaymentReceipt() {
    const receipt = this.makePaymentReceiptNumber();
    if (!receipt || receipt.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await this.paymentService.checkReceipt(receipt.trim()).toPromise();
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  pendingPayAllItems(): CartItemRead[] {
    return this.paidCartItems().filter(ci => this.cartItemBalance(ci) > 0);
  }

  openPayAllDialog() {
    const items = this.pendingPayAllItems().map(ci => ({
      cartItem: ci,
      payNow: this.cartItemBalance(ci),
      balance: this.cartItemBalance(ci),
      productName: this.productName(ci),
      packageName: this.packageName(ci) || '',
    }));
    if (!items.length) return;
    this.payAllItems.set(items);
    this.payAllReceiptNumber.set('');
    this.payAllInstallments = [];
    this.payAllDocumentDate.set(null);
    this.receiptChecking.set(false);
    this.receiptAvailable.set(null);
    this.initPayAllInstallments();
    this.showPayAllDialog.set(true);
  }

  payAllTotal(): number {
    return this.payAllItems().reduce((s, it) => s + (it.payNow || 0), 0);
  }

  get payAllRemainingBalance(): number {
    return this.payAllItems().reduce((s, it) => s + Math.max(0, it.balance - (it.payNow || 0)), 0);
  }

  get payAllInstallmentTotal(): number {
    return this.payAllInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
  }

  get payAllInstallmentBalanceMatch(): boolean {
    return this.payAllInstallmentTotal >= this.payAllRemainingBalance;
  }

  initPayAllInstallments() {
    const balance = this.payAllRemainingBalance;
    if (balance <= 0) {
      this.payAllInstallments = [];
      return;
    }
    const now = new Date();
    const half = Math.ceil(balance / 2);
    this.payAllInstallments = [
      { due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), amount: half },
      { due_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), amount: balance - half },
    ];
  }

  addPayAllInstallment() {
    const balance = this.payAllRemainingBalance;
    if (balance <= 0) return;
    const sumExisting = this.payAllInstallments.reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    const last = this.payAllInstallments[this.payAllInstallments.length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.payAllInstallments = [...this.payAllInstallments, { due_date: nextDate, amount: prefill }];
  }

  removePayAllInstallment(index: number) {
    this.payAllInstallments = this.payAllInstallments.filter((_, i) => i !== index);
  }

  onPayAllInput() {
    this.initPayAllInstallments();
  }

  async validatePayAllReceipt() {
    const receipt = this.payAllReceiptNumber();
    if (!receipt || receipt.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await this.paymentService.checkReceipt(receipt.trim()).toPromise();
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  async payAll() {
    const c = this.consultation();
    if (!c) return;
    const items = this.payAllItems().filter(it => it.payNow > 0);
    if (!items.length) return;

    const receipt = this.payAllReceiptNumber();
    if (receipt && receipt.trim().length >= 2 && this.receiptAvailable() !== true) return;

    this.loading.set(true);
    const receiptIds: string[] = [];
    const totalRemaining = this.payAllRemainingBalance;
    try {
      for (const it of items) {
        const ci = it.cartItem;
        const amount = it.payNow;
        const remaining = Math.max(0, it.balance - amount);

        // Build installments: one immediate + proportionally distributed scheduled
        const installments: { due_date: string; amount: number }[] = [
          { due_date: this.formatDate(new Date()), amount },
        ];
        if (totalRemaining > 0 && remaining > 0) {
          const scheduled = this.payAllInstallments
            .filter(inst => inst.amount > 0 && inst.due_date)
            .map(inst => ({
              due_date: this.formatDate(inst.due_date!),
              amount: Math.round(inst.amount * (remaining / totalRemaining)),
            }))
            .filter(inst => inst.amount > 0);
          installments.push(...scheduled);
        }

        const paymentResult = await this.paymentService
          .createPayment(c.id, {
            product_id: ci.product_id,
            package_id: ci.package_id || undefined,
            total_amount: amount + remaining,
            notes: `Bulk payment of ${amount}`,
            receipt_number: receipt || undefined,
            installments,
            document_date: this.payAllDocumentDate() ? this.formatDate(this.payAllDocumentDate()!) : undefined,
          })
          .toPromise();

        if (paymentResult?.installments.length) {
          await this.paymentService
            .updateInstallment(paymentResult.id, paymentResult.installments[0].id, {
              paid_date: this.formatDate(new Date()),
              paid_amount: amount,
              notes: 'Paid',
            })
            .toPromise();
        }
        if (paymentResult?.id) receiptIds.push(paymentResult.id);
      }

      this.showPayAllDialog.set(false);
      this.payAllItems.set([]);
      await this.loadConsultation(c.id);

      // Update any fully paid cart items
      for (const it of items) {
        const ci = it.cartItem;
        const totalPaid = this.paidForProduct(ci);
        const totalAmt = this.cartItemTotal(ci);
        const updatedCi = this.consultation()?.cart_items?.find(item => item.id === ci.id);
        if (totalPaid >= totalAmt && updatedCi?.status === 'converted_paying') {
          await this.cartItemService.update(ci.id, { status: 'converted_paid' }).toPromise();
        }
      }
      await this.loadConsultation(c.id);

      if (receipt) {
        this.openConsolidatedAddReceipt(receipt);
      } else {
        for (const id of receiptIds) {
          if (id) this.openReceipt(id);
        }
      }

      this.messageService.add({ severity: 'success', summary: 'Payments Recorded', detail: `${items.length} payment(s) recorded` });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to process payments' });
    } finally {
      this.loading.set(false);
    }
  }

  closePayAllDialog() {
    this.showPayAllDialog.set(false);
    this.payAllItems.set([]);
    this.payAllInstallments = [];
  }

  async saveRecover() {
    const ci = this.recoverTarget();
    if (!ci || !this.recoverReason()) return;
    this.loading.set(true);
    try {
      await this.cartItemService.update(ci.id, { status: 'consulting', recovery_reason: this.recoverReason() }).toPromise();
      this.showRecoverDialog.set(false);
      this.recoverTarget.set(null);
      this.recoverReason.set('');
      const c = this.consultation();
      if (c) await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Recovered', detail: 'Cart item recovered' });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to recover' });
    } finally {
      this.loading.set(false);
    }
  }

  async removeCartItem(ci: CartItemRead) {
    if (ci.status === 'converted' || ci.status === 'converted_paid' || ci.status === 'converted_paying') {
      this.messageService.add({ severity: 'warn', summary: 'Cannot delete', detail: 'This product is already converted' });
      return;
    }
    this.loading.set(true);
    try {
      await this.cartItemService.remove(ci.id).toPromise();
      const c = this.consultation();
      if (c) await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Removed', detail: 'Cart item removed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove cart item' });
    } finally {
      this.loading.set(false);
    }
  }

  openEdit() {
    const c = this.consultation();
    if (!c) return;
    this.editForm = {
      first_name: c.first_name,
      middle_name: c.middle_name,
      last_name: c.last_name,
      phone: c.phone,
      location: c.location,
      how_they_knew_us: c.how_they_knew_us,
      interest_level: c.interest_level,
      start_date: c.start_date,
      notes: c.notes,
      status: c.status,
    };
    this.showEditDialog.set(true);
  }

  async saveEdit() {
    const c = this.consultation();
    if (!c) return;
    this.loading.set(true);
    try {
      const updated = await this.consultationService.update(c.id, this.editForm).toPromise();
      if (updated) this.consultation.set(updated);
      this.showEditDialog.set(false);
      this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Consultation saved' });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to update' });
    } finally {
      this.loading.set(false);
    }
  }

  confirmMarkLost() {
    const c = this.consultation();
    if (!c) return;
    this.confirmationService.confirm({
      message: 'Mark this consultation as lost?',
      header: 'Mark Lost',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.doTransition('lost'),
    });
  }

  openAddFollowUp() {
    this.followUpForm = { follow_up_date: null, note: '', type: 'conversion', cart_item_ids: [] };
    this.showFollowUpDialog.set(true);
  }

  async saveFollowUp() {
    const c = this.consultation();
    if (!c || !this.followUpForm.follow_up_date || !this.followUpForm.cart_item_ids.length) return;
    this.loading.set(true);
    try {
      await this.consultationService
        .createFollowUp(c.id, {
          follow_up_date: this.formatDate(this.followUpForm.follow_up_date),
          note: this.followUpForm.note || undefined,
          type: this.followUpForm.type || undefined,
          cart_item_ids: this.followUpForm.cart_item_ids,
        })
        .toPromise();
      this.showFollowUpDialog.set(false);
      this.clearFollowUpCheck();
      await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Follow-up added' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add follow-up' });
    } finally {
      this.loading.set(false);
    }
  }

  openCompleteFollowUp(fu: FollowUp) {
    this.completingFollowUp.set(fu);
    this.completeFollowUpForm = { note: '', next_follow_up_date: null };
    this.showCompleteFollowUpDialog.set(true);
  }

  async saveCompleteFollowUp() {
    const fu = this.completingFollowUp();
    const c = this.consultation();
    if (!fu || !c) return;

    this.loading.set(true);
    try {
      await this.consultationService
        .updateFollowUp(fu.id, {
          status: 'completed',
          note: this.completeFollowUpForm.note || undefined,
        })
        .toPromise();

      if (this.completeFollowUpForm.next_follow_up_date) {
        const nextDate = this.completeFollowUpForm.next_follow_up_date;
        const userNote = this.completeFollowUpForm.note || '';
        await this.consultationService
          .createFollowUp(c.id, {
            follow_up_date: this.formatDate(nextDate),
            note: userNote || undefined,
            type: fu.type,
            cart_item_ids: fu.cart_item_ids,
          })
          .toPromise();
      }

      this.showCompleteFollowUpDialog.set(false);
      this.clearFollowUpCheck();
      await this.loadConsultation(c.id);
      this.messageService.add({ severity: 'success', summary: 'Completed', detail: 'Follow-up completed' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to complete follow-up' });
    } finally {
      this.loading.set(false);
    }
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  relativeDuration(from: Date, to: Date): string {
    const diffMs = to.getTime() - from.getTime();
    if (diffMs <= 0) return '';
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    if (weeks >= 1) return `${weeks}W`;
    if (days >= 1) return `${days}d`;
    if (hours >= 1) return `${hours}h`;
    if (minutes >= 1) return `${minutes}min`;
    return '';
  }

  timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    if (diffMs < 0) return 'just now';
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 365) { const y = Math.floor(days / 365); return `${y} year${y > 1 ? 's' : ''} ago`; }
    if (days >= 30) { const m = Math.floor(days / 30); return `${m} month${m > 1 ? 's' : ''} ago`; }
    if (days >= 7) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago`; }
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  toggleCartItemSelection(ciId: string) {
    const idx = this.followUpForm.cart_item_ids.indexOf(ciId);
    if (idx >= 0) {
      this.followUpForm.cart_item_ids.splice(idx, 1);
    } else {
      this.followUpForm.cart_item_ids.push(ciId);
    }
  }

  isCartItemSelected(ciId: string): boolean {
    return this.followUpForm.cart_item_ids.includes(ciId);
  }

  ciDisableFollowUpCheck(ci: CartItemRead): boolean {
    return ci.status === 'lost' || ci.status === 'converted' || ci.status === 'converted_paid' || ci.status === 'converted_paying';
  }

  balanceInfo(ciId: string): { label: string; total: number; paid: number; balance: number } | null {
    const ci = this.consultation()?.cart_items?.find(c => c.id === ciId);
    if (!ci) return null;
    const label = this.productName(ci) + (this.packageName(ci) ? ` (${this.packageName(ci)})` : '');
    const total = this.totalForProduct(ci);
    const paid = this.paidForProduct(ci);
    return { label, total, paid, balance: total - paid };
  }

  paidCartItems(): CartItemRead[] {
    const items = this.consultation()?.cart_items || [];
    return items.filter(ci => ci.status === 'converted_paid' || ci.status === 'converted_paying');
  }

  paymentsForProduct(ci: CartItemRead): PaymentRead[] {
    return this.payments().filter(pay =>
      pay.product_id === ci.product_id &&
      (ci.package_id ? pay.package_id === ci.package_id : !pay.package_id)
    );
  }

  latestPaymentForCartItem(ci: CartItemRead): PaymentRead | null {
    const pays = this.paymentsForProduct(ci);
    if (!pays.length) return null;
    return [...pays].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }

  paidForProduct(ci: CartItemRead): number {
    const pays = this.paymentsForProduct(ci);
    if (!pays.length) return 0;
    return pays.reduce((s, p) => s + parseFloat(p.total_paid), 0);
  }

  totalForProduct(ci: CartItemRead): number {
    const pays = this.paymentsForProduct(ci);
    if (!pays.length) return 0;
    const sorted = [...pays].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return parseFloat(sorted[0].total_amount);
  }

  balanceForProduct(ci: CartItemRead): number {
    return Math.max(0, this.totalForProduct(ci) - this.paidForProduct(ci));
  }

  paymentDate(pay: PaymentRead): Date {
    return new Date(pay.document_date || pay.created_at);
  }

  sortedPayments(): PaymentRead[] {
    return [...this.payments()].sort(
      (a, b) => this.paymentDate(a).getTime() - this.paymentDate(b).getTime()
    );
  }

  /** Return the shared receipt_number if this payment's receipt is shared with other payments, else null. */
  private sharedReceiptNumber(paymentId: string): string | null {
    const payment = this.payments().find(p => p.id === paymentId);
    if (!payment?.receipt_number) return null;
    const shared = this.payments().filter(p =>
      p.receipt_number === payment.receipt_number &&
      p.consultation_id === payment.consultation_id
    );
    return shared.length > 1 ? payment.receipt_number : null;
  }

  openReceipt(paymentId: string) {
    const sharedRn = this.sharedReceiptNumber(paymentId);
    if (sharedRn) {
      this.openConsolidatedAddReceipt(sharedRn);
      return;
    }
    this.paymentService.getReceipt(paymentId).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  downloadReceipt(paymentId: string) {
    const sharedRn = this.sharedReceiptNumber(paymentId);
    if (sharedRn) {
      this.downloadConsolidatedAddReceipt(sharedRn);
      return;
    }
    this.paymentService.getReceipt(paymentId, true).subscribe({
      next: (html) => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${paymentId}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download receipt' }),
    });
  }

  reprintReceipt(paymentId: string) {
    const sharedRn = this.sharedReceiptNumber(paymentId);
    if (sharedRn) {
      this.reprintConsolidatedAddReceipt(sharedRn);
      return;
    }
    this.paymentService.getReceipt(paymentId).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => {
            try { win.print(); } catch { /* fallback */ }
          }, 800);
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  private get addConsultationId(): string {
    return this.consultation()?.id || '';
  }

  openConsolidatedAddReceipt(receiptNumber: string) {
    const cid = this.addConsultationId;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  reprintConsolidatedAddReceipt(receiptNumber: string) {
    const cid = this.addConsultationId;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => {
            try { win.print(); } catch { /* fallback */ }
          }, 800);
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  downloadConsolidatedAddReceipt(receiptNumber: string) {
    const cid = this.addConsultationId;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid, true).subscribe({
      next: (html) => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${receiptNumber}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download receipt' }),
    });
  }

  paymentProductName(pay: PaymentRead): string {
    const p = this.products().find(pr => pr.id === pay.product_id);
    return p?.name || pay.product_id;
  }

  paymentPaidAmount(pay: PaymentRead): number {
    return pay.installments
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + parseFloat(i.paid_amount || i.amount), 0);
  }

  paymentBalanceAfter(pay: PaymentRead): number {
    const ci = this.paidCartItems().find(item =>
      item.product_id === pay.product_id &&
      (pay.package_id ? item.package_id === pay.package_id : !item.package_id)
    );
    if (!ci) return 0;
    const originalTotal = this.totalForProduct(ci);
    const payTime = this.paymentDate(pay).getTime();
    const paysUpTo = this.paymentsForProduct(ci).filter(p =>
      this.paymentDate(p).getTime() <= payTime
    );
    const totalPaid = paysUpTo.reduce((s, p) => s + parseFloat(p.total_paid), 0);
    return Math.max(0, originalTotal - totalPaid);
  }

  paymentStatus(pay: PaymentRead): string {
    const ci = this.consultation()?.cart_items?.find(item =>
      item.product_id === pay.product_id &&
      (pay.package_id ? item.package_id === pay.package_id : !item.package_id)
    );

    if (ci) {
      const balance = this.balanceForProduct(ci);
      if (balance > 0) {
        const statuses = pay.installments.map(i => i.status);
        if (statuses.some(s => s === 'paid')) return 'partial';
        if (statuses.some(s => s === 'overdue')) return 'overdue';
        return 'pending';
      }
    }

    const statuses = pay.installments.map(i => i.status);
    if (statuses.every(s => s === 'paid')) return 'paid';
    if (statuses.some(s => s === 'paid')) return 'partial';
    if (statuses.some(s => s === 'overdue')) return 'overdue';
    return 'pending';
  }

  paymentSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'contrast' {
    switch (s) {
      case 'paid': return 'success';
      case 'partial': return 'warn';
      case 'overdue': return 'danger';
      case 'pending': return 'info';
      default: return 'contrast';
    }
  }

  sortedFollowUps(): FollowUp[] {
    return [...(this.consultation()?.follow_ups || [])].sort(
      (a, b) => b.follow_up_date.localeCompare(a.follow_up_date)
    );
  }

  sortedCartItems(): CartItemRead[] {
    return [...(this.consultation()?.cart_items || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  followUpCartItems(fu: FollowUp): CartItemRead[] {
    return this.consultation()?.cart_items?.filter(ci => fu.cart_item_ids.includes(ci.id)) || [];
  }

  followUpDurationLabel(fu: FollowUp): string {
    if (fu.status !== 'pending') return '';
    const d = new Date(fu.follow_up_date);
    const now = new Date();
    if (d <= now) return '';
    const dur = this.relativeDuration(now, d);
    return dur ? `Follow up on this client in ${dur}` : '';
  }

  cartItemFollowUps(ci: CartItemRead): FollowUp[] {
    return this.consultation()?.follow_ups?.filter(fu => fu.cart_item_ids.includes(ci.id)) || [];
  }

  cartItemFollowUpCount(ci: CartItemRead): number {
    return this.cartItemFollowUps(ci).length;
  }

  cartItemCompletedCount(ci: CartItemRead): number {
    return this.cartItemFollowUps(ci).filter(fu => fu.status === 'completed').length;
  }

  cartItemPendingCount(ci: CartItemRead): number {
    return this.cartItemFollowUps(ci).filter(fu => fu.status === 'pending').length;
  }

  toggleFollowUpCheck(ciId: string) {
    this.followUpCheckIds.update(ids =>
      ids.includes(ciId) ? ids.filter(id => id !== ciId) : [...ids, ciId]
    );
  }

  isFollowUpChecked(ciId: string): boolean {
    return this.followUpCheckIds().includes(ciId);
  }

  openPerItemFollowUp(ci: CartItemRead) {
    this.followUpForm = { follow_up_date: null, note: '', type: 'conversion', cart_item_ids: [ci.id] };
    this.showFollowUpDialog.set(true);
  }

  openBulkFollowUp() {
    const ids = this.followUpCheckIds();
    if (!ids.length) return;
    this.followUpForm = { follow_up_date: null, note: '', type: 'conversion', cart_item_ids: [...ids] };
    this.showFollowUpDialog.set(true);
  }

  clearFollowUpCheck() {
    this.followUpCheckIds.set([]);
  }

  openCartItemFollowUpsDialog(ci: CartItemRead) {
    this.cartItemFollowUpsTarget.set(ci);
    this.showCartItemFollowUpsDialog.set(true);
  }

  cartItemFollowUpSeverity(s: string): 'warn' | 'success' | 'danger' {
    return s === 'completed' ? 'success' : s === 'cancelled' ? 'danger' : 'warn';
  }

  openGuide(section: 'products' | 'followups') {
    if (section === 'products') {
      this.guideContent.set(
        'This section shows all products/packages added to this consultation.\n\n' +
        '• Select checkboxes and click "Follow Up" to schedule a follow-up for multiple items.\n' +
        '• Click the calendar icon on any row to follow up on a single item.\n' +
        '• Use status buttons (→→, Convert, Mark Lost) to advance the item through the workflow.\n' +
        '• Click the follow-up count badge (e.g. 2/3) to view all follow-ups for that item.\n' +
        '• Add new products with "Add to Cart". Duplicate products are blocked.\n' +
        '• Lost items can be recovered with a reason. Converted items cannot be deleted.\n' +
        '• When a 2nd follow-up is added, interested → consulting automatically.\n' +
        '• Converting an item auto-completes all pending conversion follow-ups.\n' +
        '• Marking as lost auto-cancels all pending follow-ups and records the reason.'
      );
    } else {
      this.guideContent.set(
        'This section lists all scheduled follow-ups for this consultation.\n\n' +
        '• Each follow-up has a date, type (Conversion/Payment), linked products, and status.\n' +
        '• Click the check icon to complete a pending follow-up.\n' +
        '• Completing a follow-up lets you add notes and optionally schedule the next one.\n' +
        '• Use "Schedule Follow-up" to create a new follow-up and link it to specific products.\n' +
        '• Lost/converted products cannot be selected when scheduling.\n' +
        '• Follow-ups are sorted with upcoming dates first.\n' +
        '• Cancelled follow-ups show the recovery reason if the linked item was recovered.'
      );
    }
    this.showGuide.set(true);
  }
}

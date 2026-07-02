import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConsultationService, Consultation, FollowUp } from '../../core/services/consultation.service';
import { CartItemService, CartItemRead, CartItemCreate } from '../../core/services/cart.service';
import { ProductService, Product } from '../../core/services/product.service';
import { PaymentService, PaymentRead } from '../../core/services/payment.service';
import { TrainingService, TrainingSession, TrainingSummary, Skill, SkillCreate } from '../../core/services/training.service';
import { PermitProgressService, PermitProgress } from '../../core/services/permit-progress.service';
import { OrderListModule } from 'primeng/orderlist';
import { LessonPlanService, LessonPlanTemplate, ClientLessonPlan, ClientLesson, ClientLessonUpdate } from '../../core/services/lesson-plan.service';
import { APP_CONFIG } from '../../core/config';

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
    DatePickerModule,
    TooltipModule,
    ConfirmDialogModule,
    TableModule,
    CheckboxModule,
    InputNumberModule,
    OrderListModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './client-profile.html',
})
export class ClientProfile implements OnInit {
  readonly config = APP_CONFIG;
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
  addReceiptSystemNumber = signal('');
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

  showGuide = signal(false);
  guideContent = signal('');

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
    private permitProgressService: PermitProgressService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loading.set(true);
      this.loadConsultation(id);
      this.loadProducts();
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
      if (this.consultation()) {
        this.loadPermitProgress();
        this.loadLessonPlans();
      }
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
      ci.status === 'converted_paid' || ci.status === 'converted_paying'
    );
  }

  async loadTrainingData() {
    const items = this.trainableCartItems().filter(
      ci => ci.requires_driving_training || ci.requires_theory_training
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
  lessonPlanForm: { template_id: string; transmission_type: string; start_date: string | null } = {
    template_id: '', transmission_type: 'manual', start_date: null,
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
      ci => ci.requires_driving_training || ci.requires_theory_training
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
    this.lessonPlanForm = { template_id: '', transmission_type: 'manual', start_date: null };
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

  async createLessonPlan() {
    const cartItemId = this.createPlanCartItemId();
    if (!cartItemId) return;
    this.loading.set(true);
    try {
      await this.lessonPlanService.createClientPlan(cartItemId, {
        template_id: this.lessonPlanForm.template_id || undefined,
        transmission_type: this.lessonPlanForm.transmission_type,
        start_date: this.lessonPlanForm.start_date || undefined,
      }).toPromise();
      this.showCreateLessonPlanDialog.set(false);
      await this.loadLessonPlans();
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Lesson plan created' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create lesson plan' });
    } finally {
      this.loading.set(false);
    }
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
        driving_minutes: null,
        theory_minutes: null,
        mileage_km: null,
        combined_with_next: false,
        skills_achieved: null,
        outcome: null,
        instructor_id: null,
        vehicle_id: null,
        completed_at: null,
        notes: null,
        preferred_location: item.preferred_location ?? null,
        enforce_prerequisites: item.enforce_prerequisites ?? true,
        created_at: '',
        updated_at: '',
      }));
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
      driving_minutes: lesson.driving_minutes,
      theory_minutes: lesson.theory_minutes,
      mileage_km: lesson.mileage_km,
      combined_with_next: lesson.combined_with_next,
      skills_achieved: lesson.skills_achieved || [],
      notes: lesson.notes,
    };
    this.showLessonDetailDialog.set(true);
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
    this.addReceiptSystemNumber.set('');
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

  async finishAddProducts() {
    const c = this.consultation();
    if (!c) return;
    this.loading.set(true);
    try {
      for (const sp of this.addSelectedProducts()) {
        // For existing items, get the cart item ID; for new, create it
        let itemId = sp.cartItemId;
        if (!itemId) {
          const item = await this.cartItemService.create(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
            notes: this.addNote() || undefined,
            is_important: this.addIsImportant(),
          }).toPromise();
          if (item) itemId = item.id;
        }

        if (itemId) {
          const userNote = this.addNote() || '';
          const isExistingItem = !!sp.cartItemId;
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
        if (sp.cartItemId) {
          itemIds.push(sp.cartItemId);
        } else {
          const item = await this.cartItemService.create(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
          }).toPromise();
          itemIds.push(item?.id);
        }
      }

      // Create payments for each allocated product
      let systemReceipt = '';
      for (let i = 0; i < this.addSelectedProducts().length; i++) {
        const sp = this.addSelectedProducts()[i];
        const allocation = this.getAllocation(i);
        if (allocation <= 0) continue;

        const remaining = Math.max(0, sp.price - allocation);
        const isFullyPaid = remaining === 0;

        // Build installments: one immediate + any scheduled
        const installments: { due_date: string; amount: number }[] = [
          { due_date: this.formatDate(new Date()), amount: allocation },
        ];
        const scheduledInstallments = this.addPaymentInstallments
          .filter(inst => inst.amount > 0 && inst.due_date)
          .map(inst => ({
            due_date: this.formatDate(inst.due_date!),
            amount: inst.amount,
          }));
        installments.push(...scheduledInstallments);

        const transactionTotal = installments.reduce((s, i) => s + i.amount, 0);

        const paymentResult = await this.paymentService
          .createPayment(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
            total_amount: transactionTotal,
            notes: `Paid: ${allocation}, Balance: ${remaining}`,
            receipt_number: this.addPaymentReceiptNumber() || undefined,
            installments,
          })
          .toPromise();

        if (!systemReceipt && paymentResult) {
          systemReceipt = paymentResult.system_receipt_number;
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
            const followUpDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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

      this.addReceiptItems.set(receiptItems);
      this.addReceiptSystemNumber.set(systemReceipt);
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

  closeAddReceipt() {
    this.showAddProductDialog.set(false);
    this.addStep.set(1);
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
        })
        .toPromise();

      const systemReceipt = paymentResult?.system_receipt_number || 'N/A';
      this.completeSaleSystemReceiptNumber.set(systemReceipt);

      await this.cartItemService.update(ci.id, { status }).toPromise();

      this.showCompleteSaleDialog.set(false);
      this.completeSaleTarget.set(null);
      await this.loadConsultation(c.id);
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
    return d.toISOString().split('T')[0];
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

  sortedPayments(): PaymentRead[] {
    return [...this.payments()].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  paymentProductName(pay: PaymentRead): string {
    const p = this.products().find(pr => pr.id === pay.product_id);
    return p?.name || pay.product_id;
  }

  paymentPaidAmount(pay: PaymentRead): number {
    return parseFloat(pay.total_paid);
  }

  paymentBalanceAfter(pay: PaymentRead): number {
    const ci = this.paidCartItems().find(item =>
      item.product_id === pay.product_id &&
      (pay.package_id ? item.package_id === pay.package_id : !item.package_id)
    );
    if (!ci) return 0;
    const originalTotal = this.totalForProduct(ci);
    const paysUpTo = this.paymentsForProduct(ci).filter(p =>
      new Date(p.created_at).getTime() <= new Date(pay.created_at).getTime()
    );
    const totalPaid = paysUpTo.reduce((s, p) => s + parseFloat(p.total_paid), 0);
    return Math.max(0, originalTotal - totalPaid);
  }

  paymentStatus(pay: PaymentRead): string {
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

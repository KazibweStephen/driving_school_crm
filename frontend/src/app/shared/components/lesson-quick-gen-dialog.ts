import { Component, signal, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { LessonPlanService, LessonPlanTemplate, ClientLesson, ClientLessonPlan } from '../../core/services/lesson-plan.service';
import { ProductService } from '../../core/services/product.service';
import { User } from '../../core/services/user.service';
import { Vehicle } from '../../core/services/vehicle.service';

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

interface QuickGenLesson {
  date: Date;
  lesson_type: 'practical' | 'theory';
  dayLabel: string;
  template_item_id: string | null;
  title: string | null;
  lesson_objectives: string[];
  practical_objectives: string[];
  status: 'completed' | 'pending' | 'locked';
}

@Component({
  selector: 'app-lesson-quick-gen-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, SelectModule, InputNumberModule, DatePickerModule, TooltipModule],
  template: `
    <p-dialog [(visible)]="visible" header="Quick Generate Lessons" [modal]="true"
      [style]="{ width: '92vw', maxWidth: '520px' }" [draggable]="false" [resizable]="false"
      [closable]="!saving()">
      <div class="space-y-4">
        @if (trainingDays > 0 || trainingHours > 0) {
          <div class="bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2.5 text-xs grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Driving Training (Days)</span>
              <strong class="text-indigo-700">{{ trainingDays }}</strong>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Theory Training (Hours)</span>
              <strong class="text-indigo-700">{{ trainingHours }} hrs</strong>
            </div>
          </div>
          <p class="text-xs text-gray-400 -mt-2.5">From the package — read-only. If days trained are below these totals, the remaining lessons are scheduled.</p>
        }

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Days Trained (Practical)</label>
            <p-inputNumber [(ngModel)]="form().practicalDays" [min]="0" [max]="maxPracticalDays()"
              placeholder="e.g. 4" [style]="{ width: '100%' }"
              (ngModelChange)="onCountsChange()" />
            <p class="text-[11px] text-gray-400 mt-0.5">Max {{ maxPracticalDays() }} — cannot exceed package practical days.</p>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Days Trained (Theory)</label>
            <p-inputNumber [(ngModel)]="form().theoryLessons" [min]="0" [max]="999"
              placeholder="e.g. 2" [style]="{ width: '100%' }"
              (ngModelChange)="onCountsChange()" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Start Date</label>
            <p-datepicker [(ngModel)]="form().startDate" dateFormat="yy-mm-dd"
              placeholder="Start date" appendTo="body" class="w-full"
              [style]="{ 'border-color': dateError() ? '#ef4444' : '' }"
              (ngModelChange)="onDateRangeChange()" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Last Date of Training</label>
            <p-datepicker [(ngModel)]="form().lastDate" dateFormat="yy-mm-dd"
              placeholder="Last date" appendTo="body" class="w-full"
              [style]="{ 'border-color': dateError() ? '#ef4444' : '' }"
              (ngModelChange)="onDateRangeChange()" />
          </div>
        </div>
        @if (dateError()) {
          <div class="text-xs text-red-500 flex items-center gap-1">
            <i class="pi pi-exclamation-triangle"></i>
            {{ dateError() }}
          </div>
        }
        <div>
          <label class="block text-xs text-gray-500 mb-0.5">Transmission Trained</label>
          <p-select [options]="[{ label: 'Manual', value: 'manual' }, { label: 'Automatic', value: 'automatic' }, { label: 'Both', value: 'both' }]"
            [(ngModel)]="form().transmission" appendTo="body" class="w-full"
            (ngModelChange)="onTransmissionChange($event)" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Instructor (all lessons)</label>
            <p-select [options]="instructorOpts" [(ngModel)]="form().instructor_id"
              placeholder="Optional" appendTo="body" class="w-full" [showClear]="true" [filter]="true" filterBy="label" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-0.5">Vehicle (all lessons)</label>
            <p-select [options]="vehicleOpts" [(ngModel)]="form().vehicle_id"
              placeholder="Optional" appendTo="body" class="w-full" [showClear]="true" [filter]="true" filterBy="label" />
          </div>
        </div>
        <p class="text-xs text-gray-400 -mt-2">Chosen once here, then applied to every generated lesson. Vehicles are filtered by the selected transmission.</p>

        <div>
          <label class="block text-xs text-gray-500 mb-0.5">Lesson Plan (optional)</label>
          <p-select [options]="templateOpts" [(ngModel)]="form().lesson_plan_template_id"
            placeholder="Pick lessons from a lesson plan" appendTo="body" class="w-full" [filter]="true" filterBy="label"
            (ngModelChange)="onTemplateChange($event)" />
          <p class="text-xs text-gray-400 mt-1">Filtered by transmission. Selecting a plan pre-ticks lessons from your Practical/Theory days — adjust the ticks as needed.</p>
          <p class="text-xs text-red-400 mt-0.5 flex items-center gap-1">
            <i class="pi pi-exclamation-circle"></i>
            Changing the lesson plan removes the previous lessons for this plan.
          </p>
        </div>

        @if (selectedTemplate()) {
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 border-b">
              Lessons in {{ selectedTemplate()!.name }} — pick the ones covered
            </div>
            <div class="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              @for (item of templateItems(); track item.id) {
                <div class="flex items-center gap-2.5 px-3 py-2">
                  <label class="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" class="mt-0.5" [checked]="isItemSelected(item.id)"
                      (change)="toggleItem(item.id)" />
                    <span class="text-sm">
                      <span class="font-medium text-gray-700">{{ item.title }}</span>
                      <span class="ml-1.5 text-xs px-1.5 py-0.5 rounded
                        {{ item.is_theory ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600' }}">
                        {{ item.is_theory ? 'Theory' : 'Practical' }}
                      </span>
                      @if (item.difficulty) {
                        <span class="ml-1 text-xs text-gray-400">{{ item.difficulty }}</span>
                      }
                    </span>
                  </label>
                  @if (isItemSelected(item.id)) {
                    @if (itemStatus()[item.id] === 'locked') {
                      <span class="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium whitespace-nowrap"><i class="pi pi-lock mr-0.5" style="font-size: 0.6rem"></i>Locked</span>
                    } @else if (itemStatus()[item.id] === 'pending') {
                      <span class="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium whitespace-nowrap">Scheduled</span>
                    }
                    @if (itemStatus()[item.id] !== 'locked') {
                      <p-datepicker [ngModel]="itemDates()[item.id]"
                        (ngModelChange)="onItemDateChange(item.id, $event)"
                        dateFormat="yy-mm-dd" appendTo="body" styleClass="w-56"
                        [showIcon]="true" icon="pi pi-calendar" />
                    }
                  }
                </div>
              }
            </div>
            <div class="bg-gray-50 px-3 py-1.5 text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-medium text-gray-700">{{ selectedItemIds().length }} selected</span>
              <span class="flex items-center gap-1 text-green-600"><i class="pi pi-check-circle" style="font-size: 0.7rem"></i> {{ completedCount() }} covered</span>
              <span class="flex items-center gap-1 text-orange-600"><i class="pi pi-calendar-plus" style="font-size: 0.7rem"></i> {{ scheduledCount() }} scheduled</span>
              @if (lockedCount() > 0) {
                <span class="flex items-center gap-1 text-red-600"><i class="pi pi-lock" style="font-size: 0.7rem"></i> {{ lockedCount() }} locked</span>
              }
              <span class="w-full sm:w-auto text-gray-400">pre-ticked from your Practical/Theory days. If days trained are below the package total, the remaining lessons are <span class="text-orange-600 font-medium">Scheduled</span>. Lessons beyond the package are <span class="text-red-600 font-medium">Locked</span> until an extension is purchased.</span>
            </div>
          </div>
        }

        @if (!selectedTemplate()) {
          <p-button label="Compute Lessons" icon="pi pi-calculator" (click)="computeLessons()"
            [loading]="busy()" [disabled]="busy()" styleClass="w-full" />

          @if (preview().length > 0) {
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 border-b">
                Preview — {{ preview().length }} lesson(s). Theory always on Saturday.
              </div>
              <div class="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                @for (lesson of preview(); track $index; let li = $index) {
                  <div class="flex items-center gap-2 px-3 py-2">
                    <span class="w-8 text-center text-xs font-medium text-gray-500">{{ lesson.dayLabel }}</span>
                    @if (lesson.title) {
                      <span class="text-xs text-gray-600 flex-1 min-w-0 truncate" [title]="lesson.title">
                        {{ lesson.title }}
                      </span>
                    }
                    @if (lesson.status === 'pending') {
                      <span class="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium whitespace-nowrap">Scheduled</span>
                    }
                    <p-datepicker [ngModel]="lesson.date" (ngModelChange)="onPreviewDateChange(lesson, $event)"
                      dateFormat="yy-mm-dd" appendTo="body" styleClass="w-56" />
                    <p-select [ngModel]="lesson.lesson_type"
                      (ngModelChange)="onPreviewTypeChange(lesson, $event)"
                      [options]="[{ label: 'Practical', value: 'practical' }, { label: 'Theory', value: 'theory' }]"
                      appendTo="body" styleClass="w-32" />
                    <p-button icon="pi pi-trash" severity="danger" size="small"
                      (click)="removePreviewLesson(li)" />
                  </div>
                }
              </div>
              <div class="bg-blue-50 px-3 py-2 text-xs text-blue-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="flex items-center gap-1 text-green-600"><i class="pi pi-check-circle" style="font-size: 0.7rem"></i> {{ previewCompletedCount() }} covered</span>
                <span class="flex items-center gap-1 text-orange-600"><i class="pi pi-calendar-plus" style="font-size: 0.7rem"></i> {{ previewScheduledCount() }} scheduled</span>
                <span class="text-blue-400">Confirm replaces the existing lessons for this plan.</span>
              </div>
            </div>
          }
        }
      </div>
      <ng-template pTemplate="footer">
        <div class="flex gap-2 justify-end">
          <p-button label="Cancel" severity="secondary" (click)="cancel()" [disabled]="saving()" />
          <p-button label="Confirm" [disabled]="saving() || dateError() || (selectedTemplate() ? selectedItemIds().length === 0 : preview().length === 0)"
            [loading]="saving()"
            (click)="confirm()" />
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class LessonQuickGenDialog {
  visible = signal(false);
  saving = signal(false);
  busy = signal(false);

  form = signal<QuickGenForm>({
    practicalDays: null,
    theoryLessons: null,
    startDate: null,
    lastDate: null,
    transmission: 'manual',
    lesson_plan_template_id: null,
    instructor_id: '',
    vehicle_id: '',
  });
  preview = signal<QuickGenLesson[]>([]);
  selectedItemIds = signal<string[]>([]);
  itemDates = signal<Record<string, Date | null>>({});
  itemStatus = signal<Record<string, 'completed' | 'pending' | 'locked'>>({});

  trainingDays = 0;
  trainingHours = 0;
  instructorOpts: { label: string; value: string }[] = [];
  vehicleOpts: { label: string; value: string }[] = [];
  allVehicles: Vehicle[] = [];
  templates: LessonPlanTemplate[] = [];
  templateOpts: { label: string; value: string }[] = [];

  private planId = '';
  private cartItemId = '';
  private existingLessons: ClientLesson[] = [];

  @Output() saved = new EventEmitter<void>();

  constructor(private lessonPlanService: LessonPlanService, private productService: ProductService) {}

  get maxPracticalDays(): () => number {
    return () => this.trainingDays || 999;
  }

  get selectedTemplate(): () => LessonPlanTemplate | null {
    return () => this.templates.find(t => t.id === this.form().lesson_plan_template_id) || null;
  }

  get templateItems(): () => any[] {
    return () => this.selectedTemplate()?.lesson_items || [];
  }

  get dateError(): () => string {
    return () => this.computeRangeError() || this.computeLessonsError();
  }

  get completedCount(): () => number {
    return () => Object.values(this.itemStatus()).filter(s => s === 'completed').length;
  }

  get scheduledCount(): () => number {
    return () => Object.values(this.itemStatus()).filter(s => s === 'pending').length;
  }

  get lockedCount(): () => number {
    return () => Object.values(this.itemStatus()).filter(s => s === 'locked').length;
  }

  get previewCompletedCount(): () => number {
    return () => this.preview().filter(l => l.status !== 'pending').length;
  }

  get previewScheduledCount(): () => number {
    return () => this.preview().filter(l => l.status === 'pending').length;
  }

  async open(
    plan: ClientLessonPlan,
    instructors: User[],
    vehicles: Vehicle[],
    templates: LessonPlanTemplate[],
    productId: string | null,
    packageId: string | null,
  ) {
    this.planId = plan.id;
    this.cartItemId = plan.cart_item_id;
    this.existingLessons = plan.lessons.filter(l => l.is_active).map(l => ({ ...l }));
    this.templates = templates;
    this.allVehicles = vehicles;
    this.instructorOpts = instructors.map(u => ({ label: u.name, value: u.phone }));

    // Fetch training limits from the Package (source of truth)
    if (productId && packageId) {
      try {
        const product: any = await this.productService.getProduct(productId).toPromise();
        const pkg = product?.packages?.find((p: any) => p.id === packageId);
        if (pkg) {
          this.trainingDays = pkg.driving_training_duration_days ?? 0;
          this.trainingHours = pkg.theory_training_hours ?? 0;
        } else {
          this.trainingDays = 0;
          this.trainingHours = 0;
        }
      } catch {
        this.trainingDays = 0;
        this.trainingHours = 0;
      }
    } else {
      this.trainingDays = 0;
      this.trainingHours = 0;
    }

    const trans = plan.transmission_type || 'manual';
    this.templateOpts = templates
      .filter(t => trans === 'both' || !t.transmission_type || t.transmission_type === 'both' || t.transmission_type === trans)
      .map(t => ({ label: t.name, value: t.id }));

    // Load start/end dates: first try plan.start_date, then scan existing lessons
    let startDate: Date | null = null;
    let lastDate: Date | null = null;
    if (plan.start_date) {
      startDate = new Date(plan.start_date);
    }
    if (!startDate) {
      for (const l of this.existingLessons) {
        if (l.scheduled_date) { startDate = new Date(l.scheduled_date); break; }
      }
    }
    for (const l of [...this.existingLessons].reverse()) {
      if (l.scheduled_date) { lastDate = new Date(l.scheduled_date); break; }
    }

    const practicalCount = this.existingLessons.filter(l => !l.is_theory && (l.status === 'completed' || l.status === 'started')).length;
    const theoryCount = this.existingLessons.filter(l => l.is_theory && (l.status === 'completed' || l.status === 'started')).length;

    const firstLesson = this.existingLessons[0];
    this.form.set({
      practicalDays: practicalCount || null,
      theoryLessons: theoryCount || null,
      startDate,
      lastDate,
      transmission: trans,
      lesson_plan_template_id: plan.template_id || null,
      instructor_id: firstLesson?.instructor_id || '',
      vehicle_id: firstLesson?.vehicle_id || '',
    });

    this.updateVehicleOpts(trans);
    this.preview.set([]);
    this.selectedItemIds.set([]);
    this.itemDates.set({});
    this.itemStatus.set({});

    if (plan.template_id && templates.find(t => t.id === plan.template_id)) {
      this.syncTemplateSelection();
    }

    this.visible.set(true);
  }

  private updateVehicleOpts(trans: string) {
    this.vehicleOpts = this.allVehicles
      .filter(v => trans === 'both' || v.transmission === trans)
      .map(v => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
  }

  onCountsChange() {
    this.syncTemplateSelection();
  }

  onDateRangeChange() {
    if (this.dateError()) return;
    this.assignDates(true);
  }

  onTransmissionChange(transmission: string) {
    this.form.update(f => ({ ...f, transmission }));
    this.updateVehicleOpts(transmission);
    const selectedId = this.form().lesson_plan_template_id;
    if (selectedId) {
      const tpl = this.templates.find(t => t.id === selectedId);
      if (tpl && tpl.transmission_type && tpl.transmission_type !== 'both' && tpl.transmission_type !== transmission) {
        this.form.update(f => ({ ...f, lesson_plan_template_id: null }));
        this.selectedItemIds.set([]);
        this.itemStatus.set({});
        this.preview.set([]);
      }
    }
    this.templateOpts = this.templates
      .filter(t => transmission === 'both' || !t.transmission_type || t.transmission_type === 'both' || t.transmission_type === transmission)
      .map(t => ({ label: t.name, value: t.id }));
  }

  onTemplateChange(templateId: string | null) {
    const prev = this.form().lesson_plan_template_id;
    this.form.update(f => ({ ...f, lesson_plan_template_id: templateId }));
    this.syncTemplateSelection();
    if (templateId !== prev) {
      this.existingLessons = [];
      if (!templateId) {
        this.preview.set([]);
      }
    }
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedItemIds().includes(itemId);
  }

  toggleItem(itemId: string) {
    const template = this.selectedTemplate();
    const item = template?.lesson_items?.find((i: any) => i.id === itemId);
    if (item && !this.isItemSelected(itemId)) {
      // Check practical limit
      if (!item.is_theory) {
        const max = this.trainingDays || 999;
        if (max !== 999) {
          const selected = this.selectedItemIds();
          const selectedPractical = selected.filter(id => {
            const it = template?.lesson_items?.find((i: any) => i.id === id);
            return it && !it.is_theory;
          }).length;
          if (selectedPractical >= max) return;
        }
      }
      // Check theory limit
      if (item.is_theory) {
        const maxTheory = this.trainingHours ? Math.ceil(this.trainingHours / 2) : 999;
        if (maxTheory !== 999) {
          const selected = this.selectedItemIds();
          const selectedTheory = selected.filter(id => {
            const it = template?.lesson_items?.find((i: any) => i.id === id);
            return it && it.is_theory;
          }).length;
          if (selectedTheory >= maxTheory) return;
        }
      }
    }
    this.selectedItemIds.update(ids =>
      ids.includes(itemId) ? ids.filter(id => id !== itemId) : [...ids, itemId]
    );
    this.itemStatus.update(m => {
      const n = { ...m };
      if (!n[itemId]) n[itemId] = 'pending';
      return n;
    });
    this.assignDates(false);
  }

  onItemDateChange(itemId: string, value: Date | null) {
    this.itemDates.update(m => ({ ...m, [itemId]: value }));
  }

  onPreviewDateChange(lesson: QuickGenLesson, value: Date) {
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    lesson.date = value;
    lesson.dayLabel = DAYS[value.getDay()];
    this.preview.update(list => [...list]);
  }

  onPreviewTypeChange(lesson: QuickGenLesson, value: string) {
    lesson.lesson_type = value === 'theory' ? 'theory' : 'practical';
    this.preview.update(list => [...list]);
  }

  removePreviewLesson(index: number) {
    this.preview.update(list => list.filter((_, i) => i !== index));
  }

  computeLessons() {
    this.busy.set(true);
    try {
      const f = this.form();
      const start = f.startDate ? this.startOfDay(f.startDate) : null;
      const last = f.lastDate ? this.startOfDay(f.lastDate) : null;
      if (!start || !last) return;
      if (this.dateError()) return;

      const practicalCount = f.practicalDays ?? 0;
      const theoryCount = f.theoryLessons ?? 0;
      if (practicalCount + theoryCount === 0) return;

      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      const practicalDates: Date[] = [];
      const cursor = new Date(start);
      while (cursor <= last) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) practicalDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      let overflow = new Date(last);
      while (practicalDates.length < practicalCount) {
        overflow.setDate(overflow.getDate() + 1);
        if (overflow.getDay() >= 1 && overflow.getDay() <= 5) practicalDates.push(new Date(overflow));
      }

      const theoryDates: Date[] = [];
      const firstSat = new Date(start);
      while (firstSat.getDay() !== 6) firstSat.setDate(firstSat.getDate() + 1);
      let satCursor = new Date(firstSat);
      while (theoryDates.length < theoryCount) {
        theoryDates.push(new Date(satCursor));
        satCursor.setDate(satCursor.getDate() + 7);
      }

      const practicals: QuickGenLesson[] = practicalDates.slice(0, practicalCount).map((d, i) => ({
        date: d,
        lesson_type: 'practical' as const,
        dayLabel: DAYS[d.getDay()],
        template_item_id: null,
        title: null,
        lesson_objectives: [],
        practical_objectives: [],
        status: i < (f.practicalDays ?? 0) ? 'completed' : 'pending',
      }));

      const theories: QuickGenLesson[] = theoryDates.slice(0, theoryCount).map((d, i) => ({
        date: d,
        lesson_type: 'theory' as const,
        dayLabel: DAYS[d.getDay()],
        template_item_id: null,
        title: null,
        lesson_objectives: [],
        practical_objectives: [],
        status: i < (f.theoryLessons ?? 0) ? 'completed' : 'pending',
      }));

      const generated = [...practicals, ...theories].sort((a, b) => a.date.getTime() - b.date.getTime());
      this.preview.set(generated);
    } finally {
      setTimeout(() => this.busy.set(false), 400);
    }
  }

  async confirm() {
    this.saving.set(true);
    try {
      const f = this.form();
      const template = this.selectedTemplate();
      const instructorId = f.instructor_id || '';
      const vehicleId = f.vehicle_id || '';

      let lessonsToSave: { scheduled_date: Date | null; duration_minutes: number; is_theory: boolean; instructor_id: string; vehicle_id: string; order: number; title: string | null; lesson_objectives: string[]; practical_objectives: string[]; template_item_id: string | null; status: string; is_locked: boolean }[];

      if (template) {
        const ids = this.selectedItemIds();
        const items = (template.lesson_items || []).filter((i: any) => ids.includes(i.id));
        if (items.length === 0) { this.saving.set(false); return; }
        const dates = this.itemDates();
        const statuses = this.itemStatus();
        lessonsToSave = items.map((item: any, idx: number) => ({
          scheduled_date: dates[item.id] || null,
          duration_minutes: item.is_theory ? 120 : 30,
          is_theory: item.is_theory,
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          order: idx + 1,
          title: item.title,
          lesson_objectives: item.lesson_objectives || [],
          practical_objectives: item.practical_objectives || [],
          template_item_id: item.id,
          status: statuses[item.id] || 'completed',
          is_locked: statuses[item.id] === 'locked',
        }));
      } else {
        const pv = this.preview();
        if (pv.length === 0) { this.saving.set(false); return; }
        lessonsToSave = pv.map((l, idx) => ({
          scheduled_date: l.date,
          duration_minutes: l.lesson_type === 'theory' ? 120 : 30,
          is_theory: l.lesson_type === 'theory',
          instructor_id: instructorId,
          vehicle_id: vehicleId,
          order: idx + 1,
          title: l.title,
          lesson_objectives: l.lesson_objectives,
          practical_objectives: l.practical_objectives,
          template_item_id: l.template_item_id,
          status: l.status,
          is_locked: l.status === 'locked',
        }));
      }

      const newTemplateId = f.lesson_plan_template_id || null;

      const existingActive = this.existingLessons.filter(l => l.id);
      const deletePromises = existingActive.map(l =>
        this.lessonPlanService.updateClientLesson(l.id, { is_active: false }).toPromise()
      );
      await Promise.all(deletePromises);

      await this.lessonPlanService.createClientPlan(this.cartItemId, {
        template_id: newTemplateId || undefined,
        transmission_type: f.transmission || 'manual',
        lessons: lessonsToSave.map(ls => ({
          day_number: ls.order,
          week_number: Math.ceil(ls.order / 5),
          title: ls.title || `Lesson ${ls.order}`,
          lesson_objectives: ls.lesson_objectives.length ? ls.lesson_objectives : undefined,
          practical_objectives: ls.practical_objectives.length ? ls.practical_objectives : undefined,
          order: ls.order,
          is_active: true,
          is_locked: ls.is_locked || false,
          scheduled_date: ls.scheduled_date ? ls.scheduled_date.toISOString().split('T')[0] : undefined,
          duration_minutes: ls.duration_minutes,
          is_theory: ls.is_theory,
          instructor_id: ls.instructor_id || undefined,
          vehicle_id: ls.vehicle_id || undefined,
          template_item_id: ls.template_item_id || undefined,
        })),
      }).toPromise();

      this.visible.set(false);
      this.saved.emit();
    } finally {
      this.saving.set(false);
    }
  }

  cancel() {
    this.visible.set(false);
    this.preview.set([]);
    this.selectedItemIds.set([]);
    this.itemDates.set({});
    this.itemStatus.set({});
  }

  // ── Internal helpers ──

  private startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private computeRangeError(): string {
    const f = this.form();
    const start = f.startDate ? this.startOfDay(f.startDate) : null;
    const last = f.lastDate ? this.startOfDay(f.lastDate) : null;
    if (last && start && last < start) return 'Last date must be after start date';
    return '';
  }

  private computeLessonsError(): string {
    const template = this.selectedTemplate();
    if (template) {
      const ids = this.selectedItemIds();
      const items = (template.lesson_items || []).filter((i: any) => ids.includes(i.id));
      for (const item of items) {
        const date = this.itemDates()[item.id];
        if (!date) return `Set a date for "${item.title}"`;
      }
    } else {
      for (const lesson of this.preview()) {
        if (!lesson.date) return 'All lessons need a date';
      }
    }
    return '';
  }

  private syncTemplateSelection() {
    const f = this.form();
    const template = this.templates.find(t => t.id === f.lesson_plan_template_id);
    if (!template || !template.lesson_items?.length) {
      this.selectedItemIds.set([]);
      this.itemDates.set({});
      this.itemStatus.set({});
      return;
    }
    const practicalItems = template.lesson_items.filter((i: any) => !i.is_theory);
    const theoryItems = template.lesson_items.filter((i: any) => i.is_theory);
    // Cap at package training limits
    const maxPractical = this.trainingDays || 999;
    const maxTheory = this.trainingHours ? Math.ceil(this.trainingHours / 2) : 999;
    const trainedPractical = f.practicalDays ?? 0;
    const trainedTheory = f.theoryLessons ?? 0;
    // Select up to package limit; user-entered trained count determines completed vs pending
    const practicalToSelect = Math.min(practicalItems.length, maxPractical);
    const theoryToSelect = Math.min(theoryItems.length, maxTheory);
    const selected: string[] = [];
    const status: Record<string, 'completed' | 'pending' | 'locked'> = {};
    practicalItems.forEach((i: any, idx: number) => {
      if (idx < practicalToSelect) {
        selected.push(i.id);
        status[i.id] = idx < trainedPractical ? 'completed' : 'pending';
      } else {
        // Beyond package limit → locked
        selected.push(i.id);
        status[i.id] = 'locked';
      }
    });
    theoryItems.forEach((i: any, idx: number) => {
      if (idx < theoryToSelect) {
        selected.push(i.id);
        status[i.id] = idx < trainedTheory ? 'completed' : 'pending';
      } else {
        // Beyond package limit → locked
        selected.push(i.id);
        status[i.id] = 'locked';
      }
    });
    this.selectedItemIds.set(selected);
    this.itemStatus.set(status);
    this.assignDates(true);
  }

  private assignDates(force: boolean) {
    const f = this.form();
    const template = this.selectedTemplate();
    if (!template) return;
    const start = f.startDate ? this.startOfDay(f.startDate) : null;
    const last = f.lastDate ? this.startOfDay(f.lastDate) : null;
    if (!start || !last) return;
    const ids = this.selectedItemIds();
    const selectedItems = (template.lesson_items || []).filter((i: any) => ids.includes(i.id));
    const practicals = selectedItems.filter((i: any) => !i.is_theory);
    const theories = selectedItems.filter((i: any) => i.is_theory);

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

    this.itemDates.update(map => {
      const next = { ...map };
      practicals.forEach((it: any, i: number) => {
        if (force || !next[it.id]) next[it.id] = practicalDates[i] || null;
      });
      theories.forEach((it: any, i: number) => {
        if (force || !next[it.id]) next[it.id] = theoryDates[i] || null;
      });
      return next;
    });
  }
}

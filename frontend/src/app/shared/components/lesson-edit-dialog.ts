import { Component, signal, EventEmitter, Output, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { ClientLesson } from '../../core/services/lesson-plan.service';
import { User } from '../../core/services/user.service';
import { Vehicle } from '../../core/services/vehicle.service';

@Component({
  selector: 'app-lesson-edit-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, SelectModule, InputNumberModule, DatePickerModule, TooltipModule],
  template: `
    <p-dialog [(visible)]="visible" header="Edit Lesson Plan" [modal]="true"
      [style]="{ width: '95vw', maxWidth: '720px' }" [draggable]="false" [resizable]="false"
      [closable]="!saving()">
      <div class="space-y-3">
        <!-- Training info bar -->
        @if (trainingDays > 0 || trainingHours > 0) {
          <div class="bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2.5 text-xs grid grid-cols-2 gap-x-4 gap-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Driving Training Days</span>
              <strong class="text-indigo-700">{{ trainingDays }}</strong>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500">Theory Training Hours</span>
              <strong class="text-indigo-700">{{ trainingHours }} hrs</strong>
            </div>
          </div>
        }

        <!-- Lesson rows -->
        @for (lesson of lessons(); track $index; let li = $index) {
          <div class="border border-gray-200 rounded-lg p-3 last:border-b"
               [class.bg-amber-50]="lesson.is_theory"
               [class.border-l-2]="lesson.is_theory"
               [class.border-l-amber-400]="lesson.is_theory">
            <div class="flex items-center justify-between mb-2">
              <span class="inline-flex items-center gap-1.5 text-xs font-medium"
                    [class.text-amber-700]="lesson.is_theory"
                    [class.text-gray-500]="!lesson.is_theory">
                <i class="pi" [class.pi-book]="lesson.is_theory" [class.pi-car]="!lesson.is_theory"
                   [class.text-amber-500]="lesson.is_theory" [class.text-gray-400]="!lesson.is_theory"></i>
                Lesson {{ li + 1 }}
                @if (lesson.is_theory) {
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Theory</span>
                }
                @if (lesson.title) {
                  <span [class.text-amber-600]="lesson.is_theory" [class.text-gray-700]="!lesson.is_theory">· {{ lesson.title }}</span>
                }
                @if (lesson.status === 'completed' || lesson.status === 'started') {
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">Done</span>
                } @else if (lesson.status === 'scheduled') {
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">Scheduled</span>
                }
              </span>
              <p-button icon="pi pi-trash" severity="danger" size="small" [text]="true"
                (click)="removeLesson(li)" pTooltip="Remove lesson" tooltipPosition="top" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">Date</label>
                <p-datepicker [ngModel]="lesson.scheduled_date"
                  (ngModelChange)="lesson.scheduled_date = $event"
                  dateFormat="yy-mm-dd" placeholder="Date" appendTo="body" styleClass="w-full" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">Duration (min)</label>
                <p-inputNumber [ngModel]="lesson.duration_minutes"
                  (ngModelChange)="lesson.duration_minutes = $event"
                  [min]="1" [max]="480" placeholder="Minutes" styleClass="w-full" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">Type</label>
                <p-select [options]="typeOptions"
                  [ngModel]="lesson.is_theory ? 'theory' : 'practical'"
                  (ngModelChange)="onTypeChange(li, $event)"
                  appendTo="body" styleClass="w-full" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">Instructor</label>
                <p-select [options]="instructorOptions"
                  [ngModel]="lesson.instructor_id"
                  (ngModelChange)="lesson.instructor_id = $event"
                  placeholder="Optional" appendTo="body" styleClass="w-full"
                  [filter]="true" filterBy="label" [showClear]="true" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-0.5">Vehicle</label>
                <p-select [options]="vehicleOptions"
                  [ngModel]="lesson.vehicle_id"
                  (ngModelChange)="lesson.vehicle_id = $event"
                  placeholder="Optional" appendTo="body" styleClass="w-full"
                  [filter]="true" filterBy="label" [showClear]="true" />
              </div>
            </div>
            @if (lesson.duration_minutes && lesson.duration_minutes > 30) {
              <div class="text-xs text-blue-500 mt-2 flex items-center gap-1">
                <i class="pi pi-info-circle"></i>
                Split into {{ countExpanded(lesson) }} session(s) of 30min
              </div>
            }
          </div>
        }

        @if (lessons().length === 0) {
          <p class="py-6 text-center text-sm text-gray-400">No lessons yet. Click "Add Lesson" to create one.</p>
        }

        <div class="pt-1">
          <p-button label="Add Lesson" icon="pi pi-plus" size="small" severity="secondary"
            (click)="addLesson()" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <div class="flex gap-2 justify-end">
          <p-button label="Cancel" severity="secondary" (click)="cancel()" [disabled]="saving()" />
          <p-button label="Confirm" icon="pi pi-check" (click)="confirm()" [loading]="saving()" />
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class LessonEditDialog {
  visible = signal(false);
  saving = signal(false);
  lessons = signal<ClientLesson[]>([]);

  @Output() confirmed = new EventEmitter<ClientLesson[]>();

  trainingDays = 0;
  trainingHours = 0;
  transmissionType = 'manual';
  instructorOptions: { label: string; value: string }[] = [];
  vehicleOptions: { label: string; value: string }[] = [];
  typeOptions = [
    { label: 'Practical', value: 'practical' },
    { label: 'Theory', value: 'theory' },
  ];

  open(
    existingLessons: ClientLesson[],
    instructors: User[],
    vehicles: Vehicle[],
    trainingDays: number,
    trainingHours: number,
    transmissionType: string,
  ) {
    this.trainingDays = trainingDays;
    this.trainingHours = trainingHours;
    this.transmissionType = transmissionType;
    this.instructorOptions = instructors.map(u => ({ label: u.name, value: u.phone }));
    this.vehicleOptions = vehicles
      .filter(v => transmissionType === 'both' || v.transmission === transmissionType)
      .map(v => ({ label: `${v.name} (${v.plate_number})`, value: v.id }));
    this.lessons.set(existingLessons.map(l => ({ ...l })));
    this.visible.set(true);
  }

  addLesson() {
    this.lessons.update(list => [...list, {
      id: '',
      lesson_plan_id: '',
      template_item_id: null,
      lesson_library_id: null,
      day_number: list.length + 1,
      week_number: 1,
      title: `Lesson ${list.length + 1}`,
      lesson_objectives: [],
      practical_objectives: [],
      order: list.length + 1,
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
      is_theory: false,
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
      preferred_location: null,
      enforce_prerequisites: true,
      created_at: '',
      updated_at: '',
    }]);
  }

  removeLesson(index: number) {
    this.lessons.update(list => list.filter((_, i) => i !== index));
  }

  onTypeChange(index: number, newType: string) {
    this.lessons.update(list => {
      const updated = [...list];
      updated[index] = {
        ...updated[index],
        is_theory: newType === 'theory',
        duration_minutes: newType === 'theory' ? 120 : 30,
      };
      return updated;
    });
  }

  countExpanded(lesson: ClientLesson): number {
    if (!lesson.duration_minutes || lesson.duration_minutes <= 0) return 0;
    return Math.ceil(lesson.duration_minutes / 30);
  }

  cancel() {
    this.visible.set(false);
    this.lessons.set([]);
  }

  confirm() {
    this.saving.set(true);
    const lessons = this.lessons().map((l, i) => ({ ...l, order: i + 1 }));
    this.confirmed.emit(lessons);
    this.visible.set(false);
    this.saving.set(false);
  }
}

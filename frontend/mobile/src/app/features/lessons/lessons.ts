import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import {
  ScheduleService,
  WeeklyScheduleEntry,
  WeeklyScheduleResponse,
} from '../../core/services/schedule.service';
import { LessonService } from '../../core/services/lesson.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import {
  addDays,
  formatTime,
  mondayOf,
  toISODate,
  todayISO,
} from '../../shared/format';

type Step = 'list' | 'running';
type ViewMode = 'day' | 'week' | 'month';

@Component({
  selector: 'app-lessons',
  imports: [ButtonModule, FormsModule, LoadingOverlay, PageHeader],
  templateUrl: './lessons.html',
})
export class Lessons implements OnInit {
  private scheduleService = inject(ScheduleService);
  private lessonService = inject(LessonService);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);

  ngOnInit() {
    this.load();
  }

  step = signal<Step>('list');
  loading = signal(false);
  starting = signal(false);

  view = signal<ViewMode>('week');
  views: ViewMode[] = ['day', 'week', 'month'];
  anchor = signal<string>(toISODate(mondayOf(new Date())));
  selectedDate = signal<string>(todayISO());
  isInstructor = computed(() => this.authService.currentUserRole() === 'instructor');

  counterLabel = computed(() => {
    const map: Record<ViewMode, string> = { day: 'Day', week: 'Week', month: 'Month' };
    return map[this.view()];
  });

  viewLabel(mode: ViewMode): string {
    const map: Record<ViewMode, string> = { day: 'Day', week: 'Week', month: 'Month' };
    return map[mode];
  }

  days = computed(() => {
    const v = this.view();
    const count = v === 'day' ? 1 : v === 'week' ? 7 : 28;
    const start = new Date(this.anchor() + 'T00:00:00');
    return Array.from({ length: count }, (_, i) => {
      const d = addDays(start, i);
      return {
        date: toISODate(d),
        label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        day: d.getDate(),
        month: d.toLocaleDateString('en-GB', { month: 'short' }),
      };
    });
  });

  slots = signal<WeeklyScheduleEntry[]>([]);
  slotMap = computed(() => {
    const map: Record<string, WeeklyScheduleEntry[]> = {};
    for (const s of this.slots()) {
      const key = s.scheduled_date || '';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  });
  selectedSlots = computed(() => this.slotMap()[this.selectedDate()] ?? []);
  countFor = (date: string) => this.slotMap()[date]?.length ?? 0;

  // running lesson
  runningLesson = signal<WeeklyScheduleEntry | null>(null);
  elapsed = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSync = 0;

  // reschedule
  showReschedule = signal(false);
  rescheduleLesson = signal<WeeklyScheduleEntry | null>(null);
  rsDate = signal('');
  rsStart = signal('');
  rsEnd = signal('');
  saving = signal(false);

  setView(v: ViewMode) {
    this.view.set(v);
    if (v === 'day') {
      this.anchor.set(this.selectedDate());
    } else if (v === 'week') {
      this.anchor.set(toISODate(mondayOf(new Date(this.selectedDate() + 'T00:00:00'))));
    } else {
      const base = new Date(this.selectedDate() + 'T00:00:00');
      this.anchor.set(toISODate(new Date(base.getFullYear(), base.getMonth(), 1)));
    }
    this.load();
  }

  shift(steps: number) {
    const base = new Date(this.anchor() + 'T00:00:00');
    if (this.view() === 'day') {
      this.anchor.set(toISODate(addDays(base, steps)));
      if (steps !== 0) this.selectedDate.set(this.anchor());
    } else if (this.view() === 'week') {
      this.anchor.set(toISODate(addDays(base, 7 * steps)));
    } else {
      const first = new Date(base.getFullYear(), base.getMonth() + steps, 1);
      this.anchor.set(toISODate(first));
      this.selectedDate.set(toISODate(first));
    }
    this.load();
  }

  today() {
    this.view.set('day');
    this.anchor.set(todayISO());
    this.selectedDate.set(todayISO());
    this.load();
  }

  load() {
    this.loading.set(true);
    this.scheduleService
      .getWeeklySchedule(this.anchor(), this.view(), this.isInstructor())
      .subscribe({
        next: (res: WeeklyScheduleResponse) => {
          this.slots.set(res.slots ?? []);
          if (this.view() !== 'month') {
            // keep selectedDate within the visible range; default to today if present
            const dates = new Set((res.days ?? []).map((d) => String(d).slice(0, 10)));
            if (dates.size && !dates.has(this.selectedDate())) {
              this.selectedDate.set(toISODate(new Date()));
            }
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.slots.set([]);
          this.messageService.add({ severity: 'error', summary: 'Could not load schedule' });
        },
      });
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
  }

  isToday(date: string): boolean {
    return date === todayISO();
  }

  slotTime(slot: WeeklyScheduleEntry): string {
    if (!slot.scheduled_start_time) {
      return slot.duration_minutes ? `${slot.duration_minutes}min` : 'All day';
    }
    const end = slot.scheduled_end_time
      ? `–${formatTime(slot.scheduled_end_time)}`
      : slot.duration_minutes
        ? ` (${slot.duration_minutes}min)`
        : '';
    return `${formatTime(slot.scheduled_start_time)} ${end}`;
  }

  canStart(slot: WeeklyScheduleEntry): boolean {
    if (slot.status === 'in_progress') return false;
    if (slot.scheduled_date && slot.scheduled_date < todayISO()) return false;
    const today = todayISO();
    if (slot.scheduled_date && slot.scheduled_date > today) return false;
    return slot.status === 'pending' || slot.status === 'unlocked';
  }

  canReschedule(slot: WeeklyScheduleEntry): boolean {
    return slot.status === 'pending' || slot.status === 'unlocked';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pending',
      unlocked: 'Ready',
      in_progress: 'In progress',
      completed: 'Completed',
      partially_completed: 'Partial',
      skipped: 'Skipped',
      cancelled: 'Cancelled',
      carried_over: 'Carried over',
      makeup: 'Makeup',
      excused: 'Excused',
    };
    return map[status] || status;
  }

  openReschedule(slot: WeeklyScheduleEntry) {
    this.rescheduleLesson.set(slot);
    this.rsDate.set(slot.scheduled_date || '');
    this.rsStart.set((slot.scheduled_start_time || '').slice(0, 5));
    this.rsEnd.set((slot.scheduled_end_time || '').slice(0, 5));
    this.showReschedule.set(true);
  }

  submitReschedule() {
    const lesson = this.rescheduleLesson();
    if (!lesson) return;
    if (!this.rsDate()) {
      this.messageService.add({ severity: 'error', summary: 'Select a date' });
      return;
    }
    this.saving.set(true);
    const body: Partial<LessonUpdateBody> = { scheduled_date: this.rsDate() };
    if (this.rsStart()) body.scheduled_start_time = this.rsStart() + ':00';
    if (this.rsEnd()) body.scheduled_end_time = this.rsEnd() + ':00';
    this.lessonService.updateLesson(lesson.lesson_id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.showReschedule.set(false);
        this.messageService.add({ severity: 'success', summary: 'Lesson rescheduled' });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not reschedule',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  removeLesson(slot: WeeklyScheduleEntry) {
    if (!window.confirm(`Remove "${slot.title}" from the schedule?`)) return;
    this.starting.set(true);
    this.lessonService.updateLesson(slot.lesson_id, { is_active: false }).subscribe({
      next: () => {
        this.starting.set(false);
        this.messageService.add({ severity: 'success', summary: 'Lesson removed' });
        this.load();
      },
      error: (err) => {
        this.starting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not remove',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  startLesson(slot: WeeklyScheduleEntry) {
    if (this.starting()) return;
    this.starting.set(true);
    this.lessonService.startLesson(slot.lesson_id).subscribe({
      next: () => {
        this.lessonService.startTimer(slot.lesson_id).subscribe({
          next: () => {
            this.starting.set(false);
            this.runningLesson.set(slot);
            this.elapsed.set(0);
            this.step.set('running');
            this.beginTimer(slot.lesson_id);
          },
          error: (err) => {
            this.starting.set(false);
            this.messageService.add({
              severity: 'error',
              summary: 'Timer failed',
              detail: err.error?.detail || 'Lesson started but timer could not start',
            });
            this.load();
          },
        });
      },
      error: (err) => {
        this.starting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not start lesson',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  private beginTimer(lessonId: string) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.elapsed.update((s) => s + 1);
      const now = Date.now();
      if (now - this.lastSync >= 30000) {
        this.lastSync = now;
        this.lessonService.syncTimer(lessonId, { total_seconds: this.elapsed() }).subscribe({
          error: () => {},
        });
      }
    }, 1000);
  }

  completeLesson(outcome: 'completed' | 'partially_completed' | 'skipped') {
    const lesson = this.runningLesson();
    if (!lesson) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.starting.set(true);
    this.lessonService
      .syncTimer(lesson.lesson_id, { total_seconds: this.elapsed() })
      .subscribe({
        complete: () => this.doComplete(lesson, outcome),
        error: () => this.doComplete(lesson, outcome),
      });
  }

  private doComplete(lesson: WeeklyScheduleEntry, outcome: string) {
    this.lessonService.completeLesson(lesson.lesson_id, outcome).subscribe({
      next: () => {
        this.starting.set(false);
        this.runningLesson.set(null);
        this.elapsed.set(0);
        this.step.set('list');
        this.messageService.add({
          severity: 'success',
          summary: 'Lesson completed',
          detail: `${lesson.client_name} · ${outcome.replace('_', ' ')}`,
        });
        this.load();
      },
      error: (err) => {
        this.starting.set(false);
        this.runningLesson.set(null);
        this.elapsed.set(0);
        this.step.set('list');
        this.messageService.add({
          severity: 'error',
          summary: 'Failed to complete',
          detail: err.error?.detail || 'Try again',
        });
        this.load();
      },
    });
  }

  formattedElapsed(): string {
    const s = this.elapsed();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  }
}

interface LessonUpdateBody {
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  is_active: boolean;
}
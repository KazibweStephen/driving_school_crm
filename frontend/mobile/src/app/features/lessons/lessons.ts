import { Component, computed, inject, signal } from '@angular/core';
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
import { addDays, formatTime, mondayOf, toISODate, todayISO } from '../../shared/format';

type Step = 'week' | 'running';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

@Component({
  selector: 'app-lessons',
  imports: [ButtonModule, LoadingOverlay, PageHeader],
  templateUrl: './lessons.html',
})
export class Lessons {
  private scheduleService = inject(ScheduleService);
  private lessonService = inject(LessonService);
  private messageService = inject(MessageService);

  step = signal<Step>('week');
  loading = signal(false);
  starting = signal(false);

  weekStart = toISODate(mondayOf(new Date()));
  selectedDate = signal<string>(todayISO());
  days = computed(() => {
    const start = new Date(this.weekStart + 'T00:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { date: toISODate(d), label: DAY_NAMES[i], day: d.getDate() };
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

  // running lesson
  runningLesson = signal<WeeklyScheduleEntry | null>(null);
  elapsed = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSync = 0;

  load() {
    this.loading.set(true);
    this.scheduleService.getWeeklySchedule(this.weekStart).subscribe({
      next: (res: WeeklyScheduleResponse) => {
        this.slots.set(res.slots ?? []);
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
    if (!slot.scheduled_start_time) return '';
    const end = slot.scheduled_end_time
      ? `–${formatTime(slot.scheduled_end_time)}`
      : ` (${slot.duration_minutes}min)`;
    return `${formatTime(slot.scheduled_start_time)} ${end}`;
  }

  canStart(slot: WeeklyScheduleEntry): boolean {
    if (slot.status === 'in_progress') return false;
    const today = todayISO();
    if (slot.scheduled_date && slot.scheduled_date < today) return false;
    if (slot.scheduled_date && slot.scheduled_date > today) return false;
    return true;
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
        this.step.set('week');
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
        this.step.set('week');
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

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import {
  SchedulingService,
  WeeklyScheduleEntry,
} from '../../core/services/scheduling.service';

@Component({
  selector: 'app-weekly-schedule',
  imports: [
    CommonModule, FormsModule, ButtonModule, DatePickerModule,
    ToastModule, TableModule, TagModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>

    <div class="p-4">
      <div class="flex items-center gap-4 mb-4">
        <h1 class="text-2xl font-bold">Weekly Schedule</h1>
        <p-datepicker [(ngModel)]="weekStart" dateFormat="dd/mm/yy"
          (onSelect)="loadWeek()" styleClass="w-48" appendTo="body" />
        <p-button label="Previous Week" icon="pi pi-chevron-left" severity="secondary"
          (onClick)="shiftWeek(-1)" />
        <p-button label="Next Week" icon="pi pi-chevron-right" severity="secondary"
          (onClick)="shiftWeek(1)" />
      </div>

      @if (loading()) {
        <div class="py-12 text-center text-sm text-gray-400">Loading...</div>
      } @else if (slots().length === 0) {
        <div class="py-12 text-center text-sm text-gray-400">
          No scheduled lessons for this week.
        </div>
      } @else {
        <div class="overflow-x-auto border rounded-lg">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th class="border-b bg-gray-50 px-1.5 py-1 text-left font-semibold text-gray-500 w-16">Time</th>
                @for (day of dayLabels; track $index) {
                  <th class="border-b bg-gray-50 px-1.5 py-1 text-center font-semibold text-gray-500 min-w-[130px]">
                    <div>{{ day }}</div>
                    <div class="text-[10px] font-normal text-gray-400">{{ dayDates[$index] }}</div>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (time of timeSlots; track time) {
                <tr>
                  <td class="border-b px-1.5 py-1 font-mono text-gray-500 whitespace-nowrap">{{ time }}</td>
                  @for (dayIdx of [0,1,2,3,4,5,6]; track dayIdx) {
                    @let entries = cellEntries(dayIdx, time);
                    <td class="border-b px-0.5 py-0.5 align-top"
                        [class.bg-yellow-50]="entries.length > 1">
                      @if (entries.length > 0) {
                        <div class="flex flex-col gap-0.5">
                          @for (e of entries; track e.lesson_id) {
                            <div class="rounded px-1 py-0.5 text-[10px] leading-tight cursor-default"
                              [class.bg-blue-50]="e.transmission === 'manual'"
                              [class.bg-green-50]="e.transmission === 'automatic'"
                              [class.bg-gray-50]="!e.transmission">
                              <div class="font-medium truncate">{{ e.client_name }}</div>
                              <div class="text-gray-500 truncate">{{ e.instructor_name || e.instructor_id }}</div>
                              @if (e.vehicle_name) {
                                <div class="text-gray-400 truncate">{{ e.vehicle_plate }}</div>
                              }
                            </div>
                          }
                        </div>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class WeeklyScheduleCmp implements OnInit {
  weekStart = signal<Date>(this._mondayOf(new Date()));
  slots = signal<WeeklyScheduleEntry[]>([]);
  loading = signal(false);

  dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  timeSlots: string[] = [];

  constructor(
    private schedulingService: SchedulingService,
    private messageService: MessageService,
  ) {
    for (let i = 0; i < 26; i++) {
      const h = Math.floor((i * 30) / 60) + 6;
      const m = (i * 30) % 60;
      this.timeSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }

  ngOnInit() {
    this.loadWeek();
  }

  get dayDates(): string[] {
    const start = this.weekStart();
    if (!start) return [];
    return [0,1,2,3,4,5,6].map(i => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    });
  }

  private _mondayOf(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  shiftWeek(direction: number) {
    const d = this.weekStart();
    d.setDate(d.getDate() + 7 * direction);
    this.weekStart.set(new Date(d));
    this.loadWeek();
  }

  async loadWeek() {
    const d = this.weekStart();
    if (!d) return;
    this.loading.set(true);
    try {
      const ds = d.toISOString().split('T')[0];
      const res = await this.schedulingService.getWeeklySchedule(ds).toPromise();
      this.slots.set(res?.slots || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedule' });
      this.slots.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  cellEntries(dayIdx: number, time: string): WeeklyScheduleEntry[] {
    const d = this.weekStart();
    if (!d) return [];
    const date = new Date(d);
    date.setDate(date.getDate() + dayIdx);
    const ds = date.toISOString().split('T')[0];
    return this.slots().filter(
      s => s.scheduled_date === ds && (s.scheduled_start_time?.substring(0, 5) === time)
    );
  }
}

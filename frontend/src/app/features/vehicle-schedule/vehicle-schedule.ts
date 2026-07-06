import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';
import { UserService, User } from '../../core/services/user.service';
import {
  VehicleScheduleService,
  VehicleScheduleSlot,
  VehicleScheduleSlotCreate,
} from '../../core/services/vehicle-schedule.service';

interface PendingChange {
  day: number;
  time: string;
  instructor_id: string;
  /** true = assign this instructor, false = remove assignment */
  assign: boolean;
}

@Component({
  selector: 'app-vehicle-schedule',
  imports: [
    CommonModule, FormsModule, ButtonModule, SelectModule,
    CheckboxModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './vehicle-schedule.html',
})
export class VehicleScheduleCmp implements OnInit {
  vehicles = signal<Vehicle[]>([]);
  instructors = signal<User[]>([]);
  selectedVehicleId = signal<string>('');
  scheduleSlots = signal<VehicleScheduleSlot[]>([]);
  activeInstructorId = signal<string>('');
  daySelectAll = [false, false, false, false, false];
  pendingChanges = signal<PendingChange[]>([]);

  vehicleSelectOptions = signal<{ id: string; label: string }[]>([]);

  dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  timeSlots: string[] = [];
  slotDuration = 30;
  lunchSlot = '13:00';

  constructor(
    private vehicleService: VehicleService,
    private userService: UserService,
    private scheduleService: VehicleScheduleService,
    private messageService: MessageService,
  ) {
    for (let i = 0; i < 26; i++) {
      const h = Math.floor((i * this.slotDuration) / 60) + 6;
      const m = (i * this.slotDuration) % 60;
      this.timeSlots.push(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      );
    }
  }

  isLunchSlot(slot: string): boolean {
    return slot === this.lunchSlot;
  }

  ngOnInit() {
    this.loadVehicles();
    this.loadInstructors();
  }

  async loadVehicles() {
    try {
      const res = await this.vehicleService.list().toPromise();
      this.vehicles.set(res || []);
      this.vehicleSelectOptions.set(
        (res || []).map(v => ({ id: v.id, label: `${v.plate_number} · ${v.transmission}` }))
      );
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vehicles' });
    }
  }

  async loadInstructors() {
    try {
      const res = await this.userService.list({ role: 'instructor', status: 'active', page_size: 100 }).toPromise();
      this.instructors.set(res?.users?.filter(u => u.role === 'instructor') || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load instructors' });
    }
  }

  selectVehicle(id: string) {
    const newId = this.selectedVehicleId() === id ? '' : id;
    this.selectedVehicleId.set(newId);
    this.resetChanges();
    this.activeInstructorId.set('');
    if (newId) this.loadSchedule();
  }

  onVehicleSelect(id: string) {
    this.selectedVehicleId.set(id);
    this.resetChanges();
    this.activeInstructorId.set('');
    this.loadSchedule();
  }

  async loadSchedule() {
    const vid = this.selectedVehicleId();
    if (!vid) return;
    try {
      const res = await this.scheduleService.list({ vehicle_id: vid }).toPromise();
      this.scheduleSlots.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedule' });
    }
  }

  slotEnd(start: string): string {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + this.slotDuration;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    return `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
  }

  getCell(day: number, startTime: string): VehicleScheduleSlot | undefined {
    return this.scheduleSlots().find(
      s => s.day_of_week === day && s.start_time.substring(0, 5) === startTime
    );
  }

  instructorName(instructorId: string): string {
    const inst = this.instructors().find(u => u.phone === instructorId);
    return inst ? inst.name || inst.phone : instructorId;
  }

  /** Resolve effective instructor for a cell (existing + pending overrides) */
  cellInstructor(day: number, time: string): string | null {
    const pending = this.pendingChanges().find(c => c.day === day && c.time === time);
    if (pending) return pending.assign ? pending.instructor_id : null;
    const cell = this.getCell(day, time);
    return cell ? cell.instructor_id : null;
  }

  pendingAssign(day: number, time: string): boolean {
    return this.pendingChanges().some(c => c.day === day && c.time === time && c.assign);
  }

  pendingRemove(day: number, time: string): boolean {
    return this.pendingChanges().some(c => c.day === day && c.time === time && !c.assign);
  }

  hasChanges(): boolean {
    return this.pendingChanges().length > 0;
  }

  /** Toggle a single cell */
  toggleCell(day: number, time: string) {
    if (this.isLunchSlot(time)) return;
    const instId = this.activeInstructorId();
    if (!instId) return;

    const currentInst = this.cellInstructor(day, time);
    const existingPending = this.pendingChanges();
    const existing = this.getCell(day, time);

    // Remove any existing pending for this cell
    const filtered = existingPending.filter(c => !(c.day === day && c.time === time));

    if (currentInst === instId) {
      // Currently assigned to this instructor — remove assignment
      this.pendingChanges.set([...filtered, { day, time, instructor_id: instId, assign: false }]);
    } else {
      // Assign this instructor
      this.pendingChanges.set([...filtered, { day, time, instructor_id: instId, assign: true }]);
    }
  }

  /** Toggle all slots for a day */
  toggleDay(dayIdx: number) {
    const instId = this.activeInstructorId();
    if (!instId) {
      this.daySelectAll[dayIdx] = false;
      return;
    }
    const checked = this.daySelectAll[dayIdx];
    let changes = this.pendingChanges();
    // Remove existing pending for this day
    changes = changes.filter(c => c.day !== dayIdx);

    if (checked) {
      for (const time of this.timeSlots) {
        if (this.isLunchSlot(time)) continue;
        const currentInst = this.cellInstructor(dayIdx, time);
        if (currentInst !== instId) {
          changes.push({ day: dayIdx, time, instructor_id: instId, assign: true });
        }
      }
    }
    this.pendingChanges.set(changes);
  }

  resetChanges() {
    this.pendingChanges.set([]);
    this.daySelectAll = [false, false, false, false, false];
  }

  async saveSchedule() {
    const vid = this.selectedVehicleId();
    if (!vid) return;

    try {
      const existing = this.scheduleSlots();
      const pending = this.pendingChanges();
      const slotMap = new Map<string, VehicleScheduleSlotCreate>();

      // Add existing slots
      for (const s of existing) {
        const key = `${s.day_of_week}|${s.start_time}`;
        slotMap.set(key, {
          vehicle_id: vid,
          instructor_id: s.instructor_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: this.slotEnd(s.start_time),
        });
      }

      // Apply pending changes
      for (const p of pending) {
        const key = `${p.day}|${p.time}`;
        if (p.assign) {
          slotMap.set(key, {
            vehicle_id: vid,
            instructor_id: p.instructor_id,
            day_of_week: p.day,
            start_time: p.time,
            end_time: this.slotEnd(p.time),
          });
        } else {
          slotMap.delete(key);
        }
      }

      const slots = Array.from(slotMap.values());
      await this.scheduleService.bulkSet(vid, slots).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Schedule updated' });
      this.resetChanges();
      await this.loadSchedule();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save schedule' });
    }
  }
}

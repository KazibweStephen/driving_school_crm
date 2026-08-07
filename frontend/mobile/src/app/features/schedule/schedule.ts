import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
  Consultation,
  CartItem,
} from '../../core/services/consultation.service';
import {
  ScheduleService,
  ClientLessonPlan,
  FindAndLockResult,
} from '../../core/services/schedule.service';
import { CatalogService, LessonPlanTemplate, User, Vehicle } from '../../core/services/catalog.service';
import { ClientSearch } from '../../shared/client-search/client-search';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatTime, todayISO, toISODate } from '../../shared/format';

type Step = 'client' | 'cart' | 'setup' | 'done';

@Component({
  selector: 'app-schedule',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    SelectModule,
    ClientSearch,
    LoadingOverlay,
    PageHeader,
  ],
  templateUrl: './schedule.html',
})
export class Schedule {
  private consultationService = inject(ConsultationService);
  private scheduleService = inject(ScheduleService);
  private catalogService = inject(CatalogService);
  private messageService = inject(MessageService);

  step = signal<Step>('client');
  loading = signal(false);
  generating = signal(false);

  client: ClientInfo | null = null;
  consultation = signal<Consultation | null>(null);
  private consultationId = '';

  templates = signal<LessonPlanTemplate[]>([]);
  instructors = signal<User[]>([]);
  vehicles = signal<Vehicle[]>([]);

  targetItem = signal<CartItem | null>(null);
  templateId = signal<string | null>(null);
  startDate = signal<string>(todayISO());
  startDateObject = computed(() =>
    this.startDate() ? new Date(this.startDate() + 'T00:00:00') : null,
  );
  purchasedDays = signal<number | null>(null);
  instructorId = signal<string | null>(null);
  vehicleId = signal<string | null>(null);

  result = signal<FindAndLockResult | null>(null);
  plan = signal<ClientLessonPlan | null>(null);

  selectedClient(client: ClientInfo) {
    this.client = client;
    if (!client.latest_consultation_id) {
      this.messageService.add({ severity: 'warn', summary: 'No consultation', detail: 'This client has no consultation' });
      return;
    }
    this.loading.set(true);
    this.consultationService.get(client.latest_consultation_id).subscribe({
      next: (consultation) => {
        this.consultation.set(consultation);
        this.consultationId = consultation.id;
        this.loading.set(false);
        this.step.set('cart');
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not load client',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  clientName() {
    const c = this.consultation();
    if (!c) return this.client?.first_name || '';
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || c.first_name;
  }

  scheduleableItems(): CartItem[] {
    const items = this.consultation()?.cart_items || [];
    return items.filter((ci) => ci.package_id);
  }

  itemLabel(ci: CartItem): string {
    return ci.package_name || ci.product_name || 'Product';
  }

  openSetup(ci: CartItem) {
    this.targetItem.set(ci);
    this.templateId.set(null);
    this.instructorId.set(null);
    this.vehicleId.set(null);
    this.result.set(null);
    this.plan.set(null);
    this.startDate.set(todayISO());
    this.purchasedDays.set(null);
    this.step.set('setup');
    if (this.templates().length === 0) this.loadCatalog();
  }

  private loadCatalog() {
    this.catalogService.listTemplates().subscribe({
      next: (templates) =>
        this.templates.set(templates.filter((t) => t.status === 'active' || !t.status)),
      error: () => this.templates.set([]),
    });
    this.catalogService.listInstructors().subscribe({
      next: (res) => this.instructors.set(res.users ?? []),
      error: () => this.instructors.set([]),
    });
    this.catalogService.listVehicles().subscribe({
      next: (vehicles) => this.vehicles.set(vehicles.filter((v) => v.status === 'active')),
      error: () => this.vehicles.set([]),
    });
  }

  onTemplateChange() {
    const tpl = this.templates().find((t) => t.id === this.templateId());
    if (tpl) {
      this.purchasedDays.set(tpl.total_days);
      const autoVehicle = this.vehicles().find(
        (v) => v.transmission === tpl.transmission_type,
      );
      if (autoVehicle && !this.vehicleId()) this.vehicleId.set(autoVehicle.id);
    }
  }

  onStartDate(date: Date | null) {
    if (date) this.startDate.set(toISODate(date));
  }

  generateAndSchedule() {
    const ci = this.targetItem();
    const tpl = this.templates().find((t) => t.id === this.templateId());
    if (!ci || !tpl) {
      this.messageService.add({ severity: 'warn', summary: 'Select a template' });
      return;
    }
    if (!this.startDate()) {
      this.messageService.add({ severity: 'warn', summary: 'Pick a start date' });
      return;
    }
    const days = this.purchasedDays() || tpl.total_days;
    this.generating.set(true);
    this.scheduleService
      .generatePlan(ci.id, tpl.id, tpl.transmission_type, this.startDate(), days)
      .subscribe({
        next: (plan) => {
          this.plan.set(plan);
          this.autoAssign(plan, tpl.transmission_type);
        },
        error: (err) => {
          this.generating.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Could not generate plan',
            detail: err.error?.detail || 'Try again',
          });
        },
      });
  }

  private autoAssign(plan: ClientLessonPlan, transmission: string) {
    let instructorId = this.instructorId();
    if (!instructorId) {
      instructorId = this.instructors().find((u) => u.status === 'active')?.phone || this.instructors()[0]?.phone || '';
    }
    let vehicleId = this.vehicleId();
    if (!vehicleId) {
      vehicleId =
        this.vehicles().find((v) => v.transmission === transmission)?.id ||
        this.vehicles()[0]?.id ||
        '';
    }
    this.scheduleService
      .findAndLock(plan.id, {
        instructor_id: instructorId,
        vehicle_id: vehicleId || undefined,
        start_date: this.startDate(),
        preferred_times: ['17:00'],
        manual_days: 0,
      })
      .subscribe({
        next: (result) => {
          this.generating.set(false);
          this.result.set(result);
          this.step.set('done');
        },
        error: (err) => {
          this.generating.set(false);
          this.result.set({ locked: false, message: err.error?.detail || 'Could not auto-assign' });
          this.step.set('done');
        },
      });
  }

  reset() {
    this.step.set('client');
    this.client = null;
    this.consultation.set(null);
    this.consultationId = '';
    this.targetItem.set(null);
    this.result.set(null);
    this.plan.set(null);
  }

  timeOf(value?: string): string {
    if (!value) return '';
    const timePart = value.includes('T') ? value.split('T')[1].slice(0, 5) : value;
    return formatTime(timePart);
  }
}

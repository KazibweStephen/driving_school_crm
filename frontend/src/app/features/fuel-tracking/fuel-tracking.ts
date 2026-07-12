import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FuelService, FuelRate, FuelRefueling, FuelAlert, FuelVehicleStatus } from '../../core/services/fuel.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';

@Component({
  selector: 'app-fuel-tracking',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, ConfirmDialogModule, TableModule, TagModule, TabsModule,
    DatePickerModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './fuel-tracking.html',
})
export class FuelTrackingCmp implements OnInit {
  rates = signal<FuelRate[]>([]);
  refuelings = signal<FuelRefueling[]>([]);
  vehicles = signal<Vehicle[]>([]);
  alerts = signal<FuelAlert[]>([]);
  activeTab = signal<'rates' | 'refuelings' | 'alerts'>('alerts');

  showRateDialog = signal(false);
  showRefuelDialog = signal(false);
  editingRate = signal<FuelRate | null>(null);

  rateForm = { vehicle_id: '', rate_per_lesson: 0, notes: '' };
  refuelForm = { vehicle_id: '', amount: 0, liters: null as number | null, notes: '' };

  filterVehicle = signal<string>('');
  page = 1;
  pageSize = 20;
  total = 0;
  loading = signal(false);
  vehicleOptions = computed(() => this.vehicles().map(v => ({ label: `${v.plate_number} - ${v.name}`, value: v.id })));

  constructor(
    private svc: FuelService,
    private vehicleSvc: VehicleService,
    private msg: MessageService,
    private confirm: ConfirmationService,
  ) {}

  ngOnInit() {
    this.vehicleSvc.list().subscribe(v => this.vehicles.set(v));
    this.loadAlerts();
    this.loadRates();
  }

  loadRates() {
    this.svc.listRates({ vehicle_id: this.filterVehicle() || undefined }).subscribe(r => this.rates.set(r));
  }

  loadRefuelings() {
    this.loading.set(true);
    this.svc.listRefuelings({ vehicle_id: this.filterVehicle() || undefined, page: this.page, page_size: this.pageSize })
      .subscribe(r => {
        this.refuelings.set(r.items);
        this.total = r.total;
        this.loading.set(false);
      });
  }

  loadAlerts() {
    this.svc.getAlerts().subscribe(a => this.alerts.set(a));
  }

  openNewRate() {
    this.editingRate.set(null);
    this.rateForm = { vehicle_id: '', rate_per_lesson: 0, notes: '' };
    this.showRateDialog.set(true);
  }

  editRate(rate: FuelRate) {
    this.editingRate.set(rate);
    this.rateForm = {
      vehicle_id: rate.vehicle_id,
      rate_per_lesson: Number(rate.rate_per_lesson),
      notes: rate.notes || '',
    };
    this.showRateDialog.set(true);
  }

  saveRate() {
    const data = { ...this.rateForm, is_active: true };
    if (this.editingRate()) {
      this.svc.updateRate(this.editingRate()!.id, data).subscribe(() => {
        this.msg.add({ severity: 'success', summary: 'Rate updated' });
        this.showRateDialog.set(false);
        this.loadRates();
      });
    } else {
      this.svc.createRate(data).subscribe(() => {
        this.msg.add({ severity: 'success', summary: 'Rate created' });
        this.showRateDialog.set(false);
        this.loadRates();
      });
    }
  }

  deleteRate(rate: FuelRate) {
    this.confirm.confirm({
      message: `Delete this rate?`,
      header: 'Confirm',
      accept: () => {
        this.svc.deleteRate(rate.id).subscribe(() => {
          this.msg.add({ severity: 'success', summary: 'Deleted' });
          this.loadRates();
        });
      },
    });
  }

  openNewRefueling() {
    this.refuelForm = { vehicle_id: '', amount: 0, liters: null, notes: '' };
    this.showRefuelDialog.set(true);
  }

  saveRefueling() {
    const vehId = this.refuelForm.vehicle_id;
    const veh = this.vehicles().find(v => v.id === vehId);
    if (!vehId) { this.msg.add({ severity: 'error', summary: 'Select vehicle' }); return; }

    this.svc.getActiveRate(vehId).subscribe({
      next: rate => {
        const data = {
          vehicle_id: vehId,
          fuel_rate_id: rate.id,
          amount: this.refuelForm.amount,
          liters: this.refuelForm.liters,
          notes: this.refuelForm.notes,
        };
        this.svc.createRefueling(data).subscribe(() => {
          this.msg.add({ severity: 'success', summary: `Refueling recorded: ~${Math.floor(Number(data.amount) / Number(rate.rate_per_lesson))} lessons covered` });
          this.showRefuelDialog.set(false);
          this.loadRefuelings();
          this.loadAlerts();
        });
      },
      error: () => this.msg.add({ severity: 'error', summary: 'No active fuel rate for this vehicle. Create a rate first.' }),
    });
  }

  deleteRefueling(r: FuelRefueling) {
    this.confirm.confirm({
      message: 'Delete this refueling record?',
      header: 'Confirm',
      accept: () => {
        this.svc.deleteRefueling(r.id).subscribe(() => {
          this.msg.add({ severity: 'success', summary: 'Deleted' });
          this.loadRefuelings();
          this.loadAlerts();
        });
      },
    });
  }

  onPageChange(event: any) {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadRefuelings();
  }

  onTabChange(tab: any) {
    this.activeTab.set(tab);
    if (tab === 'refuelings' && this.refuelings().length === 0) this.loadRefuelings();
    if (tab === 'alerts') this.loadAlerts();
  }
}

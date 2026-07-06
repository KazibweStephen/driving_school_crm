import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import { CompanyService, Branch } from '../../core/services/company.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';

@Component({
  selector: 'app-vehicles',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, TagModule, TooltipModule, MultiSelectModule,
    ToastModule, SelectModule, ConfirmDialogModule, TableModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './vehicles.html',
})
export class VehiclesCmp implements OnInit {
  vehicles = signal<Vehicle[]>([]);
  loading = signal(false);
  showDialog = signal(false);
  editingVehicle = signal<Vehicle | null>(null);
  statusFilter = signal<string | null>(null);

  form: any = {
    name: '',
    plate_number: '',
    transmission: null,
    status: 'available',
    notes: '',
    branch_ids: [],
  };

  statusOptions = [
    { label: 'All', value: null },
    { label: 'Available', value: 'available' },
    { label: 'In Use', value: 'in_use' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Decommissioned', value: 'decommissioned' },
  ];

  transmissionOptions = [
    { label: 'Manual', value: 'manual' },
    { label: 'Automatic', value: 'automatic' },
  ];

  branches = signal<Branch[]>([]);

  constructor(
    private vehicleService: VehicleService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadVehicles();
    this.loadBranches();
  }

  private loadBranches() {
    this.companyService.list().subscribe(companies => {
      for (const c of companies) {
        this.companyService.listBranches(c.id).subscribe(bbs => {
          this.branches.update(existing => [...existing, ...bbs]);
        });
      }
    });
  }

  async loadVehicles() {
    this.loading.set(true);
    try {
      const params: any = {};
      if (this.statusFilter()) params.status = this.statusFilter()!;
      const res = await this.vehicleService.list(params).toPromise();
      this.vehicles.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vehicles' });
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editingVehicle.set(null);
    this.form = { name: '', plate_number: '', transmission: null, status: 'available', notes: '', branch_ids: [] };
    this.showDialog.set(true);
  }

  openEdit(vehicle: Vehicle) {
    this.editingVehicle.set(vehicle);
    this.form = {
      name: vehicle.name,
      plate_number: vehicle.plate_number,
      transmission: vehicle.transmission,
      status: vehicle.status,
      notes: vehicle.notes || '',
      branch_ids: [...vehicle.branch_ids],
    };
    this.showDialog.set(true);
  }

  async save() {
    const editing = this.editingVehicle();
    this.loading.set(true);
    try {
      const branchIds = this.form.branch_ids?.length ? this.form.branch_ids : undefined;
      if (editing) {
        await this.vehicleService.update(editing.id, {
          name: this.form.name,
          plate_number: this.form.plate_number,
          transmission: this.form.transmission,
          status: this.form.status,
          notes: this.form.notes || undefined,
          branch_ids: branchIds,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Vehicle updated' });
      } else {
        await this.vehicleService.create({
          name: this.form.name,
          plate_number: this.form.plate_number,
          transmission: this.form.transmission,
          notes: this.form.notes || undefined,
          branch_ids: branchIds,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Vehicle created' });
      }
      this.showDialog.set(false);
      await this.loadVehicles();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${editing ? 'update' : 'create'} vehicle` });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDelete(vehicle: Vehicle) {
    this.confirmationService.confirm({
      message: `Delete "${vehicle.name}" (${vehicle.plate_number})? This cannot be undone.`,
      header: 'Delete Vehicle',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteVehicle(vehicle),
    });
  }

  async deleteVehicle(vehicle: Vehicle) {
    try {
      await this.vehicleService.delete(vehicle.id).toPromise();
      this.vehicles.update(list => list.filter(v => v.id !== vehicle.id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Vehicle deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete vehicle' });
    }
  }

  branchNames(ids: string[]): string {
    if (!ids?.length) return '-';
    return ids.map(id => this.branches().find(b => b.id === id)?.name || id.slice(0, 8)).join(', ');
  }

  statusColor(s: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (s) {
      case 'available': return 'success';
      case 'in_use': return 'info';
      case 'maintenance': return 'warn';
      case 'decommissioned': return 'danger';
      default: return 'info';
    }
  }
}

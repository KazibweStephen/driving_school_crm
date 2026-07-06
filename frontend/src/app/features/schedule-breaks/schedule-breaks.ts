import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ScheduleBreakService, ScheduleBreak } from '../../core/services/schedule-break.service';

@Component({
  selector: 'app-schedule-breaks',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, ToastModule, SelectModule, ToggleSwitchModule,
    ConfirmDialogModule, TableModule, TagModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './schedule-breaks.html',
})
export class ScheduleBreaksCmp implements OnInit {
  breaks = signal<ScheduleBreak[]>([]);
  loading = signal(false);
  showDialog = signal(false);
  editingBreak = signal<ScheduleBreak | null>(null);

  form: any = {
    name: '',
    start_time: '',
    end_time: '',
    is_active: true,
  };

  constructor(
    private breakService: ScheduleBreakService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadBreaks();
  }

  async loadBreaks() {
    this.loading.set(true);
    try {
      const res = await this.breakService.list().toPromise();
      this.breaks.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load breaks' });
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editingBreak.set(null);
    this.form = { name: '', start_time: '', end_time: '', is_active: true };
    this.showDialog.set(true);
  }

  openEdit(b: ScheduleBreak) {
    this.editingBreak.set(b);
    this.form = {
      name: b.name,
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
      is_active: b.is_active,
    };
    this.showDialog.set(true);
  }

  async save() {
    const editing = this.editingBreak();
    this.loading.set(true);
    try {
      if (editing) {
        await this.breakService.update(editing.id, {
          name: this.form.name,
          start_time: this.form.start_time,
          end_time: this.form.end_time,
          is_active: this.form.is_active,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Break updated' });
      } else {
        await this.breakService.create({
          name: this.form.name,
          start_time: this.form.start_time,
          end_time: this.form.end_time,
          is_active: this.form.is_active,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Break created' });
      }
      this.showDialog.set(false);
      await this.loadBreaks();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${editing ? 'update' : 'create'} break` });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDelete(b: ScheduleBreak) {
    if (b.is_standard) {
      this.messageService.add({ severity: 'warn', summary: 'Protected', detail: 'Standard breaks cannot be deleted' });
      return;
    }
    this.confirmationService.confirm({
      message: `Delete "${b.name}"? This cannot be undone.`,
      header: 'Delete Break',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteBreak(b),
    });
  }

  async deleteBreak(b: ScheduleBreak) {
    try {
      await this.breakService.delete(b.id).toPromise();
      this.breaks.update(list => list.filter(x => x.id !== b.id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Break deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete break' });
    }
  }

  async toggleActive(b: ScheduleBreak) {
    try {
      const updated = await this.breakService.update(b.id, { is_active: !b.is_active }).toPromise();
      if (updated) {
        this.breaks.update(list => list.map(x => x.id === b.id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Toggled', detail: `${updated.name} is now ${updated.is_active ? 'active' : 'inactive'}` });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to toggle break' });
    }
  }
}

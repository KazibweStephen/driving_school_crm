import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-change-pin-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, ToastModule],
  providers: [MessageService],
  templateUrl: './change-pin-dialog.html',
  styleUrl: './change-pin-dialog.css',
})
export class ChangePinDialog {
  visible = signal(false);
  loading = signal(false);
  data = { old_pin: '', new_pin: '' };

  constructor(
    private userService: UserService,
    private messageService: MessageService,
  ) {}

  open() {
    this.data = { old_pin: '', new_pin: '' };
    this.visible.set(true);
  }

  async save() {
    this.loading.set(true);
    try {
      await this.userService.changePin(this.data).toPromise();
      this.visible.set(false);
      this.data = { old_pin: '', new_pin: '' };
      this.messageService.add({
        severity: 'success',
        summary: 'PIN Changed',
        detail: 'Your PIN has been updated',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to change PIN. Check your current PIN.',
      });
    } finally {
      this.loading.set(false);
    }
  }
}

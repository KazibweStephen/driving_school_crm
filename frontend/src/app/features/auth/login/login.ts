import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PasswordModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  phone = signal('');
  pin = signal('');
  error = signal<string | null>(null);
  loading = signal(false);

  showForgotDialog = signal(false);
  forgotStep = signal(1);
  forgotPhone = signal('');
  otp = signal('');
  newPin = signal('');
  confirmPin = signal('');
  forgotError = signal<string | null>(null);
  forgotSuccess = signal<string | null>(null);
  forgotLoading = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  async onSubmit() {
    this.error.set(null);
    this.loading.set(true);
    try {
      const res = await this.auth.login({
        phone: this.phone().trim(),
        pin: this.pin().trim(),
      }).toPromise();
      if (res) {
        this.auth.setSession(res.access_token, res.refresh_token);
        await this.router.navigate(['/dashboard']);
      }
    } catch {
      this.error.set('Invalid phone or PIN.');
    } finally {
      this.loading.set(false);
    }
  }

  openForgotDialog() {
    this.forgotPhone.set(this.phone().trim());
    this.forgotStep.set(1);
    this.otp.set('');
    this.newPin.set('');
    this.confirmPin.set('');
    this.forgotError.set(null);
    this.forgotSuccess.set(null);
    this.showForgotDialog.set(true);
  }

  async requestOtp() {
    this.forgotError.set(null);
    if (!/^\d{7,15}$/.test(this.forgotPhone().trim())) {
      this.forgotError.set('Enter a valid phone number.');
      return;
    }
    this.forgotLoading.set(true);
    try {
      await this.auth.requestPinReset(this.forgotPhone().trim()).toPromise();
      this.forgotStep.set(2);
    } catch {
      this.forgotError.set('Failed to send OTP. Please try again.');
    } finally {
      this.forgotLoading.set(false);
    }
  }

  async verifyOtp() {
    this.forgotError.set(null);
    if (this.otp().trim().length !== 6) {
      this.forgotError.set('Enter the 6-digit OTP you received.');
      return;
    }
    if (this.newPin().trim().length !== 4) {
      this.forgotError.set('New PIN must be 4 digits.');
      return;
    }
    if (this.newPin() !== this.confirmPin()) {
      this.forgotError.set('PINs do not match.');
      return;
    }
    this.forgotLoading.set(true);
    try {
      await this.auth
        .verifyPinReset({
          phone: this.forgotPhone().trim(),
          otp: this.otp().trim(),
          new_pin: this.newPin().trim(),
        })
        .toPromise();
      this.phone.set(this.forgotPhone().trim());
      this.forgotSuccess.set('PIN reset successfully. You can now log in with your new PIN.');
      this.forgotStep.set(3);
    } catch {
      this.forgotError.set('Invalid or expired OTP. Please try again.');
    } finally {
      this.forgotLoading.set(false);
    }
  }

  closeForgotDialog() {
    this.showForgotDialog.set(false);
    this.forgotStep.set(1);
    this.forgotError.set(null);
    this.forgotSuccess.set(null);
  }
}

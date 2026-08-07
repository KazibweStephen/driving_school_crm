import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/auth/auth.service';
import { MOBILE_REDIRECT_KEY } from '../../core/auth/auth.guard';

@Component({
  selector: 'app-login',
  imports: [FormsModule, ButtonModule, InputTextModule, PasswordModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-6 text-center">
          <div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-xl text-white">
            <span class="pi pi-car"></span>
          </div>
          <h1 class="text-xl font-semibold text-slate-900">Drive CRM</h1>
          <p class="text-sm text-slate-500">Office Admin</p>
        </div>

        @if (!resetMode()) {
          <form (ngSubmit)="login()" class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <input
                pInputText
                type="tel"
                inputmode="numeric"
                [(ngModel)]="phone"
                name="phone"
                required
                class="w-full"
                data-testid="phone"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">PIN</label>
              <input
                pInputText
                type="password"
                inputmode="numeric"
                maxlength="4"
                [(ngModel)]="pin"
                name="pin"
                required
                class="w-full tracking-widest"
                data-testid="pin"
              />
            </div>
            @if (error()) {
              <p class="text-sm text-red-600" data-testid="login-error">{{ error() }}</p>
            }
            <p-button
              type="submit"
              label="Sign in"
              styleClass="w-full justify-center"
              [loading]="loading()"
              data-testid="login-btn"
            />
            <button
              type="button"
              class="w-full text-center text-sm text-slate-500"
              (click)="resetMode.set(true)"
            >
              Forgot PIN?
            </button>
          </form>
        } @else {
          <form (ngSubmit)="resetPin()" class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <input
                pInputText
                type="tel"
                [(ngModel)]="resetPhone"
                name="resetPhone"
                required
                class="w-full"
                data-testid="reset-phone"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">OTP</label>
              <input
                pInputText
                type="text"
                inputmode="numeric"
                [(ngModel)]="otp"
                name="otp"
                required
                class="w-full"
                data-testid="otp"
              />
              <button
                type="button"
                class="mt-1 text-xs text-slate-500"
                (click)="sendOtp()"
                data-testid="send-otp"
              >
                {{ otpSent() ? 'Resend OTP' : 'Send OTP' }}
              </button>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">New PIN</label>
              <input
                pInputText
                type="password"
                inputmode="numeric"
                maxlength="4"
                [(ngModel)]="newPin"
                name="newPin"
                required
                class="w-full"
                data-testid="new-pin"
              />
            </div>
            @if (error()) {
              <p class="text-sm text-red-600">{{ error() }}</p>
            }
            <p-button
              type="submit"
              label="Reset PIN"
              styleClass="w-full justify-center"
              [loading]="loading()"
            />
            <button
              type="button"
              class="w-full text-center text-sm text-slate-500"
              (click)="resetMode.set(false)"
            >
              Back to sign in
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  phone = '';
  pin = '';
  loading = signal(false);
  error = signal('');
  resetMode = signal(false);
  resetPhone = '';
  otp = '';
  newPin = '';
  otpSent = signal(false);

  login() {
    this.error.set('');
    if (!this.phone || !this.pin) {
      this.error.set('Enter your phone and PIN');
      return;
    }
    this.loading.set(true);
    this.auth.login({ phone: this.phone.trim(), pin: this.pin }).subscribe({
      next: (res) => {
        this.auth.setSession(res.access_token, res.refresh_token);
        const redirectUrl = localStorage.getItem(MOBILE_REDIRECT_KEY);
        if (redirectUrl) {
          localStorage.removeItem(MOBILE_REDIRECT_KEY);
          this.router.navigateByUrl(redirectUrl);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.detail || 'Login failed. Check your phone and PIN.');
      },
      complete: () => this.loading.set(false),
    });
  }

  sendOtp() {
    if (!this.resetPhone) return;
    this.auth.requestPinReset(this.resetPhone.trim()).subscribe({
      next: () => {
        this.otpSent.set(true);
        this.messageService.add({
          severity: 'success',
          summary: 'OTP sent',
          detail: 'Check your phone for the reset code',
        });
      },
      error: (err) => {
        this.error.set(err.error?.detail || 'Could not send OTP');
      },
    });
  }

  resetPin() {
    this.error.set('');
    if (!this.resetPhone || !this.otp || this.newPin.length !== 4) {
      this.error.set('Fill in all fields. PIN must be 4 digits.');
      return;
    }
    this.loading.set(true);
    this.auth
      .verifyPinReset({
        phone: this.resetPhone.trim(),
        otp: this.otp,
        new_pin: this.newPin,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'PIN reset',
            detail: 'Sign in with your new PIN',
          });
          this.resetMode.set(false);
          this.pin = this.newPin;
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.detail || 'Reset failed');
        },
      });
  }
}

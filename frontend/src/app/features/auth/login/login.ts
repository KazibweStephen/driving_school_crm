import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    ButtonModule,
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
}

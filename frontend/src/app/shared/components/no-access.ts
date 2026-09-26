import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-no-access',
  imports: [ButtonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div class="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-md text-center">
        <div class="text-4xl mb-3">🔒</div>
        <h1 class="text-xl font-semibold text-slate-800 mb-2">No pages available</h1>
        <p class="text-slate-600 mb-6">
          Your account does not have access to any page yet. Ask an administrator to
          assign you a role with permissions, then sign in again.
        </p>
        <button pButton label="Sign out" (click)="logout()"></button>
      </div>
    </div>
  `,
})
export class NoAccess {
  constructor(private auth: AuthService, private router: Router) {}

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}

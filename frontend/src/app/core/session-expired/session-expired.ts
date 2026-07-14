import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-session-expired',
  imports: [DialogModule, ButtonModule],
  template: `
    @if (auth.isAuthenticated()) {
    <p-dialog
      [(visible)]="auth.sessionExpired"
      [modal]="true"
      [closable]="false"
      [dismissableMask]="false"
      header="Session Expired"
      [style]="{ width: '360px' }"
    >
      <p class="mb-3 text-sm text-gray-600">
        Your session has expired. Please refresh or log in again.
      </p>
      <p class="mb-4 text-xs text-gray-400">
        Auto-logout in {{ auth.sessionCountdown() }}s
      </p>
      <div class="flex justify-end gap-2">
        <p-button label="Logout" severity="danger" (onClick)="auth.logout()" />
        <p-button label="Refresh" (onClick)="onRefresh()" />
      </div>
    </p-dialog>
    }
  `,
})
export class SessionExpired {
  constructor(public auth: AuthService) {}

  async onRefresh() {
    const ok = await this.auth.refreshToken();
    if (!ok) this.auth.logout();
  }
}

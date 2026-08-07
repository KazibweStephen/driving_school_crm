import { Component, input } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-loading-overlay',
  imports: [ProgressSpinnerModule],
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
        data-testid="loading-overlay"
      >
        <div class="rounded-2xl bg-white p-6 shadow-xl">
          <p-progressSpinner styleClass="w-10 h-10" />
          <p class="mt-3 text-center text-sm text-slate-600">{{ message() }}</p>
        </div>
      </div>
    }
  `,
})
export class LoadingOverlay {
  visible = input(false);
  message = input('Please wait...');
}

import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConsultationService, ClientInfo } from '../../core/services/consultation.service';

@Component({
  selector: 'app-client-search',
  imports: [FormsModule, InputTextModule, ButtonModule, ProgressSpinnerModule],
  template: `
    @if (!chosen()) {
      <div class="w-full">
        <input
          pInputText
          type="search"
          [placeholder]="placeholder"
          class="w-full !min-h-[44px]"
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
          data-testid="client-search"
        />
        @if (loading()) {
          <div class="flex justify-center py-4">
            <p-progressSpinner styleClass="w-6 h-6" />
          </div>
        }
        @if (results().length > 0) {
          <ul class="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            @for (c of results(); track c.phone) {
              <li>
                <button
                  type="button"
                  class="w-full px-3 py-2 text-left"
                  (click)="select(c)"
                  data-testid="client-result"
                >
                  <div class="text-sm font-medium text-slate-800">
                    {{ c.first_name }} {{ c.middle_name }} {{ c.last_name }}
                  </div>
                  <div class="text-xs text-slate-500">{{ c.phone }}</div>
                </button>
              </li>
            }
          </ul>
        }
        @if (query() && !loading() && results().length === 0) {
          <p class="mt-2 text-xs text-slate-500">No clients found.</p>
        }
      </div>
    } @else {
      <div class="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div>
          <div class="text-sm font-medium text-slate-800">{{ chosen()!.first_name }} {{ chosen()!.middle_name }} {{ chosen()!.last_name }}</div>
          <div class="text-xs text-slate-500">{{ chosen()!.phone }}</div>
        </div>
        <button pButton type="button" label="Change" text (click)="reset()"></button>
      </div>
    }
  `,
})
export class ClientSearch {
  private consultationService = inject(ConsultationService);

  placeholder = 'Search client by name or phone';
  selected = output<ClientInfo>();

  query = signal('');
  results = signal<ClientInfo[]>([]);
  loading = signal(false);
  chosen = signal<ClientInfo | null>(null);
  private debounce: ReturnType<typeof setTimeout> | null = null;

  onQuery(value: string) {
    this.query.set(value);
    if (this.debounce) clearTimeout(this.debounce);
    if (value.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.debounce = setTimeout(() => this.search(value), 350);
  }

  private search(value: string) {
    this.loading.set(true);
    this.consultationService.clientSearch(value.trim()).subscribe({
      next: (res) => this.results.set(res ?? []),
      error: () => this.results.set([]),
      complete: () => this.loading.set(false),
    });
  }

  select(client: ClientInfo) {
    this.chosen.set(client);
    this.selected.emit(client);
  }

  reset() {
    this.chosen.set(null);
    this.query.set('');
    this.results.set([]);
  }

  clearSelection() {
    this.reset();
  }
}

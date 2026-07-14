import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from '../auth/auth.service';

const CURRENCY_SYMBOLS: Record<string, string> = {
  UGX: 'UGX',
  USD: '$',
  EUR: '\u20ac',
  GBP: '\u00a3',
  KES: 'KSh',
  TZS: 'TSh',
  RWF: 'FRw',
};

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private auth = inject(AuthService);

  code = computed(() => this.auth.currencyCode() || 'UGX');
  symbol = computed(() => CURRENCY_SYMBOLS[this.code()] || this.code());
}

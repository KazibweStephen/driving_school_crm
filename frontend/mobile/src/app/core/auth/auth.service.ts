import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

export interface LoginRequest {
  phone: string;
  pin: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'mobile_access_token';
  private readonly REFRESH_KEY = 'mobile_refresh_token';

  currentUser = signal<string | null>(null);
  currentUserName = signal<string | null>(null);
  currentUserRole = signal<string | null>(null);
  currentUserCompanyId = signal<string | null>(null);
  currentUserCanBackdate = signal(false);
  permissions = signal<string[]>([]);
  currencyCode = signal('UGX');
  isAuthenticated = signal(false);
  refreshing = false;

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (token) {
      this.applyToken(token);
    }
  }

  login(data: LoginRequest) {
    return this.http.post<TokenResponse>('/api/v1/auth/login', data);
  }

  requestPinReset(phone: string) {
    return this.http.post<{ message: string }>('/api/v1/auth/forgot-pin', { phone });
  }

  verifyPinReset(data: { phone: string; otp: string; new_pin: string }) {
    return this.http.post<{ message: string }>('/api/v1/auth/forgot-pin/verify', data);
  }

  setSession(token: string, refreshToken: string) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.REFRESH_KEY, refreshToken);
    this.applyToken(token);
  }

  currentUserPhone(): string | null {
    return this.currentUser();
  }

  hasPermission(code: string): boolean {
    return this.permissions().includes(code);
  }

  hasAnyPermission(codes: string[]): boolean {
    return codes.some((c) => this.hasPermission(c));
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.currentUserName.set(null);
    this.currentUserRole.set(null);
    this.currentUserCompanyId.set(null);
    this.currentUserCanBackdate.set(false);
    this.permissions.set([]);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  async refreshToken(): Promise<boolean> {
    if (this.refreshing) {
      await new Promise((r) => setTimeout(r, 400));
      return !!this.getToken();
    }
    const rt = localStorage.getItem(this.REFRESH_KEY);
    if (!rt) return false;
    this.refreshing = true;
    try {
      const res = await this.http
        .post<TokenResponse>('/api/v1/auth/refresh', { refresh_token: rt })
        .toPromise();
      if (res) {
        this.setSession(res.access_token, res.refresh_token);
        return true;
      }
      this.logout();
      return false;
    } catch {
      this.logout();
      return false;
    } finally {
      this.refreshing = false;
    }
  }

  private applyToken(token: string) {
    this.isAuthenticated.set(true);
    this.currentUser.set(this.decodeString(token, 'sub'));
    this.currentUserName.set(this.decodeString(token, 'name'));
    this.currentUserRole.set(this.decodeString(token, 'role'));
    this.currentUserCompanyId.set(this.decodeString(token, 'company_id'));
    this.currentUserCanBackdate.set(!!this.decodeBoolean(token, 'can_backdate'));
    this.currencyCode.set(this.decodeString(token, 'currency') || 'UGX');
    const perms = this.decodePayload(token)?.['permissions'];
    this.permissions.set(Array.isArray(perms) ? (perms as string[]) : []);
  }

  private decodePayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }

  private decodeString(token: string, key: string): string | null {
    const payload = this.decodePayload(token);
    const v = payload?.[key];
    return typeof v === 'string' ? v : null;
  }

  private decodeBoolean(token: string, key: string): boolean {
    const payload = this.decodePayload(token);
    return !!payload?.[key];
  }
}

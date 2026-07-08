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
  private readonly TOKEN_KEY = 'access_token';
  private readonly REFRESH_KEY = 'refresh_token';

  currentUser = signal<string | null>(null);
  currentUserRole = signal<string | null>(null);
  currentUserCanBackdate = signal(false);
  isAuthenticated = signal(false);
  sessionExpired = signal(false);
  sessionCountdown = signal(160);

  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (token) {
      this.isAuthenticated.set(true);
      const phone = this.decodePhoneFromToken(token);
      this.currentUser.set(phone);
      this.currentUserRole.set(this.decodeRoleFromToken(token));
      this.currentUserCanBackdate.set(this.decodeCanBackdate(token));
      this.startSessionTimer();
    }
  }

  login(data: LoginRequest) {
    return this.http.post<TokenResponse>('/api/v1/auth/login', data);
  }

  setSession(token: string, refreshToken: string) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.REFRESH_KEY, refreshToken);
    this.isAuthenticated.set(true);
    this.currentUser.set(this.decodePhoneFromToken(token));
    this.currentUserRole.set(this.decodeRoleFromToken(token));
    this.currentUserCanBackdate.set(this.decodeCanBackdate(token));
    this.startSessionTimer();
  }

  logout() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  async refreshToken(): Promise<boolean> {
    const rt = localStorage.getItem(this.REFRESH_KEY);
    if (!rt) return false;
    try {
      const res = await this.http
        .post<TokenResponse>('/api/v1/auth/refresh', { refresh_token: rt })
        .toPromise();
      if (res) {
        this.setSession(res.access_token, res.refresh_token);
        this.hideSessionExpired();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private startSessionTimer() {
    this.clearTimers();
    const token = this.getToken();
    if (!token) return;
    const payload = this.decodeToken(token);
    if (!payload?.['exp']) return;
    const msUntilExpiry = (payload['exp'] as number) * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      this.showSessionExpired();
      return;
    }
    this.sessionTimer = setTimeout(() => this.showSessionExpired(), msUntilExpiry);
  }

  private showSessionExpired() {
    this.sessionExpired.set(true);
    this.sessionCountdown.set(160);
    this.countdownTimer = setInterval(() => {
      this.sessionCountdown.update((v) => {
        if (v <= 1) {
          this.clearSession();
          this.router.navigate(['/login']);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  hideSessionExpired() {
    this.sessionExpired.set(false);
    this.sessionCountdown.set(160);
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.sessionExpired.set(false);
    this.sessionCountdown.set(160);
    this.clearTimers();
  }

  private clearTimers() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private decodeToken(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch {
      return null;
    }
  }

  private decodePhoneFromToken(token: string): string | null {
    const payload = this.decodeToken(token);
    return (payload?.['sub'] as string) || null;
  }

  private decodeRoleFromToken(token: string): string | null {
    const payload = this.decodeToken(token);
    return (payload?.['role'] as string) || null;
  }

  private decodeCanBackdate(token: string): boolean {
    const payload = this.decodeToken(token);
    return (payload?.['can_backdate'] as boolean) || false;
  }
}

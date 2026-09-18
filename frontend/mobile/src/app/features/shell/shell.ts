import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav, NavTab } from '../../shared/bottom-nav/bottom-nav';
import { CompanyService, Company } from '../../core/services/company.service';
import {
  FinanceService,
  TransferNotification,
  TransferNotificationsResponse,
  ExpenseNotification,
  ExpenseNotificationsResponse,
} from '../../core/services/finance.service';
import {
  PermitService,
  PermitNotificationItem,
  PermitNotificationsResponse,
} from '../../core/services/permit.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav],
  templateUrl: './shell.html',
})
export class Shell implements OnInit, OnDestroy {
  public auth = inject(AuthService);
  private router = inject(Router);
  private companyService = inject(CompanyService);
  private financeService = inject(FinanceService);
  private permitService = inject(PermitService);

  user = this.auth.currentUserName;
  currency = this.auth.currencyCode;

  companies = signal<Company[]>([]);
  companyMenuOpen = signal(false);
  switchingCompany = signal(false);

  notifications = signal<TransferNotification[]>([]);
  permitNotifications = signal<PermitNotificationItem[]>([]);
  expenseNotifications = signal<ExpenseNotification[]>([]);
  toReceiveCount = signal(0);
  toReceiveAmount = signal('0');
  pendingPermitCount = signal(0);
  pendingExpenseCount = signal(0);
  notificationsOpen = signal(false);
  loadingNotifications = signal(false);
  receivingId = signal<string | null>(null);
  cancellingId = signal<string | null>(null);

  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  get isSuperAdmin(): boolean {
    return this.auth.currentUserRole() === 'super_user';
  }

  get currentCompanyName(): string {
    const cid = this.auth.currentUserCompanyId();
    const match = this.companies().find((c) => c.id === cid);
    return match ? match.name : cid ? 'Company' : '';
  }

  ngOnInit() {
    if (this.isSuperAdmin) {
      this.loadCompanies();
    }
    this.refreshNotifications();
    this._pollTimer = setInterval(() => this.refreshNotifications(), 60000);
  }

  ngOnDestroy() {
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  async refreshNotifications() {
    try {
      const res: TransferNotificationsResponse | undefined = await this.financeService
        .getTransferNotifications(20)
        .toPromise();
      if (res) {
        this.notifications.set(res.items);
        this.toReceiveCount.set(res.to_receive_count);
        this.toReceiveAmount.set(res.to_receive_amount);
      }
    } catch {
      /* non-critical */
    }

    if (this.auth.hasPermission('training.view')) {
      try {
        const permitRes: PermitNotificationsResponse | undefined = await this.permitService
          .getPermitNotifications(20)
          .toPromise();
        if (permitRes) {
          this.permitNotifications.set(permitRes.items);
          this.pendingPermitCount.set(permitRes.total);
        }
      } catch {
        /* non-critical */
      }
    }

    if (this.auth.hasPermission('expenses.view')) {
      try {
        const expenseRes: ExpenseNotificationsResponse | undefined = await this.financeService
          .getExpenseNotifications(20)
          .toPromise();
        if (expenseRes) {
          this.expenseNotifications.set(expenseRes.items);
          this.pendingExpenseCount.set(expenseRes.pending_count + expenseRes.approved_count);
        }
      } catch {
        /* non-critical */
      }
    }

    this.loadingNotifications.set(false);
  }

  toggleNotifications() {
    this.notificationsOpen.update((v) => !v);
    if (this.notificationsOpen()) {
      this.loadingNotifications.set(true);
      this.refreshNotifications();
    }
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }

  get totalNotificationCount(): number {
    return this.toReceiveCount() + this.pendingPermitCount() + this.pendingExpenseCount();
  }

  get noNotifications(): boolean {
    return (
      this.notifications().length === 0 &&
      this.permitNotifications().length === 0 &&
      this.expenseNotifications().length === 0
    );
  }

  formatAmount(v: string | number | null | undefined): string {
    return Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  timeAgo(d: string): string {
    const ms = new Date(d).getTime();
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 0) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? 'yesterday' : `${days}d ago`;
  }

  async receiveTransfer(n: TransferNotification) {
    this.receivingId.set(n.id);
    try {
      await this.financeService.receiveTransfer(n.id).toPromise();
      await this.refreshNotifications();
    } catch {
      /* non-critical */
    } finally {
      this.receivingId.set(null);
    }
  }

  async cancelTransferNotification(n: TransferNotification) {
    this.cancellingId.set(n.id);
    try {
      await this.financeService.cancelTransfer(n.id).toPromise();
      await this.refreshNotifications();
    } catch {
      /* non-critical */
    } finally {
      this.cancellingId.set(null);
    }
  }

  goToTransfers() {
    this.notificationsOpen.set(false);
    this.router.navigate(['/finance/transfers']);
  }

  goToPermits() {
    this.notificationsOpen.set(false);
    this.router.navigate(['/permits']);
  }

  goToExpenses() {
    this.notificationsOpen.set(false);
    this.router.navigate(['/expenses']);
  }

  async loadCompanies() {
    try {
      const companies = await this.companyService.list().toPromise();
      if (companies) this.companies.set(companies);
    } catch {
      /* non-critical */
    }
  }

  toggleCompanyMenu() {
    this.companyMenuOpen.update((v) => !v);
    if (this.companyMenuOpen() && this.companies().length === 0) {
      this.loadCompanies();
    }
  }

  async switchCompany(id: string) {
    this.switchingCompany.set(true);
    try {
      const res = await this.auth.switchCompany(id).toPromise();
      if (res) {
        this.auth.setSession(res.access_token, res.refresh_token);
        window.location.reload();
      }
    } catch {
      /* keep menu open; ignore */
    } finally {
      this.switchingCompany.set(false);
    }
  }

  tabs = computed<NavTab[]>(() => {
    return [{ route: '/home', label: 'Home', icon: 'pi-home' }];
  });

  logout() {
    this.auth.logout();
  }

  switchToDesktop() {
    document.cookie = 'prefer_desktop=1; path=/; max-age=2592000';
    window.location.href = '/';
  }
}

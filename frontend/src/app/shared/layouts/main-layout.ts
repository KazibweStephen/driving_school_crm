import { Component, OnInit, OnDestroy, signal, ViewChild } from '@angular/core';
import { Event as RouterEvent, NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { ChangePinDialog } from '../../shared/components/change-pin-dialog';
import {
  FinanceService,
  TransferNotification,
  TransferNotificationsResponse,
} from '../../core/services/finance.service';
import {
  DiscountNotification,
  DiscountService,
} from '../../core/services/discount.service';
import { NotificationRefreshService } from '../../core/services/notification-refresh.service';
import { CompanyService, Company } from '../../core/services/company.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  permission: string;
}

interface NavGroup {
  label: string;
  icon: string;
  expanded: boolean;
  children: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule, TagModule, ChangePinDialog],
  providers: [MessageService],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnInit, OnDestroy {
  sidebarOpen = signal(true);
  expandedGroups = signal<Set<string>>(new Set());
  notificationsOpen = signal(false);
  notifications = signal<TransferNotification[]>([]);
  discountNotifications = signal<DiscountNotification[]>([]);
  toReceiveCount = signal(0);
  toReceiveAmount = signal('0.00');
  pendingDiscountCount = signal(0);
  loadingNotifications = signal(false);
  receivingId = signal<string | null>(null);
  approvingDiscountId = signal<string | null>(null);
  rejectingDiscountId = signal<string | null>(null);
  companies = signal<Company[]>([]);
  companySwitcherOpen = signal(false);
  switchingCompany = signal(false);
  routeLoading = signal(false);
  actionsOpen = signal(false);
  private _pollTimer: any = null;
  @ViewChild('changePin') changePin!: ChangePinDialog;

  get displayName(): string {
    return this.auth.currentUserName() || this.auth.currentUser() || 'User';
  }

  get displayInitial(): string {
    return (this.auth.currentUserName() || this.auth.currentUser() || 'U').charAt(0).toUpperCase();
  }

  get isSuperAdmin(): boolean {
    return this.auth.hasRole('super_user');
  }

  get currentCompanyName(): string {
    const cid = this.auth.currentUserCompanyId();
    const match = this.companies().find((c) => c.id === cid);
    return match ? match.name : cid ? 'Company' : '';
  }

  topItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'pi pi-home', permission: 'dashboard.view' },
    { path: '/reports', label: 'Reports', icon: 'pi pi-chart-bar', permission: 'reports.view' },
  ];

  navGroups: NavGroup[] = [
    {
      label: 'Sales & Expenses', icon: 'pi pi-dollar', expanded: false,
      children: [
        { path: '/consultations', label: 'Consultations', icon: 'pi pi-phone', permission: 'consultations.view' },
        { path: '/bulk-onboarding', label: 'Bulk Onboarding', icon: 'pi pi-upload', permission: 'bulk_onboarding.manage' },
        { path: '/expenses', label: 'Expenses', icon: 'pi pi-minus-circle', permission: 'expenses.view' },
        { path: '/expense-categories', label: 'Expense Categories', icon: 'pi pi-tags', permission: 'expenses.manage' },
        { path: '/payments', label: 'Payments', icon: 'pi pi-credit-card', permission: 'payments.view' },
        { path: '/collections-sheet', label: 'Collections Sheet', icon: 'pi pi-file-invoice', permission: 'collections.view' },
      ],
    },
    {
      label: 'Finance', icon: 'pi pi-dollar', expanded: false,
      children: [
        { path: '/cash-position', label: 'Cash Position', icon: 'pi pi-wallet', permission: 'finance.view' },
        { path: '/transfers', label: 'Branch Transfers', icon: 'pi pi-arrow-right-arrow-left', permission: 'transfers.view' },
        { path: '/profit-loss', label: 'Profit & Loss', icon: 'pi pi-chart-line', permission: 'finance.manage' },
      ],
    },
    {
      label: 'Fleet', icon: 'pi pi-truck', expanded: false,
      children: [
        { path: '/vehicles', label: 'Vehicles', icon: 'pi pi-truck', permission: 'vehicles.view' },
        { path: '/vehicle-schedule', label: 'Vehicle Schedule', icon: 'pi pi-calendar-clock', permission: 'vehicle_schedule.view' },
        { path: '/weekly-schedule', label: 'Weekly Schedule', icon: 'pi pi-calendar', permission: 'availabilities.view' },
        { path: '/schedule-breaks', label: 'Schedule Breaks', icon: 'pi pi-clock', permission: 'schedule_breaks.manage' },
        { path: '/fuel-tracking', label: 'Fuel Tracking', icon: 'pi pi-car', permission: 'fuel.view' },
        { path: '/training-schedule', label: 'Training Schedule', icon: 'pi pi-calendar-clock', permission: 'training.view' },
      ],
    },
    {
      label: 'Lesson Planning', icon: 'pi pi-book', expanded: false,
      children: [
        { path: '/lesson-plans', label: 'Lesson Plans', icon: 'pi pi-book', permission: 'lesson_plans.view' },
        { path: '/lesson-library', label: 'Lesson Library', icon: 'pi pi-list', permission: 'lesson_library.view' },
        { path: '/video-library', label: 'Video Library', icon: 'pi pi-video', permission: 'video_library.view' },
        { path: '/competency-catalogue', label: 'Competency Catalogue', icon: 'pi pi-check-circle', permission: 'competency.view' },
      ],
    },
    {
      label: 'Management', icon: 'pi pi-cog', expanded: false,
      children: [
        { path: '/users', label: 'Users', icon: 'pi pi-users', permission: 'users.view' },
        { path: '/users/transfers', label: 'Transfer History', icon: 'pi pi-arrow-right-arrow-left', permission: 'users.view' },
        { path: '/discounts', label: 'Discounts', icon: 'pi pi-percentage', permission: 'discounts.view' },
        { path: '/branches', label: 'Branches', icon: 'pi pi-sitemap', permission: 'branches.view' },
        { path: '/companies', label: 'Companies', icon: 'pi pi-building', permission: 'companies.view' },
        { path: '/products', label: 'Products', icon: 'pi pi-box', permission: 'products.view' },
        { path: '/commissions', label: 'Commissions', icon: 'pi pi-dollar', permission: 'commissions.view' },
        { path: '/permissions', label: 'Permissions', icon: 'pi pi-key', permission: 'permissions.manage' },
        { path: '/company-settings', label: 'Company Settings', icon: 'pi pi-cog', permission: 'sms.view' },
        { path: '/sms-logs', label: 'SMS Logs', icon: 'pi pi-history', permission: 'sms.view' },
      ],
    },
  ];

  constructor(
    public auth: AuthService,
    private financeService: FinanceService,
    private discountService: DiscountService,
    private notificationRefresh: NotificationRefreshService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private router: Router,
  ) {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.sidebarOpen.set(false);
    }
  }

  get visibleTopItems(): NavItem[] {
    return this.topItems.filter((i) => this.auth.hasPermission(i.permission));
  }

  get visibleNavGroups(): NavGroup[] {
    return this.navGroups
      .map((g) => ({ ...g, children: g.children.filter((i) => this.auth.hasPermission(i.permission)) }))
      .filter((g) => g.children.length > 0);
  }

  isGroupExpanded(group: NavGroup): boolean {
    return this.expandedGroups().has(group.label);
  }

  ngOnInit() {
    this.refreshNotifications();
    if (this.isSuperAdmin) {
      this.loadCompanies();
    }
    if (typeof window !== 'undefined') {
      this._pollTimer = setInterval(() => this.refreshNotifications(), 60000);
    }
    this.notificationRefresh.refresh$.subscribe(() => this.refreshNotifications());
    this.router.events.subscribe((event: RouterEvent) => {
      if (event instanceof NavigationStart) {
        this.routeLoading.set(true);
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.routeLoading.set(false);
      }
    });
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

    if (this.auth.hasPermission('discounts.view')) {
      try {
        const discountRes = await this.discountService.getPendingNotifications(20).toPromise();
        if (discountRes) {
          this.discountNotifications.set(discountRes.items);
          this.pendingDiscountCount.set(discountRes.total);
        }
      } catch {
        /* non-critical */
      }
    }
  }

  toggleNotifications() {
    this.notificationsOpen.set(!this.notificationsOpen());
    if (this.notificationsOpen()) this.refreshNotifications();
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }

  toggleActions() {
    this.actionsOpen.set(!this.actionsOpen());
  }

  closeActions() {
    this.actionsOpen.set(false);
  }

  goToTransfers() {
    this.notificationsOpen.set(false);
    this.router.navigate(['/transfers']);
  }

  async receiveTransfer(t: TransferNotification) {
    this.receivingId.set(t.id);
    try {
      await this.financeService.receiveTransfer(t.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Received', detail: 'Transfer received' });
      await this.refreshNotifications();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to receive transfer' });
    } finally {
      this.receivingId.set(null);
    }
  }

  discountDescription(d: DiscountNotification): string {
    if (d.discount_type === 'fixed') {
      return `${d.discount_value.toLocaleString()} UGX off`;
    }
    return `${d.discount_value}% off`;
  }

  async approveDiscountNotification(d: DiscountNotification) {
    this.approvingDiscountId.set(d.id);
    try {
      await this.discountService.approve(d.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Discount approved' });
      await this.refreshNotifications();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to approve discount' });
    } finally {
      this.approvingDiscountId.set(null);
    }
  }

  async rejectDiscountNotification(d: DiscountNotification) {
    this.rejectingDiscountId.set(d.id);
    try {
      await this.discountService.reject(d.id, 'Rejected from notification').toPromise();
      this.messageService.add({ severity: 'success', summary: 'Rejected', detail: 'Discount rejected' });
      await this.refreshNotifications();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to reject discount' });
    } finally {
      this.rejectingDiscountId.set(null);
    }
  }

  goToDiscounts() {
    this.notificationsOpen.set(false);
    this.router.navigate(['/discounts']);
  }

  async loadCompanies() {
    try {
      const companies = await this.companyService.list().toPromise();
      if (companies) this.companies.set(companies);
    } catch {
      /* non-critical */
    }
  }

  toggleCompanySwitcher() {
    this.companySwitcherOpen.set(!this.companySwitcherOpen());
    if (this.companySwitcherOpen() && this.companies().length === 0) {
      this.loadCompanies();
    }
  }

  closeCompanySwitcher() {
    this.companySwitcherOpen.set(false);
  }

  async switchCompany(id: string) {
    this.switchingCompany.set(true);
    try {
      const res = await this.auth.switchCompany(id).toPromise();
      if (res) {
        this.auth.setSession(res.access_token, res.refresh_token);
        window.location.reload();
      }
    } catch (e: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: e?.error?.detail || 'Failed to switch company',
      });
    } finally {
      this.switchingCompany.set(false);
    }
  }

  formatAmount(val: string | number): string {
    const n = typeof val === 'number' ? val : parseFloat(val);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  timeAgo(d: string): string {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  toggleGroup(group: NavGroup) {
    this.expandedGroups.update((set) => {
      const next = new Set(set);
      if (next.has(group.label)) {
        next.delete(group.label);
      } else {
        next.add(group.label);
      }
      return next;
    });
  }

  switchToMobile() {
    if (typeof document !== 'undefined') {
      document.cookie = 'prefer_desktop=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    window.location.href = '/m/';
  }

  toggleSidebar() {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar() {
    if (window.innerWidth < 1024) {
      this.sidebarOpen.set(false);
    }
  }
}

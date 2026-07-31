import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import {
  FinanceService,
  TransferNotification,
  TransferNotificationsResponse,
} from '../../core/services/finance.service';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule, TagModule],
  providers: [MessageService],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnInit, OnDestroy {
  sidebarOpen = signal(true);
  expandedGroups = signal<Set<string>>(new Set());
  notificationsOpen = signal(false);
  notifications = signal<TransferNotification[]>([]);
  toReceiveCount = signal(0);
  toReceiveAmount = signal('0.00');
  loadingNotifications = signal(false);
  receivingId = signal<string | null>(null);
  private _pollTimer: any = null;

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
        { path: '/payments', label: 'Payments', icon: 'pi pi-credit-card', permission: 'payments.view' },
        { path: '/collections-sheet', label: 'Collections Sheet', icon: 'pi pi-file-invoice', permission: 'collections.view' },
        { path: '/transfers', label: 'Branch Transfers', icon: 'pi pi-arrow-right-arrow-left', permission: 'transfers.view' },
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
    if (typeof window !== 'undefined') {
      this._pollTimer = setInterval(() => this.refreshNotifications(), 60000);
    }
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
  }

  toggleNotifications() {
    this.notificationsOpen.set(!this.notificationsOpen());
    if (this.notificationsOpen()) this.refreshNotifications();
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
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

  toggleSidebar() {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar() {
    if (window.innerWidth < 1024) {
      this.sidebarOpen.set(false);
    }
  }
}

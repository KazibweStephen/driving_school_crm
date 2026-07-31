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
  notificationsOpen = signal(false);
  notifications = signal<TransferNotification[]>([]);
  toReceiveCount = signal(0);
  toReceiveAmount = signal('0.00');
  loadingNotifications = signal(false);
  receivingId = signal<string | null>(null);
  private _pollTimer: any = null;

  topItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'pi pi-home' },
    { path: '/reports', label: 'Reports', icon: 'pi pi-chart-bar' },
  ];

  navGroups: NavGroup[] = [
    {
      label: 'Sales & Expenses', icon: 'pi pi-dollar', expanded: false,
      children: [
        { path: '/consultations', label: 'Consultations', icon: 'pi pi-phone' },
        { path: '/bulk-onboarding', label: 'Bulk Onboarding', icon: 'pi pi-upload' },
        { path: '/expenses', label: 'Expenses', icon: 'pi pi-minus-circle' },
        { path: '/payments', label: 'Payments', icon: 'pi pi-credit-card' },
        { path: '/collections-sheet', label: 'Collections Sheet', icon: 'pi pi-file-invoice' },
        { path: '/transfers', label: 'Branch Transfers', icon: 'pi pi-arrow-right-arrow-left' },
      ],
    },
    {
      label: 'Fleet', icon: 'pi pi-truck', expanded: false,
      children: [
        { path: '/vehicles', label: 'Vehicles', icon: 'pi pi-truck' },
        { path: '/vehicle-schedule', label: 'Vehicle Schedule', icon: 'pi pi-calendar-clock' },
        { path: '/weekly-schedule', label: 'Weekly Schedule', icon: 'pi pi-calendar' },
        { path: '/schedule-breaks', label: 'Schedule Breaks', icon: 'pi pi-clock' },
        { path: '/fuel-tracking', label: 'Fuel Tracking', icon: 'pi pi-car' },
        { path: '/training-schedule', label: 'Training Schedule', icon: 'pi pi-calendar-clock' },
      ],
    },
    {
      label: 'Lesson Planning', icon: 'pi pi-book', expanded: false,
      children: [
        { path: '/lesson-plans', label: 'Lesson Plans', icon: 'pi pi-book' },
        { path: '/lesson-library', label: 'Lesson Library', icon: 'pi pi-list' },
        { path: '/video-library', label: 'Video Library', icon: 'pi pi-video' },
        { path: '/competency-catalogue', label: 'Competency Catalogue', icon: 'pi pi-check-circle' },
      ],
    },
    {
      label: 'Management', icon: 'pi pi-cog', expanded: false,
      children: [
        { path: '/users', label: 'Users', icon: 'pi pi-users' },
        { path: '/branches', label: 'Branches', icon: 'pi pi-sitemap' },
        { path: '/companies', label: 'Companies', icon: 'pi pi-building' },
        { path: '/products', label: 'Products', icon: 'pi pi-box' },
        { path: '/commissions', label: 'Commissions', icon: 'pi pi-dollar' },
        { path: '/company-settings', label: 'Company Settings', icon: 'pi pi-cog' },
        { path: '/sms-logs', label: 'SMS Logs', icon: 'pi pi-history' },
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
    group.expanded = !group.expanded;
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

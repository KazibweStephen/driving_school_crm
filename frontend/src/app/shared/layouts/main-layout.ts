import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {
  sidebarOpen = signal(true);

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
      ],
    },
  ];

  constructor(public auth: AuthService) {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.sidebarOpen.set(false);
    }
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

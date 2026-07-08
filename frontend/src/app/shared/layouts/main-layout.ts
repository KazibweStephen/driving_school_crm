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
    { path: '/consultations', label: 'Consultations', icon: 'pi pi-phone' },
  ];

  navGroups: NavGroup[] = [
    {
      label: 'Management', icon: 'pi pi-cog', expanded: false,
      children: [
        { path: '/users', label: 'Users', icon: 'pi pi-users' },
        { path: '/branches', label: 'Branches', icon: 'pi pi-sitemap' },
        { path: '/companies', label: 'Companies', icon: 'pi pi-building' },
        { path: '/products', label: 'Products', icon: 'pi pi-box' },
        { path: '/expenses', label: 'Expenses', icon: 'pi pi-dollar' },
        { path: '/payments', label: 'Payments', icon: 'pi pi-credit-card' },
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
      label: 'Fleet', icon: 'pi pi-truck', expanded: false,
      children: [
        { path: '/vehicles', label: 'Vehicles', icon: 'pi pi-truck' },
        { path: '/vehicle-schedule', label: 'Vehicle Schedule', icon: 'pi pi-calendar-clock' },
        { path: '/weekly-schedule', label: 'Weekly Schedule', icon: 'pi pi-calendar' },
        { path: '/schedule-breaks', label: 'Schedule Breaks', icon: 'pi pi-clock' },
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

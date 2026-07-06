import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TooltipModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {
  sidebarOpen = signal(true);

  navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'pi pi-home' },
    { path: '/users', label: 'Users', icon: 'pi pi-users' },
    { path: '/companies', label: 'Companies', icon: 'pi pi-building' },
    { path: '/branches', label: 'Branches', icon: 'pi pi-sitemap' },
    { path: '/products', label: 'Products', icon: 'pi pi-box' },
    { path: '/lesson-plans', label: 'Lesson Plans', icon: 'pi pi-book' },
    { path: '/lesson-library', label: 'Lesson Library', icon: 'pi pi-list' },
    { path: '/video-library', label: 'Video Library', icon: 'pi pi-video' },
    { path: '/vehicles', label: 'Vehicles', icon: 'pi pi-truck' },
    { path: '/vehicle-schedule', label: 'Vehicle Schedule', icon: 'pi pi-calendar-clock' },
    { path: '/weekly-schedule', label: 'Weekly Schedule', icon: 'pi pi-calendar' },
    { path: '/schedule-breaks', label: 'Schedule Breaks', icon: 'pi pi-clock' },
    { path: '/consultations', label: 'Consultations', icon: 'pi pi-phone' },
  ];

  constructor(public auth: AuthService) {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.sidebarOpen.set(false);
    }
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

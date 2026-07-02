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
    { path: '/products', label: 'Products', icon: 'pi pi-box' },
    { path: '/lesson-plans', label: 'Lesson Plans', icon: 'pi pi-book' },
    { path: '/lesson-library', label: 'Lesson Library', icon: 'pi pi-list' },
    { path: '/video-library', label: 'Video Library', icon: 'pi pi-video' },
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

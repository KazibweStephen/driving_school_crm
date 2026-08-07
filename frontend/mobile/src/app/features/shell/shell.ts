import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav, NavTab } from '../../shared/bottom-nav/bottom-nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav],
  templateUrl: './shell.html',
})
export class Shell {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.currentUserName;
  currency = this.auth.currencyCode;

  tabs = computed<NavTab[]>(() => {
    const perms = this.auth.permissions();
    const tabs: NavTab[] = [];
    tabs.push({ route: '/dashboard', label: 'Home', icon: 'pi-home' });
    if (perms.includes('consultations.create')) {
      tabs.push({ route: '/sales', label: 'Sales', icon: 'pi-tags' });
    }
    if (perms.includes('payments.record')) {
      tabs.push({ route: '/payments', label: 'Payments', icon: 'pi-wallet' });
    }
    if (perms.includes('lesson_plans.edit')) {
      tabs.push({ route: '/lessons', label: 'Lessons', icon: 'pi-calendar' });
    }
    if (perms.includes('lesson_plans.create')) {
      tabs.push({ route: '/schedule', label: 'Schedule', icon: 'pi-plus-circle' });
    }
    if (perms.includes('sms.send')) {
      tabs.push({ route: '/sms', label: 'SMS', icon: 'pi-comments' });
    }
    if (perms.includes('expenses.view')) {
      tabs.push({ route: '/expenses', label: 'Expenses', icon: 'pi-money-bill' });
    }
    return tabs;
  });

  logout() {
    this.auth.logout();
  }

  switchToDesktop() {
    document.cookie = 'prefer_desktop=1; path=/; max-age=2592000';
    window.location.href = '/';
  }
}

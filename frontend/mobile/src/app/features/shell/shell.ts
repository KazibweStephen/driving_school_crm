import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav, NavTab } from '../../shared/bottom-nav/bottom-nav';
import { CompanyService, Company } from '../../core/services/company.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav],
  templateUrl: './shell.html',
})
export class Shell implements OnInit {
  public auth = inject(AuthService);
  private router = inject(Router);
  private companyService = inject(CompanyService);

  user = this.auth.currentUserName;
  currency = this.auth.currencyCode;

  companies = signal<Company[]>([]);
  companyMenuOpen = signal(false);
  switchingCompany = signal(false);

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
    const perms = this.auth.permissions();
    const tabs: NavTab[] = [];
    tabs.push({ route: '/home', label: 'Home', icon: 'pi-home' });
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

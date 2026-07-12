import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../core/auth/auth.service';
import { ReportsService, DashboardSummary } from '../../core/services/reports.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CommonModule, ButtonModule, TagModule],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  summary = signal<DashboardSummary | null>(null);
  loading = signal(true);
  error = signal(false);

  constructor(
    public auth: AuthService,
    private reportsSvc: ReportsService,
  ) {}

  ngOnInit() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.loading.set(true);
    this.error.set(false);
    this.reportsSvc.getDashboard().subscribe({
      next: s => {
        this.summary.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }
}

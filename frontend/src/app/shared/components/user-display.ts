import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService, User } from '../../core/services/user.service';

@Component({
  selector: 'app-user-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (user) {
      <span class="font-medium text-gray-900">{{ user.name }}</span>
      <span class="text-xs text-gray-500 ml-1">{{ user.phone }}</span>
    } @else if (loading) {
      <span class="text-xs text-gray-400 italic">loading...</span>
    } @else if (phone) {
      <span class="text-xs text-gray-500">{{ phone }}</span>
    }
  `,
})
export class UserDisplayCmp implements OnInit {
  @Input() phone: string | null | undefined = '';
  user: User | null = null;
  loading = false;

  private static cache = new Map<string, User>();

  constructor(private userService: UserService) {}

  ngOnInit() {
    if (!this.phone) return;
    const cached = UserDisplayCmp.cache.get(this.phone);
    if (cached) {
      this.user = cached;
      return;
    }
    this.loading = true;
    this.userService.getByPhone(this.phone).subscribe({
      next: (u) => {
        UserDisplayCmp.cache.set(this.phone!, u);
        this.user = u;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }
}

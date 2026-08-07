import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavTab {
  route: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
      <div class="mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        @for (tab of tabs(); track tab.route) {
          <a
            [routerLink]="tab.route"
            routerLinkActive="text-slate-900"
            class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-slate-400"
          >
            <span [class]="tab.icon" class="pi text-lg"></span>
            <span>{{ tab.label }}</span>
          </a>
        }
      </div>
    </nav>
  `,
})
export class BottomNav {
  tabs = input<NavTab[]>([]);
}

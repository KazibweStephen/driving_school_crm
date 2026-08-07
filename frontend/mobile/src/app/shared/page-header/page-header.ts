import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  imports: [],
  template: `
    <div class="mb-3 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-slate-900">{{ title() }}</h1>
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  title = input('');
}

import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-backdate-input',
  imports: [FormsModule, DatePickerModule],
  template: `
    @if (canBackdate()) {
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-slate-700">Date</label>
        <p-datepicker
          [(ngModel)]="date"
          dateFormat="dd/mm/yy"
          appendTo="body"
          class="w-full"
          data-testid="document-date"
        />
      </div>
    }
  `,
})
export class BackdateInput {
  canBackdate = input(false);
  date = model<Date | null>(null);
}

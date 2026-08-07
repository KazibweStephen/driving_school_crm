import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
} from '../../core/services/consultation.service';
import { SmsService, SmsTemplate } from '../../core/services/sms.service';
import { ClientSearch } from '../../shared/client-search/client-search';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-sms',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ClientSearch,
    LoadingOverlay,
    PageHeader,
  ],
  templateUrl: './sms.html',
})
export class Sms {
  private auth = inject(AuthService);
  private consultationService = inject(ConsultationService);
  private smsService = inject(SmsService);
  private messageService = inject(MessageService);

  companyId = this.auth.currentUserCompanyId;
  sending = signal(false);
  loadingTemplates = signal(false);

  client: ClientInfo | null = null;
  manualPhone = '';
  phone = signal('');

  templates = signal<SmsTemplate[]>([]);
  templateId = signal<string | null>(null);
  message = signal('');

  segmentCount = computed(() => Math.max(1, Math.ceil(this.message().length / 160)));

  loadTemplates() {
    const companyId = this.companyId();
    if (!companyId || this.templates().length > 0) return;
    this.loadingTemplates.set(true);
    this.smsService.listTemplates(companyId).subscribe({
      next: (templates) => {
        this.templates.set(templates.filter((t) => t.is_active !== false));
        this.loadingTemplates.set(false);
      },
      error: () => this.loadingTemplates.set(false),
    });
  }

  onClientSelected(client: ClientInfo) {
    this.client = client;
    this.phone.set(client.phone);
  }

  onManualPhone(value: string) {
    this.manualPhone = value;
    this.phone.set(value.trim());
  }

  onTemplateChange() {
    const tpl = this.templates().find((t) => t.id === this.templateId());
    if (tpl) this.message.set(tpl.body);
  }

  clearRecipient() {
    this.client = null;
    this.manualPhone = '';
    this.phone.set('');
  }

  send() {
    const companyId = this.companyId();
    if (!companyId) {
      this.messageService.add({ severity: 'error', summary: 'No company', detail: 'Re-login to continue' });
      return;
    }
    if (!this.phone()) {
      this.messageService.add({ severity: 'warn', summary: 'No recipient', detail: 'Pick a client or enter a phone number' });
      return;
    }
    if (!this.message().trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Empty message' });
      return;
    }
    this.sending.set(true);
    this.smsService.sendSms(companyId, this.phone(), this.message().trim()).subscribe({
      next: () => {
        this.sending.set(false);
        this.messageService.add({ severity: 'success', summary: 'SMS sent', detail: this.phone() });
        this.message.set('');
        this.templateId.set(null);
      },
      error: (err) => {
        this.sending.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not send SMS',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }
}

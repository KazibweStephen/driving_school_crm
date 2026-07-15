import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import {
  SmsService,
  SmsSettings,
  SmsSettingsUpdate,
  SmsTemplate,
  SmsTemplateCreate,
  SMS_TEMPLATE_CATEGORIES,
  SMS_TRIGGERS,
  TEMPLATE_PLACEHOLDERS,
} from '../../core/services/sms.service';
import { CompanyService, Company } from '../../core/services/company.service';

@Component({
  selector: 'app-company-settings',
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, DialogModule,
    InputTextModule, TextareaModule, ToggleSwitchModule, TagModule, ToastModule,
    ConfirmDialogModule, SelectModule, TabsModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast></p-toast>
    <p-confirmDialog />

    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">Company Settings</h1>

      @if (isSuperUser() && companies().length > 0) {
        <div class="mb-4">
          <label class="mb-1 block text-sm font-medium text-gray-700">Select Company</label>
          <p-select [(ngModel)]="selectedCompanyId" [options]="companies()" optionLabel="name"
            optionValue="id" placeholder="Choose a company" styleClass="w-80" appendTo="body"
            (onChange)="onCompanyChange()" />
        </div>
      }

      @if (!selectedCompanyId) {
        <div class="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
          @if (isSuperUser()) {
            Select a company above to configure its SMS settings.
          } @else {
            You are not associated with any company. SMS settings are not available.
          }
        </div>
      } @else {
        <p-tabs value="provider">
          <p-tablist>
            <p-tab value="provider">SMS Provider</p-tab>
            <p-tab value="templates">SMS Templates</p-tab>
          </p-tablist>
          <p-tabpanels>
            <!-- SMS Provider Tab -->
            <p-tabpanel value="provider">

              <div class="max-w-2xl">
                <div class="flex items-center gap-3 mb-6">
                  <p-toggleswitch [(ngModel)]="settingsForm.is_active" (onChange)="saveSettings()" />
                  <span class="text-sm font-medium">{{ settingsForm.is_active ? 'SMS Enabled' : 'SMS Disabled' }}</span>
                  <span class="text-xs text-gray-500">(When disabled, all SMS is logged for testing)</span>
                </div>

                <div class="mb-4">
                  <label class="mb-1 block text-sm font-medium text-gray-700">Provider</label>
                  <p-select [(ngModel)]="settingsForm.provider" [options]="providerOptions"
                    optionLabel="label" optionValue="value" placeholder="Select provider"
                    styleClass="w-full" appendTo="body" />
                </div>

                @if (settingsForm.provider === 'egosms') {
                  <div class="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg border">
                    <h3 class="font-medium text-sm text-gray-700">egoSMS Settings</h3>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600">API URL</label>
                      <input pInputText [(ngModel)]="settingsForm.egosms_api_url" class="w-full" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="mb-1 block text-xs font-medium text-gray-600">Username</label>
                        <input pInputText [(ngModel)]="settingsForm.egosms_username" class="w-full" />
                      </div>
                      <div>
                        <label class="mb-1 block text-xs font-medium text-gray-600">Password</label>
                        <input pInputText [(ngModel)]="egosmsPasswordInput" class="w-full" type="password"
                          placeholder="{{ egosmsPasswordPlaceholder }}" />
                      </div>
                    </div>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600">Sender ID</label>
                      <input pInputText [(ngModel)]="settingsForm.egosms_sender" class="w-full" placeholder="e.g. Fancy Drive" />
                    </div>
                  </div>
                }

                @if (settingsForm.provider === 'twilio') {
                  <div class="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg border">
                    <h3 class="font-medium text-sm text-gray-700">Twilio Settings</h3>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600">Account SID</label>
                      <input pInputText [(ngModel)]="settingsForm.twilio_account_sid" class="w-full" />
                    </div>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600">Auth Token</label>
                      <input pInputText [(ngModel)]="twilioTokenInput" class="w-full" type="password"
                        placeholder="{{ twilioTokenPlaceholder }}" />
                    </div>
                    <div>
                      <label class="mb-1 block text-xs font-medium text-gray-600">Phone Number</label>
                      <input pInputText [(ngModel)]="settingsForm.twilio_phone_number" class="w-full" placeholder="+1234567890" />
                    </div>
                  </div>
                }

                @if (settingsForm.provider === 'logging') {
                  <div class="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                    <i class="pi pi-info-circle mr-1"></i>
                    Logging mode: All SMS messages will be logged to the server console instead of being sent. No credentials needed.
                  </div>
                }

                <div class="mt-4 flex gap-2">
                  <p-button label="Save Settings" [loading]="savingSettings()" (onClick)="saveSettings()" />
                  <p-button label="Send Test SMS" severity="secondary" (onClick)="showTestDialog()" [disabled]="!settingsForm.is_active" />
                </div>
              </div>
            </p-tabpanel>

            <!-- SMS Templates Tab -->
            <p-tabpanel value="templates">

              <div class="flex items-center justify-between mb-4">
                <div class="flex gap-2">
                  <p-select [(ngModel)]="filterCategory" [options]="categoryOptions"
                    optionLabel="label" optionValue="value" placeholder="All categories"
                    styleClass="w-64" appendTo="body" (onChange)="loadTemplates()" [showClear]="true" />
                  <p-select [(ngModel)]="filterTrigger" [options]="triggerOptions"
                    optionLabel="label" optionValue="value" placeholder="All triggers"
                    styleClass="w-64" appendTo="body" (onChange)="loadTemplates()" [showClear]="true" />
                </div>
                <p-button label="New Template" icon="pi pi-plus" (onClick)="showCreateTemplate()" />
              </div>

              <p-table [value]="templates()" [loading]="loadingTemplates()" dataKey="id"
                styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Trigger</th>
                    <th>Preview</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-t>
                  <tr>
                    <td class="font-medium">{{ t.name }}</td>
                    <td><p-tag [value]="getCategoryLabel(t.category)" severity="info" /></td>
                    <td>
                      @if (t.trigger_event !== 'manual') {
                        <p-tag [value]="getTriggerLabel(t.trigger_event)" severity="warn" />
                      } @else {
                        <span class="text-gray-400 text-sm">Manual</span>
                      }
                    </td>
                    <td class="text-sm text-gray-600 max-w-md truncate">{{ t.body }}</td>
                    <td><p-tag [value]="t.is_active ? 'Active' : 'Inactive'" [severity]="t.is_active ? 'success' : 'warn'" /></td>
                    <td>
                      <div class="flex gap-1">
                        <p-button icon="pi pi-pencil" severity="secondary" text (onClick)="showEditTemplate(t)" pTooltip="Edit" />
                        <p-button icon="pi pi-trash" severity="danger" text (onClick)="confirmDeleteTemplate(t)" pTooltip="Delete" />
                      </div>
                    </td>
                  </tr>
                </ng-template>
              </p-table>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      }
    </div>

    <!-- Test SMS Dialog -->
    <p-dialog [(visible)]="testDialogVisible" header="Send Test SMS" [modal]="true" [style]="{ width: '400px' }" appendTo="body">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-gray-600">Send a test SMS to verify your provider configuration.</p>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
          <input pInputText [(ngModel)]="testPhone" class="w-full" placeholder="e.g. 0782832711" />
        </div>
        <p-button label="Send Test" [loading]="testingSms()" (onClick)="sendTestSms()" styleClass="w-full justify-center" />
      </div>
    </p-dialog>

    <!-- Template Dialog -->
    <p-dialog [(visible)]="templateDialogVisible" [header]="editingTemplateId ? 'Edit Template' : 'New Template'"
      [modal]="true" [style]="{ width: '600px' }" appendTo="body">
      <div class="flex flex-col gap-3">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input pInputText [(ngModel)]="templateForm.name" class="w-full" placeholder="e.g. Payment Receipt" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <p-select [(ngModel)]="templateForm.category" [options]="categoryOptions"
              optionLabel="label" optionValue="value" placeholder="Select category"
              styleClass="w-full" appendTo="body" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Auto-Trigger</label>
            <p-select [(ngModel)]="templateForm.trigger_event" [options]="triggerOptions"
              optionLabel="label" optionValue="value" placeholder="Select trigger"
              styleClass="w-full" appendTo="body" pTooltip="Which system event fires this template automatically" />
          </div>
        </div>
        @if (templateForm.trigger_event && templateForm.trigger_event !== 'manual') {
          <div class="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <i class="pi pi-info-circle mr-1"></i>
            This template will be sent automatically when <strong>{{ getTriggerLabel(templateForm.trigger_event) }}</strong> occurs.
            Only one active template per trigger is used.
          </div>
        }
        @if (templateForm.category) {
          <div class="p-3 bg-gray-50 rounded border text-xs text-gray-600">
            <span class="font-medium">Available placeholders:</span>
            @for (ph of getPlaceholders(templateForm.category); track ph) {
              <code class="ml-1 px-1 py-0.5 bg-gray-200 rounded">{{ '{' + ph + '}' }}</code>
            }
            @if (getPlaceholders(templateForm.category).length === 0) {
              <span class="ml-1 italic">None for this category</span>
            }
          </div>
        }
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Message Body</label>
          <textarea pInputTextarea [(ngModel)]="templateForm.body" class="w-full" rows="5"
            placeholder="Dear {name}, your training at {time} is cancelled..."></textarea>
        </div>
        <div class="flex items-center gap-2">
          <p-toggleswitch [(ngModel)]="templateForm.is_active" />
          <span class="text-sm">{{ templateForm.is_active ? 'Active' : 'Inactive' }}</span>
        </div>
        <p-button label="Save" [loading]="savingTemplate()" (onClick)="saveTemplate()" styleClass="w-full justify-center" />
      </div>
    </p-dialog>
  `,
})
export class CompanySettingsCmp implements OnInit {
  isSuperUser = signal(false);
  companies = signal<Company[]>([]);
  selectedCompanyId: string | null = null;

  settingsForm: SmsSettingsUpdate & { provider: string; is_active: boolean } = {
    provider: 'logging',
    is_active: false,
    egosms_api_url: 'https://www.egosms.co/api/v1/plain/',
    egosms_username: '',
    egosms_sender: '',
    twilio_account_sid: '',
    twilio_phone_number: '',
  };

  egosmsPasswordInput = '';
  egosmsPasswordPlaceholder = 'Enter to change';
  twilioTokenInput = '';
  twilioTokenPlaceholder = 'Enter to change';

  templates = signal<SmsTemplate[]>([]);
  loadingTemplates = signal(false);
  savingSettings = signal(false);
  savingTemplate = signal(false);
  testingSms = signal(false);

  testDialogVisible = false;
  testPhone = '';
  templateDialogVisible = false;
  editingTemplateId: string | null = null;
  filterCategory: string | null = null;
  filterTrigger: string | null = null;

  templateForm: SmsTemplateCreate & { is_active: boolean } = {
    name: '',
    category: '',
    trigger_event: 'manual',
    body: '',
    is_active: true,
  };

  providerOptions = [
    { label: 'Logging (Testing)', value: 'logging' },
    { label: 'egoSMS', value: 'egosms' },
    { label: 'Twilio', value: 'twilio' },
  ];

  categoryOptions = SMS_TEMPLATE_CATEGORIES;
  triggerOptions = SMS_TRIGGERS;

  constructor(
    private smsService: SmsService,
    private authService: AuthService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  ngOnInit() {
    const role = this.authService.currentUserRole();
    this.isSuperUser.set(role === 'super_user');

    const cid = this.authService.currentUserCompanyId();
    if (cid) {
      this.selectedCompanyId = cid;
      this.loadSettings();
      this.loadTemplates();
    } else if (this.isSuperUser()) {
      this.loadCompanies();
    }
  }

  async loadCompanies() {
    try {
      const res = await this.companyService.list().toPromise();
      this.companies.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load companies' });
    }
  }

  onCompanyChange() {
    this.egosmsPasswordInput = '';
    this.twilioTokenInput = '';
    this.egosmsPasswordPlaceholder = 'Enter to change';
    this.twilioTokenPlaceholder = 'Enter to change';
    if (this.selectedCompanyId) {
      this.loadSettings();
      this.loadTemplates();
    }
  }

  async loadSettings() {
    const cid = this.selectedCompanyId;
    if (!cid) return;
    try {
      const res = await this.smsService.getSettings(cid).toPromise();
      if (res) {
        this.settingsForm = {
          provider: res.provider,
          is_active: res.is_active,
          egosms_api_url: res.egosms_api_url,
          egosms_username: res.egosms_username,
          egosms_sender: res.egosms_sender,
          twilio_account_sid: res.twilio_account_sid,
          twilio_phone_number: res.twilio_phone_number,
        };
        this.egosmsPasswordInput = '';
        this.twilioTokenInput = '';
        this.egosmsPasswordPlaceholder = 'Enter to change';
        this.twilioTokenPlaceholder = 'Enter to change';
      } else {
        this.resetSettingsForm();
      }
    } catch {
      this.resetSettingsForm();
    }
  }

  resetSettingsForm() {
    this.settingsForm = {
      provider: 'logging',
      is_active: false,
      egosms_api_url: 'https://www.egosms.co/api/v1/plain/',
      egosms_username: '',
      egosms_sender: '',
      twilio_account_sid: '',
      twilio_phone_number: '',
    };
    this.egosmsPasswordInput = '';
    this.twilioTokenInput = '';
  }

  async loadTemplates() {
    const cid = this.selectedCompanyId;
    if (!cid) return;
    this.loadingTemplates.set(true);
    try {
      const res = await this.smsService.listTemplates(cid, this.filterCategory || undefined).toPromise();
      let filtered = res || [];
      if (this.filterTrigger) {
        filtered = filtered.filter(t => t.trigger_event === this.filterTrigger);
      }
      this.templates.set(filtered);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load templates' });
    } finally {
      this.loadingTemplates.set(false);
    }
  }

  async saveSettings() {
    const cid = this.selectedCompanyId;
    if (!cid) return;
    this.savingSettings.set(true);
    try {
      const payload: SmsSettingsUpdate = {
        is_active: this.settingsForm.is_active,
        provider: this.settingsForm.provider,
        egosms_api_url: this.settingsForm.egosms_api_url,
        egosms_username: this.settingsForm.egosms_username,
        egosms_sender: this.settingsForm.egosms_sender,
        twilio_account_sid: this.settingsForm.twilio_account_sid,
        twilio_phone_number: this.settingsForm.twilio_phone_number,
      };
      if (this.egosmsPasswordInput) {
        payload.egosms_password = this.egosmsPasswordInput;
      }
      if (this.twilioTokenInput) {
        payload.twilio_auth_token = this.twilioTokenInput;
      }
      await this.smsService.upsertSettings(cid, payload).toPromise();
      this.egosmsPasswordInput = '';
      this.twilioTokenInput = '';
      this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'SMS settings updated' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save' });
    } finally {
      this.savingSettings.set(false);
    }
  }

  showTestDialog() {
    this.testPhone = '';
    this.testDialogVisible = true;
  }

  async sendTestSms() {
    const cid = this.selectedCompanyId;
    if (!cid || !this.testPhone) return;
    this.testingSms.set(true);
    try {
      await this.smsService.testSms(cid, this.testPhone).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Sent', detail: 'Test SMS sent' });
      this.testDialogVisible = false;
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to send test SMS' });
    } finally {
      this.testingSms.set(false);
    }
  }

  showCreateTemplate() {
    this.editingTemplateId = null;
    this.templateForm = { name: '', category: '', trigger_event: 'manual', body: '', is_active: true };
    this.templateDialogVisible = true;
  }

  showEditTemplate(t: SmsTemplate) {
    this.editingTemplateId = t.id;
    this.templateForm = { name: t.name, category: t.category, trigger_event: t.trigger_event, body: t.body, is_active: t.is_active };
    this.templateDialogVisible = true;
  }

  getPlaceholders(category: string): string[] {
    return TEMPLATE_PLACEHOLDERS[category] || [];
  }

  getCategoryLabel(category: string): string {
    return SMS_TEMPLATE_CATEGORIES.find(c => c.value === category)?.label || category;
  }

  getTriggerLabel(trigger: string): string {
    return SMS_TRIGGERS.find(t => t.value === trigger)?.label || trigger;
  }

  async saveTemplate() {
    const cid = this.selectedCompanyId;
    if (!cid || !this.templateForm.name || !this.templateForm.category || !this.templateForm.body) return;
    this.savingTemplate.set(true);
    try {
      if (this.editingTemplateId) {
        await this.smsService.updateTemplate(this.editingTemplateId, this.templateForm).toPromise();
      } else {
        await this.smsService.createTemplate(cid, this.templateForm).toPromise();
      }
      this.messageService.add({ severity: 'success', summary: 'Saved' });
      this.templateDialogVisible = false;
      await this.loadTemplates();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to save template' });
    } finally {
      this.savingTemplate.set(false);
    }
  }

  confirmDeleteTemplate(t: SmsTemplate) {
    this.confirmationService.confirm({
      message: `Delete template "${t.name}"?`,
      accept: async () => {
        try {
          await this.smsService.deleteTemplate(t.id).toPromise();
          this.messageService.add({ severity: 'success', summary: 'Deleted' });
          await this.loadTemplates();
        } catch {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' });
        }
      },
    });
  }
}

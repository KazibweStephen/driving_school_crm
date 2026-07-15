import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import {
  CompetencyCatalogueService,
  CompetencySearchResult,
} from '../../core/services/competency-catalogue.service';

@Component({
  selector: 'app-competency-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <p-select [ngModel]="selectedCategoryId()" (ngModelChange)="onCategoryChange($event)"
          [options]="categoryOptions" optionLabel="label" optionValue="value"
          placeholder="Filter by Category" appendTo="body" [showClear]="true" styleClass="flex-1"></p-select>
        <p-select [ngModel]="selectedDifficulty()" (ngModelChange)="onDifficultyChange($event)"
          [options]="difficultyOptions" optionLabel="label" optionValue="value"
          placeholder="Filter by Difficulty" appendTo="body" [showClear]="true" styleClass="w-40"></p-select>
      </div>
      <p-multiSelect [ngModel]="selectedIds()" (ngModelChange)="onSelectionChange($event)"
        [options]="availableCompetencies()" optionLabel="displayLabel" optionValue="id"
        appendTo="body" [filter]="true" filterBy="code,name,categoryName"
        [showClear]="true" [maxSelectedLabels]="5"
        styleClass="w-full" placeholder="Search by code, name, or category...">
        <ng-template let-comp pTemplate="item">
          <div class="flex items-center gap-2 py-1">
            <span class="font-mono font-bold text-sm">{{ comp.code }}</span>
            <span class="text-gray-400">-</span>
            <span class="text-sm">{{ comp.name }}</span>
            @if (comp.category_name) {
              <span class="text-xs text-gray-400 ml-auto">{{ comp.category_name }}</span>
            }
          </div>
        </ng-template>
      </p-multiSelect>
    </div>
  `,
})
export class CompetencyPicker implements OnInit, OnChanges {
  @Input() selectedIds: any = signal<string[]>([]);
  @Input() companyId: string | null = null;
  @Output() selectedIdsChange = new EventEmitter<string[]>();

  availableCompetencies = signal<CompetencySearchResult[]>([]);
  selectedCategoryId = signal<string | null>(null);
  selectedDifficulty = signal<string | null>(null);

  categoryOptions: { label: string; value: string }[] = [];
  difficultyOptions = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];

  constructor(private service: CompetencyCatalogueService) {}

  ngOnInit() {
    this.loadCategories();
    this.loadCompetencies();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedIds']) {
      this.loadCompetencies();
    }
  }

  async loadCategories() {
    try {
      const cats = await this.service.listCategories().toPromise();
      this.categoryOptions = (cats || []).map(c => ({ label: c.name, value: c.id }));
    } catch {}
  }

  async loadCompetencies() {
    try {
      const params: any = {};
      if (this.selectedCategoryId()) params.category_id = this.selectedCategoryId()!;
      if (this.selectedDifficulty()) params.difficulty = this.selectedDifficulty()!;
      const results = await this.service.searchCompetencies(params).toPromise();
      const mapped = (results || []).map(c => ({
        ...c,
        displayLabel: `${c.code} - ${c.name}`,
      }));
      this.availableCompetencies.set(mapped);
    } catch {}
  }

  onCategoryChange(val: string | null) {
    this.selectedCategoryId.set(val);
    this.loadCompetencies();
  }

  onDifficultyChange(val: string | null) {
    this.selectedDifficulty.set(val);
    this.loadCompetencies();
  }

  onSelectionChange(ids: string[]) {
    this.selectedIds.set(ids);
    this.selectedIdsChange.emit(ids);
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { toStudyYear } from '../approvals/study-year';

@Component({
  selector: 'app-database',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>🗃️ מסד נתונים</h1>
        <p class="subtitle">דוחות לפי מסלול או לפי כיתה</p>
      </div>
    </div>

    <div class="panel card">
      <div class="mode-toggle">
        <button type="button" [class.active]="mode() === 'track'" (click)="mode.set('track')">📚 לפי מסלול</button>
        <button type="button" [class.active]="mode() === 'class'" (click)="mode.set('class')">🏫 לפי כיתה</button>
      </div>
    </div>

    <div class="card panel" *ngIf="mode() === 'track'">
      <div class="filters">
        <div class="field">
          <label>מסלול</label>
          <select [(ngModel)]="selectedTrack">
            <option value="">בחרי מסלול</option>
            <option *ngFor="let track of trackOptions()" [value]="track">{{ track }}</option>
          </select>
        </div>
        <div class="field">
          <label>שנה</label>
          <select [(ngModel)]="selectedYear">
            <option value="">בחרי שנה</option>
            <option *ngFor="let year of yearOptions()" [value]="year">{{ toStudyYear(year) }}</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary" (click)="loadTrackReport()" [disabled]="!selectedTrack || !selectedYear">
        הצג נתונים
      </button>

      <div *ngIf="trackError()" class="error-box">{{ trackError() }}</div>
    </div>

    <div class="card panel" *ngIf="mode() === 'class'">
      <div class="filters single">
        <div class="field">
          <label>כיתה</label>
          <select [(ngModel)]="selectedClassName">
            <option value="">בחרי כיתה</option>
            <option *ngFor="let className of classOptions()" [value]="className">{{ className }}</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary" (click)="loadClassReport()" [disabled]="!selectedClassName">
        הצג נתונים
      </button>

      <div *ngIf="classError()" class="error-box">{{ classError() }}</div>
    </div>

    <div *ngIf="reportRows().length" class="table-wrap card">
      <div class="report-header">
        <strong>{{ mode() === 'track' ? 'מסלול: ' + selectedTrack : 'כיתה: ' + selectedClassName }}</strong>
        <span>{{ reportRows().length }} תלמידות</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th *ngFor="let column of reportColumns()">{{ column.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of reportRows()">
              <td *ngFor="let column of reportColumns()">{{ row[column.key] ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="!reportRows().length && (trackLoaded() || classLoaded())" class="empty-state card">
      <div class="empty-icon">📊</div>
      <p>אין נתונים להצגה לבחירה הנוכחית.</p>
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 18px; }
    .subtitle { color: var(--text-muted); margin: 4px 0 0; }
    .panel { padding: 18px; }
    .mode-toggle { display: flex; gap: 10px; }
    .mode-toggle button {
      flex: 1; padding: 11px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--text); font: inherit; font-weight: 700; cursor: pointer;
    }
    .mode-toggle button.active {
      background: var(--primary-light); border-color: var(--primary); color: var(--primary);
    }
    .filters {
      display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 14px; margin-bottom: 14px;
    }
    .filters.single { grid-template-columns: 1fr; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 0.8rem; color: var(--text-muted); font-weight: 700; }
    .field select {
      height: 40px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 0 12px; background: var(--surface); font: inherit;
    }
    .btn { height: 40px; border-radius: var(--radius-sm); border: none; cursor: pointer; font: inherit; font-weight: 700; }
    .btn-primary { background: var(--grad-primary); color: white; padding: 0 18px; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .error-box { margin-top: 12px; color: var(--danger); font-weight: 700; }
    .table-wrap { margin-top: 20px; overflow: hidden; }
    .report-header {
      display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border);
      font-size: 0.9rem; color: var(--text-muted);
    }
    .table-scroll { overflow: auto; }
    table {
      width: max-content; min-width: 100%; border-collapse: collapse; font-size: 0.8rem;
    }
    th, td {
      border-bottom: 1px solid var(--border); padding: 8px 10px; white-space: nowrap; text-align: right;
      min-width: 120px;
    }
    th { background: var(--surface-2); color: var(--text-muted); position: sticky; top: 0; z-index: 1; }
    .empty-state { text-align: center; padding: 30px; }
    .empty-icon { font-size: 2.2rem; }
    @media (max-width: 700px) { .filters { grid-template-columns: 1fr; } }
  `]
})
export class DatabaseComponent implements OnInit {
  mode = signal<'track' | 'class'>('track');
  selectedTrack = '';
  selectedYear = '';
  selectedClassName = '';
  trackOptions = signal<string[]>([]);
  yearOptions = signal<string[]>([]);
  classOptions = signal<string[]>([]);
  reportColumns = signal<any[]>([]);
  reportRows = signal<any[]>([]);
  trackError = signal('');
  classError = signal('');
  trackLoaded = signal(false);
  classLoaded = signal(false);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getTracks().subscribe((resp) => {
      this.trackOptions.set(resp.tracks.map((t) => t.name));
    });

    this.api.getStudents().subscribe((students) => {
      const years = [...new Set(
        students
          .map((s) => s.year)
          .filter((y): y is string => typeof y === 'string' && !!y.trim())
          .map((y) => y.trim()),
      )].sort((a, b) => a.localeCompare(b, 'he'));
      this.yearOptions.set(years);

      const classNames = [...new Set(
        students.flatMap((s) => {
          const base = typeof s.year === 'string' ? s.year.trim() : '';
          if (!base) return [] as string[];

          const values = [base];
          const parallel = s.extra_data && typeof s.extra_data === 'object'
            ? Object.entries(s.extra_data).find(([key]) => {
                const normalizedKey = String(key || '').replace(/\s+/g, '').toLowerCase();
                return normalizedKey.includes('מקב') || normalizedKey.includes('parallel') || normalizedKey.includes('קבוצה');
              })
            : undefined;

          const parallelValue = parallel ? String(parallel[1] || '').trim() : '';
          if (parallelValue) values.push(`${base}${parallelValue}`);
          return values;
        }),
      )].sort((a, b) => a.localeCompare(b, 'he'));
      this.classOptions.set(classNames);
    });
  }

  loadTrackReport() {
    if (!this.selectedTrack || !this.selectedYear) return;
    this.trackError.set('');
    this.classError.set('');
    this.api.getDatabaseTrackReport(this.selectedTrack, this.selectedYear).subscribe({
      next: (report) => {
        this.reportColumns.set(report.columns);
        this.reportRows.set(report.rows as any[]);
        this.trackLoaded.set(true);
        this.classLoaded.set(false);
      },
      error: (err) => {
        this.trackError.set(err.error?.error || 'לא ניתן לטעון את הנתונים');
        this.reportRows.set([]);
      },
    });
  }

  loadClassReport() {
    if (!this.selectedClassName) return;
    this.classError.set('');
    this.trackError.set('');
    this.api.getDatabaseClassReport(this.selectedClassName).subscribe({
      next: (report) => {
        this.reportColumns.set(report.columns);
        this.reportRows.set(report.rows as any[]);
        this.classLoaded.set(true);
        this.trackLoaded.set(false);
      },
      error: (err) => {
        this.classError.set(err.error?.error || 'לא ניתן לטעון את הנתונים');
        this.reportRows.set([]);
      },
    });
  }

  toStudyYear = toStudyYear;
}

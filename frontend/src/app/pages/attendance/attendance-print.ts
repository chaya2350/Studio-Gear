import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { formatHebrewDate } from '../../hebrew-date';

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

@Component({
  selector: 'app-attendance-print',
  imports: [CommonModule, FormsModule],
  template: `
<div class="no-print">
  <!-- Week selector -->
  <div class="controls card">
    <div class="control-row">
      <label class="field">
        <span>שבוע (תאריך ראשון)</span>
        <input type="date" [(ngModel)]="selectedWeek" (change)="loadSheets()">
      </label>
      <button class="btn btn-secondary" (click)="prevWeek()">→ שבוע קודם</button>
      <button class="btn btn-secondary" (click)="nextWeek()">שבוע הבא ←</button>
      <button class="btn btn-primary" (click)="goToCurrentWeek()">השבוע הנוכחי</button>
    </div>
    <p class="week-label">שבוע: <strong>{{ selectedWeek }}</strong></p>
  </div>

  <div class="sheet-mode" role="group" aria-label="סוג דפי נוכחות">
    <button type="button" [class.active]="viewMode === 'week'" (click)="setViewMode('week')">דפי השבוע</button>
    <button type="button" [class.active]="viewMode === 'changes'" (click)="setViewMode('changes')">
      שינויים השבוע <span *ngIf="changes().length">{{ changes().length }}</span>
    </button>
  </div>

  <!-- Filter -->
  <div class="filters card" *ngIf="currentSheets().length">
    <div class="filter-row">
      <label class="field">
        <span>סנן לפי מורה</span>
        <select [(ngModel)]="filterTeacher" (change)="applyFilter()">
          <option value="">כל המורות</option>
          <option *ngFor="let t of uniqueTeachers()" [value]="t">{{ t }}</option>
        </select>
      </label>
      <label class="field">
        <span>סנן לפי כיתה</span>
        <select [(ngModel)]="filterClass" (change)="applyFilter()">
          <option value="">כל הכיתות</option>
          <option *ngFor="let c of uniqueClasses()" [value]="c">כיתה {{ c }}</option>
        </select>
      </label>
      <div class="filter-summary">
        מציג {{ filteredSheets().length }} דפים מתוך {{ currentSheets().length }}
      </div>
    </div>
  </div>

  <div *ngIf="loading()" class="loading-state">טוען דפים...</div>

  <div *ngIf="!loading() && !currentSheets().length" class="empty-state">
    <div class="empty-icon">📄</div>
    <p>{{ viewMode === 'changes' ? 'אין שינויים לשבוע זה' : 'אין שיעורים לשבוע זה' }}</p>
    <a href="/schedule" class="btn btn-primary">לניהול מערכת השעות</a>
  </div>

  <div *ngIf="!loading() && filteredSheets().length" class="action-bar">
    <button class="btn btn-primary btn-large" (click)="printAll()">
      🖨️ {{ viewMode === 'changes' ? 'הדפסת השינויים' : 'הדפסת כל דפי השבוע' }} ({{ filteredSheets().length }})
    </button>
    <button class="btn btn-secondary" (click)="expandAll()">פתח הכל</button>
    <button class="btn btn-secondary" (click)="collapseAll()">סגור הכל</button>
  </div>

  <!-- Sheet previews -->
  <div class="sheets-preview" *ngIf="!loading()">
    <div *ngFor="let sheet of filteredSheets(); let i = index" class="sheet-preview-card card">
      <div class="sheet-header-row" (click)="toggleExpand(i)">
        <div class="sheet-title">
          <span class="class-badge">כיתה {{ sheet.class_name }}</span>
          <strong>{{ sheet.teacher_name }}</strong>
          <span class="sheet-days-count">{{ sheet.days.length }} ימים · {{ sheet.students.length }} תלמידות</span>
        </div>
        <div class="sheet-actions">
          <button class="btn btn-secondary btn-sm" (click)="$event.stopPropagation(); printSheet(i)">🖨️ הדפס</button>
          <span class="expand-arrow">{{ expandedSheets.has(i) ? '▲' : '▼' }}</span>
        </div>
      </div>

      <div class="sheet-days" *ngIf="expandedSheets.has(i)">
        <div *ngFor="let day of sheet.days" class="day-preview">
          <span class="day-label">יום {{ day.day_name }} {{ day.lesson_date }}</span>
          <span *ngIf="day.subject" class="subject-label">{{ day.subject }}</span>
          <span class="barcode-code">{{ day.barcode }}</span>
        </div>
        <div *ngIf="sheet.change_reason" class="change-preview">
          <strong>שינוי מערכת</strong>
          <span>{{ changeCategoryLabel(sheet.change_category) }}</span>
          <span>{{ sheet.change_reason }}</span>
          <span *ngIf="sheet.change_from_teacher_name">המורה המתוכננת: {{ sheet.change_from_teacher_name }}</span>
        </div>
        <div class="student-count-preview">
          <strong>{{ sheet.students.length }}</strong> תלמידות רשומות בכיתה זו
        </div>
      </div>
    </div>
  </div>
</div>

<!-- PRINTABLE SHEETS (hidden until print) -->
<div class="print-only" id="printable-area">
  <ng-container *ngFor="let sheet of printQueue(); let si = index">
    <div class="print-sheet" [class.page-break]="si > 0">
      <!-- Sheet Header -->
      <div class="print-header">
        <div class="print-header-right">
          <div class="print-school-name">סמינר גור ירושלים</div>
          <div class="print-sheet-title">{{ sheet.change_reason ? 'דף נוכחות לשיעור ששונה' : 'דף נוכחות שבועי' }}</div>
        </div>
        <div class="print-header-left">
          <div class="print-info-line"><span class="print-label">מורה:</span> {{ sheet.teacher_name }}</div>
          <div class="print-info-line"><span class="print-label">כיתה:</span> {{ sheet.class_name }}</div>
          <div class="print-info-line"><span class="print-label">שבוע:</span> {{ sheet.week_start }} · {{ formatHebrewDate(sheet.week_start) }}</div>
          <div *ngIf="sheet.change_from_teacher_name" class="print-info-line"><span class="print-label">מורה מתוכננת:</span> {{ sheet.change_from_teacher_name }}</div>
        </div>
      </div>

      <!-- Days with barcodes -->
      <div class="print-days-row">
        <div *ngFor="let day of sheet.days" class="print-day-cell">
          <div class="print-day-name">יום {{ day.day_name }}</div>
          <div class="print-day-date">{{ day.lesson_date }}</div>
          <div class="print-day-date">{{ formatHebrewDate(day.lesson_date) }}</div>
          <div *ngIf="day.subject" class="print-day-subject">{{ day.subject }}</div>
          <div class="print-day-time" *ngIf="day.start_time">{{ day.start_time }}</div>
          <img class="print-barcode" [src]="getBarcodeUrl(day.barcode)" [alt]="day.barcode" crossorigin="anonymous">
          <div class="print-barcode-text">{{ day.barcode }}</div>
        </div>
      </div>

      <!-- Students table -->
      <div class="print-students-section">
        <div class="print-table-header">
          <span>רשימת תלמידות</span>
          <span class="print-instructions">סמני - ליד תלמידה שחסרה ו + ליד תלמידה שאיחרה</span>
        </div>
        <table class="print-students-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ברקוד</th>
              <th>שם תלמידה</th>
              <ng-container *ngFor="let day of sheet.days">
                <th class="day-col">{{ day.day_name }}</th>
              </ng-container>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let student of sheet.students; let si = index">
              <td class="num-cell">{{ si + 1 }}</td>
              <td class="barcode-cell">
                <img [src]="getStudentBarcodeUrl(student.id_number)" [alt]="student.barcode" crossorigin="anonymous" class="student-barcode-img">
                <div class="barcode-manual-text">{{ student.id_number }}</div>
              </td>
              <td class="name-cell">{{ student.name }}</td>
              <ng-container *ngFor="let day of sheet.days">
                <td class="check-cell"></td>
              </ng-container>
              <td class="notes-cell"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ng-container>
</div>
`,
  styles: [`
/* Screen styles */
.controls { padding: 16px; margin-bottom: 12px; }
.sheet-mode { display: flex; gap: 4px; margin-bottom: 16px; padding: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); }
.sheet-mode button { padding: 8px 12px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); font: inherit; cursor: pointer; }
.sheet-mode button.active { background: var(--surface); color: var(--text); font-weight: 700; }
.change-preview { display: grid; gap: 4px; margin: 8px 16px 14px; padding: 10px; border-inline-start: 3px solid #d97706; background: #fff7e6; font-size: 0.84rem; }
.control-row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.field { display: grid; gap: 5px; font-size: 0.82rem; font-weight: 700; color: var(--text-muted);
  input, select { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px;
    font: inherit; font-size: 0.9rem; background: var(--surface-2); } }
.week-label { margin: 8px 0 0; font-size: 0.85rem; color: var(--text-muted); }

.filters { padding: 12px 16px; margin-bottom: 12px; }
.filter-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.filter-summary { font-size: 0.82rem; color: var(--text-muted); align-self: center; margin-inline-start: auto; }

.action-bar { display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap; align-items: center; }
.btn-large { padding: 12px 24px; font-size: 1rem; }

.sheets-preview { display: flex; flex-direction: column; gap: 10px; }
.sheet-preview-card { padding: 0; overflow: hidden; }
.sheet-header-row { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; cursor: pointer; &:hover { background: var(--surface-2); } }
.sheet-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.class-badge { background: var(--primary-light); color: var(--primary); border-radius: 12px;
  padding: 3px 12px; font-weight: 700; font-size: 0.82rem; }
.sheet-days-count { font-size: 0.8rem; color: var(--text-muted); }
.sheet-actions { display: flex; align-items: center; gap: 10px; }
.expand-arrow { font-size: 0.75rem; color: var(--text-muted); }
.btn-sm { padding: 5px 10px; font-size: 0.78rem; }

.sheet-days { padding: 0 16px 14px; display: flex; flex-direction: column; gap: 6px; }
.day-preview { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  background: var(--bg); border-radius: 6px; font-size: 0.82rem; }
.day-label { font-weight: 700; }
.subject-label { color: var(--text-muted); }
.barcode-code { margin-inline-start: auto; font-family: monospace; font-size: 0.75rem;
  color: var(--text-muted); }
.student-count-preview { font-size: 0.82rem; color: var(--text-muted); padding: 4px 10px; }

.loading-state { text-align: center; padding: 40px; color: var(--text-muted); }
.empty-state { text-align: center; padding: 48px;
  .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
  p { color: var(--text-muted); margin-bottom: 16px; } }

/* === PRINT STYLES === */
.print-only { display: none; }

@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }

  @page { size: A4 portrait; margin: 8mm; }
  body { margin: 0; padding: 0; font-family: 'Heebo', 'Arial Hebrew', Arial, sans-serif; direction: rtl; color: #1a1a1a; }

  .print-sheet {
    padding: 0;
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }
  .print-sheet:last-child { page-break-after: auto; }
  .page-break { page-break-before: always; }

  /* Header */
  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2.5px solid #0d9488;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .print-school-name { font-size: 13pt; font-weight: 800; color: #0d9488; }
  .print-sheet-title { font-size: 10pt; color: #666; margin-top: 1px; }
  .print-info-line { font-size: 9pt; margin-bottom: 2px; line-height: 1.5; }
  .print-label { font-weight: 700; margin-left: 4px; }

  /* Day cells — compact */
  .print-days-row {
    display: flex;
    gap: 5px;
    margin-bottom: 10px;
  }
  .print-day-cell {
    border: 1px solid #999;
    border-radius: 5px;
    padding: 5px 6px;
    text-align: center;
    flex: 1;
    min-width: 0;
  }
  .print-day-name { font-weight: 700; font-size: 8.5pt; }
  .print-day-date { font-size: 7pt; color: #666; margin-bottom: 2px; }
  .print-day-subject { font-size: 7pt; color: #444; }
  .print-day-time { font-size: 7pt; color: #777; }
  .print-barcode { width: 70px; height: 16px; object-fit: contain; display: block; margin: 3px auto 1px; }
  .print-barcode-text { font-size: 5.5pt; color: #888; font-family: monospace; }

  /* Students table */
  .print-students-section { flex: 1; }
  .print-table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9pt;
    font-weight: 700;
    margin-bottom: 4px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
  }
  .print-instructions { font-size: 7.5pt; font-weight: 400; color: #888; }

  .print-students-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
  }
  .print-students-table th,
  .print-students-table td {
    border: 0.5px solid #bbb;
    padding: 2.5px 5px;
    text-align: right;
    line-height: 1.4;
  }
  .print-students-table th {
    background: #f5f5f5;
    font-weight: 700;
    font-size: 7.5pt;
  }
  .print-students-table tbody tr:nth-child(even) { background: #fafafa; }
  .num-cell { width: 22px; text-align: center; font-size: 7.5pt; color: #888; }
  .name-cell { min-width: 100px; font-weight: 500; }
  .barcode-cell { width: 78px; padding: 1px 3px; text-align: center; }
  .student-barcode-img { width: 70px; height: 16px; object-fit: contain; }
  .barcode-manual-text {
    font-family: monospace;
    font-size: 5.5pt;
    color: #666;
    text-align: center;
    margin-top: 1px;
  }
  .day-col { width: 34px; text-align: center; }
  .check-cell { width: 34px; }
  .notes-cell { min-width: 50px; }
}
  `]
})
export class AttendancePrintComponent implements OnInit {
  readonly formatHebrewDate = formatHebrewDate;
  loading = signal(false);
  sheets = signal<any[]>([]);
  changes = signal<any[]>([]);
  filteredSheets = signal<any[]>([]);
  printQueue = signal<any[]>([]);
  viewMode: 'week' | 'changes' = 'week';
  changedSlotId: number | null = null;
  selectedWeek = getWeekStart(new Date());
  filterTeacher = '';
  filterClass = '';
  expandedSheets = new Set<number>();
  today = new Date().toLocaleDateString('he-IL');

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const requestedWeek = params.get('week');
    if (requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)) this.selectedWeek = requestedWeek;
    const changedSlotId = Number(params.get('changedSlotId'));
    if (Number.isInteger(changedSlotId) && changedSlotId > 0) {
      this.changedSlotId = changedSlotId;
      this.viewMode = 'changes';
    }
    this.loadSheets();
  }

  loadSheets() {
    this.loading.set(true);
    this.expandedSheets.clear();
    this.api.getWeeklySheets(this.selectedWeek).subscribe({
      next: r => {
        this.sheets.set(r.sheets);
        this.changes.set(r.changes || []);
        const selected = this.changedSlotId
          ? (r.changes || []).filter(sheet => sheet.changed_slot_id === this.changedSlotId)
          : this.viewMode === 'changes' ? (r.changes || []) : r.sheets;
        this.filteredSheets.set(selected);
        this.printQueue.set(selected);
        this.loading.set(false);
        if (this.changedSlotId && selected.length) setTimeout(() => window.print(), 300);
      },
      error: () => this.loading.set(false)
    });
  }

  prevWeek() {
    const d = new Date(this.selectedWeek);
    d.setDate(d.getDate() - 7);
    this.selectedWeek = d.toISOString().split('T')[0];
    this.loadSheets();
  }

  nextWeek() {
    const d = new Date(this.selectedWeek);
    d.setDate(d.getDate() + 7);
    this.selectedWeek = d.toISOString().split('T')[0];
    this.loadSheets();
  }

  goToCurrentWeek() {
    this.selectedWeek = getWeekStart(new Date());
    this.loadSheets();
  }

  currentSheets() { return this.viewMode === 'changes' ? this.changes() : this.sheets(); }
  uniqueTeachers() { return [...new Set(this.currentSheets().map(s => s.teacher_name))].sort(); }
  uniqueClasses() { return [...new Set(this.currentSheets().map(s => s.class_name))].sort(); }

  setViewMode(mode: 'week' | 'changes') {
    this.viewMode = mode;
    this.applyFilter();
  }

  applyFilter() {
    const filtered = this.currentSheets().filter(s =>
      (!this.filterTeacher || s.teacher_name === this.filterTeacher) &&
      (!this.filterClass || s.class_name === this.filterClass)
    );
    this.filteredSheets.set(filtered);
    this.printQueue.set(filtered);
  }

  toggleExpand(i: number) {
    if (this.expandedSheets.has(i)) this.expandedSheets.delete(i);
    else this.expandedSheets.add(i);
  }
  expandAll() { this.filteredSheets().forEach((_, i) => this.expandedSheets.add(i)); }
  collapseAll() { this.expandedSheets.clear(); }

  printAll() {
    this.printQueue.set(this.filteredSheets());
    setTimeout(() => window.print(), 300);
  }

  printSheet(i: number) {
    this.printQueue.set([this.filteredSheets()[i]]);
    setTimeout(() => window.print(), 300);
  }

  changeCategoryLabel(category: string) {
    return ({
      seminary_constraints: 'אילוצי סמינר',
      absent_teacher: 'המורה המתוכננת אינה יכולה להגיע',
      replacement_teacher: 'סיבה הקשורה למורה המחליפה'
    } as Record<string, string>)[category] || category;
  }

  getBarcodeUrl(code: string) { return this.api.getAttendanceBarcodeUrl(code); }
  getStudentBarcodeUrl(id: string) { return this.api.getStudentAttendanceBarcodeUrl(id); }
}

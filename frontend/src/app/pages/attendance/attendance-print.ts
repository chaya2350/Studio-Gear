import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

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

  <!-- Filter -->
  <div class="filters card" *ngIf="sheets().length">
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
        מציג {{ filteredSheets().length }} דפים מתוך {{ sheets().length }}
      </div>
    </div>
  </div>

  <div *ngIf="loading()" class="loading-state">טוען דפים...</div>

  <div *ngIf="!loading() && !sheets().length" class="empty-state">
    <div class="empty-icon">📄</div>
    <p>אין שיעורים לשבוע זה</p>
    <a href="/schedule" class="btn btn-primary">לניהול מערכת השעות</a>
  </div>

  <div *ngIf="!loading() && filteredSheets().length" class="action-bar">
    <button class="btn btn-primary btn-large" (click)="printAll()">
      🖨️ הדפסת כל הדפים ({{ filteredSheets().length }})
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
          <div class="print-sheet-title">דף נוכחות שבועי</div>
        </div>
        <div class="print-header-left">
          <div class="print-info-line"><span class="print-label">מורה:</span> {{ sheet.teacher_name }}</div>
          <div class="print-info-line"><span class="print-label">כיתה:</span> {{ sheet.class_name }}</div>
          <div class="print-info-line"><span class="print-label">שבוע:</span> {{ sheet.week_start }}</div>
        </div>
      </div>

      <!-- Days with barcodes -->
      <div class="print-days-row">
        <div *ngFor="let day of sheet.days" class="print-day-cell">
          <div class="print-day-name">יום {{ day.day_name }}</div>
          <div class="print-day-date">{{ day.lesson_date }}</div>
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

      <!-- Footer -->
      <div class="print-footer">
        <span>הודפס: {{ today }}</span>
        <span>סה"כ תלמידות: {{ sheet.students.length }}</span>
      </div>
    </div>
  </ng-container>
</div>
`,
  styles: [`
/* Screen styles */
.controls { padding: 16px; margin-bottom: 12px; }
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

  body { margin: 0; padding: 0; font-family: 'Arial Hebrew', Arial, sans-serif; direction: rtl; }

  .print-sheet {
    padding: 12mm 10mm;
    min-height: 270mm;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .page-break { page-break-before: always; }

  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .print-school-name { font-size: 14pt; font-weight: bold; }
  .print-sheet-title { font-size: 11pt; color: #555; }
  .print-info-line { font-size: 10pt; margin-bottom: 3px; }
  .print-label { font-weight: bold; margin-left: 4px; }

  .print-days-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .print-day-cell {
    border: 1.5px solid #666;
    border-radius: 6px;
    padding: 8px 10px;
    text-align: center;
    min-width: 100px;
    flex: 1;
  }
  .print-day-name { font-weight: bold; font-size: 10pt; }
  .print-day-date { font-size: 8pt; color: #555; margin-bottom: 4px; }
  .print-day-subject { font-size: 8pt; color: #333; }
  .print-day-time { font-size: 8pt; color: #555; }
  .print-barcode { width: 100%; max-width: 82px; height: 18px; object-fit: contain; display: block; margin: 4px auto; }
  .print-barcode-text { font-size: 6pt; color: #777; font-family: monospace; }

  .print-students-section { flex: 1; }
  .print-table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10pt;
    font-weight: bold;
    margin-bottom: 6px;
  }
  .print-instructions { font-size: 8pt; font-weight: normal; color: #555; }

  .print-students-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
  }
  .print-students-table th, .print-students-table td {
    border: 1px solid #aaa;
    padding: 4px 6px;
    text-align: right;
  }
  .print-students-table th { background: #f0f0f0; font-weight: bold; }
  .num-cell { width: 28px; text-align: center; }
  .name-cell { min-width: 120px; }
  .barcode-cell { width: 90px; padding: 2px 4px; }
  .student-barcode-img { width: 80px; height: 20px; object-fit: contain; }
  .day-col { width: 42px; text-align: center; }
  .check-cell { width: 42px; }
  .notes-cell { min-width: 60px; }

  .print-footer {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #777;
    border-top: 1px solid #ccc;
    padding-top: 6px;
    margin-top: 8px;
  }
}
  `]
})
export class AttendancePrintComponent implements OnInit {
  loading = signal(false);
  sheets = signal<any[]>([]);
  filteredSheets = signal<any[]>([]);
  printQueue = signal<any[]>([]);
  selectedWeek = getWeekStart(new Date());
  filterTeacher = '';
  filterClass = '';
  expandedSheets = new Set<number>();
  today = new Date().toLocaleDateString('he-IL');

  constructor(private api: ApiService) {}

  ngOnInit() { this.loadSheets(); }

  loadSheets() {
    this.loading.set(true);
    this.expandedSheets.clear();
    this.api.getWeeklySheets(this.selectedWeek).subscribe({
      next: r => {
        this.sheets.set(r.sheets);
        this.filteredSheets.set(r.sheets);
        this.printQueue.set(r.sheets);
        this.loading.set(false);
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

  uniqueTeachers() { return [...new Set(this.sheets().map(s => s.teacher_name))].sort(); }
  uniqueClasses() { return [...new Set(this.sheets().map(s => s.class_name))].sort(); }

  applyFilter() {
    const filtered = this.sheets().filter(s =>
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

  getBarcodeUrl(code: string) { return this.api.getAttendanceBarcodeUrl(code); }
  getStudentBarcodeUrl(id: string) { return this.api.getStudentAttendanceBarcodeUrl(id); }
}

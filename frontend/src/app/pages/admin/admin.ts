import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-admin',
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div>
        <h1>⚙️ ניהול מערכת</h1>
        <p class="subtitle">ייבוא נתוני תלמידות מקובץ אקסל</p>
      </div>
    </div>

    <div class="card" style="max-width:560px;">
      <div class="section-title">📥 ייבוא תלמידות מאקסל</div>
      <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
        העלה קובץ Excel עם עמודות: <strong>ת.ז, שם, טלפון, מסלול, שנה</strong><br>
        ניתן להעלות מספר קבצים (שנה א + שנה ב). רשומות קיימות יתעדכנו לפי ת.ז.
      </p>

      <div class="upload-area"
        [class.dragover]="dragging()"
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()">
        <div class="upload-icon">📂</div>
        <div class="upload-text">גרור קובץ Excel לכאן או לחץ לבחירה</div>
        <div class="upload-hint">.xlsx / .xls</div>
        <input #fileInput type="file" accept=".xlsx,.xls" style="display:none" (change)="onFileChange($event)" multiple>
      </div>

      <div *ngIf="importing()" class="import-status importing">
        <div class="spinner-sm"></div> מייבא נתונים...
      </div>

      <div *ngFor="let r of results()" class="import-status" [class.success]="r.ok" [class.error]="!r.ok">
        <span *ngIf="r.ok">✅ <strong>{{ r.filename }}</strong> — יובאו {{ r.imported }} תלמידות
          <span *ngIf="r.skipped">({{ r.skipped }} דולגו)</span>
        </span>
        <span *ngIf="!r.ok">❌ <strong>{{ r.filename }}</strong> — {{ r.error }}</span>
      </div>

      <div *ngIf="totalImported() > 0" class="total-badge">
        סה"כ {{ totalImported() }} תלמידות במערכת
      </div>
    </div>
  `,
  styles: [`
    .upload-area {
      border: 2px dashed var(--border); border-radius: var(--radius); padding: 40px 20px;
      text-align: center; cursor: pointer; transition: all var(--transition);
      background: var(--surface-2);
      &:hover, &.dragover { border-color: var(--primary); background: var(--primary-light); }
    }
    .upload-icon { font-size: 2.5rem; margin-bottom: 10px; }
    .upload-text { font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .upload-hint { font-size: 0.78rem; color: var(--text-muted); }

    .import-status {
      margin-top: 12px; padding: 12px 16px; border-radius: var(--radius-sm);
      font-size: 0.875rem; display: flex; align-items: center; gap: 8px;
      &.importing { background: var(--primary-light); color: var(--primary); border: 1px solid var(--border-focus); }
      &.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
      &.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    }
    .spinner-sm {
      width: 16px; height: 16px; border: 2px solid var(--primary-light);
      border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .total-badge {
      margin-top: 16px; padding: 10px 16px; background: var(--primary-light);
      border-radius: var(--radius-sm); font-weight: 700; color: var(--primary);
      font-size: 0.875rem; text-align: center;
    }
  `]
})
export class AdminComponent {
  dragging = signal(false);
  importing = signal(false);
  results = signal<{ filename: string; ok: boolean; imported?: number; skipped?: number; error?: string }[]>([]);
  totalImported = signal(0);

  constructor(private http: HttpClient) {
    this.loadTotal();
  }

  loadTotal() {
    this.http.get<any[]>('/api/students').subscribe(s => this.totalImported.set(s.length));
  }

  onFileChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.importFiles(Array.from(files));
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) this.importFiles(files);
  }

  importFiles(files: File[]) {
    this.results.set([]);
    this.importing.set(true);
    let done = 0;
    const newResults: { filename: string; ok: boolean; imported?: number; skipped?: number; error?: string }[] = [];

    files.forEach(file => {
      const fd = new FormData();
      fd.append('file', file);
      this.http.post<any>('/api/students/import', fd).subscribe({
        next: (r) => {
          newResults.push({ filename: file.name, ok: true, imported: r.imported, skipped: r.skipped });
          if (++done === files.length) { this.importing.set(false); this.results.set([...newResults]); this.loadTotal(); }
        },
        error: (e) => {
          newResults.push({ filename: file.name, ok: false, error: e.error?.error || 'שגיאה' });
          if (++done === files.length) { this.importing.set(false); this.results.set([...newResults]); }
        }
      });
    });
  }
}

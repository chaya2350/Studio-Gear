import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule],
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
        העלה קובץ Excel עם עמודות: <strong>ת.ז, שם, טלפון, מסלול, שנה, ת. לידה לועזי/עברית, כתובת, מספר בית, עיר</strong><br>
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
          (תאריך לידה: {{ r.withBirthDate || 0 }}, כתובת: {{ r.withAddress || 0 }})
          <span *ngIf="r.skipped">({{ r.skipped }} דולגו)</span>
        </span>
        <span *ngIf="!r.ok">❌ <strong>{{ r.filename }}</strong> — {{ r.error }}</span>
      </div>

      <div *ngIf="totalImported() > 0" class="total-badge">
        סה"כ {{ totalImported() }} תלמידות במערכת
      </div>
    </div>

    <!-- ניהול סוגי אישורים -->
    <div class="card" style="max-width:760px; margin-top:24px;">
      <div class="section-title">📄 ניהול סוגי אישורים</div>

      <div class="approval-list">
        <div *ngFor="let t of approvalTypes()" class="approval-row">
          <div class="approval-row-info">
            <strong>{{ t.name }}</strong>
            <span class="approval-type-badge" [class.single]="t.type === 'single'">
              {{ t.type === 'single' ? '💍 אישור אישי' : '📄 אישור קבוצתי' }}
            </span>
          </div>
          <div class="approval-row-actions">
            <button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="editApproval(t)">✏️ עריכה</button>
            <button class="btn btn-danger" style="font-size:0.78rem; padding:5px 12px;" (click)="deleteApproval(t.id)">🗑️</button>
          </div>
        </div>
      </div>

      <div class="approval-form" *ngIf="editingApproval()">
        <div class="section-title" style="margin-top:20px;">{{ editingApproval()!.id ? '✏️ עריכת אישור' : '➕ אישור חדש' }}</div>
        <div class="form-group"><label>שם האישור</label><input [(ngModel)]="editingApproval()!.name" placeholder="שם האישור"></div>
        <div class="form-group">
          <label>סוג</label>
          <select [(ngModel)]="editingApproval()!.type">
            <option value="regular">📄 אישור קבוצתי (בחירת תלמידות)</option>
            <option value="single">💍 אישור אישי (מילוי ידני)</option>
          </select>
        </div>
        <div class="form-group">
          <label>חתימה</label>
          <select [(ngModel)]="editingApproval()!.signature">
            <option value="principal">מנהלת</option>
            <option value="secretary">מזכירות</option>
          </select>
        </div>
        <div class="form-group">
          <label>תבנית טקסט</label>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:6px;" [innerHTML]="varsHint(editingApproval()!.type)"></div>
          <textarea [(ngModel)]="editingApproval()!.template" rows="8" style="font-family:monospace; font-size:0.82rem;"></textarea>
        </div>
        <p *ngIf="approvalSaveError()" class="approval-save-error">{{ approvalSaveError() }}</p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" [disabled]="savingApproval()" (click)="saveApproval()">
            {{ savingApproval() ? 'שומר...' : '💾 שמור' }}
          </button>
          <button class="btn btn-secondary" [disabled]="savingApproval()" (click)="editingApproval.set(null)">ביטול</button>
        </div>
      </div>

      <button *ngIf="!editingApproval()" class="btn btn-secondary" style="margin-top:16px;" (click)="newApproval()">➕ הוסף סוג אישור</button>
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
    .approval-list { display: flex; flex-direction: column; gap: 8px; }
    .approval-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
    }
    .approval-row-info { display: flex; align-items: center; gap: 10px; }
    .approval-row-info strong { font-size: 0.9rem; }
    .approval-type-badge {
      font-size: 0.72rem; padding: 2px 8px; border-radius: 20px;
      background: var(--primary-light); color: var(--primary); font-weight: 600;
      &.single { background: #fdf4ff; color: #7c3aed; }
    }
    .approval-row-actions { display: flex; gap: 6px; }
    .approval-form { margin-top: 4px; }
    .approval-save-error { color: #991b1b; margin-bottom: 10px; }
    code { background: var(--surface-3); padding: 1px 5px; border-radius: 4px; font-size: 0.78rem; }
  `]
})
export class AdminComponent {
  dragging = signal(false);
  importing = signal(false);
  results = signal<{
    filename: string;
    ok: boolean;
    imported?: number;
    skipped?: number;
    withBirthDate?: number;
    withAddress?: number;
    error?: string;
  }[]>([]);
  totalImported = signal(0);
  approvalTypes = signal<any[]>([]);
  editingApproval = signal<any | null>(null);
  approvalSaveError = signal('');
  savingApproval = signal(false);

  constructor(private http: HttpClient, private api: ApiService) {
    this.loadTotal();
    this.loadApprovals();
  }

  loadTotal() {
    this.http.get<any[]>('/api/students').subscribe(s => this.totalImported.set(s.length));
  }

  loadApprovals() {
    this.api.getApprovalTypes().subscribe(t => this.approvalTypes.set(t));
  }

  newApproval() {
    this.approvalSaveError.set('');
    this.editingApproval.set({ id: null, name: '', template: '', signature: 'principal', type: 'regular' });
  }

  editApproval(t: any) {
    this.approvalSaveError.set('');
    this.editingApproval.set({ ...t });
  }

  saveApproval() {
    const t = this.editingApproval()!;
    this.approvalSaveError.set('');
    this.savingApproval.set(true);
    const obs = t.id ? this.api.updateApprovalType(t.id, t) : this.api.createApprovalType(t);
    obs.subscribe({
      next: () => {
        this.savingApproval.set(false);
        this.loadApprovals();
        this.editingApproval.set(null);
      },
      error: (error) => {
        this.savingApproval.set(false);
        this.approvalSaveError.set(error.error?.error || 'שמירת האישור נכשלה. נסי שוב.');
      }
    });
  }

  deleteApproval(id: number) {
    if (!confirm('למחוק סוג אישור זה?')) return;
    this.api.deleteApprovalType(id).subscribe(() => this.loadApprovals());
  }

  varsHint(type: string): string {
    const base = 'משתנים זמינים: <code>{{\u05e9\u05dd}}</code> <code>{{\u05ea\u05d6}}</code> <code>{{\u05e9\u05e0\u05d4}}</code> <code>{{\u05de\u05e1\u05dc\u05d5\u05dc}}</code>';
    const extra = ' <code>{{\u05ea\u05d0\u05e8\u05d9\u05da \u05dc\u05d9\u05d3\u05d4}}</code> <code>{{\u05db\u05ea\u05d5\u05d1\u05ea}}</code>';
    return type === 'single' ? base + extra : base;
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
    const newResults: {
      filename: string;
      ok: boolean;
      imported?: number;
      skipped?: number;
      withBirthDate?: number;
      withAddress?: number;
      error?: string;
    }[] = [];

    files.forEach(file => {
      const fd = new FormData();
      fd.append('file', file);
      this.http.post<any>('/api/students/import', fd).subscribe({
        next: (r) => {
          newResults.push({
            filename: file.name,
            ok: true,
            imported: r.imported,
            skipped: r.skipped,
            withBirthDate: r.withBirthDate,
            withAddress: r.withAddress
          });
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

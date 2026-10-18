import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { AuthService, UserRole } from '../../services/auth.service';

interface UserAccount {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: number;
  created_at: string;
}

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

    <div *ngIf="auth.user()?.role === 'admin'" class="card user-management">
      <div class="section-title">👥 ניהול משתמשות והרשאות</div>
      <p class="user-help">מנהלת מערכת יכולה לנהל חשבונות. סיסמה חדשה צריכה להכיל לפחות 12 תווים.</p>
      <div class="user-form">
        <input [(ngModel)]="newUser.name" placeholder="שם מלא" aria-label="שם מלא">
        <input [(ngModel)]="newUser.email" type="email" placeholder="אימייל" aria-label="אימייל">
        <input [(ngModel)]="newUser.password" type="password" placeholder="סיסמה ראשונית" aria-label="סיסמה ראשונית">
        <select [(ngModel)]="newUser.role" aria-label="תפקיד">
          <option value="laborant">לבורנטית</option>
          <option value="secretary">מזכירות</option>
          <option value="admin">מנהלת מערכת</option>
        </select>
        <button class="btn btn-primary" (click)="createUser()">➕ יצירת חשבון</button>
      </div>
      <p *ngIf="userError()" class="user-error" role="alert">{{ userError() }}</p>
      <div class="user-list">
        <div *ngFor="let user of users()" class="user-row">
          <div class="user-info">
            <strong>{{ user.name }}</strong>
            <span>{{ user.email }} · {{ user.active ? 'פעילה' : 'מושבתת' }}</span>
          </div>
          <select [ngModel]="user.role" (ngModelChange)="updateUser(user, $event, !!user.active)"
            [disabled]="user.id === auth.user()?.id" aria-label="תפקיד משתמשת">
            <option value="laborant">לבורנטית</option>
            <option value="secretary">מזכירות</option>
            <option value="admin">מנהלת מערכת</option>
          </select>
          <button class="btn" [class.btn-danger]="user.active" [class.btn-secondary]="!user.active"
            [disabled]="user.id === auth.user()?.id"
            (click)="updateUser(user, user.role, !user.active)">
            {{ user.active ? 'השבתה' : 'הפעלה' }}
          </button>
        </div>
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
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" (click)="saveApproval()">💾 שמור</button>
          <button class="btn btn-secondary" (click)="editingApproval.set(null)">ביטול</button>
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
    code { background: var(--surface-3); padding: 1px 5px; border-radius: 4px; font-size: 0.78rem; }
    .user-management { max-width: 1000px; margin-bottom: 24px; }
    .user-help { color: var(--text-muted); font-size: 0.85rem; margin: -4px 0 14px; }
    .user-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .user-list { display: grid; gap: 8px; margin-top: 18px; }
    .user-row { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .user-info { display: grid; flex: 1; gap: 3px; }
    .user-info span { color: var(--text-muted); font-size: 0.78rem; }
    .user-row select { max-width: 180px; }
    .user-error { color: var(--danger); font-size: 0.85rem; margin-top: 12px; }
    @media (max-width: 640px) {
      .user-row { align-items: stretch; flex-direction: column; }
      .user-row select { max-width: none; }
    }
  `]
})
export class AdminComponent {
  dragging = signal(false);
  importing = signal(false);
  results = signal<{ filename: string; ok: boolean; imported?: number; skipped?: number; error?: string }[]>([]);
  totalImported = signal(0);
  approvalTypes = signal<any[]>([]);
  editingApproval = signal<any | null>(null);
  users = signal<UserAccount[]>([]);
  userError = signal('');
  newUser: { name: string; email: string; password: string; role: UserRole } = {
    name: '', email: '', password: '', role: 'laborant'
  };

  constructor(private http: HttpClient, private api: ApiService, public auth: AuthService) {
    this.loadTotal();
    this.loadApprovals();
    if (auth.user()?.role === 'admin') this.loadUsers();
  }

  loadUsers() {
    this.http.get<UserAccount[]>('/api/users').subscribe(users => this.users.set(users));
  }

  createUser() {
    this.userError.set('');
    this.http.post('/api/users', this.newUser).subscribe({
      next: () => {
        this.newUser = { name: '', email: '', password: '', role: 'laborant' };
        this.loadUsers();
      },
      error: error => this.userError.set(error.error?.error || 'לא ניתן ליצור את החשבון')
    });
  }

  updateUser(user: UserAccount, role: UserRole, active: boolean) {
    this.userError.set('');
    this.http.put(`/api/users/${user.id}`, { role, active }).subscribe({
      next: () => this.loadUsers(),
      error: error => {
        this.userError.set(error.error?.error || 'לא ניתן לעדכן את החשבון');
        this.loadUsers();
      }
    });
  }

  loadTotal() {
    this.http.get<any[]>('/api/students').subscribe(s => this.totalImported.set(s.length));
  }

  loadApprovals() {
    this.api.getApprovalTypes().subscribe(t => this.approvalTypes.set(t));
  }

  newApproval() {
    this.editingApproval.set({ id: null, name: '', template: '', signature: 'principal', type: 'regular' });
  }

  editApproval(t: any) { this.editingApproval.set({ ...t }); }

  saveApproval() {
    const t = this.editingApproval()!;
    const obs = t.id ? this.api.updateApprovalType(t.id, t) : this.api.createApprovalType(t);
    obs.subscribe(() => { this.loadApprovals(); this.editingApproval.set(null); });
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

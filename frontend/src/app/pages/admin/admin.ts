import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { AuthService, UserRole } from '../../services/auth.service';
import { TracksComponent } from '../tracks/tracks';

type AdminSection = 'tracks' | 'students' | 'approvals' | 'users';

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
  imports: [CommonModule, FormsModule, TracksComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>⚙️ ניהול מערכת</h1>
        <p class="subtitle">בחרי תחום לניהול</p>
      </div>
    </div>

    <div class="section-tabs" role="tablist">
      <button
        *ngFor="let s of sections()"
        type="button"
        role="tab"
        class="section-tab"
        [class.active]="activeSection() === s.id"
        [attr.aria-selected]="activeSection() === s.id"
        (click)="section.set(s.id)"
      >
        <span class="tab-icon">{{ s.icon }}</span>
        <span>{{ s.label }}</span>
      </button>
    </div>

    <div *ngIf="activeSection() === 'users'" class="card user-management">
      <div class="section-title">👥 ניהול משתמשות והרשאות</div>
      <p class="user-help">מנהלת מערכת יכולה לנהל חשבונות. סיסמה חדשה צריכה להכיל לפחות 12 תווים.</p>

      <div class="danger-zone" *ngIf="auth.user()?.role === 'admin'">
        <div class="danger-title">⚠️ איפוס מסד נתונים (תלמידות)</div>
        <p>
          הפעולה תמחק את כל נתוני התלמידות, המסלולים, הדרישות והמבחנים כדי להתחיל הזנה מהתחלה.
          משתמשות מערכת, הודעות, ציוד והשאלות לא נמחקים.
        </p>
        <button class="btn btn-danger" [disabled]="resettingDb()" (click)="resetDatabase()">
          {{ resettingDb() ? 'מאפסת...' : '🧨 איפוס נתוני תלמידות' }}
        </button>
        <p *ngIf="resetDbMessage()" class="danger-result">{{ resetDbMessage() }}</p>
      </div>

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
      <div *ngIf="userError()" class="alert alert-error user-error" role="alert">⚠️ {{ userError() }}</div>
      <form *ngIf="passwordTarget() as target" class="alert user-error set-password" (submit)="$event.preventDefault(); savePassword()">
        <label>סיסמה חדשה עבור <strong>{{ target.name }}</strong> (12–128 תווים):</label>
        <input type="password" autocomplete="new-password" minlength="12" maxlength="128" [value]="newPassword()" (input)="newPassword.set($any($event.target).value)">
        <button class="btn btn-primary" type="submit" [disabled]="newPassword().length < 12">שמירה</button>
        <button class="btn btn-secondary" type="button" (click)="passwordTarget.set(null)">ביטול</button>
      </form>
      <div *ngIf="resetResult() as r" class="alert alert-success user-error" role="status">
        🔑 סיסמה זמנית עבור <strong>{{ r.name }}</strong>:
        <code class="temp-password">{{ r.password }}</code>
        <br>הסיסמה מוצגת פעם אחת בלבד. העבירי אותה למשתמשת, והיא תתחבר איתה (יש לבקש ממנה להחליף).
        <button class="btn btn-secondary" type="button" (click)="resetResult.set(null)">הסתרה</button>
      </div>
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
          <button class="btn btn-secondary" [disabled]="user.id === auth.user()?.id" (click)="startSetPassword(user)">
            ✏️ קביעת סיסמה
          </button>
          <button class="btn btn-secondary" [disabled]="user.id === auth.user()?.id" (click)="resetPassword(user)">
            🔑 איפוס סיסמה
          </button>
          <button class="btn" [class.btn-danger]="user.active" [class.btn-secondary]="!user.active"
            [disabled]="user.id === auth.user()?.id"
            (click)="updateUser(user, user.role, !user.active)">
            {{ user.active ? 'השבתה' : 'הפעלה' }}
          </button>
        </div>
      </div>
    </div>

    <app-tracks *ngIf="activeSection() === 'tracks'"></app-tracks>

    <div *ngIf="activeSection() === 'students'" class="card" style="max-width:560px;">
      <div class="section-title">📥 ייבוא תלמידות מאקסל</div>
      <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
        העלה קובץ Excel עם עמודות: <strong>ת.ז, שם, טלפון, מסלול, שנה, ת. לידה לועזי/עברית, כתובת, מספר בית, עיר</strong><br>
        ניתן להעלות מספר קבצים (שנה א + שנה ב). המערכת ממזגת לפי ת.ז בלי לדרוס מידע קיים, ומוסיפה פרמטרים חדשים (כמו קוד לטלפון).
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
          (תאריך לידה: {{ r.withBirthDate || 0 }}, כתובת: {{ r.withAddress || 0 }}, קוד טלפון: {{ r.withPhoneCode || 0 }})
          <span *ngIf="r.mergedExisting"> · מוזגו {{ r.mergedExisting }} תלמידות קיימות</span>
          <span *ngIf="r.addedExtraFields"> · נוספו {{ r.addedExtraFields }} פרמטרים נוספים</span>
          <span *ngIf="r.skipped">({{ r.skipped }} דולגו)</span>
        </span>
        <span *ngIf="!r.ok">❌ <strong>{{ r.filename }}</strong> — {{ r.error }}</span>
      </div>

      <div *ngIf="totalImported() > 0" class="total-badge">
        סה"כ {{ totalImported() }} תלמידות במערכת
      </div>
    </div>

    <!-- ניהול סוגי אישורים -->
    <div *ngIf="activeSection() === 'approvals'" class="card" style="max-width:760px;">
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
    .section-tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
    .section-tab {
      display: flex; align-items: center; gap: 8px; padding: 12px 22px; cursor: pointer;
      background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      font: inherit; font-weight: 700; color: var(--text-muted); box-shadow: var(--shadow-xs);
      transition: all var(--transition);
    }
    .section-tab:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    .section-tab.active { background: var(--grad-primary); border-color: transparent; color: #fff; box-shadow: var(--shadow-primary); }
    .tab-icon { font-size: 1.15rem; }
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
    .user-management { max-width: 1000px; margin-bottom: 24px; }
    .danger-zone {
      margin: 0 0 16px;
      padding: 14px;
      border: 1.5px solid #fecaca;
      border-radius: var(--radius-sm);
      background: #fff1f2;
      display: grid;
      gap: 8px;
    }
    .danger-title { font-weight: 800; color: #9f1239; }
    .danger-zone p { margin: 0; color: #881337; font-size: 0.85rem; }
    .danger-result { font-weight: 700; color: #9f1239; }
    .user-help { color: var(--text-muted); font-size: 0.85rem; margin: -4px 0 14px; }
    .user-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: center; }
    .user-form input, .user-form select, .user-row select {
      padding: 10px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      font-size: 0.93rem; font-family: inherit; direction: rtl; background: var(--surface); color: var(--text);
      transition: border-color var(--transition), box-shadow var(--transition);
    }
    .user-form input:focus, .user-form select:focus, .user-row select:focus {
      outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow);
    }
    .user-form input::placeholder { color: var(--text-light); }
    .user-list { display: grid; gap: 10px; margin-top: 20px; }
    .user-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .user-info { display: grid; flex: 1; gap: 3px; }
    .user-info span { color: var(--text-muted); font-size: 0.78rem; }
    .user-row select { max-width: 180px; }
    .user-error { margin-top: 12px; margin-bottom: 0; }
    .temp-password { direction: ltr; display: inline-block; font-size: 1.1rem; font-weight: 800; letter-spacing: 1px; background: var(--surface); padding: 2px 10px; border-radius: 6px; user-select: all; }
    @media (max-width: 640px) {
      .user-row { align-items: stretch; flex-direction: column; }
      .user-row select { max-width: none; }
    }
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
    withPhoneCode?: number;
    mergedExisting?: number;
    addedExtraFields?: number;
    error?: string;
  }[]>([]);
  totalImported = signal(0);
  approvalTypes = signal<any[]>([]);
  editingApproval = signal<any | null>(null);
  users = signal<UserAccount[]>([]);
  userError = signal('');
  resetResult = signal<{ name: string; password: string } | null>(null);
  newUser: { name: string; email: string; password: string; role: UserRole } = {
    name: '', email: '', password: '', role: 'laborant'
  };
  approvalSaveError = signal('');
  savingApproval = signal(false);
  section = signal<AdminSection | null>(null);
  resettingDb = signal(false);
  resetDbMessage = signal('');

  constructor(private http: HttpClient, private api: ApiService, public auth: AuthService) {
    this.loadTotal();
    this.loadApprovals();
    if (auth.user()?.role === 'admin') this.loadUsers();
  }

  sections(): { id: AdminSection; icon: string; label: string }[] {
    const role = this.auth.user()?.role;
    const all: { id: AdminSection; icon: string; label: string; roles: UserRole[] }[] = [
      { id: 'tracks', icon: '🎓', label: 'מסלולים', roles: ['admin', 'laborant'] },
      { id: 'students', icon: '🪪', label: 'תלמידות', roles: ['admin', 'laborant', 'secretary'] },
      { id: 'approvals', icon: '📄', label: 'סוגי אישורים', roles: ['admin', 'laborant', 'secretary'] },
      { id: 'users', icon: '👥', label: 'משתמשות והרשאות', roles: ['admin'] },
    ];
    return all.filter(s => role && s.roles.includes(role));
  }

  activeSection(): AdminSection | null {
    const available = this.sections();
    const chosen = this.section();
    return available.find(s => s.id === chosen)?.id ?? available[0]?.id ?? null;
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

  passwordTarget = signal<UserAccount | null>(null);
  newPassword = signal('');

  startSetPassword(user: UserAccount) {
    this.userError.set('');
    this.resetResult.set(null);
    this.newPassword.set('');
    this.passwordTarget.set(user);
  }

  savePassword() {
    const user = this.passwordTarget();
    if (!user) return;
    this.http.post(`/api/users/${user.id}/password`, { password: this.newPassword() }).subscribe({
      next: () => {
        this.passwordTarget.set(null);
        this.newPassword.set('');
        alert(`הסיסמה של ${user.name} עודכנה. היא נותקה מהמערכת ותתחבר עם הסיסמה החדשה.`);
      },
      error: error => this.userError.set(error.error?.error || 'לא ניתן לשנות את הסיסמה')
    });
  }

  resetPassword(user: UserAccount) {
    if (!confirm(`לאפס את הסיסמה של ${user.name}? הסיסמה הנוכחית תפסיק לעבוד והיא תנותק מהמערכת.`)) return;
    this.userError.set('');
    this.resetResult.set(null);
    this.http.post<{ password: string }>(`/api/users/${user.id}/reset-password`, {}).subscribe({
      next: result => this.resetResult.set({ name: user.name, password: result.password }),
      error: error => this.userError.set(error.error?.error || 'לא ניתן לאפס את הסיסמה')
    });
  }

  resetDatabase() {
    this.resetDbMessage.set('');
    const first = confirm('לאפס את נתוני התלמידות מהמערכת? הפעולה מוחקת נתוני תלמידות/מסלולים/דרישות/מבחנים.');
    if (!first) return;
    const second = confirm('אישור סופי: פעולה זו בלתי הפיכה. להמשיך?');
    if (!second) return;

    this.resettingDb.set(true);
    this.api.resetDatabase().subscribe({
      next: (result) => {
        this.resettingDb.set(false);
        this.loadTotal();
        this.resetDbMessage.set(`${result.message} (נמחקו תלמידות: ${result.cleared['students']}, מסלולים: ${result.cleared['tracks']}, מבחנים: ${result.cleared['exams']})`);
      },
      error: (error) => {
        this.resettingDb.set(false);
        this.resetDbMessage.set(error.error?.error || 'איפוס מסד הנתונים נכשל');
      }
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
      withPhoneCode?: number;
      mergedExisting?: number;
      addedExtraFields?: number;
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
            withAddress: r.withAddress,
            withPhoneCode: r.withPhoneCode,
            mergedExisting: r.mergedExisting,
            addedExtraFields: r.addedExtraFields
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

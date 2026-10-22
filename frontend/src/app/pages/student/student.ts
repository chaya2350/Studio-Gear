import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, StudentRequirement, StudentRequirements } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Student } from '../../models';

@Component({
  selector: 'app-student',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div *ngIf="student()">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <a href="#" (click)="goBack($event)" class="back-btn">→</a>
          <div>
            <h1>{{ student()!.name }}</h1>
            <p class="subtitle">🪪 {{ student()!.id_number }}
              <span *ngIf="student()!.track"> · {{ student()!.track }}{{ student()!.year ? ' ' + student()!.year : '' }}</span>
            </p>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="student-card-header">
            <div class="section-title">📋 פרטים אישיים</div>
            <button *ngIf="!editing()" class="btn btn-secondary" (click)="startEditing()">✏️ עריכת פרטים</button>
          </div>
          <form *ngIf="editing()" class="student-edit-form" (ngSubmit)="saveStudent()">
            <label>שם מלא<input name="name" [(ngModel)]="studentDraft.name" required></label>
            <label>טלפון<input name="phone" [(ngModel)]="studentDraft.phone"></label>
            <label>מסלול<input name="track" [(ngModel)]="studentDraft.track"></label>
            <label>שנה<input name="year" [(ngModel)]="studentDraft.year"></label>
            <div *ngIf="editError()" class="edit-error" role="alert">{{ editError() }}</div>
            <div class="edit-actions">
              <button class="btn btn-primary" type="submit" [disabled]="saving()">שמור</button>
              <button class="btn btn-secondary" type="button" (click)="editing.set(false)">ביטול</button>
            </div>
          </form>
          <div class="info-row">
            <span class="info-label">שם</span>
            <span class="info-value">{{ student()!.name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">ת.ז.</span>
            <span class="info-value barcode-val">{{ student()!.id_number }}</span>
          </div>
          <div class="info-row" *ngIf="student()!.phone">
            <span class="info-label">טלפון</span>
            <span class="info-value">{{ student()!.phone }}</span>
          </div>
          <div class="info-row" *ngIf="student()!.track">
            <span class="info-label">מסלול</span>
            <span class="info-value">{{ student()!.track }}{{ student()!.year ? ' ' + student()!.year : '' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">סה"כ השאלות</span>
            <span class="info-value">{{ student()!.loans?.length || 0 }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">פעילות</span>
            <span class="badge" [class]="activeLoans().length ? 'badge-loaned' : 'badge-available'">
              {{ activeLoans().length ? activeLoans().length + ' פעילות' : 'אין השאלות פעילות' }}
            </span>
          </div>
        </div>

        <div class="card" *ngIf="activeLoans().length">
          <div class="section-title">📤 השאלות פעילות</div>
          <div *ngFor="let l of activeLoans()" class="loan-row active">
            <a [routerLink]="['/equipment', l.equipment_id]" class="loan-name">{{ l.equipment_name }}</a>
            <div class="loan-meta">
              <span>{{ l.loan_date }}</span>
              <span>→</span>
              <span [style.color]="isOverdue(l) ? 'var(--danger)' : 'inherit'">{{ l.expected_return }}</span>
              <span *ngIf="isOverdue(l)" class="badge badge-overdue">⚠ איחור</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px;" *ngIf="requirements() as reqs">
        <div class="section-title">✅ דרישות המסלול{{ reqs.track ? ' · ' + reqs.track : '' }}</div>
        <p *ngIf="!reqs.track" class="req-note">לא הוגדר מסלול לתלמידה. אפשר להגדיר אותו בעריכת הפרטים.</p>
        <p *ngIf="reqs.track && !reqs.defined" class="req-note">
          עדיין לא הוגדרו דרישות למסלול הזה.
          <a *ngIf="auth.user()?.role !== 'secretary'" routerLink="/admin" class="req-link">להגדרת המסלול</a>
        </p>
        <p *ngIf="reqs.defined && !reqs.requirements.length" class="req-note">
          למסלול הזה עדיין אין דרישות.
          <a *ngIf="auth.user()?.role !== 'secretary'" routerLink="/admin" class="req-link">להוספת דרישות</a>
        </p>
        <ng-container *ngIf="reqs.requirements.length">
          <div class="req-summary" [class.done]="missingRequired() === 0">
            {{ missingRequired() === 0 ? '🎉 כל דרישות החובה הושלמו' : 'חסרות ' + missingRequired() + ' דרישות חובה' }}
          </div>
          <div *ngIf="requirementError()" class="edit-error" role="alert">{{ requirementError() }}</div>
          <ng-container *ngFor="let r of reqs.requirements">
          <div *ngIf="r.requires_file" class="req-item file-req" [class.checked]="!!r.completed_at">
            <span class="req-text">📎 {{ r.title }}</span>
            <span class="badge req-badge" [class.optional]="!r.required">{{ r.required ? 'חובה' : 'רשות' }}</span>
            <ng-container *ngIf="r.completed_at">
              <a class="btn btn-secondary" [href]="fileUrl(r)" target="_blank" rel="noopener">👁️ {{ r.file_name || 'צפייה' }}</a>
              <button class="btn btn-secondary" type="button" (click)="printFile(r)">🖨️ הדפסה</button>
              <button class="btn btn-danger" type="button" [disabled]="savingRequirementId() === r.id" (click)="toggleRequirement(r, false)">🗑️</button>
            </ng-container>
            <label class="btn btn-primary upload-btn" [class.disabled]="savingRequirementId() === r.id">
              {{ r.completed_at ? '🔄 החלפה' : '⬆️ העלאת קובץ' }}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                hidden
                [disabled]="savingRequirementId() === r.id"
                (change)="uploadFile(r, $event)"
              />
            </label>
            <span *ngIf="r.completed_at" class="req-by">{{ r.completed_by ? 'הועלה ע"י ' + r.completed_by : '' }}</span>
          </div>
          <label *ngIf="!r.requires_file" class="req-item" [class.checked]="!!r.completed_at">
            <input
              type="checkbox"
              [checked]="!!r.completed_at"
              [disabled]="savingRequirementId() === r.id"
              (change)="toggleRequirement(r, $any($event.target).checked)"
            />
            <span class="req-text">{{ r.title }}</span>
            <span class="badge req-badge" [class.optional]="!r.required">{{ r.required ? 'חובה' : 'רשות' }}</span>
            <span *ngIf="r.completed_at" class="req-by">{{ r.completed_by ? 'סומן ע"י ' + r.completed_by : 'הושלם' }}</span>
          </label>
          </ng-container>
        </ng-container>
      </div>

      <div class="card" style="margin-top:20px;" *ngIf="exams() as ex">
        <div class="section-title">📝 מבחנים וציונים</div>
        <p *ngIf="!ex.length" class="req-note">עדיין אין מבחנים רשומים לתלמידה זו.</p>
        <div class="table-wrap" *ngIf="ex.length">
          <table>
            <thead>
              <tr><th>מבחן</th><th>תאריך</th><th>ציון</th><th>סטטוס</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of ex">
                <td>{{ e.exam_name }}</td>
                <td>{{ e.exam_date || '—' }}</td>
                <td [class.grade-val]="e.grade != null">{{ e.grade != null ? e.grade : '—' }}</td>
                <td><span class="badge" [class.badge-green]="e.grade != null" [class.badge-red]="e.grade == null">{{ e.grade != null ? 'נבחנה' : 'לא נבחנה' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="exam-average" *ngIf="studentExamAvg()">
          📊 ממוצע כללי: <strong>{{ studentExamAvg() }}</strong>
        </div>
      </div>

      <div class="card" style="margin-top:20px;">
        <div class="section-title">🕓 היסטוריית השאלות ({{ student()!.loans?.length || 0 }})</div>
        <div *ngIf="!student()!.loans?.length" class="empty-state" style="padding:30px 0;">
          <div class="empty-icon">📭</div><p>אין היסטוריה</p>
        </div>
        <div class="table-wrap" *ngIf="student()!.loans?.length">
          <table>
            <thead>
              <tr><th>ציוד</th><th>סוג</th><th>תאריך השאלה</th><th>תאריך החזרה</th><th>הוחזר</th><th>תשלום</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of student()!.loans">
                <td><a [routerLink]="['/equipment', l.equipment_id]" style="color:var(--primary); font-weight:700;">{{ l.equipment_name }}</a></td>
                <td><span class="badge" [style]="l.loan_type==='rental' ? 'background:#fff8ec;color:#d97706' : 'background:#e6faf4;color:#059669'">{{ l.loan_type === 'rental' ? '💰 השכרה' : '🤝 השאלה' }}</span></td>
                <td>{{ l.loan_date }}</td>
                <td>{{ l.expected_return }}</td>
                <td>
                  <span *ngIf="l.actual_return" class="badge badge-available">{{ l.actual_return }}</span>
                  <span *ngIf="!l.actual_return" class="badge badge-loaned">טרם הוחזר</span>
                </td>
                <td>
                  <span *ngIf="l.payment_status === 'charged'" class="badge badge-available">✅ חויב</span>
                  <span *ngIf="l.payment_status === 'pending'" class="badge" style="background:#fff8ec;color:#d97706">⏳ ממתין</span>
                  <span *ngIf="l.payment_status === 'none'" class="badge badge-available">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div *ngIf="!student() && !loading()" class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>תלמידה לא נמצאה</p>
      <a href="#" (click)="goBack($event)" class="btn btn-primary" style="margin-top:16px;">חזרה</a>
    </div>
  `,
  styles: [`
    .back-btn {
      width: 36px; height: 36px; background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
      text-decoration: none; color: var(--text-muted); font-size: 1rem; font-weight: 700;
      transition: all var(--transition); box-shadow: var(--shadow-xs);
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }
    .student-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    .student-card-header .section-title { margin-bottom: 0; }
    .student-edit-form { display: grid; gap: 10px; margin-bottom: 16px; }
    .student-edit-form label { display: grid; gap: 5px; font-size: 0.82rem; font-weight: 700; }
    .edit-actions { display: flex; gap: 8px; }
    .edit-error { color: var(--danger); font-size: 0.85rem; }
    .req-note { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
    .req-link { color: var(--primary); font-weight: 700; margin-inline-start: 6px; }
    .req-summary {
      background: #fef3c7; color: #92400e; border-radius: var(--radius-sm);
      padding: 8px 14px; font-weight: 700; font-size: 0.88rem; margin-bottom: 12px;
      &.done { background: #dcfce7; color: #166534; }
    }
    .req-item {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin-bottom: 8px;
      background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
      &.checked { background: #f0fdf4; border-color: #bbf7d0; }
      input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }
    }
    .req-text { flex: 1; font-weight: 600; }
    .req-item.checked .req-text { color: var(--text-muted); text-decoration: line-through; }
    .req-badge { background: #fee2e2; color: #b91c1c; }
    .req-badge.optional { background: var(--primary-light); color: var(--primary); }
    .req-by { color: var(--text-muted); font-size: 0.75rem; }
    .file-req { flex-wrap: wrap; cursor: default; }
    .file-req .btn { padding: 6px 12px; font-size: 0.82rem; text-decoration: none; }
    .upload-btn { cursor: pointer; margin: 0; }
    .upload-btn.disabled { opacity: 0.6; pointer-events: none; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }
    .barcode-val {
      font-family: monospace; background: var(--surface-2); padding: 3px 9px;
      border-radius: var(--radius-xs); font-size: 0.85rem; border: 1px solid var(--border);
    }
    .loan-row {
      padding: 12px 0; border-bottom: 1px solid var(--border);
      &:last-child { border: none; }
    }
    .loan-name {
      font-weight: 700; color: var(--primary); text-decoration: none; font-size: 0.9rem;
      display: block; margin-bottom: 5px;
      &:hover { text-decoration: underline; }
    }
    .loan-meta {
      display: flex; gap: 8px; align-items: center; font-size: 0.8rem; color: var(--text-muted);
    }
    .stats-row {
      display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;
    }
    .stat-pill {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px;
      padding: 5px 14px; font-size: 0.8rem; font-weight: 700; color: var(--text-muted);
      display: flex; align-items: center; gap: 6px;
      span { color: var(--text); font-size: 1rem; }
    }
  `]
})
export class StudentComponent implements OnInit {
  student = signal<Student | null>(null);
  loading = signal(true);
  editing = signal(false);
  saving = signal(false);
  editError = signal('');
  studentDraft = { name: '', phone: '', track: '', year: '' };
  today = new Date().toISOString().split('T')[0];
  requirements = signal<StudentRequirements | null>(null);
  requirementError = signal('');
  savingRequirementId = signal<number | null>(null);
  exams = signal<any[]>([]);

  constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService, private location: Location, private router: Router) {}

  goBack(event: Event) {
    event.preventDefault();
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/students']);
  }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.loadStudent(id);
  }

  loadStudent(id: string) {
    this.api.getStudent(id).subscribe({
      next: s => { this.student.set(s); this.loading.set(false); this.loadRequirements(s.id_number); this.loadExams(s.id_number); },
      error: () => this.loading.set(false)
    });
  }

  loadExams(id_number: string) {
    this.api.getStudentExams(id_number).subscribe({
      next: rows => this.exams.set(rows),
      error: () => this.exams.set([])
    });
  }

  studentExamAvg(): string {
    const graded = this.exams().filter(e => e.grade != null);
    if (!graded.length) return '';
    return (graded.reduce((sum, e) => sum + e.grade, 0) / graded.length).toFixed(1);
  }

  loadRequirements(id_number: string) {
    this.api.getStudentRequirements(id_number).subscribe({
      next: r => this.requirements.set(r),
      error: () => this.requirements.set(null)
    });
  }

  missingRequired() {
    return (this.requirements()?.requirements || []).filter(r => r.required && !r.completed_at).length;
  }

  toggleRequirement(req: StudentRequirement, completed: boolean) {
    const current = this.student();
    if (!current || this.savingRequirementId() !== null) return;
    this.savingRequirementId.set(req.id);
    this.requirementError.set('');
    this.api.setStudentRequirement(current.id_number, req.id, completed).subscribe({
      next: () => {
        this.savingRequirementId.set(null);
        this.loadRequirements(current.id_number);
      },
      error: error => {
        this.savingRequirementId.set(null);
        this.requirementError.set(error.error?.error || 'לא ניתן לשמור את הסימון');
        this.loadRequirements(current.id_number);
      }
    });
  }

  fileUrl(req: StudentRequirement) {
    return this.api.requirementFileUrl(this.student()!.id_number, req.id) + '?v=' + encodeURIComponent(req.completed_at || '');
  }

  uploadFile(req: StudentRequirement, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const current = this.student();
    input.value = '';
    if (!file || !current) return;
    this.savingRequirementId.set(req.id);
    this.requirementError.set('');
    this.api.uploadRequirementFile(current.id_number, req.id, file).subscribe({
      next: () => {
        this.savingRequirementId.set(null);
        this.loadRequirements(current.id_number);
      },
      error: error => {
        this.savingRequirementId.set(null);
        this.requirementError.set(error.error?.error || 'לא ניתן להעלות את הקובץ');
      }
    });
  }

  printFile(req: StudentRequirement) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.src = this.fileUrl(req);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60000);
    };
    document.body.appendChild(frame);
  }

  startEditing() {
    const current = this.student();
    if (!current) return;
    this.studentDraft = {
      name: current.name,
      phone: current.phone || '',
      track: current.track || '',
      year: current.year || ''
    };
    this.editError.set('');
    this.editing.set(true);
  }

  saveStudent() {
    const current = this.student();
    if (!current || this.saving()) return;
    this.saving.set(true);
    this.editError.set('');
    this.api.updateStudent(current.id_number, this.studentDraft).subscribe({
      next: () => {
        this.editing.set(false);
        this.saving.set(false);
        this.loadStudent(current.id_number);
      },
      error: error => {
        this.editError.set(error.error?.error || 'לא ניתן לשמור את פרטי התלמידה');
        this.saving.set(false);
      }
    });
  }

  activeLoans() {
    return (this.student()?.loans || []).filter(l => !l.actual_return);
  }

  isOverdue(l: any) {
    return !l.actual_return && l.expected_return < this.today;
  }
}

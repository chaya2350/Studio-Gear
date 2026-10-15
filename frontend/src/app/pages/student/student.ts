import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { Student } from '../../models';

@Component({
  selector: 'app-student',
  imports: [CommonModule, RouterLink],
  template: `
    <div *ngIf="student()">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <a routerLink="/equipment" class="back-btn">←</a>
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
          <div class="section-title">📋 פרטים אישיים</div>
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
      <a routerLink="/equipment" class="btn btn-primary" style="margin-top:16px;">חזור לציוד</a>
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
  today = new Date().toISOString().split('T')[0];

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.api.getStudent(id).subscribe({
      next: s => { this.student.set(s); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  activeLoans() {
    return (this.student()?.loans || []).filter(l => !l.actual_return);
  }

  isOverdue(l: any) {
    return !l.actual_return && l.expected_return < this.today;
  }
}

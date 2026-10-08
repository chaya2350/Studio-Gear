import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { Loan } from '../../models';

@Component({
  selector: 'app-loans',
  imports: [CommonModule, RouterLink],
  // loans component
  template: `
    <div class="page-header">
      <div>
        <h1>השאלות</h1>
        <p class="subtitle">ניהול כל ההשאלות הפעילות</p>
      </div>
    </div>

    <!-- Laptop overdue alert -->
    <div *ngIf="laptopOverdue().length" class="laptop-alert">
      <strong>💻 מחשבים שלא הוחזרו היום ({{ laptopOverdue().length }}):</strong>
      <span *ngFor="let l of laptopOverdue(); let last = last">
        {{ l.equipment_name }} — {{ l.borrower_name }}{{ !last ? ' | ' : '' }}
      </span>
    </div>

    <div class="filter-tabs">
      <button [class.active]="filter()==='active'" (click)="setFilter('active')">
        📤 פעילות <span class="tab-count">{{ activeCount() }}</span>
      </button>
      <button [class.active]="filter()==='overdue'" (click)="setFilter('overdue')">
        ⚠️ איחורים
        <span class="tab-count overdue" *ngIf="overdueCount()">{{ overdueCount() }}</span>
      </button>
      <button [class.active]="filter()==='all'" (click)="setFilter('all')">
        📋 הכל <span class="tab-count">{{ all().length }}</span>
      </button>
    </div>

    <div class="card">
      <div class="table-wrap" *ngIf="displayed().length; else empty">
        <table>
          <thead>
            <tr>
              <th>ציוד</th>
              <th>קטגוריה</th>
              <th>שואל</th>
              <th>טלפון</th>
              <th>תאריך השאלה</th>
              <th>תאריך החזרה</th>
              <th>סטטוס</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of displayed()" [class.overdue-row]="isOverdue(l)">
              <td>
                <a [routerLink]="['/equipment', l.equipment_id]" class="eq-link">{{ l.equipment_name }}</a>
              </td>
              <td><span class="cat-chip">{{ l.category }}</span></td>
              <td><strong>{{ l.borrower_name }}</strong></td>
              <td>{{ l.borrower_phone || '—' }}</td>
              <td>{{ l.loan_date }}</td>
              <td [style.color]="isOverdue(l) ? 'var(--danger)' : 'inherit'" [style.fontWeight]="isOverdue(l) ? '700' : '400'">
                {{ l.expected_return }}
              </td>
              <td>
                <span *ngIf="!l.actual_return && isFuture(l)" class="badge badge-reserved">📅 שמור</span>
                <span *ngIf="!l.actual_return && !isFuture(l)" class="badge" [class]="isOverdue(l) ? 'badge-overdue' : 'badge-loaned'">
                  {{ isOverdue(l) ? '⚠ איחור' : 'מושאל' }}
                </span>
                <span *ngIf="l.actual_return" class="badge badge-available">✓ {{ l.actual_return }}</span>
              </td>
              <td>
                <button *ngIf="!l.actual_return && !isFuture(l)" class="btn btn-success" style="padding:5px 14px; font-size:0.8rem;" (click)="returnLoan(l)">
                  {{ isOverdue(l) ? 'שלם והחזר' : 'החזר' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ng-template #empty>
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>אין השאלות להצגה</p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .filter-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;

      button {
        padding: 9px 20px;
        border: 1.5px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text-muted);
        font-size: 0.88rem;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.18s;
        display: flex;
        align-items: center;
        gap: 7px;

        &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
        &.active { background: var(--primary); color: white; border-color: var(--primary); }
      }
    }
    .tab-count {
      background: rgba(255,255,255,0.25);
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 0.78rem;
      &.overdue { background: var(--danger); color: white; }
    }
    .laptop-alert {
      background: #fef3c7; border: 1.5px solid #f59e0b; border-radius: 10px;
      padding: 12px 16px; margin-bottom: 20px; font-size: 0.9rem; color: #92400e;
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    }
    .eq-link { color: var(--primary); text-decoration: none; font-weight: 600; &:hover { text-decoration: underline; } }
    .cat-chip { background: var(--primary-light); color: var(--primary); padding: 3px 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 600; }
    .overdue-row td { background: #fff8f8 !important; }
  `]
})
export class LoansComponent implements OnInit {
  all = signal<Loan[]>([]);
  displayed = signal<Loan[]>([]);
  filter = signal<'active' | 'overdue' | 'all'>('active');
  overdueCount = signal(0);
  laptopOverdue = signal<any[]>([]);

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.load();
    this.api.getOverdueLoans().subscribe(d => this.overdueCount.set(d.length));
    this.api.getLaptopOverdue().subscribe(d => this.laptopOverdue.set(d));
    this.route.queryParams.subscribe(p => {
      if (p['filter'] === 'overdue') this.setFilter('overdue');
    });
  }

  activeCount() { return this.all().filter(l => !l.actual_return).length; }

  load() {
    this.api.getLoans().subscribe(data => { this.all.set(data); this.applyFilter(); });
  }

  setFilter(f: 'active' | 'overdue' | 'all') { this.filter.set(f); this.applyFilter(); }

  applyFilter() {
    const today = new Date().toISOString().split('T')[0];
    const all = this.all();
    if (this.filter() === 'active')       this.displayed.set(all.filter(l => !l.actual_return && !this.isFuture(l)));
    else if (this.filter() === 'overdue') this.displayed.set(all.filter(l => !l.actual_return && !this.isFuture(l) && l.expected_return < today));
    else this.displayed.set(all);
  }

  isFuture(l: Loan) { return l.is_future === 1; }
  isOverdue(l: Loan) { return !l.actual_return && !this.isFuture(l) && l.expected_return < new Date().toISOString().split('T')[0]; }

  returnLoan(l: Loan) {
    this.api.returnLoan(l.id).subscribe({
      next: () => {
        this.load();
        this.api.getOverdueLoans().subscribe(d => this.overdueCount.set(d.length));
      },
      error: (e) => {
        if (e.status === 402) {
          const msg = `נדרש תשלום קנס איחור של ${e.error.chargeAmount} ₪ לפני החזרה.\nניתן לבצע תשלום מדף פרטי הציוד.`;
          alert(msg);
        } else {
          alert(e.error?.error || 'שגיאה');
        }
      }
    });
  }
}

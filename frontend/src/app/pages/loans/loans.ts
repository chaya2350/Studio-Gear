import { Component, OnInit, signal, ElementRef, ViewChild } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ApiService } from '../../services/api.service';
import { Loan } from '../../models';

@Component({
  selector: 'app-loans',
  imports: [CommonModule, RouterLink, FormsModule],
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

    <div class="card" *ngIf="orderFilter()">
      <div class="return-scan-box">
        <div class="return-title">🔎 החזרת פריטים מהזמנה</div>
        <div class="scan-row">
          <input [(ngModel)]="returnBarcode" (keydown.enter)="submitReturnScan()" placeholder="סרוק/הקלד ברקוד מוצר מההזמנה" />
          <button type="button" class="btn btn-ghost" (click)="toggleReturnScan()" [class.active]="returnScanOpen()">📷</button>
          <button class="btn btn-primary" (click)="submitReturnScan()">סמן כמוחזר</button>
        </div>
        <div *ngIf="returnScanOpen()" class="scan-video-wrap">
          <video #returnScanVideo autoplay playsinline muted></video>
        </div>
        <div *ngIf="returnMessage()" class="return-message" [class.error]="returnMessageType() === 'error'">
          {{ returnMessage() }}
        </div>
      </div>
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
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of displayed()" [class.overdue-row]="isOverdue(l)" [class.order-highlight-row]="isInOrderFilter(l)">
              <td>
                <a [routerLink]="['/equipment', l.equipment_id]" class="eq-link">{{ l.equipment_name }}</a>
              </td>
              <td><span class="cat-chip">{{ l.category }}</span></td>
              <td>
                <a *ngIf="l.borrower_id_number" [routerLink]="['/students', l.borrower_id_number]" class="student-link">
                  <strong>{{ l.borrower_name }}</strong>
                </a>
                <strong *ngIf="!l.borrower_id_number">{{ l.borrower_name }}</strong>
              </td>
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
      gap: 6px;
      margin-bottom: 22px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 5px;

      button {
        padding: 8px 18px;
        border: none;
        border-radius: var(--radius-xs);
        background: transparent;
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        transition: all var(--transition);
        display: flex;
        align-items: center;
        gap: 7px;

        &:hover { background: var(--surface-2); color: var(--text); }
        &.active { background: var(--grad-primary); color: white; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
      }
    }
    .tab-count {
      background: rgba(255,255,255,0.25);
      border-radius: 20px;
      padding: 1px 8px;
      font-size: 0.72rem;
      &.overdue { background: var(--danger); color: white; }
    }
    button:not(.active) .tab-count { background: var(--surface-2); color: var(--text-muted); }
    .laptop-alert {
      background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: var(--radius-sm);
      padding: 12px 16px; margin-bottom: 20px; font-size: 0.875rem; color: #92400e;
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-weight: 500;
    }
    .return-scan-box {
      padding: 18px 20px; background: #f8fafc; border: 1px solid var(--border); border-radius: var(--radius-sm);
    }
    .return-title {
      font-size: 0.9rem; font-weight: 800; color: var(--text); margin-bottom: 10px;
    }
    .scan-row {
      display: flex; gap: 10px; align-items: center;
    }
    .scan-row input {
      flex: 1; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; font-size: 0.95rem;
      font-family: inherit; background: white;
    }
    .btn-ghost {
      border: 1px solid var(--border); background: white; color: var(--text); padding: 10px 12px;
      border-radius: var(--radius-sm); font-size: 1.2rem; min-width: 46px;
    }
    .btn-ghost.active { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    .scan-video-wrap {
      margin-top: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: #0f172a;
    }
    .scan-video-wrap video {
      width: 100%; max-height: 220px; display: block; background: #0f172a;
    }
    .return-message {
      margin-top: 10px; font-size: 0.82rem; font-weight: 700; color: #166534; background: #ecfdf5; border: 1px solid #86efac; border-radius: var(--radius-xs); padding: 8px 10px;
    }
    .return-message.error { color: #991b1b; background: #fef2f2; border-color: #fca5a5; }
    .eq-link { color: var(--primary); text-decoration: none; font-weight: 700; &:hover { text-decoration: underline; } }
    .student-link { color: var(--primary); text-decoration: none; font-weight: 700; &:hover { text-decoration: underline; } }
    .cat-chip { background: var(--primary-light); color: var(--primary); padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; }
    .overdue-row td { background: #fef2f2 !important; }
    .order-highlight-row td { background: #eef2ff !important; box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.2); }
  `]
})
export class LoansComponent implements OnInit {
  all = signal<Loan[]>([]);
  displayed = signal<Loan[]>([]);
  filter = signal<'active' | 'overdue' | 'all'>('active');
  overdueCount = signal(0);
  laptopOverdue = signal<any[]>([]);
  orderFilter = signal<number | null>(null);
  returnBarcode = '';
  returnMessage = signal('');
  returnMessageType = signal<'success' | 'error'>('success');
  returnScanOpen = signal(false);
  private returnReader = new BrowserMultiFormatReader();
  @ViewChild('returnScanVideo') returnVideoEl?: ElementRef<HTMLVideoElement>;

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.load();
    this.api.getOverdueLoans().subscribe(d => this.overdueCount.set(d.length));
    this.api.getLaptopOverdue().subscribe(d => this.laptopOverdue.set(d));
    this.route.queryParams.subscribe(p => {
      const order = p['order'];
      this.orderFilter.set(order ? Number(order) : null);
      if (p['filter'] === 'overdue') this.setFilter('overdue');
      this.applyFilter();
    });
  }

  private isHiddenFromGeneralView(l: Loan) {
    return l.category === 'מצלמות אישיות' || (l.category === 'ציוד צילום' && (l as any).subcategory === 'מצלמות אישיות');
  }

  activeCount() { return this.all().filter(l => !l.actual_return).length; }

  load() {
    this.api.getLoans().subscribe(data => { this.all.set(data); this.applyFilter(); });
  }

  setFilter(f: 'active' | 'overdue' | 'all') { this.filter.set(f); this.applyFilter(); }

  applyFilter() {
    const today = new Date().toISOString().split('T')[0];
    const all = this.all();
    const orderId = this.orderFilter();

    const visible = (orderId
      ? all.filter(l => this.matchesOrder(l, orderId))
      : all
    ).filter(l => !this.isHiddenFromGeneralView(l));

    if (this.filter() === 'active')       this.displayed.set(visible.filter(l => !l.actual_return && !this.isFuture(l)));
    else if (this.filter() === 'overdue') this.displayed.set(visible.filter(l => !l.actual_return && !this.isFuture(l) && l.expected_return < today));
    else this.displayed.set(visible);
  }

  matchesOrder(l: Loan, orderId: number) {
    if (l.id === orderId) return true;
    const saved = sessionStorage.getItem('confirmedOrder');
    if (!saved) return false;
    try {
      const parsed = JSON.parse(saved);
      const ids = Array.isArray(parsed.itemIds) ? parsed.itemIds : [];
      return ids.includes(l.id) && Number(parsed.orderId) === orderId;
    } catch {
      return false;
    }
  }

  toggleReturnScan() {
    if (this.returnScanOpen()) {
      this.returnScanOpen.set(false);
      BrowserMultiFormatReader.releaseAllStreams();
      return;
    }

    this.returnScanOpen.set(true);
    setTimeout(() => {
      if (!this.returnVideoEl) return;
      this.returnReader.decodeFromVideoDevice(undefined, this.returnVideoEl.nativeElement, (result) => {
        if (!result) return;
        this.returnBarcode = result.getText();
        this.returnScanOpen.set(false);
        BrowserMultiFormatReader.releaseAllStreams();
        this.submitReturnScan();
      });
    }, 150);
  }

  submitReturnScan() {
    const orderId = this.orderFilter();
    if (!orderId) {
      this.returnMessageType.set('error');
      this.returnMessage.set('יש לסרוק תחילה ברקוד הזמנה כדי לגשת להזמנה');
      return;
    }

    const code = this.returnBarcode.trim();
    if (!code) {
      this.returnMessageType.set('error');
      this.returnMessage.set('יש לסרוק או להקליד ברקוד של מוצר מההזמנה');
      return;
    }

    const match = this.all().find(l => !l.actual_return && this.matchesOrder(l, orderId) && l.barcode === code);
    if (!match) {
      this.returnMessageType.set('error');
      this.returnMessage.set('המוצר הזה לא שייך להזמנה הפעילה או כבר הוחזר');
      return;
    }

    this.api.returnLoan(match.id).subscribe({
      next: () => {
        this.returnBarcode = '';
        this.returnMessageType.set('success');
        this.returnMessage.set(`הפריט "${match.equipment_name}" סומן כמוחזר`);
        this.load();
      },
      error: (e) => {
        this.returnMessageType.set('error');
        this.returnMessage.set(e.error?.error || 'לא ניתן לסמן פריט זה כמוחזר');
      }
    });
  }

  isInOrderFilter(l: Loan) {
    const orderId = this.orderFilter();
    return !!orderId && this.matchesOrder(l, orderId);
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

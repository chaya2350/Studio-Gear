import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Equipment, Loan } from '../../models';

@Component({
  selector: 'app-equipment-detail',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div *ngIf="item()">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <a routerLink="/equipment" class="back-btn">←</a>
          <div>
            <h1>{{ item()!.name }}</h1>
            <p class="subtitle">{{ item()!.category }}<span *ngIf="item()!.subcategory"> › {{ item()!.subcategory }}</span> · ברקוד {{ item()!.barcode }}</p>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" (click)="printBarcode()">🖨️ הדפס ברקוד</button>
          <a [routerLink]="['/equipment', item()!.id, 'edit']" class="btn btn-ghost">✏️ עריכה</a>
          <button class="btn btn-danger" (click)="delete()">🗑 מחיקה</button>
        </div>
      </div>

      <div class="detail-grid">
        <!-- Info card -->
        <div class="card">
          <img *ngIf="item()!.image_url" [src]="item()!.image_url" class="item-image">
          <div class="section-title">📋 פרטי הציוד</div>
          <div class="info-row">
            <span class="info-label">סטטוס</span>
            <span class="badge" [class]="statusClass()">{{ statusLabel() }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">ברקוד</span>
            <span class="info-value barcode-val">{{ item()!.barcode }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">קטגוריה</span>
            <span class="info-value">{{ item()!.category || '—' }}</span>
          </div>
          <div class="info-row" *ngIf="item()!.subcategory">
            <span class="info-label">תת-קטגוריה</span>
            <span class="info-value">{{ item()!.subcategory }}</span>
          </div>
          <div class="info-row" *ngIf="item()!.description">
            <span class="info-label">תיאור</span>
            <span class="info-value" style="max-width:60%; text-align:left;">{{ item()!.description }}</span>
          </div>

          <div class="info-row" *ngIf="item()!.rental_price_per_day && !isLaptop()">
            <span class="info-label">מחיר השכרה</span>
            <span class="info-value">{{ item()!.rental_price_per_day }} ₪ / יום</span>
          </div>
          <div class="info-row" *ngIf="item()!.overdue_price_per_day && !isLaptop()">
            <span class="info-label">קנס איחור</span>
            <span class="info-value">{{ item()!.overdue_price_per_day }} ₪ / יום</span>
          </div>

          <div *ngIf="item()!.is_reserved" class="reservation-notice">
            <div class="res-header">📅 הזמנות עתידיות ({{ futureLoans().length }})</div>
            <div *ngFor="let fl of futureLoans(); let i = index" class="res-item">
              <div class="res-row"><span>שואל:</span><strong>{{ fl.borrower_name }}</strong></div>
              <div class="res-row"><span>סוג:</span><strong>{{ fl.loan_type === 'rental' ? '💰 השכרה' : '🤝 השאלה' }}</strong></div>
              <div class="res-row"><span>מתאריך:</span><strong>{{ fl.loan_date }}</strong></div>
              <div class="res-row"><span>עד תאריך:</span><strong>{{ fl.expected_return }}</strong></div>
              <button class="btn btn-danger" style="margin-top:8px; width:100%; padding:5px; font-size:0.8rem;" (click)="cancelLoan(fl)">✕ בטל הזמנה</button>
              <hr *ngIf="i < futureLoans().length - 1" style="border:none; border-top:1px solid #d8d0ff; margin:10px 0;">
            </div>
          </div>
        </div>

        <!-- Loan card -->
        <div class="card">
          <div *ngIf="item()!.is_loaned; else loanForm">
            <div class="section-title">
              {{ activeLoan()?.loan_type === 'rental' ? '💰 השכרה פעילה' : '📤 השאלה פעילה' }}
            </div>
            <div *ngIf="isOverdue()" class="alert alert-warning" style="margin-bottom:16px;">⚠️ הציוד לא הוחזר בזמן!</div>
            <div class="info-row">
              <span class="info-label">{{ activeLoan()?.loan_type === 'rental' ? 'שוכר' : 'שואל' }}</span>
              <span class="info-value">{{ item()!.borrower_name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">טלפון</span>
              <span class="info-value">{{ item()!.borrower_phone || '—' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תאריך התחלה</span>
              <span class="info-value">{{ item()!.loan_date }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תאריך החזרה</span>
              <span class="info-value" [style.color]="isOverdue() ? 'var(--danger)' : 'inherit'">{{ item()!.expected_return }}</span>
            </div>
            <div class="info-row" *ngIf="activeLoan()?.loan_type === 'rental'">
              <span class="info-label">מחיר ליום</span>
              <span class="info-value">{{ activeLoan()?.price_per_day || item()!.rental_price_per_day }} ₪</span>
            </div>
            <div class="info-row" *ngIf="activeLoan()?.loan_type !== 'rental' && item()!.overdue_price_per_day">
              <span class="info-label">קנס איחור</span>
              <span class="info-value">{{ item()!.overdue_price_per_day }} ₪ / יום</span>
            </div>
            <div class="info-row">
              <span class="info-label">כרטיס</span>
              <span class="info-value">**** {{ activeLoan()?.card_last4 }}</span>
            </div>
            <div *ngIf="chargeResult()" class="alert alert-success" style="margin-top:12px;">✅ {{ chargeResult() }}</div>
            <div *ngIf="pendingCharge() > 0" class="charge-block">
              <div class="charge-title">💳 נדרש תשלום לפני החזרה</div>
              <div class="charge-amount">{{ pendingCharge() }} ₪</div>
              <div class="charge-desc" *ngIf="isOverdue()">קנס איחור: {{ overduedays() }} ימים × {{ item()!.overdue_price_per_day }} ₪</div>
              <div class="charge-desc" *ngIf="activeLoan()?.loan_type === 'rental'">השכרה: {{ rentalDays() }} ימים × {{ activeLoan()?.price_per_day || item()!.rental_price_per_day }} ₪</div>
              <div *ngIf="paymentState() === 'processing'" class="payment-processing">
                <div class="spinner"></div>
                <span>מעביר לחברת האשראי...</span>
              </div>
              <div *ngIf="paymentState() === 'success'" class="payment-success">✅ חיוב בוצע בהצלחה!</div>
              <button *ngIf="paymentState() === 'idle'" class="btn btn-primary" style="margin-top:10px; width:100%;" (click)="payAndReturn()">💳 שלם {{ pendingCharge() }} ₪ והחזר</button>
            </div>
            <button *ngIf="pendingCharge() === 0" class="btn btn-success" style="margin-top:16px; width:100%;" (click)="returnItem()">✓ סמן כהוחזר</button>
          </div>

          <ng-template #loanForm>
            <!-- Type tabs — hidden for laptops -->
            <div class="type-tabs" *ngIf="!isLaptop()">
              <button [class.active]="loanType() === 'loan'" (click)="loanType.set('loan')">🤝 השאלה</button>
              <button [class.active]="loanType() === 'rental'" (click)="loanType.set('rental')">💰 השכרה</button>
            </div>
            <div *ngIf="isLaptop()" class="laptop-badge">💻 השאלת מחשב נייד — ליום אחד</div>

            <div class="form-group">
              <label>שם השואל *</label>
              <input [(ngModel)]="loan.borrower_name" placeholder="שם מלא">
            </div>
            <div class="form-group" *ngIf="!isLaptop()">
              <label>טלפון</label>
              <input [(ngModel)]="loan.borrower_phone" placeholder="050-0000000">
            </div>
            <div class="form-group">
              <label>מסלול *</label>
              <select [(ngModel)]="loan.track">
                <option value="">בחר מסלול</option>
                <option>גרפיקה שנה א</option>
                <option>גרפיקה שנה ב</option>
                <option>בימוי שנה א</option>
                <option>בימוי שנה ב</option>
                <option>אחר</option>
              </select>
            </div>
            <div class="form-group" *ngIf="isLaptop()">
              <label>לאן לוקחים *</label>
              <input [(ngModel)]="loan.location" placeholder="לדוגמה: כיתה 201, בית ספר...">
            </div>

            <!-- Dates — only for non-laptops -->
            <ng-container *ngIf="!isLaptop()">
              <div class="form-group">
                <label>תאריך התחלה *</label>
                <input type="date" [(ngModel)]="loan.loan_date" [min]="today" (ngModelChange)="onDateChange()">
              </div>
              <div class="form-group">
                <label>תאריך החזרה * <span class="field-hint">(מקסימום 14 יום)</span></label>
                <input type="date" [(ngModel)]="loan.expected_return" [min]="loan.loan_date || today" [max]="maxReturnDate()">
              </div>
              <div *ngIf="loanType() === 'rental'" class="rental-price-info">
                <span class="info-label">מחיר ליום</span>
                <span class="info-value">{{ item()!.rental_price_per_day || 0 }} ₪</span>
              </div>
              <div *ngIf="priceSummary() > 0" class="price-summary">
                <span>💰 סה"כ משוער:</span>
                <strong>{{ priceSummary() }} ₪</strong>
                <span class="price-detail">{{ loanDays() }} ימים × {{ item()!.rental_price_per_day }} ₪</span>
              </div>
            </ng-container>

            <!-- Laptop: show today's date info -->
            <div *ngIf="isLaptop()" class="laptop-date-info">
              <span>📅 תאריך השאלה:</span><strong>{{ today }}</strong>
              <span>🔁 החזרה עד:</span><strong>{{ today }}</strong>
            </div>

            <!-- Credit card — only for non-laptops -->
            <ng-container *ngIf="!isLaptop()">
              <div class="card-section">
                <div class="section-title" style="font-size:0.9rem; margin-bottom:10px;">💳 פרטי אשראי</div>
                <div class="form-group">
                  <label>שם בעל הכרטיס *</label>
                  <input [(ngModel)]="loan.card_holder" placeholder="ישראל ישראלי">
                </div>
                <div class="card-row">
                  <div class="form-group" style="flex:2">
                    <label>מספר כרטיס *</label>
                    <input [(ngModel)]="cardNumber" placeholder="0000 0000 0000 0000"
                      maxlength="19" (input)="formatCard($event)" [class.invalid]="cardNumber.length > 0 && !luhnValid()">
                    <span *ngIf="cardNumber.length > 0 && !luhnValid()" class="field-error">מספר כרטיס לא תקין</span>
                  </div>
                  <div class="form-group" style="flex:1">
                    <label>תוקף *</label>
                    <input [(ngModel)]="loan.card_expiry" placeholder="MM/YY" maxlength="5" (input)="formatExpiry($event)">
                  </div>
                  <div class="form-group" style="flex:1">
                    <label>CVV *</label>
                    <input [(ngModel)]="cvv" placeholder="123" maxlength="4" type="password">
                  </div>
                </div>
              </div>
            </ng-container>

            <div class="form-group">
              <label>הערות</label>
              <textarea [(ngModel)]="loan.notes" rows="2" placeholder="הערות נוספות..."></textarea>
            </div>
            <p *ngIf="loanError()" class="alert alert-error">{{ loanError() }}</p>
            <button class="btn btn-primary" style="width:100%;" (click)="createLoan()">
              {{ isLaptop() ? '💻 השאל מחשב' : (loanType() === 'rental' ? '💰 השכר ציוד' : '📤 השאל ציוד') }}
            </button>
          </ng-template>
        </div>
      </div>

      <!-- History tabs -->
      <div class="card" style="margin-top:20px;">
        <div class="history-tabs">
          <button [class.active]="historyTab()==='past'" (click)="historyTab.set('past')">
            🕓 היסטוריה <span class="tab-count">{{ pastLoans().length }}</span>
          </button>
          <button [class.active]="historyTab()==='future'" (click)="historyTab.set('future')">
            📅 עתידיות
            <span class="tab-count" [style.background]="futureLoans().length ? 'var(--primary)' : ''">{{ futureLoans().length }}</span>
          </button>
        </div>

        <div *ngIf="historyTab()==='past'">
          <div class="table-wrap" *ngIf="pastLoans().length; else noPast">
            <table>
              <thead>
                <tr><th>שואל</th><th>סוג</th><th>תאריך השאלה</th><th>תאריך החזרה</th><th>הוחזר</th><th>תשלום</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let l of pastLoans()">
                  <td><strong>{{ l.borrower_name }}</strong></td>
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
          <ng-template #noPast>
            <div class="empty-state" style="padding:30px 0;"><div class="empty-icon">📭</div><p>אין היסטוריה</p></div>
          </ng-template>
        </div>

        <div *ngIf="historyTab()==='future'">
          <div class="table-wrap" *ngIf="futureLoans().length; else noFuture">
            <table>
              <thead>
                <tr><th>שואל</th><th>סוג</th><th>מתאריך</th><th>עד תאריך</th><th>כרטיס</th><th></th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let l of futureLoans()">
                  <td><strong>{{ l.borrower_name }}</strong></td>
                  <td><span class="badge" [style]="l.loan_type==='rental' ? 'background:#fff8ec;color:#d97706' : 'background:#e6faf4;color:#059669'">{{ l.loan_type === 'rental' ? '💰' : '🤝' }}</span></td>
                  <td><span class="badge" style="background:#ede9ff;color:var(--primary)">{{ l.loan_date }}</span></td>
                  <td>{{ l.expected_return }}</td>
                  <td>**** {{ l.card_last4 }}</td>
                  <td><button class="btn btn-danger" style="padding:4px 12px; font-size:0.8rem;" (click)="cancelLoan(l)">בטל</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #noFuture>
            <div class="empty-state" style="padding:30px 0;"><div class="empty-icon">📅</div><p>אין השאלות עתידיות</p></div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .back-btn {
      width: 38px; height: 38px; background: var(--surface-2); border: 1.5px solid var(--border);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      text-decoration: none; color: var(--text); font-size: 1.1rem; font-weight: 700; transition: all 0.18s;
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }
    .item-image { width: 100%; max-height: 220px; object-fit: contain; border-radius: 10px; margin-bottom: 16px; background: var(--surface-2); }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .barcode-val { font-family: monospace; background: var(--surface-2); padding: 3px 8px; border-radius: 6px; font-size: 0.9rem; }
    @media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }

    .type-tabs {
      display: flex; gap: 6px; margin-bottom: 16px;
      button {
        flex: 1; padding: 8px; border: 1.5px solid var(--border); border-radius: 10px;
        background: var(--surface); color: var(--text-muted); font-size: 0.9rem;
        font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.18s;
        &:hover { border-color: var(--primary); color: var(--primary); }
        &.active { background: var(--primary); color: white; border-color: var(--primary); }
      }
    }

    .card-section {
      background: var(--surface-2); border-radius: 10px; padding: 14px;
      border: 1.5px solid var(--border); margin-bottom: 12px;
    }
    .card-row { display: flex; gap: 8px; }
    .field-hint { font-size: 0.75rem; color: var(--text-muted); font-weight: 400; }
    .field-error { font-size: 0.75rem; color: var(--danger); display: block; margin-top: 3px; }
    input.invalid { border-color: var(--danger) !important; }

    .reservation-notice {
      margin-top: 16px; padding: 14px; background: #f0eeff;
      border: 1.5px solid var(--primary); border-radius: 10px;
      .res-header { font-weight: 700; color: var(--primary); margin-bottom: 8px; }
      .res-row { display: flex; justify-content: space-between; font-size: 0.88rem; padding: 3px 0; color: var(--text-muted);
        strong { color: var(--text); }
      }
    }

    .history-tabs {
      display: flex; gap: 8px; margin-bottom: 16px;
      button {
        padding: 8px 18px; border: 1.5px solid var(--border); border-radius: 10px;
        background: var(--surface); color: var(--text-muted); font-size: 0.88rem;
        font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.18s;
        display: flex; align-items: center; gap: 7px;
        &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
        &.active { background: var(--primary); color: white; border-color: var(--primary); }
      }
    }
    .tab-count { background: rgba(255,255,255,0.25); border-radius: 10px; padding: 1px 8px; font-size: 0.78rem; }
    button:not(.active) .tab-count { background: var(--surface-2); color: var(--text-muted); }
    .alert-success { background: #e6faf4; color: #059669; border: 1px solid #059669; border-radius: 8px; padding: 10px 14px; }
    .charge-block {
      margin-top: 12px; padding: 14px; background: #fff8ec;
      border: 1.5px solid #d97706; border-radius: 10px; text-align: center;
      .charge-title { font-weight: 700; color: #d97706; margin-bottom: 6px; }
      .charge-amount { font-size: 1.6rem; font-weight: 800; color: #d97706; }
      .charge-desc { font-size: 0.82rem; color: var(--text-muted); margin-top: 4px; }
    }
    .payment-processing {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      margin-top: 12px; color: #d97706; font-weight: 600; font-size: 0.95rem;
    }
    .spinner {
      width: 20px; height: 20px; border: 3px solid #f3d08a;
      border-top-color: #d97706; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .payment-success {
      margin-top: 12px; font-weight: 700; color: #059669; font-size: 1rem;
    }
    .laptop-badge {
      background: #e0f2fe; color: #0369a1; border: 1.5px solid #7dd3fc;
      border-radius: 10px; padding: 10px 14px; font-weight: 700; margin-bottom: 16px; font-size: 0.95rem;
    }
    .laptop-date-info {
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      background: var(--surface-2); border-radius: 10px; padding: 10px 14px;
      margin-bottom: 12px; font-size: 0.9rem; color: var(--text-muted);
      strong { color: var(--text); margin-left: 4px; }
    }
    .rental-price-info {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--surface-2); border: 1.5px solid var(--border); border-radius: 10px;
      padding: 10px 14px; margin-bottom: 12px;
      .info-value { font-weight: 700; color: var(--primary); font-size: 1rem; }
    }
    .price-summary {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      background: #e6faf4; border: 1px solid #059669; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 12px; color: #059669; font-size: 0.9rem;
      strong { font-size: 1.1rem; }
      .price-detail { font-size: 0.78rem; color: var(--text-muted); }
    }
  `]
})
export class EquipmentDetailComponent implements OnInit {
  item = signal<Equipment | null>(null);
  history = signal<Loan[]>([]);
  loanError = signal('');
  chargeResult = signal('');
  paymentState = signal<'idle' | 'processing' | 'success'>('idle');
  historyTab = signal<'past' | 'future'>('past');
  loanType = signal<'loan' | 'rental'>('loan');
  today = new Date().toISOString().split('T')[0];

  loan: any = { borrower_name: '', borrower_phone: '', loan_date: this.today, expected_return: '', notes: '', price_per_day: 0, card_holder: '', card_expiry: '', track: '', location: '' };
  cardNumber = '';
  cvv = '';

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {}

  ngOnInit() {
    const id = +this.route.snapshot.params['id'];
    this.load(id);
    this.api.getLoansByEquipment(id).subscribe(data => this.history.set(data));
  }

  load(id: number) { this.api.getEquipmentById(id).subscribe(data => this.item.set(data)); }

  pastLoans()   { return this.history().filter(l => !l.is_future); }
  futureLoans() { return this.history().filter(l => l.is_future).sort((a,b) => a.loan_date.localeCompare(b.loan_date)); }
  activeLoan()  { return this.history().find(l => !l.actual_return && !l.is_future) ?? null; }

  maxReturnDate(): string {
    if (!this.loan.loan_date) return '';
    const d = new Date(this.loan.loan_date);
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  }

  onDateChange() {
    if (this.loan.expected_return && this.loan.expected_return > this.maxReturnDate()) {
      this.loan.expected_return = this.maxReturnDate();
    }
  }

  loanDays(): number {
    if (!this.loan.loan_date || !this.loan.expected_return) return 0;
    const start = new Date(this.loan.loan_date), end = new Date(this.loan.expected_return);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  }

  priceSummary(): number {
    const price = this.item()?.rental_price_per_day || 0;
    if (this.loanType() !== 'rental' || !price || !this.loan.loan_date || !this.loan.expected_return) return 0;
    return this.loanDays() * price;
  }

  overduedays(): number {
    const l = this.activeLoan();
    if (!l || !this.isOverdue()) return 0;
    return Math.round((new Date().getTime() - new Date(l.expected_return!).getTime()) / 86400000);
  }

  rentalDays(): number {
    const l = this.activeLoan();
    if (!l) return 0;
    return Math.max(1, Math.round((new Date().getTime() - new Date(l.loan_date).getTime()) / 86400000));
  }

  pendingCharge(): number {
    const l = this.activeLoan();
    if (!l) return 0;
    const item = this.item()!;
    if (l.loan_type === 'rental') {
      return this.rentalDays() * (l.price_per_day || item.rental_price_per_day || 0);
    }
    if (this.isOverdue()) {
      return this.overduedays() * (item.overdue_price_per_day || 0);
    }
    return 0;
  }

  payAndReturn() {
    const item = this.item()!;
    const charge = this.pendingCharge();
    this.paymentState.set('processing');
    setTimeout(() => {
      this.api.chargeLoan(item.loan_id!, charge).subscribe({
        next: (r) => {
          this.paymentState.set('success');
          setTimeout(() => {
            this.api.returnLoan(item.loan_id!).subscribe({
              next: () => {
                this.chargeResult.set(r.message);
                this.paymentState.set('idle');
                this.load(item.id);
                this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d));
              },
              error: (e) => { this.paymentState.set('idle'); alert(e.error?.error || 'שגיאה בהחזרה'); }
            });
          }, 1500);
        },
        error: (e) => { this.paymentState.set('idle'); alert(e.error?.error || 'שגיאה בחיוב'); }
      });
    }, 2000);
  }

  calcCharge(): number {
    const l = this.activeLoan();
    if (!l) return 0;
    const pricePerDay = l.price_per_day || 0;
    if (!pricePerDay) return 0;
    if (l.loan_type === 'rental') {
      const days = Math.max(1, Math.round((new Date().getTime() - new Date(l.loan_date).getTime()) / 86400000));
      return days * pricePerDay;
    }
    if (this.today > (l.expected_return || '')) {
      const days = Math.round((new Date().getTime() - new Date(l.expected_return!).getTime()) / 86400000);
      return days * pricePerDay;
    }
    return 0;
  }

  luhnValid(): boolean {
    const num = this.cardNumber.replace(/\s/g, '');
    if (num.length < 13) return false;
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
      let n = parseInt(num[num.length - 1 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  }

  formatCard(e: Event) {
    let v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 16);
    this.cardNumber = v.replace(/(.{4})/g, '$1 ').trim();
  }

  formatExpiry(e: Event) {
    let v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 2) v = v.slice(0,2) + '/' + v.slice(2);
    this.loan.card_expiry = v;
  }

  isOverdue() {
    const item = this.item();
    return item?.is_loaned && item.expected_return && item.expected_return < this.today;
  }

  statusClass() {
    const item = this.item()!;
    if (item.is_loaned) return this.isOverdue() ? 'badge-overdue' : 'badge-loaned';
    if (item.is_reserved) return 'badge-reserved';
    return 'badge-available';
  }

  statusLabel() {
    const item = this.item()!;
    if (item.is_loaned) return this.isOverdue() ? '⚠ איחור' : (this.activeLoan()?.loan_type === 'rental' ? '💰 מושכר' : 'מושאל');
    if (item.is_reserved) return '📅 שמור';
    return '✓ פנוי';
  }

  isLaptop() { return this.item()?.category === 'מחשב נייד'; }

  createLoan() {
    const item = this.item()!;
    if (!this.loan.borrower_name) {
      this.loanError.set('נא למלא שם'); return;
    }
    if (!this.loan.track) {
      this.loanError.set('נא לבחור מסלול'); return;
    }
    if (this.isLaptop()) {
      if (!this.loan.location) { this.loanError.set('נא למלא לאן לוקחים'); return; }
      // Laptop: auto today, no card, no payment
      this.loan.loan_date = this.today;
      this.loan.expected_return = this.today;
      this.loan.loan_type = 'loan';
      this.loan.payment_status = 'none';
      this.api.createLoan({
        equipment_id: item.id, ...this.loan, loan_type: 'loan',
        card_last4: null, card_expiry: null, card_holder: null
      }).subscribe({
        next: () => { this.loanError.set(''); this.load(item.id); this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d)); },
        error: (e) => this.loanError.set(e.error?.error || 'שגיאה')
      });
      return;
    }
    if (!this.loan.loan_date || !this.loan.expected_return) {
      this.loanError.set('נא למלא תאריך התחלה ותאריך החזרה'); return;
    }
    if (this.loanType() === 'rental' && !this.item()!.rental_price_per_day) {
      this.loanError.set('לציוד זה לא הוגדר מחיר השכרה'); return;
    }
    this.loan.price_per_day = this.item()!.rental_price_per_day;
    if (!this.loan.card_holder || !this.loan.card_expiry || !this.luhnValid()) {
      this.loanError.set('נא למלא פרטי אשראי תקינים'); return;
    }
    const card_last4 = this.cardNumber.replace(/\s/g, '').slice(-4);
    this.api.createLoan({
      equipment_id: item.id, ...this.loan,
      loan_type: this.loanType(), card_last4
    }).subscribe({
      next: () => {
        this.loanError.set(''); this.cardNumber = ''; this.cvv = '';
        this.load(item.id);
        this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d));
      },
      error: (e) => this.loanError.set(e.error?.error || 'שגיאה')
    });
  }

  returnItem() {
    const item = this.item()!;
    this.api.returnLoan(item.loan_id!).subscribe({
      next: (res: any) => {
        if (res.chargeAmount > 0) {
          this.api.chargeLoan(item.loan_id!, res.chargeAmount).subscribe(r => {
            this.chargeResult.set(r.message);
            this.load(item.id);
            this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d));
          });
        } else {
          this.load(item.id);
          this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d));
        }
      },
      error: (e) => alert(e.error?.error || 'שגיאה')
    });
  }

  cancelLoan(l: Loan) {
    if (confirm(`לבטל את ה${l.loan_type === 'rental' ? 'השכרה' : 'השאלה'} של ${l.borrower_name}?`)) {
      this.api.cancelLoan(l.id).subscribe(() => {
        this.load(this.item()!.id);
        this.api.getLoansByEquipment(this.item()!.id).subscribe(d => this.history.set(d));
      });
    }
  }

  delete() {
    if (confirm('למחוק את הציוד?')) {
      this.api.deleteEquipment(this.item()!.id).subscribe(() => this.router.navigate(['/equipment']));
    }
  }

  printBarcode() {
    const item = this.item()!;
    const url = this.api.getBarcodeUrl(item.id);
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>ברקוד - ${item.name}</title>
      <style>body{font-family:'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:white;}
      .name{font-size:18px;font-weight:700;margin-bottom:12px;color:#1e1e2e;}.barcode-num{font-size:13px;color:#666;margin-top:8px;font-family:monospace;}img{max-width:280px;}
      @media print{body{height:auto;padding:20px;}}</style></head>
      <body><div class="name">${item.name}</div><img src="${url}" onload="window.print();window.close();">
      <div class="barcode-num">${item.barcode}</div></body></html>`);
    win.document.close();
  }
}

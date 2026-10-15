import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../services/cart.service';
import { ApiService } from '../../services/api.service';
import { Student } from '../../models';

@Component({
  selector: 'app-checkout',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:16px;">
        <button class="back-btn" (click)="router.navigate(['/equipment'])">→</button>
        <div>
          <h1>🛒 הזמנה חדשה</h1>
          <p class="subtitle">{{ cart.count() }} פריטים נבחרו</p>
        </div>
      </div>
    </div>

    <div *ngIf="cart.count() === 0" class="empty-state">
      <div class="empty-icon">🛒</div>
      <p>העגלה ריקה — חזור לציוד ובחר פריטים</p>
      <a routerLink="/equipment" class="btn btn-primary" style="margin-top:16px;">📦 לציוד</a>
    </div>

    <div *ngIf="cart.count() > 0" class="checkout-grid">

      <!-- עמודה שמאל: פרטי הזמנה -->
      <div class="checkout-main">

        <!-- חיפוש תלמידה -->
        <div class="card">
          <div class="section-title">👤 פרטי השואלת</div>
          <div class="form-group" style="position:relative;">
            <label>ת.ז. *</label>
            <input [(ngModel)]="idQuery" placeholder="הקלד ת.ז. או שם לחיפוש..."
              (input)="onIdInput()" (keydown.escape)="suggestions.set([])" autocomplete="off">
            <div *ngIf="suggestions().length" class="suggestions">
              <div *ngFor="let s of suggestions()" class="suggestion-item" (click)="selectStudent(s)">
                <strong>{{ s.name }}</strong>
                <span>{{ s.id_number }} · {{ s.track }}{{ s.year ? ' ' + s.year : '' }}</span>
              </div>
            </div>
          </div>

          <div *ngIf="student()" class="student-found">
            <div class="student-name">{{ student()!.name }}</div>
            <div class="student-meta">
              <span>🪪 {{ student()!.id_number }}</span>
              <span *ngIf="student()!.track">📚 {{ student()!.track }}{{ student()!.year ? ' ' + student()!.year : '' }}</span>
              <span *ngIf="student()!.phone">📱 {{ student()!.phone }}</span>
            </div>
          </div>

          <div *ngIf="!student() && idQuery.length > 2" class="student-not-found">
            ⚠️ תלמידה לא נמצאה — ניתן להמשיך עם הזנה ידנית
          </div>

          <div *ngIf="!student()">
            <div class="form-group">
              <label>שם מלא *</label>
              <input [(ngModel)]="form.borrower_name" placeholder="שם מלא">
            </div>
            <div class="form-group">
              <label>טלפון</label>
              <input [(ngModel)]="form.borrower_phone" placeholder="050-0000000">
            </div>
            <div class="form-group">
              <label>מסלול</label>
              <div style="display:flex; gap:8px;">
                <select [(ngModel)]="form.trackName" style="flex:2" (ngModelChange)="form.trackYear=''">
                  <option value="">בחר מסלול</option>
                  <option>אדריכלות</option><option>הנדסאים</option><option>הנדסת אנרגיה</option>
                  <option>הוראה מתקנת</option><option>תקשורת</option><option>גרפיקה</option>
                  <option>בימוי</option><option>יעוץ מס</option><option value="אחר">אחר</option>
                </select>
                <select [(ngModel)]="form.trackYear" style="flex:1" *ngIf="form.trackName && form.trackName !== 'אחר'">
                  <option value="" disabled>שנה</option>
                  <option value="א">א</option>
                  <option value="ב">ב</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- סוג + תאריכים -->
        <div class="card">
          <div class="section-title">📅 פרטי השאלה</div>
          <div class="type-tabs">
            <button [class.active]="form.loan_type === 'loan'" (click)="form.loan_type = 'loan'">🤝 השאלה</button>
            <button [class.active]="form.loan_type === 'rental'" (click)="form.loan_type = 'rental'">💰 השכרה</button>
          </div>
          <div class="form-group">
            <label>תאריך התחלה *</label>
            <input type="date" [(ngModel)]="form.loan_date" [min]="today" (ngModelChange)="onDateChange()">
          </div>
          <div class="form-group">
            <label>תאריך החזרה * <span class="field-hint">(מקסימום 14 יום)</span></label>
            <input type="date" [(ngModel)]="form.expected_return" [min]="form.loan_date || today" [max]="maxReturn()">
          </div>
          <div class="form-group">
            <label>הערות</label>
            <textarea [(ngModel)]="form.notes" rows="2" placeholder="הערות נוספות..."></textarea>
          </div>
        </div>

        <!-- אשראי -->
        <div class="card">
          <div class="section-title">💳 פרטי אשראי</div>
          <div class="form-group">
            <label>שם בעל הכרטיס *</label>
            <input [(ngModel)]="form.card_holder" placeholder="ישראל ישראלי">
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
              <input [(ngModel)]="form.card_expiry" placeholder="MM/YY" maxlength="5" (input)="formatExpiry($event)">
            </div>
            <div class="form-group" style="flex:1">
              <label>CVV *</label>
              <input [(ngModel)]="cvv" placeholder="123" maxlength="3" type="password">
            </div>
          </div>
        </div>

        <p *ngIf="error()" class="alert alert-error">{{ error() }}</p>

        <button class="btn btn-primary btn-submit" (click)="submit()" [disabled]="submitting()">
          <span *ngIf="!submitting()">✅ אשר הזמנה ({{ cart.count() }} פריטים)</span>
          <span *ngIf="submitting()">שולח...</span>
        </button>
      </div>

      <!-- עמודה ימין: סל -->
      <div class="cart-sidebar">
        <div class="card">
          <div class="section-title">🛒 פריטים בהזמנה</div>
          <div *ngFor="let item of cart.items()" class="cart-item">
            <div class="cart-item-info">
              <div class="cart-item-name">{{ item.name }}</div>
              <div class="cart-item-cat">{{ item.category }}<span *ngIf="item.subcategory"> › {{ item.subcategory }}</span></div>
              <div class="cart-item-status" [class.taken]="item.is_loaned || item.is_reserved">
                {{ item.is_reserved ? '📅 שמור, אך זמין אם התאריכים אינם נוגעים' : (item.is_loaned ? '⚠️ תפוס כעת' : '✓ פנוי') }}
              </div>
            </div>
            <button class="remove-btn" (click)="cart.remove(item.id)">✕</button>
          </div>
          <div *ngIf="totalPrice() > 0" class="price-total">
            <span>💰 סה"כ משוער:</span>
            <strong>{{ totalPrice() }} ₪</strong>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .checkout-grid { display: grid; grid-template-columns: 1fr 360px; gap: 24px; align-items: start; }
    @media (max-width: 800px) { .checkout-grid { grid-template-columns: 1fr; } }
    .checkout-main { display: flex; flex-direction: column; gap: 16px; }

    .back-btn {
      width: 36px; height: 36px; background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 1rem; font-weight: 700; color: var(--text-muted);
      transition: all var(--transition); box-shadow: var(--shadow-xs);
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }

    .type-tabs {
      display: flex; gap: 6px; margin-bottom: 14px;
      button {
        flex: 1; padding: 10px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
        background: var(--surface); color: var(--text-muted); font-size: 0.875rem;
        font-weight: 700; font-family: inherit; cursor: pointer; transition: all var(--transition);
        &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
        &.active { background: var(--grad-primary); color: white; border-color: transparent; box-shadow: 0 3px 10px rgba(79,70,229,0.3); }
      }
    }

    .card-row { display: flex; gap: 8px; }
    .field-hint { font-size: 0.72rem; color: var(--text-light); }
    .field-error { font-size: 0.72rem; color: var(--danger); display: block; margin-top: 3px; font-weight: 600; }
    input.invalid { border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.1) !important; }

    .suggestions {
      position: absolute; top: 100%; right: 0; left: 0; z-index: 100;
      background: var(--surface); border: 1.5px solid var(--border-focus);
      border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); overflow: hidden; margin-top: 4px;
    }
    .suggestion-item {
      padding: 10px 14px; cursor: pointer; display: flex; justify-content: space-between;
      align-items: center; font-size: 0.875rem; transition: background var(--transition);
      border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
      strong { color: var(--text); }
      span { color: var(--text-muted); font-size: 0.78rem; }
      &:hover { background: var(--primary-light); }
    }
    .student-found {
      background: #f0fdf4; border: 1.5px solid #86efac; border-radius: var(--radius-sm);
      padding: 14px 16px; margin-top: 10px;
      .student-name { font-weight: 800; font-size: 1.05rem; color: #166534; margin-bottom: 6px; }
      .student-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.82rem; color: #166534; }
    }
    .student-not-found {
      background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm);
      padding: 10px 14px; font-size: 0.85rem; color: #92400e; margin-top: 8px;
    }

    /* סל צד */
    .cart-sidebar { position: sticky; top: 20px; }
    .cart-item {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 12px 0; border-bottom: 1px solid var(--border);
      &:last-of-type { border-bottom: none; }
    }
    .cart-item-name { font-weight: 700; font-size: 0.9rem; margin-bottom: 2px; color: var(--text); }
    .cart-item-cat { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .cart-item-status { font-size: 0.72rem; font-weight: 600; color: var(--success); }
    .cart-item-status.taken { color: var(--warning); }
    .remove-btn {
      border: none; background: transparent; color: var(--text-light); cursor: pointer;
      font-size: 0.85rem; padding: 4px 8px; border-radius: var(--radius-xs);
      transition: all var(--transition); flex-shrink: 0; margin-top: 2px;
      &:hover { background: #fee2e2; color: var(--danger); }
    }
    .price-total {
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 14px; margin-top: 8px; border-top: 2px solid var(--border);
      font-size: 0.875rem; color: var(--text-muted);
      strong { font-size: 1.2rem; color: var(--primary); font-weight: 900; }
    }

    .btn-submit {
      width: 100%; padding: 15px; font-size: 1rem; font-weight: 800;
      border-radius: var(--radius); box-shadow: 0 4px 14px rgba(79,70,229,0.3);
    }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  `]
})
export class CheckoutComponent implements OnInit {
  today = new Date().toISOString().split('T')[0];
  idQuery = '';
  suggestions = signal<Student[]>([]);
  student = signal<Student | null>(null);
  error = signal('');
  submitting = signal(false);
  cardNumber = '';
  cvv = '';

  form: any = {
    borrower_name: '', borrower_phone: '', trackName: '', trackYear: '',
    loan_date: this.today, expected_return: '', notes: '',
    loan_type: 'loan', card_holder: '', card_expiry: ''
  };

  constructor(public cart: CartService, private api: ApiService, public router: Router) {}

  ngOnInit() {}

  onIdInput() {
    this.student.set(null);
    if (this.idQuery.length < 2) { this.suggestions.set([]); return; }
    this.api.getStudents(this.idQuery).subscribe(s => this.suggestions.set(s));
  }

  selectStudent(s: Student) {
    this.student.set(s);
    this.idQuery = s.id_number;
    this.suggestions.set([]);
    this.form.borrower_name = s.name;
    this.form.borrower_phone = s.phone || '';
    this.form.trackName = s.track || '';
    this.form.trackYear = s.year || '';
  }

  maxReturn(): string {
    if (!this.form.loan_date) return '';
    const d = new Date(this.form.loan_date);
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  }

  onDateChange() {
    if (this.form.expected_return > this.maxReturn()) this.form.expected_return = this.maxReturn();
  }

  loanDays(): number {
    if (!this.form.loan_date || !this.form.expected_return) return 0;
    return Math.max(1, Math.round((new Date(this.form.expected_return).getTime() - new Date(this.form.loan_date).getTime()) / 86400000));
  }

  totalPrice(): number {
    if (this.form.loan_type !== 'rental') return 0;
    const days = this.loanDays();
    return this.cart.items().reduce((sum, item) => sum + (item.rental_price_per_day || 0) * days, 0);
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
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.form.card_expiry = v;
  }

  submit() {
    const s = this.student();
    const name = s ? s.name : this.form.borrower_name;
    if (!name) { this.error.set('נא למלא שם שואלת'); return; }
    if (!this.form.loan_date || !this.form.expected_return) { this.error.set('נא למלא תאריכים'); return; }
    if (!this.form.card_holder || !this.luhnValid() || !this.form.card_expiry) { this.error.set('נא למלא פרטי אשראי תקינים'); return; }
    if (!/^\d{3}$/.test(this.cvv)) { this.error.set('CVV חייב להכיל 3 ספרות'); return; }

    const track = this.form.trackName
      ? (this.form.trackName !== 'אחר' && this.form.trackYear ? `${this.form.trackName} ${this.form.trackYear}` : this.form.trackName)
      : (s?.track ? `${s.track}${s.year ? ' ' + s.year : ''}` : '');

    const card_last4 = this.cardNumber.replace(/\s/g, '').slice(-4);
    const base = {
      borrower_name: name,
      borrower_phone: s?.phone || this.form.borrower_phone,
      borrower_id_number: s?.id_number || '',
      loan_date: this.form.loan_date,
      expected_return: this.form.expected_return,
      notes: this.form.notes,
      loan_type: this.form.loan_type,
      track,
      card_holder: this.form.card_holder,
      card_expiry: this.form.card_expiry,
      card_last4,
    };

    this.submitting.set(true);
    this.error.set('');

    const items = this.cart.items();
    let done = 0, failed = 0;

    items.forEach(item => {
      this.api.createLoan({
        ...base,
        equipment_id: item.id,
        price_per_day: item.rental_price_per_day || 0,
      }).subscribe({
        next: () => {
          done++;
          if (done + failed === items.length) this.onDone(failed);
        },
        error: () => {
          failed++;
          if (done + failed === items.length) this.onDone(failed);
        }
      });
    });
  }

  onDone(failed: number) {
    this.submitting.set(false);
    if (failed > 0) {
      this.error.set(`${failed} פריטים לא נרשמו (כנראה תפוסים בתאריכים אלו)`);
    } else {
      this.cart.clear();
      const s = this.student();
      if (s) this.router.navigate(['/students', s.id_number]);
      else this.router.navigate(['/loans']);
    }
  }
}

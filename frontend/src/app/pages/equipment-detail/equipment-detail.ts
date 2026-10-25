import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { Equipment, Loan } from '../../models';
import { BrowserMultiFormatReader } from '@zxing/browser';

@Component({
selector: 'app-equipment-detail',
imports: [CommonModule, RouterLink, FormsModule],
template: `
<div *ngIf="item()">
<div class="page-header">
<div class="header-top">
<a routerLink="/equipment" class="back-btn">→</a>
<div class="header-info">
<h1>{{ item()!.name }}</h1>
<p class="subtitle">{{ item()!.category }}<span *ngIf="item()!.subcategory"> › {{ item()!.subcategory }}</span> · ברקוד {{ item()!.barcode }}</p>
</div>
<span class="badge header-badge" [class]="statusClass()">{{ statusLabel() }}</span>
</div>
<div class="page-actions">
<button class="btn btn-ghost action-btn" (click)="printBarcode()"> הדפס ברקוד</button>
<a [routerLink]="['/equipment', item()!.id, 'edit']" class="btn btn-ghost action-btn"> עריכה</a>
<button class="btn btn-danger action-btn" (click)="delete()"> מחיקה</button>
</div>
</div>

<div class="detail-grid">
<!-- Info card -->
<div class="card info-col">
<img *ngIf="item()!.image_url" [src]="item()!.image_url" class="item-image">
<div class="section-title"> פרטי הציוד</div>
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
<div class="res-header"> הזמנות עתידיות ({{ futureLoans().length }})</div>
<div *ngFor="let fl of futureLoans(); let i = index" class="res-item">
<div class="res-row"><span>שואל:</span><strong>{{ fl.borrower_name }}</strong></div>
<div class="res-row"><span>סוג:</span><strong>{{ fl.loan_type === 'rental' ? ' השכרה' : ' השאלה' }}</strong></div>
<div class="res-row"><span>מתאריך:</span><strong>{{ fl.loan_date }}</strong></div>
<div class="res-row"><span>עד תאריך:</span><strong>{{ fl.expected_return }}</strong></div>
<button class="btn btn-danger" style="margin-top:8px; width:100%; padding:5px; font-size:0.8rem;" (click)="cancelLoan(fl)"> בטל הזמנה</button>
<hr *ngIf="i < futureLoans().length - 1" style="border:none; border-top:1px solid #d8d0ff; margin:10px 0;">
</div>
</div>
</div>

<!-- Cart CTA card -->
<div class="cart-card" *ngIf="showAddToCart() && !item()!.is_loaned">
<div class="cart-card-glow" [class.cart-card-glow--added]="cart.has(item()!.id)"></div>
<div class="cart-card-inner">
<div class="cart-card-icon" [class.cart-card-icon--added]="cart.has(item()!.id)">
<span *ngIf="!cart.has(item()!.id)"></span>
<span *ngIf="cart.has(item()!.id)"></span>
</div>
<div class="cart-card-text">
<div class="cart-card-title" *ngIf="!cart.has(item()!.id)">הוסף להזמנה קבוצתית</div>
<div class="cart-card-title" *ngIf="cart.has(item()!.id)">הציוד בסל!</div>
<div class="cart-card-desc" *ngIf="!cart.has(item()!.id)">בחר מספר פריטים יחד ושלח הזמנה אחת לכולם</div>
<div class="cart-card-desc" *ngIf="cart.has(item()!.id)">הפריט נוסף לסל ההזמנה — לחץ להסרה</div>
</div>
<button class="cart-cta-big" [class.cart-cta-big--added]="cart.has(item()!.id)" (click)="addToCart()">
<span class="cart-btn-icon">{{ cart.has(item()!.id) ? '' : '+' }}</span>
<span>{{ cart.has(item()!.id) ? 'הסר מהסל' : 'הוסף לסל' }}</span>
</button>
</div>
</div>

<!-- Return / Loan card -->
<div class="card" *ngIf="item()!.is_loaned || !showAddToCart() || isLaptop()">
<div *ngIf="item()!.is_loaned; else loanForm">
<div class="section-title">
{{ isLaptop() ? ' בשימוש' : (activeLoan()?.loan_type === 'rental' ? ' השכרה פעילה' : ' השאלה פעילה') }}
</div>
<div *ngIf="isOverdue() && !isLaptop()" class="alert alert-warning" style="margin-bottom:16px;"> הציוד לא הוחזר בזמן!</div>
<div class="info-row">
<span class="info-label">{{ isLaptop() ? 'שם' : 'שואל' }}</span>
<span class="info-value">{{ item()!.borrower_name }}{{ isLaptop() && activeLoan()?.track ? ' — ' + activeLoan()!.track : '' }}</span>
</div>
<div class="info-row" *ngIf="!isLaptop()">
<span class="info-label">טלפון</span>
<span class="info-value">{{ item()!.borrower_phone || '—' }}</span>
</div>
<div class="info-row" *ngIf="isLaptop() && item()!.location">
<span class="info-label">כיתה</span>
<span class="info-value">{{ item()!.location }}</span>
</div>
<div class="info-row" *ngIf="isLaptop()">
<span class="info-label">תאריך </span>
<span class="info-value">{{ item()!.loan_date }}</span>
</div>
<ng-container *ngIf="!isLaptop()">
<div class="info-row">
<span class="info-label">תאריך התחלה</span>
<span class="info-value">{{ item()!.loan_date }}</span>
</div>
<div class="info-row">
<span class="info-label">תאריך החזרה</span>
<span class="info-value" [style.color]="isOverdue() ? 'var(--danger)' : 'inherit'">{{ item()!.expected_return }}</span>
</div>
</ng-container>
<div class="info-row" *ngIf="activeLoan()?.loan_type === 'rental'">
<span class="info-label">מחיר ליום</span>
<span class="info-value">{{ activeLoan()?.price_per_day || item()!.rental_price_per_day }} ₪</span>
</div>
<div class="info-row" *ngIf="activeLoan()?.loan_type !== 'rental' && item()!.overdue_price_per_day">
<span class="info-label">קנס איחור</span>
<span class="info-value">{{ item()!.overdue_price_per_day }} ₪ / יום</span>
</div>

<div *ngIf="chargeResult()" class="alert alert-success" style="margin-top:12px;"> {{ chargeResult() }}</div>
<div *ngIf="pendingCharge() > 0" class="charge-block" #paySection>
<div class="charge-title"> נדרש תשלום לפני החזרה</div>
<div class="charge-amount">{{ pendingCharge() }} ₪</div>
<div class="charge-desc" *ngIf="isOverdue()">קנס איחור: {{ overduedays() }} ימים × {{ item()!.overdue_price_per_day }} ₪</div>
<div class="charge-desc" *ngIf="activeLoan()?.loan_type === 'rental'">השכרה: {{ rentalDays() }} ימים × {{ activeLoan()?.price_per_day || item()!.rental_price_per_day }} ₪</div>
<div *ngIf="paymentState() === 'processing'" class="payment-processing">
<div class="spinner"></div>
<span>מעביר לחברת האשראי...</span>
</div>
<div *ngIf="paymentState() === 'success'" class="payment-success"> חיוב בוצע בהצלחה!</div>
<button *ngIf="paymentState() === 'idle'" class="btn btn-primary" style="margin-top:10px; width:100%;" (click)="payAndReturn()"> שלם {{ pendingCharge() }} ₪ והחזר</button>
</div>
<!-- Barcode confirm before return -->
<div *ngIf="pendingCharge() === 0" class="return-confirm">
<div class="return-confirm-label"> לאישור החזרה — סרוק או הקלד ברקוד</div>
<div class="return-confirm-row">
<input #returnInput class="return-barcode-input" [(ngModel)]="returnBarcode" placeholder="הזן ברקוד" (keyup.enter)="returnItem()" [class.input-error]="returnBarcodeError()">
<button class="btn btn-ghost return-scan-btn" (click)="toggleReturnScan()" [class.active]="returnScanning()"></button>
<button class="btn btn-success return-btn" (click)="returnItem()"> אשר</button>
</div>
<div *ngIf="returnScanning()" class="return-video-wrap">
<video #returnVideoEl autoplay playsinline></video>
<div class="return-scan-overlay"><div class="return-scan-frame"></div></div>
</div>
<div *ngIf="returnBarcodeError()" class="barcode-error"> ברקוד שגוי — נסה שוב</div>
</div>
</div>

<ng-template #loanForm>
<!-- Type tabs — hidden for laptops and personal camera -->
<div class="type-tabs" *ngIf="!isLaptop() && !isPersonalCamera()">
<button [class.active]="loanType() === 'loan'" (click)="loanType.set('loan')"> השאלה</button>
<button [class.active]="loanType() === 'rental'" (click)="loanType.set('rental')"> השכרה</button>
</div>
<div *ngIf="isLaptop()" class="laptop-badge"> תפיסת מחשב נייד — ליום אחד</div>
<div *ngIf="isPersonalCamera()" class="laptop-badge" style="background:#fff7ed;border-color:#fdba74;color:#9a4d00;"> ציוד צילום — שנת השאלה: {{ loan.hebrew_year || currentHebrewYear() }}</div>

<div class="form-group" *ngIf="isLaptop() || isPersonalCamera(); else borrowerManual">
<label>{{ isPersonalCamera() ? 'ת.ז * — מסלול גרפיקה, שנה א' : 'מז *' }}</label>
<div style="position:relative;">
<input [(ngModel)]="studentQuery" [placeholder]="isPersonalCamera() ? 'הקלד ת.ז...' : 'הקלד מז או שם לחיפוש...'" (input)="onStudentSearch()" autocomplete="off">
<div *ngIf="studentSuggestions().length" class="suggestions">
<div *ngFor="let s of studentSuggestions()" class="suggestion-item" (click)="selectStudent(s)">
<strong>{{ s.name }}</strong>
<span>{{ s.id_number }} · {{ s.track }}{{ s.year ? ' ' + s.year : '' }}</span>
</div>
</div>
</div>
<div *ngIf="selectedStudent()" class="student-found">
<div class="student-name">{{ selectedStudent()!.name }}</div>
<div class="student-meta">
<span> {{ selectedStudent()!.id_number }}</span>
<span *ngIf="selectedStudent()!.track"> {{ selectedStudent()!.track }}{{ selectedStudent()!.year ? ' ' + selectedStudent()!.year : '' }}</span>
<span *ngIf="selectedStudent()!.phone"> {{ selectedStudent()!.phone }}</span>
</div>
</div>
</div>
<ng-template #borrowerManual>
<div class="form-group">
<label>שם השואל *</label>
<input [(ngModel)]="loan.borrower_name" placeholder="שם מלא">
</div>
<div class="form-group">
<label>טלפון</label>
<input [(ngModel)]="loan.borrower_phone" placeholder="050-0000000">
</div>
<div class="form-group">
<label>מסלול *</label>
<div style="display:flex; gap:8px;">
<select [(ngModel)]="loan.trackName" style="flex:2" (ngModelChange)="onTrackChange()">
<option value="">בחר מסלול</option>
<option>אדריכלות</option>
<option>הנדסאים</option>
<option>הנדסת אנרגיה</option>
<option>הוראה מתקנת</option>
<option>תקשורת</option>
<option>גרפיקה</option>
<option>בימוי</option>
<option>ייעוץ מס</option>
<option value="אחר">אחר</option>
</select>
<select [(ngModel)]="loan.trackYear" style="flex:1" *ngIf="trackNeedsYear()">
<option value="" disabled>שנה</option>
<option value="א">א</option>
<option value="ב">ב</option>
</select>
</div>
</div>
</ng-template>
<div class="form-group" *ngIf="isLaptop()">
<label>לאן לוקחים *</label>
<div style="display:flex; gap:8px; align-items:center;">
<select [(ngModel)]="loan.location" style="flex:1">
<option value="">בחר כיתה</option>
<optgroup label="קומה 4">
<option>406 — גרפיקה א'</option>
<option>405 — גרפיקה ב'</option>
<option>402 — אדריכלות ב'</option>
<option>401 — הנדסאים ב'</option>
<option>407 — אולפן</option>
</optgroup>
<optgroup label="קומה 3">
<option>312 — ו'4</option>
<option>311 — ו'3</option>
<option>310 — ו'5</option>
<option>309 — טכנולוגי 1</option>
<option>308 — בימוי והפקה</option>
<option>306 — הקבצה 1</option>
<option>305 — הקבצה 2</option>
<option>304 — הנדסת אנרגיה</option>
<option>303 — אדריכלות א'</option>
<option>302 — ספרייה</option>
<option>301 — מעבדה</option>
</optgroup>
<optgroup label="קומה 2">
<option>210 — ד'1</option>
<option>209 — ה'2</option>
<option>208 — ד'2</option>
<option>207 — ה'3</option>
<option>206 — ד'3</option>
<option>205 — בנות פערל</option>
<option>204 — ו'1</option>
<option>203 — ה'1</option>
<option>201 — ו'2</option>
</optgroup>
<optgroup label="קומה 1">
<option>110 — ב'2</option>
<option>109 — ב'3</option>
<option>108 — א'1</option>
<option>107 — ג'1</option>
<option>106 — א'2</option>
<option>105 — ג'2</option>
<option>104 — א'3</option>
<option>103 — ג'3</option>
<option>102 — ב'1</option>
</optgroup>
<optgroup label="קומה 0">
<option>011 — הקבצה 4</option>
<option>009 — הקבצה 5</option>
<option>007 — הקבצה 6</option>
<option>001 — סטודיו</option>
</optgroup>
<optgroup label="אחר">
<option>משרדים</option>
<option>חדר מורות</option>
<option>אחר</option>
</optgroup>
</select>
<a href="https://docs.google.com/spreadsheets/d/1gAyG-4tKUQXXfOw48D9nqfM0d6RglBCvzuJ_mMhWbmg/edit?usp=sharing" target="_blank" class="btn btn-ghost" style="white-space:nowrap;"> מפת חדרים</a>
</div>
</div>

<!-- Dates — only for standard equipment -->
<ng-container *ngIf="!isLaptop() && !isPersonalCamera()">
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
<span> סה"כ משוער:</span>
<strong>{{ priceSummary() }} ₪</strong>
<span class="price-detail">{{ loanDays() }} ימים × {{ item()!.rental_price_per_day }} ₪</span>
</div>
</ng-container>

<!-- Laptop: show today's date info -->
<div *ngIf="isLaptop()" class="laptop-date-info">
<span> תאריך :</span><strong>{{ today }}</strong>
</div>
<div *ngIf="isPersonalCamera()" class="laptop-date-info">
<span> שנת השאלה:</span><strong>{{ loan.hebrew_year || currentHebrewYear() }}</strong>
</div>

<!-- Personal camera: annual booking with deposit checkbox + scan -->
<ng-container *ngIf="isPersonalCamera()">
<div class="card-section">
<div class="section-title" style="font-size:0.9rem; margin-bottom:10px;"> שיק / פיקדון</div>
<label class="checkbox-row" style="display:flex; align-items:center; gap:10px; margin-bottom:12px; font-weight:600; color:var(--text);">
<input type="checkbox" [(ngModel)]="loan.deposit_check" [disabled]="true" checked>
<span>יש שיק / פיקדון (חובה)</span>
</label>
<div *ngIf="loan.deposit_check" class="form-group">
<label>סריקת שיק / פיקדון</label>
<input type="file" accept="image/*" (change)="uploadDepositScan($event)">
<img *ngIf="loan.deposit_scan_url" [src]="loan.deposit_scan_url" style="width:100%; max-height:180px; object-fit:contain; margin-top:10px; border-radius:8px; border:1px solid var(--border); background:#fff;">
</div>
</div>
</ng-container>

<!-- Credit card — only for standard equipment -->
<ng-container *ngIf="!isLaptop() && !isPersonalCamera()">
<div class="card-section">
<div class="section-title" style="font-size:0.9rem; margin-bottom:10px;"> פרטי אשראי</div>
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
<input [(ngModel)]="cvv" placeholder="123" maxlength="3" type="password" (input)="formatCvv($event)">
</div>
</div>
</div>
</ng-container>

<div class="form-group">
<label>{{ isPersonalCamera() ? 'הערות *' : 'הערות' }}</label>
<textarea [(ngModel)]="loan.notes" rows="2" [placeholder]="isPersonalCamera() ? 'מה קיבלה בנוסף למצלמה?' : 'הערות נוספות...'"></textarea>
</div>
<p *ngIf="loanError()" class="alert alert-error">{{ loanError() }}</p>
<button class="btn btn-primary" style="width:100%;" (click)="createLoan()">
{{ isPersonalCamera() ? ' הזמנת מצלמה' : (isLaptop() ? ' תפוס מחשב' : (loanType() === 'rental' ? ' השכר ציוד' : ' השאל ציוד')) }}
</button>
</ng-template>
</div>
</div>

<!-- History tabs -->
<div class="card" style="margin-top:20px;">
<div class="history-tabs">
<button [class.active]="historyTab()==='past'" (click)="historyTab.set('past')">
היסטוריה <span class="tab-count">{{ pastLoans().length }}</span>
</button>
<button [class.active]="historyTab()==='future'" (click)="historyTab.set('future')">
עתידיות
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
<td><span class="badge" [style]="l.loan_type==='rental' ? 'background:#fff8ec;color:#d97706' : 'background:#e6faf4;color:#059669'">{{ l.loan_type === 'rental' ? ' השכרה' : ' השאלה' }}</span></td>
<td>{{ l.loan_date }}</td>
<td>{{ l.expected_return }}</td>
<td>
<span *ngIf="l.actual_return" class="badge badge-available">{{ l.actual_return }}</span>
<span *ngIf="!l.actual_return" class="badge badge-loaned">טרם הוחזר</span>
</td>
<td>
<span *ngIf="l.payment_status === 'charged'" class="badge badge-available"> חויב</span>
<span *ngIf="l.payment_status === 'pending'" class="badge" style="background:#fff8ec;color:#d97706">⏳ ממתין</span>
<span *ngIf="l.payment_status === 'none'" class="badge badge-available">—</span>
</td>
</tr>
</tbody>
</table>
</div>
<ng-template #noPast>
<div class="empty-state" style="padding:30px 0;"><div class="empty-icon"></div><p>אין היסטוריה</p></div>
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
<td><span class="badge" [style]="l.loan_type==='rental' ? 'background:#fff8ec;color:#d97706' : 'background:#e6faf4;color:#059669'">{{ l.loan_type === 'rental' ? '' : '' }}</span></td>
<td><span class="badge" style="background:#ede9ff;color:var(--primary)">{{ l.loan_date }}</span></td>
<td>{{ l.expected_return }}</td>
<td>**** {{ l.card_last4 }}</td>
<td><button class="btn btn-danger" style="padding:4px 12px; font-size:0.8rem;" (click)="cancelLoan(l)">בטל</button></td>
</tr>
</tbody>
</table>
</div>
<ng-template #noFuture>
<div class="empty-state" style="padding:30px 0;"><div class="empty-icon"></div><p>אין השאלות עתידיות</p></div>
</ng-template>
</div>
</div>
</div>
`,
styles: [`
.back-btn {
width: 36px; height: 36px; background: var(--surface); border: 1.5px solid var(--border);
border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
flex-shrink: 0;
text-decoration: none; color: var(--text-muted); font-size: 1rem; font-weight: 700;
transition: all var(--transition); box-shadow: var(--shadow-xs);
&:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
}
.page-header {
display: flex; flex-direction: column; gap: 14px; margin-bottom: 4px;
}
.header-top {
display: flex; align-items: center; gap: 14px;
}
.header-info {
flex: 1; min-width: 0;
h1 { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subtitle { margin: 2px 0 0; }
}
.header-badge {
flex-shrink: 0; font-size: 0.85rem; padding: 6px 14px;
}
.page-actions {
display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
padding: 2px 0;
}
.action-btn {
height: 38px; padding: 0 16px; border-radius: 10px; font-size: 0.875rem; font-weight: 700;
display: inline-flex; align-items: center; gap: 6px;
transition: all var(--transition);
}
.cart-card {
position: relative; overflow: hidden;
background: linear-gradient(145deg, #faf9ff 0%, #f0edff 50%, #ede9ff 100%);
border: 1.5px solid #c4b5fd;
border-radius: var(--radius); padding: 32px 28px;
display: flex; align-items: center;
box-shadow: 0 4px 24px rgba(109,78,247,0.08);
transition: box-shadow 0.2s;
&:hover { box-shadow: 0 8px 32px rgba(109,78,247,0.14); }
}
.cart-card-glow {
position: absolute; top: -60px; left: -60px;
width: 200px; height: 200px; border-radius: 50%;
background: radial-gradient(circle, rgba(109,78,247,0.12) 0%, transparent 70%);
pointer-events: none; transition: background 0.4s;
}
.cart-card-glow--added {
background: radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 70%);
}
.cart-card-inner {
position: relative; z-index: 1;
display: flex; align-items: center; gap: 24px; width: 100%;
}
.cart-card-icon {
font-size: 3.2rem; line-height: 1; flex-shrink: 0;
filter: drop-shadow(0 4px 8px rgba(109,78,247,0.25));
transition: transform 0.3s;
&:hover { transform: scale(1.08) rotate(-4deg); }
}
.cart-card-icon--added { filter: drop-shadow(0 4px 8px rgba(16,185,129,0.3)); }
.cart-card-text { flex: 1; }
.cart-card-title {
font-size: 1.2rem; font-weight: 800; color: #115e59; margin-bottom: 6px; line-height: 1.2;
}
.cart-card-desc { font-size: 0.875rem; color: #6b7280; line-height: 1.55; }
.cart-cta-big {
position: relative; overflow: hidden;
flex-shrink: 0; height: 52px; padding: 0 28px; border-radius: 14px;
font-weight: 900; font-size: 1rem; letter-spacing: 0.3px;
border: none; color: #fff; cursor: pointer; font-family: inherit;
background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%);
box-shadow: 0 6px 20px rgba(13,148,136,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
transition: transform 0.18s, box-shadow 0.18s;
display: inline-flex; align-items: center; gap: 10px;
&::after {
content: ''; position: absolute; inset: 0;
background: linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 60%);
pointer-events: none;
}
&:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(13,148,136,0.42); }
&:active { transform: translateY(0); box-shadow: 0 4px 12px rgba(13,148,136,0.3); }
}
.cart-cta-big--added {
background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
box-shadow: 0 6px 20px rgba(5,150,105,0.32), inset 0 1px 0 rgba(255,255,255,0.25);
&:hover { box-shadow: 0 12px 28px rgba(5,150,105,0.4); }
}
.cart-btn-icon {
font-size: 1.2rem; font-weight: 900; line-height: 1;
}
.item-image { width: 100%; max-height: 200px; object-fit: contain; border-radius: var(--radius-sm); margin-bottom: 18px; background: var(--surface-2); border: 1px solid var(--border); }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.barcode-val { font-family: monospace; background: var(--surface-2); padding: 3px 9px; border-radius: var(--radius-xs); font-size: 0.85rem; border: 1px solid var(--border); }
@media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }

.type-tabs {
display: flex; gap: 6px; margin-bottom: 18px;
button {
flex: 1; padding: 10px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
background: var(--surface); color: var(--text-muted); font-size: 0.875rem;
font-weight: 700; font-family: inherit; cursor: pointer; transition: all var(--transition);
&:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
&.active { background: var(--grad-primary); color: white; border-color: transparent; box-shadow: 0 3px 10px rgba(13,148,136,0.3); }
}
}

.card-section {
background: var(--surface-2); border-radius: var(--radius-sm); padding: 16px;
border: 1px solid var(--border); margin-bottom: 14px;
}
.card-row { display: flex; gap: 8px; }
.field-hint { font-size: 0.72rem; color: var(--text-light); font-weight: 500; }
.field-error { font-size: 0.72rem; color: var(--danger); display: block; margin-top: 3px; font-weight: 600; }
input.invalid { border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.1) !important; }

.reservation-notice {
margin-top: 16px; padding: 14px; background: var(--primary-light);
border: 1.5px solid var(--primary); border-radius: var(--radius-sm);
.res-header { font-weight: 800; color: var(--primary); margin-bottom: 8px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.4px; }
.res-row { display: flex; justify-content: space-between; font-size: 0.85rem; padding: 3px 0; color: var(--text-muted);
strong { color: var(--text); }
}
}

.history-tabs {
display: flex; gap: 8px; margin-bottom: 18px;
button {
padding: 9px 20px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
background: var(--surface); color: var(--text-muted); font-size: 0.85rem;
font-weight: 700; font-family: inherit; cursor: pointer; transition: all var(--transition);
display: flex; align-items: center; gap: 7px;
&:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
&.active { background: var(--grad-primary); color: white; border-color: transparent; box-shadow: 0 3px 10px rgba(13,148,136,0.3); }
}
}
.tab-count { background: rgba(255,255,255,0.25); border-radius: 20px; padding: 1px 8px; font-size: 0.72rem; }
button:not(.active) .tab-count { background: var(--surface-2); color: var(--text-muted); }
.return-confirm {
margin-top: 16px; padding: 16px; background: #f0fdf4;
border: 1.5px solid #86efac; border-radius: var(--radius-sm);
}
.return-confirm-label {
font-size: 0.8rem; font-weight: 700; color: #166534; margin-bottom: 10px; letter-spacing: 0.3px;
}
.return-confirm-row { display: flex; gap: 8px; }
.return-barcode-input {
flex: 1; height: 42px; padding: 0 12px; border-radius: var(--radius-sm);
border: 1.5px solid #86efac; background: white; font-size: 0.95rem;
font-family: monospace; outline: none; direction: ltr;
&:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.12); }
&.input-error { border-color: var(--danger); box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
}
.return-btn { height: 42px; padding: 0 18px; white-space: nowrap; }
.barcode-error { margin-top: 8px; font-size: 0.8rem; color: var(--danger); font-weight: 600; }
.return-video-wrap {
position: relative; margin-top: 10px; border-radius: var(--radius-sm); overflow: hidden;
background: #0a0a1a; aspect-ratio: 4/3;
video { width: 100%; height: 100%; object-fit: cover; display: block; }
}
.return-scan-overlay {
position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
background: rgba(0,0,0,0.4);
}
.return-scan-frame {
width: 180px; height: 100px; border: 2.5px solid white; border-radius: var(--radius-sm);
box-shadow: 0 0 0 2000px rgba(0,0,0,0.35), 0 0 20px rgba(13,148,136,0.6);
}
.return-scan-btn {
height: 42px; padding: 0 12px; font-size: 1.1rem;
&.active { background: var(--primary-light); border-color: var(--primary); }
}
.charge-block {
margin-top: 14px; padding: 18px; background: #fffbeb;
border: 1.5px solid #f59e0b; border-radius: var(--radius-sm); text-align: center;
.charge-title { font-weight: 800; color: #92400e; margin-bottom: 6px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
.charge-amount { font-size: 2rem; font-weight: 900; color: #d97706; letter-spacing: -2px; }
.charge-desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
}
.payment-processing {
display: flex; align-items: center; justify-content: center; gap: 10px;
margin-top: 14px; color: #d97706; font-weight: 700; font-size: 0.9rem;
}
.spinner {
width: 18px; height: 18px; border: 2.5px solid #fde68a;
border-top-color: #d97706; border-radius: 50%;
animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.payment-success { margin-top: 12px; font-weight: 800; color: #166534; font-size: 1rem; }
.laptop-badge {
background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe;
border-radius: var(--radius-sm); padding: 10px 14px; font-weight: 700; margin-bottom: 16px; font-size: 0.875rem;
}
.suggestions {
position: absolute; top: 100%; right: 0; left: 0; z-index: 100;
background: var(--surface); border: 1.5px solid var(--border-focus); border-radius: var(--radius-sm);
box-shadow: var(--shadow-lg); overflow: hidden; margin-top: 4px;
}
.suggestion-item {
padding: 10px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
font-size: 0.875rem; transition: background var(--transition); border-bottom: 1px solid var(--border);
&:last-child { border-bottom: none; }
strong { color: var(--text); }
span { color: var(--text-muted); font-size: 0.78rem; }
&:hover { background: var(--primary-light); }
}
.student-found {
background: #f0fdf4; border: 1.5px solid #86efac; border-radius: var(--radius-sm); padding: 14px 16px; margin-top: 10px;
.student-name { font-weight: 800; font-size: 1.05rem; color: #166534; margin-bottom: 6px; }
.student-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.82rem; color: #166534; }
}
.laptop-date-info {
display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
background: var(--surface-2); border-radius: var(--radius-sm); padding: 10px 14px;
margin-bottom: 12px; font-size: 0.875rem; color: var(--text-muted); border: 1px solid var(--border);
strong { color: var(--text); margin-left: 4px; font-weight: 700; }
}
.rental-price-info {
display: flex; justify-content: space-between; align-items: center;
background: var(--primary-light); border: 1.5px solid var(--border-focus); border-radius: var(--radius-sm);
padding: 12px 16px; margin-bottom: 12px;
.info-value { font-weight: 900; color: var(--primary); font-size: 1.1rem; }
}
.price-summary {
display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-sm);
padding: 10px 14px; margin-bottom: 12px; color: #166534; font-size: 0.875rem;
strong { font-size: 1.1rem; font-weight: 900; }
.price-detail { font-size: 0.75rem; color: var(--text-muted); }
}
`]
})
export class EquipmentDetailComponent implements OnInit, OnDestroy {
@ViewChild('returnVideoEl') returnVideoEl?: ElementRef<HTMLVideoElement>;
@ViewChild('paySection') paySection?: ElementRef;
item = signal<Equipment | null>(null);
history = signal<Loan[]>([]);
loanError = signal('');
chargeResult = signal('');
paymentState = signal<'idle' | 'processing' | 'success'>('idle');
historyTab = signal<'past' | 'future'>('past');
loanType = signal<'loan' | 'rental'>('loan');
today = new Date().toISOString().split('T')[0];
studentQuery = '';
studentSuggestions = signal<any[]>([]);
selectedStudent = signal<any | null>(null);

loan: any = { borrower_name: '', borrower_phone: '', borrower_id_number: '', loan_date: this.today, expected_return: '', notes: '', price_per_day: 0, card_holder: '', card_expiry: '', track: '', trackName: '', trackYear: '', location: '', hebrew_year: this.currentHebrewYear(), deposit_check: true };
returnBarcode = '';
returnBarcodeError = signal(false);
returnScanning = signal(false);
private returnReader = new BrowserMultiFormatReader();
cardNumber = '';
cvv = '';

constructor(private route: ActivatedRoute, private router: Router, private api: ApiService, public cart: CartService) {}

addToCart() {
const item = this.item();
if (!item || this.isLaptop()) return;
if (this.cart.has(item.id)) {
this.cart.remove(item.id);
return;
}
this.cart.add(item);
}

showAddToCart(): boolean {
return !this.isLaptop() && !this.isPersonalCamera();
}

isPersonalCamera() {
const item = this.item();
return !!item && (
item.category === 'מצלמות אישיות' ||
(item.category === 'ציוד צילום' && item.subcategory === 'מצלמות אישיות')
);
}

ngOnInit() {
const id = +this.route.snapshot.params['id'];
this.load(id);
this.api.getLoansByEquipment(id).subscribe(data => {
this.history.set(data);
if (this.route.snapshot.queryParams['pay']) {
setTimeout(() => this.paySection?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}
});
}

load(id: number) { this.api.getEquipmentById(id).subscribe(data => this.item.set(data)); }

pastLoans() { return this.history().filter(l => !l.is_future); }
futureLoans() { return this.history().filter(l => l.is_future).sort((a,b) => a.loan_date.localeCompare(b.loan_date)); }
activeLoan() { return this.history().find(l => !l.actual_return && !l.is_future) ?? null; }

matchesPersonalCameraStudent(student: any): boolean {
const track = String(student?.track || '').trim();
const year = String(student?.year || '').trim();
const isGraphicsTrack = /(גרפיקה|מגרפיקה|graphic|graphics)/i.test(track);
const isGraphicsYear = ['ה', 'שנה ה', 'שנה ה\u05F3', 'ה\u05F3'].includes(year) || /^שנה\s*ה\s*$|^ה\s*$|^ה\u05F3$/.test(year);
return isGraphicsTrack && isGraphicsYear;
}

onStudentSearch() {
this.selectedStudent.set(null);
const q = this.studentQuery.trim();
if (!q) {
this.studentSuggestions.set([]);
return;
}

const request$ = this.isPersonalCamera()
? this.api.getStudents()
: this.api.getStudents(q);

request$.subscribe(s => {
let filtered = this.isPersonalCamera()
? s.filter(student => this.matchesPersonalCameraStudent(student))
: s;

if (this.isPersonalCamera()) {
filtered = filtered.filter(student => {
const hay = `${student?.id_number || ''} ${student?.name || ''}`.toLowerCase();
return hay.includes(q.toLowerCase());
});
}

this.studentSuggestions.set(filtered.slice(0, 5));
});
}

selectStudent(s: any) {
this.selectedStudent.set(s);
this.studentQuery = s.id_number;
this.studentSuggestions.set([]);
this.loan.borrower_name = s.name;
this.loan.borrower_phone = s.phone || '';
this.loan.borrower_id_number = s.id_number;
this.loan.trackName = this.isPersonalCamera() ? 'גרפיקה' : (s.track || '');
this.loan.trackYear = this.isPersonalCamera() ? 'ה' : (s.year || '');
this.loan.track = this.isPersonalCamera() ? 'גרפיקה ה' : (s.track && s.year ? `${s.track} ${s.year}` : (s.track || ''));
if (this.isPersonalCamera()) {
this.loan.hebrew_year = this.currentHebrewYear();
}
}

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

formatCvv(e: Event) {
this.cvv = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 3);
}

uploadDepositScan(event: Event) {
const file = (event.target as HTMLInputElement).files?.[0];
if (!file) return;
const fd = new FormData();
fd.append('image', file);
this.api.uploadImage(fd).subscribe({
next: (res) => this.loan.deposit_scan_url = res.url,
error: () => this.loanError.set('שגיאה בהעלאת סריקת הפיקדון')
});
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
if (item.is_loaned) return this.isOverdue() ? ' איחור' : (this.isLaptop() ? ' תפוס' : (this.activeLoan()?.loan_type === 'rental' ? ' מושכר' : 'מושאל'));
if (item.is_reserved) return ' שמור';
return ' פנוי';
}

trackNeedsYear() { return this.loan.trackName && this.loan.trackName !== 'אחר'; }
onTrackChange() { this.loan.trackYear = ''; }

isLaptop() { return this.item()?.category === 'מחשב נייד'; }

currentHebrewYear(): string {
const now = new Date();
const academicStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
const values = ['תשפ"ז', 'תשפ"ח', 'תשפ"ט', 'תשפ"כ', 'תשפ"ל', 'תשפ"מ'];
const index = Math.max(0, Math.min(values.length - 1, academicStart - 2026));
return values[index];
}

personalCameraDates() {
const year = this.loan.hebrew_year || this.currentHebrewYear();
const map: Record<string, { loan_date: string; expected_return: string }> = {
'תשפ"ז': { loan_date: '2026-09-01', expected_return: '2027-06-30' },
'תשפ"ח': { loan_date: '2027-09-01', expected_return: '2028-06-30' },
'תשפ"ט': { loan_date: '2028-09-01', expected_return: '2029-06-30' },
'תשפ"כ': { loan_date: '2029-09-01', expected_return: '2030-06-30' },
'תשפ"ל': { loan_date: '2030-09-01', expected_return: '2031-06-30' },
'תשפ"מ': { loan_date: '2031-09-01', expected_return: '2032-06-30' }
};
return map[year] || map['תשפ"ז'];
}

createLoan() {
const item = this.item()!;
if (this.isLaptop()) {
if (!this.loan.borrower_name) {
this.loanError.set('נא לבחור מז תקין'); return;
}
if (!this.loan.trackName) {
this.loanError.set('נא לבחור מסלול'); return;
}
if (this.trackNeedsYear() && !this.loan.trackYear) {
this.loanError.set('נא לבחור שנה'); return;
}
this.loan.track = this.trackNeedsYear() ? `${this.loan.trackName} ${this.loan.trackYear}` : this.loan.trackName;
if (!this.loan.location) { this.loanError.set('נא למלא לאן לוקחים'); return; }
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

if (this.isPersonalCamera()) {
this.loan.deposit_check = true;
if (!this.loan.borrower_name) {
this.loanError.set('נא למלא שם שואל'); return;
}
if (!this.loan.notes || !this.loan.notes.trim()) {
this.loanError.set('חובה לכתוב מה קיבלה בנוסף למצלמה'); return;
}
if (!this.loan.deposit_scan_url) {
this.loanError.set('נא להעלות סריקת שיק/פיקדון'); return;
}
const dates = this.personalCameraDates();
this.api.createLoan({
equipment_id: item.id,
borrower_name: this.loan.borrower_name,
borrower_phone: this.loan.borrower_phone || '',
borrower_id_number: this.loan.borrower_id_number || null,
loan_date: dates.loan_date,
expected_return: dates.expected_return,
notes: this.loan.notes,
loan_type: 'loan',
payment_status: 'none',
track: this.loan.track || 'גרפיקה א',
location: this.loan.location || null,
deposit_check: !!this.loan.deposit_check,
deposit_scan_url: this.loan.deposit_scan_url || null,
hebrew_year: this.loan.hebrew_year || 'תשפ"ז'
}).subscribe({
next: () => {
this.loanError.set('');
this.load(item.id);
this.api.getLoansByEquipment(item.id).subscribe(d => this.history.set(d));
},
error: (e) => this.loanError.set(e.error?.error || 'שגיאה')
});
return;
}

if (!this.loan.borrower_name) {
this.loanError.set('נא למלא שם'); return;
}
if (!this.loan.trackName) {
this.loanError.set('נא לבחור מסלול'); return;
}
if (this.trackNeedsYear() && !this.loan.trackYear) {
this.loanError.set('נא לבחור שנה'); return;
}
this.loan.track = this.trackNeedsYear() ? `${this.loan.trackName} ${this.loan.trackYear}` : this.loan.trackName;
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
if (!/^\d{3}$/.test(this.cvv)) {
this.loanError.set('CVV חייב להכיל רק 3 ספרות'); return;
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

toggleReturnScan() {
if (this.returnScanning()) {
this.returnScanning.set(false);
BrowserMultiFormatReader.releaseAllStreams();
} else {
this.returnScanning.set(true);
setTimeout(() => {
if (!this.returnVideoEl) return;
this.returnReader.decodeFromVideoDevice(undefined, this.returnVideoEl.nativeElement, (result) => {
if (result) {
this.returnBarcode = result.getText();
this.returnScanning.set(false);
BrowserMultiFormatReader.releaseAllStreams();
this.returnItem();
}
});
}, 150);
}
}

ngOnDestroy() {
BrowserMultiFormatReader.releaseAllStreams();
}

returnItem() {
const item = this.item()!;
if (this.returnBarcode.trim() !== item.barcode) {
this.returnBarcodeError.set(true);
setTimeout(() => this.returnBarcodeError.set(false), 2000);
return;
}
this.returnBarcodeError.set(false);
this.returnBarcode = '';
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

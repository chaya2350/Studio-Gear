import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

type KioskStep = 'id' | 'student' | 'select-equipment' | 'confirm' | 'success';

interface KioskEquipment {
  id: number;
  name: string;
  category: string;
  subcategory?: string;
  barcode: string;
  is_loaned: number;
  is_reserved: number;
}

@Component({
  selector: 'app-kiosk',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="kiosk" (click)="resetIdleTimer()">

      <!-- Top bar -->
      <header class="kiosk-header">
        <div class="kiosk-brand">
          <img src="/logo.png" alt="לוגו" class="kiosk-logo">
          <span>קיוסק השאלה עצמאית</span>
        </div>
        <button class="exit-btn" (click)="exitKiosk()" title="יציאה">✕ יציאה</button>
      </header>

      <!-- Idle overlay -->
      @if (isIdle()) {
        <div class="idle-overlay" (click)="resetIdleTimer()">
          <div class="idle-content">
            <div class="idle-pulse"></div>
            <p class="idle-title">👋 לחצי להתחלה</p>
            <p class="idle-sub">קיוסק השאלת ציוד עצמאית</p>
          </div>
        </div>
      }

      <!-- Step: Enter ID -->
      @if (!isIdle() && step() === 'id') {
        <div class="step-container">
          <div class="step-card">
            <span class="step-icon">🪪</span>
            <h2 class="step-title">הכניסי את תעודת הזהות שלך</h2>
            <p class="step-sub">הקלידי את מספר תז שלך ולחצי על "המשך"</p>
            <input
              class="kiosk-input"
              type="text"
              inputmode="numeric"
              [(ngModel)]="idInput"
              (keyup.enter)="lookupStudent()"
              placeholder="000000000"
              maxlength="9"
              autofocus
            />
            @if (lookupError()) {
              <p class="step-error">{{ lookupError() }}</p>
            }
            <button class="kiosk-btn kiosk-btn--primary" [disabled]="idInput.length < 5" (click)="lookupStudent()">
              המשך ←
            </button>
          </div>
        </div>
      }

      <!-- Step: Confirm student identity -->
      @if (!isIdle() && step() === 'student') {
        <div class="step-container">
          <div class="step-card step-card--wide">
            <span class="step-icon">👩‍🎓</span>
            <h2 class="step-title">שלום, {{ student()?.name }}</h2>
            <p class="step-sub">
              {{ student()?.track }}{{ student()?.year ? ' · ' + student()?.year : '' }}
            </p>
            @if ((student()?.loans || []).filter(l => !l.actual_return).length > 0) {
              <div class="active-loans-banner">
                <span>📦</span>
                <span>יש לך {{ (student()?.loans || []).filter(l => !l.actual_return).length }} פריטי ציוד בחוץ</span>
              </div>
            }
            <div class="step-actions">
              <button class="kiosk-btn kiosk-btn--primary" (click)="goToEquipment()">
                השאלת ציוד ←
              </button>
              <button class="kiosk-btn kiosk-btn--ghost" (click)="reset()">
                חזרה
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Step: Select equipment -->
      @if (!isIdle() && step() === 'select-equipment') {
        <div class="step-container step-container--wide">
          <h2 class="equip-title">בחרי ציוד להשאלה</h2>
          <p class="equip-sub">לחצי על פריט כדי להוסיפו לסל</p>

          <!-- Availability date picker -->
          <div class="date-picker-row">
            <label class="date-picker-label">📅 בדיקת זמינות לתאריך:</label>
            <input
              type="date"
              class="kiosk-input kiosk-input--sm"
              [min]="todayStr"
              [max]="maxDateStr"
              [ngModel]="availabilityDate()"
              (ngModelChange)="onAvailabilityChange($event)"
            />
            @if (availabilityDate() !== todayStr) {
              <span class="date-hint">מוצג מה פנוי בתאריך {{ availabilityDate() }}</span>
            }
          </div>

          <!-- Filter tabs -->
          <div class="filter-tabs">
            @for (cat of categories; track cat) {
              <button
                [class.active]="activeCategory() === cat"
                (click)="activeCategory.set(cat)">
                {{ cat }}
              </button>
            }
          </div>

          <!-- Equipment grid -->
          <div class="equip-grid">
            @for (eq of filteredEquipment(); track eq.id) {
              <div
                class="equip-card"
                [class.equip-card--selected]="isSelected(eq.id)"
                [class.equip-card--loaned]="eq.is_loaned"
                (click)="toggleItem(eq)">
                <div class="equip-card-top">
                  <span class="equip-cat">{{ eq.category }}</span>
                  @if (isSelected(eq.id)) {
                    <span class="equip-check">✓</span>
                  }
                  @if (eq.is_loaned) {
                    <span class="equip-busy">תפוס</span>
                  }
                </div>
                <p class="equip-name">{{ eq.name }}</p>
                <p class="equip-barcode">{{ eq.barcode }}</p>
              </div>
            }
          </div>

          <!-- Cart summary -->
          @if (cart().length > 0) {
            <div class="cart-bar">
              <span>{{ cart().length }} פריטים נבחרו</span>
              <button class="kiosk-btn kiosk-btn--primary" (click)="goToConfirm()">
                אישור והשאלה ←
              </button>
            </div>
          }
        </div>
      }

      <!-- Step: Confirm -->
      @if (!isIdle() && step() === 'confirm') {
        <div class="step-container">
          <div class="step-card step-card--wide">
            <span class="step-icon">📋</span>
            <h2 class="step-title">אישור השאלה</h2>
            <p class="step-sub">{{ student()?.name }} · {{ todayStr }}</p>

            <div class="confirm-list">
              @for (item of cart(); track item.id) {
                <div class="confirm-row">
                  <span class="confirm-name">{{ item.name }}</span>
                  <span class="confirm-cat">{{ item.category }}</span>
                </div>
              }
            </div>

            <div class="confirm-dates">
              <label>תאריך החזרה *
                @if (availabilityDate() > todayStr) {
                  <span>(ההשאלה מתחילה בתאריך {{ loanStartDate() }})</span>
                }
                <input type="date" [(ngModel)]="returnDate" [min]="loanStartDate()" [max]="loanMaxReturn()" class="kiosk-input kiosk-input--sm">
              </label>
            </div>

            @if (confirmError()) {
              <p class="step-error">{{ confirmError() }}</p>
            }

            <div class="step-actions">
              <button class="kiosk-btn kiosk-btn--primary" [disabled]="!returnDate || submitting()" (click)="submitLoans()">
                {{ submitting() ? 'מעבד...' : 'אישור סופי ←' }}
              </button>
              <button class="kiosk-btn kiosk-btn--ghost" (click)="step.set('select-equipment')">
                חזרה
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Step: Success -->
      @if (!isIdle() && step() === 'success') {
        <div class="step-container">
          <div class="step-card">
            <div class="success-anim">
              <svg viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="36" stroke="#10b981" stroke-width="4" opacity="0.2"/>
                <circle cx="40" cy="40" r="36" stroke="#10b981" stroke-width="4"
                  stroke-dasharray="226" stroke-dashoffset="226"
                  class="success-ring"/>
                <path d="M25 40l10 12 20-22" stroke="#10b981" stroke-width="4"
                  stroke-linecap="round" stroke-linejoin="round"
                  stroke-dasharray="50" stroke-dashoffset="50"
                  class="success-check"/>
              </svg>
            </div>
            <h2 class="step-title">ההשאלה בוצעה בהצלחה!</h2>
            <p class="step-sub">שמרי על הציוד ותחזירי עד {{ returnDate }}</p>
            <div class="success-items">
              @for (item of cart(); track item.id) {
                <span class="success-chip">{{ item.name }}</span>
              }
            </div>
            <button class="kiosk-btn kiosk-btn--primary" (click)="reset()">
              סיום
            </button>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ── Shell ── */
    .kiosk {
      min-height: 100vh;
      background: linear-gradient(160deg, #0f1a2e 0%, #0d1421 50%, #061118 100%);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    /* Ambient glow */
    .kiosk::before {
      content: '';
      position: fixed;
      top: -30%;
      right: 10%;
      width: 60vw;
      height: 60vw;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    /* ── Header ── */
    .kiosk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 32px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      backdrop-filter: blur(8px);
    }

    .kiosk-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      color: rgba(255,255,255,0.7);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .kiosk-logo {
      height: 36px;
      opacity: 0.8;
    }

    .exit-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.5);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      transition: all 0.18s;
      &:hover { background: rgba(255,0,0,0.15); border-color: rgba(255,0,0,0.3); color: #ff6b6b; }
    }

    /* ── Idle ── */
    .idle-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: linear-gradient(160deg, #0f1a2e 0%, #061118 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .idle-content {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .idle-pulse {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(13,148,136,0.3) 0%, transparent 70%);
      animation: idle-pulse 2s ease-in-out infinite;
    }
    @keyframes idle-pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50%       { transform: scale(1.15); opacity: 1; }
    }

    .idle-title {
      font-size: 2rem;
      font-weight: 900;
      color: white;
    }
    .idle-sub {
      font-size: 1rem;
      color: rgba(255,255,255,0.4);
    }

    /* ── Step containers ── */
    .step-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
      animation: fade-up 0.35s cubic-bezier(0.34,1.2,0.64,1);
    }
    .step-container--wide {
      flex-direction: column;
      align-items: stretch;
      padding: 32px 40px;
    }

    @keyframes fade-up {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .step-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 40px 48px;
      max-width: 480px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      backdrop-filter: blur(12px);
    }
    .step-card--wide { max-width: 640px; }

    .step-icon { font-size: 3rem; line-height: 1; }

    .step-title {
      font-size: 1.8rem;
      font-weight: 900;
      color: white;
      text-align: center;
      letter-spacing: -0.5px;
    }

    .step-sub {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.45);
      text-align: center;
    }

    .step-error {
      font-size: 0.85rem;
      color: #ff6b6b;
      font-weight: 600;
      text-align: center;
    }

    .step-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      margin-top: 8px;
    }

    /* ── Kiosk input ── */
    .kiosk-input {
      width: 100%;
      height: 60px;
      border-radius: 14px;
      border: 2px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: white;
      font-size: 1.6rem;
      font-weight: 700;
      text-align: center;
      letter-spacing: 4px;
      outline: none;
      font-family: monospace;
      transition: border-color 0.2s;
      padding: 0 16px;

      &:focus { border-color: #0d9488; box-shadow: 0 0 0 4px rgba(13,148,136,0.15); }
      &::placeholder { color: rgba(255,255,255,0.15); letter-spacing: 2px; font-size: 1.1rem; }
    }
    .kiosk-input--sm {
      height: 44px;
      font-size: 1rem;
      letter-spacing: 0;
      margin-top: 6px;
      display: block;
    }

    /* ── Kiosk buttons ── */
    .kiosk-btn {
      width: 100%;
      height: 56px;
      border-radius: 14px;
      font-size: 1.1rem;
      font-weight: 800;
      font-family: inherit;
      cursor: pointer;
      border: none;
      transition: all 0.18s;

      &--primary {
        background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%);
        color: white;
        box-shadow: 0 6px 20px rgba(13,148,136,0.35);
        &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(13,148,136,0.45); }
        &:disabled { opacity: 0.4; cursor: not-allowed; }
      }

      &--ghost {
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        &:hover { background: rgba(255,255,255,0.1); color: white; }
      }
    }

    /* ── Active loans banner ── */
    .active-loans-banner {
      background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.25);
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 0.85rem;
      color: #fbbf24;
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      text-align: right;
    }

    /* ── Equipment section ── */
    .equip-title {
      font-size: 1.4rem;
      font-weight: 900;
      color: white;
      margin-bottom: 6px;
    }
    .equip-sub {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.35);
      margin-bottom: 20px;
    }

    /* ── Availability date picker ── */
    .date-picker-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 12px 18px;
      margin-bottom: 16px;
    }

    .date-picker-label {
      font-size: 0.9rem;
      font-weight: 700;
      color: rgba(255,255,255,0.7);
    }

    .date-picker-row input[type="date"] {
      width: auto;
      min-width: 180px;
      color-scheme: dark;
      letter-spacing: 0;
      font-size: 1rem;
    }

    .date-hint {
      font-size: 0.8rem;
      color: #5eead4;
      font-weight: 600;
    }

    .filter-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;

      button {
        padding: 8px 16px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.5);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;

        &:hover { border-color: rgba(13,148,136,0.4); color: rgba(255,255,255,0.8); }
        &.active {
          background: rgba(13,148,136,0.2);
          border-color: #0d9488;
          color: #5eead4;
        }
      }
    }

    .equip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      max-height: 50vh;
      overflow-y: auto;
      padding: 4px 2px;
    }

    .equip-card {
      background: rgba(255,255,255,0.04);
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.18s;
      position: relative;

      &:hover:not(.equip-card--loaned) {
        border-color: rgba(13,148,136,0.4);
        background: rgba(13,148,136,0.06);
      }

      &--selected {
        border-color: #0d9488;
        background: rgba(13,148,136,0.12);
        box-shadow: 0 0 0 2px rgba(13,148,136,0.2);
      }

      &--loaned {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .equip-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .equip-cat {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.3);
    }

    .equip-check {
      width: 20px;
      height: 20px;
      background: #0d9488;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      color: white;
      font-weight: 900;
      flex-shrink: 0;
    }

    .equip-busy {
      font-size: 0.65rem;
      font-weight: 700;
      color: #ff6b6b;
      background: rgba(255,0,0,0.1);
      padding: 2px 7px;
      border-radius: 10px;
    }

    .equip-name {
      font-size: 0.92rem;
      font-weight: 700;
      color: rgba(255,255,255,0.85);
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .equip-barcode {
      font-size: 0.7rem;
      font-family: monospace;
      color: rgba(255,255,255,0.2);
    }

    /* Cart bar */
    .cart-bar {
      position: sticky;
      bottom: 0;
      margin-top: 20px;
      background: rgba(13,148,136,0.15);
      border: 1px solid rgba(13,148,136,0.3);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      color: #5eead4;
      font-weight: 700;
      font-size: 0.9rem;

      .kiosk-btn { width: auto; height: 42px; padding: 0 24px; font-size: 0.9rem; }
    }

    /* ── Confirm ── */
    .confirm-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .confirm-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .confirm-name {
      font-size: 0.92rem;
      font-weight: 700;
      color: rgba(255,255,255,0.85);
    }

    .confirm-cat {
      font-size: 0.72rem;
      color: rgba(255,255,255,0.3);
    }

    .confirm-dates {
      width: 100%;
      label {
        font-size: 0.8rem;
        font-weight: 700;
        color: rgba(255,255,255,0.5);
        display: block;
      }
      input {
        color-scheme: dark;
      }
    }

    /* ── Success ── */
    .success-anim {
      width: 80px;
      height: 80px;
      svg { width: 100%; height: 100%; }
    }

    .success-ring {
      animation: draw-circle 0.6s ease forwards;
    }
    .success-check {
      animation: draw-check 0.4s 0.5s ease forwards;
    }

    @keyframes draw-circle {
      to { stroke-dashoffset: 0; }
    }
    @keyframes draw-check {
      to { stroke-dashoffset: 0; }
    }

    .success-items {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      width: 100%;
    }

    .success-chip {
      background: rgba(16,185,129,0.12);
      border: 1px solid rgba(16,185,129,0.25);
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #6ee7b7;
    }
  `],
})
export class KioskComponent implements OnInit, OnDestroy {
  step = signal<KioskStep>('id');
  isIdle = signal(true);
  student = signal<any | null>(null);
  equipment = signal<KioskEquipment[]>([]);
  activeCategory = signal<string>('הכל');
  cartItems = signal<KioskEquipment[]>([]);
  submitting = signal(false);

  idInput = '';
  lookupError = signal('');
  confirmError = signal('');
  returnDate = '';

  // Availability date — shows what's free on this future date
  availabilityDate = signal<string>('');

  readonly todayStr = new Date().toISOString().slice(0, 10);
  readonly tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  readonly maxReturnStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  readonly maxDateStr = this.maxReturnStr;

  // Loan start = availability date if in future, else today
  loanStartDate(): string {
    return this.availabilityDate() > this.todayStr ? this.availabilityDate() : this.todayStr;
  }

  // Max return = loan start + 14 days
  loanMaxReturn(): string {
    const d = new Date(this.loanStartDate() + 'T00:00:00');
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  private idleTimer: any;

  categories: string[] = ['הכל'];

  cart = this.cartItems;

  filteredEquipment = computed(() => {
    const cat = this.activeCategory();
    if (cat === 'הכל') return this.equipment();
    return this.equipment().filter(e => e.category === cat);
  });

  constructor(private http: HttpClient, private router: Router) {
    this.availabilityDate.set(this.todayStr);
  }

  ngOnInit() {
    // Request fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {});
    this.loadEquipment();
    this.startIdleTimer();
  }

  ngOnDestroy() {
    clearTimeout(this.idleTimer);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  resetIdleTimer() {
    this.isIdle.set(false);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.isIdle.set(true), 120_000); // 2 min idle
  }

  startIdleTimer() {
    this.idleTimer = setTimeout(() => this.isIdle.set(true), 5000);
  }

  lookupStudent() {
    const id = this.idInput.trim();
    if (!id) return;
    this.lookupError.set('');
    this.http.get<any>(`/api/students/${id}`).subscribe({
      next: s => { this.student.set(s); this.step.set('student'); },
      error: () => this.lookupError.set('תעודת הזהות לא נמצאה במערכת'),
    });
  }

  goToEquipment() {
    this.loadEquipment(this.availabilityDate());
    this.step.set('select-equipment');
  }

  onAvailabilityChange(date: string) {
    if (!date) return;
    this.availabilityDate.set(date);
    // Clear cart when changing date — items might not be available then
    this.cartItems.set([]);
    this.loadEquipment(date);
  }

  private loadEquipment(date?: string) {
    const url = date && date !== this.todayStr ? `/api/equipment?date=${date}` : '/api/equipment';
    this.http.get<KioskEquipment[]>(url).subscribe({
      next: list => {
        // Exclude personal cameras and laptops from kiosk
        const filtered = list.filter(e =>
          e.category !== 'מחשב נייד' &&
          e.category !== 'מצלמות אישיות' &&
          !(e.category === 'ציוד צילום' && e.subcategory === 'מצלמות אישיות')
        );
        this.equipment.set(filtered);
        const cats = ['הכל', ...new Set(filtered.map(e => e.category).filter(Boolean))];
        this.categories = cats;
      },
      error: () => {},
    });
  }

  isSelected(id: number): boolean {
    return this.cartItems().some(e => e.id === id);
  }

  toggleItem(eq: KioskEquipment) {
    if (eq.is_loaned) return;
    if (this.isSelected(eq.id)) {
      this.cartItems.update(list => list.filter(e => e.id !== eq.id));
    } else {
      this.cartItems.update(list => [...list, eq]);
    }
  }

  goToConfirm() {
    // Default return date: day after the selected availability date
    const base = new Date(this.availabilityDate() + 'T00:00:00');
    base.setDate(base.getDate() + 1);
    this.returnDate = base.toISOString().slice(0, 10);
    this.step.set('confirm');
  }

  submitLoans() {
    if (!this.returnDate || this.submitting()) return;
    const student = this.student();
    if (!student) return;
    this.submitting.set(true);
    this.confirmError.set('');

    // If availability date is in the future, the loan starts that day
    const loanDate = this.availabilityDate() > this.todayStr ? this.availabilityDate() : this.todayStr;

    const loans = this.cartItems().map(eq => this.http.post('/api/loans', {
      equipment_id: eq.id,
      borrower_name: student.name,
      borrower_phone: student.phone || '',
      borrower_id_number: student.id_number,
      loan_date: loanDate,
      expected_return: this.returnDate,
      loan_type: 'loan',
      notes: 'קיוסק עצמאי',
      card_last4: '0000',
      card_expiry: '00/00',
      card_holder: student.name,
    }));

    // Submit all in parallel
    let done = 0;
    let errors = 0;
    for (const req of loans) {
      req.subscribe({
        next: () => { done++; if (done + errors === loans.length) this.onSubmitDone(errors); },
        error: () => { errors++; if (done + errors === loans.length) this.onSubmitDone(errors); },
      });
    }
    if (loans.length === 0) this.onSubmitDone(0);
  }

  private onSubmitDone(errors: number) {
    this.submitting.set(false);
    if (errors > 0) {
      this.confirmError.set(`${errors} פריטים לא הושאלו — ייתכן שכבר תפוסים`);
    } else {
      this.step.set('success');
    }
  }

  reset() {
    this.step.set('id');
    this.idInput = '';
    this.student.set(null);
    this.cartItems.set([]);
    this.lookupError.set('');
    this.confirmError.set('');
    this.returnDate = '';
    this.availabilityDate.set(this.todayStr);
  }

  exitKiosk() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this.router.navigate(['/']);
  }
}

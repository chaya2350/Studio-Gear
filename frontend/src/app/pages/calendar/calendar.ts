import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Loan } from '../../models';
import { HDate, months } from '@hebcal/core';

const HE_MONTHS = [
  'תשרי','חשוון','כסלו','טבת','שבט','אדר','אדר א׳','אדר ב׳',
  'ניסן','אייר','סיוון','תמוז','אב','אלול'
];

const GEMATRIA = [
  '','א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳','ט׳',
  'י׳','י״א','י״ב','י״ג','י״ד','ט״ו','ט״ז','י״ז','י״ח','י״ט',
  'כ׳','כ״א','כ״ב','כ״ג','כ״ד','כ״ה','כ״ו','כ״ז','כ״ח','כ״ט','ל׳'
];

interface CalCell {
  heDay: number;
  heDayStr: string;
  gregDay: number;
  gregMonth: number; // 0-based
  gregYear: number;
  dateStr: string;   // YYYY-MM-DD gregorian
  inMonth: boolean;
  isToday: boolean;
  loans: Loan[];
}

@Component({
  selector: 'app-calendar',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>📅 לוח שנה</h1>
        <p class="subtitle">תצוגת השאלות לפי חודש עברי</p>
      </div>
    </div>

    <div class="cal-card">
      <div class="cal-header">
        <button class="cal-nav" (click)="prevMonth()">‹</button>
        <div class="cal-title">
          <span class="cal-month-he">{{ heMonthName() }} {{ heYearStr() }}</span>
          <span class="cal-month-en">{{ gregRangeLabel() }}</span>
        </div>
        <button class="cal-nav" (click)="nextMonth()">›</button>
      </div>

      <div class="cal-grid">
        <div class="cal-dow" *ngFor="let d of dows">{{ d }}</div>
        <div *ngFor="let cell of calCells()" class="cal-cell"
          [class.other-month]="!cell.inMonth"
          [class.today]="cell.isToday"
          [class.has-loans]="cell.loans.length > 0"
          [class.selected]="selectedDay() === cell.dateStr"
          [class.rosh-hodesh]="cell.inMonth && cell.heDay === 1"
          (click)="cell.inMonth && selectDay(cell)">
          <div class="cal-day-nums">
            <span class="cal-day-he">{{ cell.heDayStr }}</span>
            <span class="cal-day-greg">{{ cell.gregDay }}<span class="cal-day-greg-month" *ngIf="cell.heDay === 1 || cell.gregDay === 1">/{{ cell.gregMonth + 1 }}</span></span>
          </div>
          <div class="cal-dots">
            <span *ngFor="let l of cell.loans.slice(0,4)" class="cal-dot-wrap">
              <span class="cal-dot" [style.background]="loanColor(l)"></span>
              <span class="cal-tooltip">
                <strong>{{ l.equipment_name }}</strong>
                <span>{{ l.borrower_name }}</span>
                <span *ngIf="l.borrower_phone">{{ l.borrower_phone }}</span>
              </span>
            </span>
            <span *ngIf="cell.loans.length > 4" class="cal-dot-more">+{{ cell.loans.length - 4 }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="cal-detail" *ngIf="selectedDay()">
      <div class="cal-detail-title">{{ selectedDayLabel() }}</div>
      <div class="cal-detail-empty" *ngIf="selectedDayLoans().length === 0">אין השאלות ביום זה</div>
      <div *ngFor="let l of selectedDayLoans()" class="cal-loan-row">
        <span class="cal-loan-dot" [style.background]="loanColor(l)"></span>
        <div class="cal-loan-info">
          <a [routerLink]="['/equipment', l.equipment_id]" class="cal-loan-name">{{ l.equipment_name }}</a>
          <span class="cal-loan-cat">{{ l.category }}</span>
        </div>
        <div class="cal-loan-who">
          <span>👤 {{ l.borrower_name }}{{ l.track ? ' — ' + l.track : '' }}</span>
          <span class="cal-loan-dates">{{ l.loan_date }} ← {{ l.expected_return }}</span>
        </div>
        <span class="cal-loan-status" [class.overdue]="isOverdue(l)">
          {{ isOverdue(l) ? '⚠ איחור' : 'מושאל' }}
        </span>
      </div>
    </div>

    <div class="cal-legend" *ngIf="legendItems().length">
      <span class="legend-title">ציוד מושאל החודש:</span>
      <span *ngFor="let item of legendItems()" class="legend-item">
        <span class="cal-dot" [style.background]="item.color"></span>{{ item.name }}
      </span>
    </div>
  `,
  styles: [`
    .cal-card {
      background: var(--surface); border-radius: var(--radius);
      border: 1.5px solid var(--border); box-shadow: var(--shadow-sm);
      padding: 24px; margin-bottom: 20px;
    }
    .cal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .cal-nav {
      width: 36px; height: 36px; border: 1.5px solid var(--border); border-radius: 8px;
      background: var(--surface-2); font-size: 1.4rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center; color: var(--primary);
      &:hover { background: var(--primary-light); border-color: var(--primary); }
    }
    .cal-title { flex: 1; text-align: center; }
    .cal-month-he { display: block; font-size: 1.2rem; font-weight: 700; }
    .cal-month-en { display: block; font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .cal-dow { text-align: center; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); padding: 6px 0; }
    .cal-cell {
      min-height: 76px; border: 1.5px solid var(--border); border-radius: 10px;
      padding: 6px 8px; cursor: pointer; transition: all 0.15s; background: var(--surface);
      &:hover { border-color: var(--primary); background: var(--primary-light); }
      &.other-month { opacity: 0.25; cursor: default;
        &:hover { border-color: var(--border); background: var(--surface); } }
      &.today { border-color: var(--primary); background: var(--primary-light); }
      &.has-loans { border-color: #c4b5fd; }
      &.rosh-hodesh { border-color: #f59e0b; background: #fffbeb; }
      &.selected { border-color: var(--primary); background: var(--primary);
        .cal-day-he, .cal-day-greg { color: white !important; }
        .cal-day-greg-month { color: rgba(255,255,255,0.7) !important; }
      }
    }
    .cal-day-nums { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .cal-day-he { font-size: 0.88rem; font-weight: 700; color: var(--text); }
    .cal-day-greg { font-size: 0.72rem; color: var(--text-muted); }
    .cal-day-greg-month { font-size: 0.65rem; color: var(--text-muted); }
    .cal-cell.today .cal-day-he { color: var(--primary); }
    .cal-dots { display: flex; flex-wrap: wrap; gap: 3px; }
    .cal-dot-wrap { position: relative; display: inline-flex; }
    .cal-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; cursor: default; }
    .cal-dot-more { font-size: 0.6rem; color: var(--text-muted); }
    .cal-tooltip {
      display: none; position: absolute; bottom: calc(100% + 6px); right: 50%;
      transform: translateX(50%);
      background: #1e1e2e; color: white; border-radius: 8px;
      padding: 7px 10px; min-width: 140px; max-width: 200px;
      font-size: 0.75rem; line-height: 1.5; white-space: nowrap;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 100;
      pointer-events: none;
      strong { display: block; font-size: 0.78rem; margin-bottom: 2px; }
      span { display: block; color: rgba(255,255,255,0.75); }
    }
    .cal-dot-wrap:hover .cal-tooltip { display: block; }

    .cal-detail {
      background: var(--surface); border-radius: var(--radius);
      border: 1.5px solid var(--border); box-shadow: var(--shadow-sm);
      padding: 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;
    }
    .cal-detail-title { font-size: 1rem; font-weight: 700; color: var(--primary); }
    .cal-detail-empty { color: var(--text-muted); font-size: 0.88rem; }
    .cal-loan-row {
      display: flex; align-items: center; gap: 12px; padding: 12px 14px;
      background: var(--surface-2); border-radius: 10px; border: 1px solid var(--border);
    }
    .cal-loan-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
    .cal-loan-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .cal-loan-name { font-size: 0.92rem; font-weight: 700; color: var(--primary); text-decoration: none;
      &:hover { text-decoration: underline; } }
    .cal-loan-cat { font-size: 0.75rem; color: var(--text-muted); }
    .cal-loan-who { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 0.83rem; }
    .cal-loan-dates { font-size: 0.72rem; color: var(--text-muted); font-family: monospace; }
    .cal-loan-status { font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 8px;
      background: #e6faf4; color: var(--success);
      &.overdue { background: #fff0f3; color: var(--danger); } }

    .cal-legend {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      font-size: 0.8rem; color: var(--text-muted); padding: 12px 16px;
      background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border);
    }
    .legend-title { font-weight: 700; color: var(--text); margin-left: 6px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
  `]
})
export class CalendarComponent implements OnInit {
  readonly today = new Date().toISOString().split('T')[0];
  allLoans = signal<Loan[]>([]);
  selectedDay = signal<string | null>(null);
  readonly dows = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];

  // Current Hebrew month/year
  private _hdate = new HDate();
  heMonth = signal(this._hdate.getMonth());
  heYear = signal(this._hdate.getFullYear());

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getLoans().subscribe(d => {
      this.allLoans.set(d);
      this.selectedDay.set(this.today);
    });
  }

  heMonthName() {
    const m = this.heMonth(), y = this.heYear();
    // adar handling
    if (m === months.ADAR_I) return HDate.isLeapYear(y) ? 'אדר א׳' : 'אדר';
    if (m === months.ADAR_II) return 'אדר ב׳';
    const names: Record<number, string> = {
      [months.TISHREI]: 'תשרי', [months.CHESHVAN]: 'חשוון', [months.KISLEV]: 'כסלו',
      [months.TEVET]: 'טבת', [months.SHVAT]: 'שבט',
      [months.NISAN]: 'ניסן', [months.IYYAR]: 'אייר', [months.SIVAN]: 'סיוון',
      [months.TAMUZ]: 'תמוז', [months.AV]: 'אב', [months.ELUL]: 'אלול',
    };
    return names[m] ?? '';
  }

  heYearStr() {
    // Convert year to Hebrew letters (simplified — just show number)
    return this.heYear().toString();
  }

  prevMonth() {
    let m = this.heMonth(), y = this.heYear();
    if (m === months.TISHREI) { m = HDate.isLeapYear(y) ? months.ADAR_II : months.ADAR_I; y--; }
    else m--;
    this.heMonth.set(m); this.heYear.set(y);
    this.selectedDay.set(null);
  }

  nextMonth() {
    let m = this.heMonth(), y = this.heYear();
    const lastMonth = HDate.isLeapYear(y) ? months.ADAR_II : months.ADAR_I;
    if (m === lastMonth) { m = months.TISHREI; y++; }
    else m++;
    this.heMonth.set(m); this.heYear.set(y);
    this.selectedDay.set(null);
  }

  calCells(): CalCell[] {
    const hm = this.heMonth(), hy = this.heYear();
    const daysInMonth = HDate.daysInMonth(hm, hy);
    const cells: CalCell[] = [];

    // First day of Hebrew month → what day of week?
    const firstHDate = new HDate(1, hm, hy);
    const firstDow = firstHDate.getDay(); // 0=Sun

    // Padding before (days from previous Hebrew month)
    for (let i = firstDow - 1; i >= 0; i--) {
      const pad = new HDate(1, hm, hy).subtract(i + 1);
      const greg = pad.greg();
      const dateStr = this.toDateStr(greg);
      cells.push({
        heDay: pad.getDate(), heDayStr: GEMATRIA[pad.getDate()],
        gregDay: greg.getDate(), gregMonth: greg.getMonth(), gregYear: greg.getFullYear(),
        dateStr, inMonth: false, isToday: dateStr === this.today,
        loans: []
      });
    }

    // Days of current Hebrew month
    for (let d = 1; d <= daysInMonth; d++) {
      const hd = new HDate(d, hm, hy);
      const greg = hd.greg();
      const dateStr = this.toDateStr(greg);
      cells.push({
        heDay: d, heDayStr: GEMATRIA[d],
        gregDay: greg.getDate(), gregMonth: greg.getMonth(), gregYear: greg.getFullYear(),
        dateStr, inMonth: true, isToday: dateStr === this.today,
        loans: this.allLoans().filter(l => !l.actual_return && l.loan_date <= dateStr && l.expected_return >= dateStr && l.category !== 'מחשב נייד')
      });
    }

    // Padding after
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const hd = new HDate(daysInMonth, hm, hy).add(i);
      const greg = hd.greg();
      const dateStr = this.toDateStr(greg);
      cells.push({
        heDay: hd.getDate(), heDayStr: GEMATRIA[hd.getDate()],
        gregDay: greg.getDate(), gregMonth: greg.getMonth(), gregYear: greg.getFullYear(),
        dateStr, inMonth: false, isToday: dateStr === this.today,
        loans: []
      });
    }
    return cells;
  }

  private toDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  gregRangeLabel() {
    const cells = this.calCells().filter(c => c.inMonth);
    if (!cells.length) return '';
    const first = cells[0], last = cells[cells.length - 1];
    const fmt = (c: CalCell) => `${c.gregDay}/${c.gregMonth + 1}/${c.gregYear}`;
    return `${fmt(first)} — ${fmt(last)}`;
  }

  selectDay(cell: CalCell) { this.selectedDay.set(cell.dateStr); }

  selectedDayLoans() {
    const d = this.selectedDay();
    if (!d) return [];
    return this.allLoans().filter(l => !l.actual_return && l.loan_date <= d && l.expected_return >= d && l.category !== 'מחשב נייד');
  }

  selectedDayLabel() {
    const d = this.selectedDay();
    if (!d) return '';
    const hd = new HDate(new Date(d + 'T12:00:00'));
    const heName = `${GEMATRIA[hd.getDate()]} ${this.heMonthName()} ${hd.getFullYear()}`;
    const greg = new Date(d + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `${heName}  |  ${greg}`;
  }

  isOverdue(l: Loan) { return !l.actual_return && l.expected_return < this.today; }

  readonly COLORS = ['#6c63ff','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4'];
  private _colorMap = new Map<number, string>();
  loanColor(l: Loan) {
    if (!this._colorMap.has(l.equipment_id))
      this._colorMap.set(l.equipment_id, this.COLORS[this._colorMap.size % this.COLORS.length]);
    return this._colorMap.get(l.equipment_id)!;
  }

  legendItems() {
    const cells = this.calCells().filter(c => c.inMonth);
    if (!cells.length) return [];
    const start = cells[0].dateStr, end = cells[cells.length - 1].dateStr;
    const seen = new Set<number>();
    return this.allLoans()
      .filter(l => !l.actual_return && l.loan_date <= end && l.expected_return >= start && l.category !== 'מחשב נייד')
      .filter(l => { if (seen.has(l.equipment_id)) return false; seen.add(l.equipment_id); return true; })
      .map(l => ({ name: l.equipment_name!, color: this.loanColor(l) }));
  }
}

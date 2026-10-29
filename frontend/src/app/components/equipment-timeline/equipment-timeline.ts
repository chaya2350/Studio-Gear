import { Component, Input, OnChanges, ChangeDetectionStrategy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Loan } from '../../models';

interface TimelineSegment {
  loan: Loan | null;       // null = free window
  start: Date;
  end: Date;
  widthPct: number;
  leftPct: number;
  isFree: boolean;
  isActive: boolean;
  isOverdue: boolean;
  isFuture: boolean;
  label: string;
  tooltip: string;
}

@Component({
  selector: 'app-equipment-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="timeline-wrap" aria-label="ציר זמן ציוד">
      <header class="tl-header">
        <h3 class="tl-title">📅 ציר זמן</h3>
        <div class="tl-legend">
          <span class="legend-dot legend-dot--active"></span><span>השאלה פעילה</span>
          <span class="legend-dot legend-dot--future"></span><span>עתידית</span>
          <span class="legend-dot legend-dot--past"></span><span>עבר</span>
          <span class="legend-dot legend-dot--free"></span><span>פנוי</span>
        </div>
      </header>

      <!-- Month axis -->
      <div class="tl-axis" role="presentation">
        @for (m of monthMarkers; track m.label) {
          <span class="axis-tick" [style.left.%]="m.pct">{{ m.label }}</span>
        }
      </div>

      <!-- Bar -->
      <div class="tl-bar-wrap">
        <!-- Today marker -->
        <div class="today-marker" [style.left.%]="todayPct" title="היום">
          <div class="today-line"></div>
          <span class="today-label">היום</span>
        </div>

        @for (seg of segments; track seg.label + seg.leftPct) {
          <div
            class="tl-seg"
            [class.tl-seg--free]="seg.isFree"
            [class.tl-seg--active]="seg.isActive"
            [class.tl-seg--overdue]="seg.isOverdue"
            [class.tl-seg--future]="seg.isFuture"
            [class.tl-seg--past]="!seg.isFree && !seg.isActive && !seg.isFuture && !seg.isOverdue"
            [style.left.%]="seg.leftPct"
            [style.width.%]="seg.widthPct"
            [title]="seg.tooltip"
            role="img"
            [attr.aria-label]="seg.tooltip"
          >
            @if (seg.widthPct > 8 && !seg.isFree) {
              <span class="seg-label">{{ seg.label }}</span>
            }
          </div>
        }
      </div>

      <!-- Next availability -->
      @if (nextFreeDate) {
        <p class="next-free">
          <span class="next-free-icon">🟢</span>
          הציוד פנוי החל מ-<strong>{{ nextFreeDate }}</strong>
        </p>
      } @else {
        <p class="next-free next-free--now">
          <span class="next-free-icon">🟢</span>
          הציוד פנוי כרגע
        </p>
      }
    </section>
  `,
  styles: [`
    .timeline-wrap {
      margin-top: 4px;
      padding: 22px 24px;
      background: var(--surface);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }

    .tl-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tl-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.2px;
    }

    .tl-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
      flex-shrink: 0;
    }
    .legend-dot--active  { background: var(--primary); }
    .legend-dot--future  { background: #818cf8; }
    .legend-dot--past    { background: var(--surface-3); border: 1px solid var(--border); }
    .legend-dot--free    { background: #bbf7d0; border: 1px solid #86efac; }

    /* ── Axis ── */
    .tl-axis {
      position: relative;
      height: 20px;
      margin-bottom: 4px;
    }

    .axis-tick {
      position: absolute;
      transform: translateX(50%);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--text-light);
      white-space: nowrap;
    }

    /* ── Bar ── */
    .tl-bar-wrap {
      position: relative;
      height: 40px;
      background: var(--surface-2);
      border-radius: 8px;
      overflow: visible;
      border: 1px solid var(--border);
    }

    /* Today marker */
    .today-marker {
      position: absolute;
      top: -4px;
      bottom: -4px;
      transform: translateX(50%);
      z-index: 10;
      pointer-events: none;
    }
    .today-line {
      width: 2px;
      height: 100%;
      background: var(--danger);
      border-radius: 2px;
      margin: 0 auto;
      box-shadow: 0 0 6px rgba(225,29,72,0.4);
    }
    .today-label {
      position: absolute;
      top: -18px;
      left: 50%;
      transform: translateX(50%);
      font-size: 0.6rem;
      font-weight: 800;
      color: var(--danger);
      background: var(--surface);
      border: 1px solid rgba(225,29,72,0.25);
      padding: 1px 5px;
      border-radius: 4px;
      white-space: nowrap;
    }

    /* Segment */
    .tl-seg {
      position: absolute;
      top: 4px;
      bottom: 4px;
      border-radius: 6px;
      transition: filter 0.15s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: default;

      &:hover {
        filter: brightness(1.08);
        transform: scaleY(1.15);
        z-index: 5;
      }

      &--free {
        background: #bbf7d0;
        border: 1px dashed #86efac;
        opacity: 0.5;
      }
      &--active {
        background: var(--grad-primary);
        box-shadow: 0 2px 8px rgba(13,148,136,0.3);
      }
      &--overdue {
        background: var(--grad-danger);
        box-shadow: 0 2px 8px rgba(225,29,72,0.3);
        animation: pulse-overdue 2s ease-in-out infinite;
      }
      &--future {
        background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
        box-shadow: 0 2px 8px rgba(99,102,241,0.25);
      }
      &--past {
        background: var(--surface-3);
        border: 1px solid var(--border);
      }
    }

    @keyframes pulse-overdue {
      0%, 100% { box-shadow: 0 2px 8px rgba(225,29,72,0.3); }
      50%       { box-shadow: 0 2px 14px rgba(225,29,72,0.6); }
    }

    .seg-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 5px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .tl-seg--past .seg-label  { color: var(--text-muted); }
    .tl-seg--free .seg-label  { color: #166534; }

    /* Next free */
    .next-free {
      margin-top: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      strong { color: var(--text); }
    }
    .next-free--now { color: #166534; font-weight: 600; }
    .next-free-icon { font-size: 0.9rem; }
  `],
})
export class EquipmentTimelineComponent implements OnChanges {
  @Input() loans: Loan[] = [];

  segments: TimelineSegment[] = [];
  monthMarkers: { label: string; pct: number }[] = [];
  todayPct = 50;
  nextFreeDate: string | null = null;

  private readonly WINDOW_DAYS = 90; // show ±45 days from today

  ngOnChanges(changes: SimpleChanges) {
    if (changes['loans']) this.build();
  }

  private build() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 30);
    const windowEnd = new Date(today);
    windowEnd.setDate(today.getDate() + 60);

    const totalMs = windowEnd.getTime() - windowStart.getTime();
    const toPct = (d: Date) => Math.max(0, Math.min(100,
      ((d.getTime() - windowStart.getTime()) / totalMs) * 100
    ));

    this.todayPct = toPct(today);

    // Build month axis markers
    this.monthMarkers = [];
    const cursor = new Date(windowStart);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + (cursor < windowStart ? 1 : 0));
    while (cursor <= windowEnd) {
      const pct = toPct(cursor);
      if (pct > 2 && pct < 98) {
        this.monthMarkers.push({
          label: cursor.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' }),
          pct,
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Filter loans overlapping the window
    const relevantLoans = this.loans
      .filter(l => {
        const start = new Date(l.loan_date + 'T00:00:00');
        const end = l.actual_return
          ? new Date(l.actual_return + 'T00:00:00')
          : new Date(l.expected_return + 'T00:00:00');
        return end >= windowStart && start <= windowEnd;
      })
      .sort((a, b) => a.loan_date.localeCompare(b.loan_date));

    const segs: TimelineSegment[] = [];

    // Add free gaps + loan segments
    let prevEnd = windowStart;
    for (const loan of relevantLoans) {
      const lStart = new Date(Math.max(
        new Date(loan.loan_date + 'T00:00:00').getTime(),
        windowStart.getTime()
      ));
      const lEnd = new Date(Math.min(
        loan.actual_return
          ? new Date(loan.actual_return + 'T00:00:00').getTime()
          : new Date(loan.expected_return + 'T00:00:00').getTime(),
        windowEnd.getTime()
      ));

      if (lStart > prevEnd) {
        const freeStart = prevEnd;
        const freeEnd = lStart;
        const w = toPct(freeEnd) - toPct(freeStart);
        if (w > 0.3) {
          segs.push({
            loan: null, start: freeStart, end: freeEnd,
            leftPct: toPct(freeStart), widthPct: w,
            isFree: true, isActive: false, isOverdue: false, isFuture: false,
            label: 'פנוי', tooltip: `פנוי: ${this.fmt(freeStart)} – ${this.fmt(freeEnd)}`,
          });
        }
      }

      const isReturned = !!loan.actual_return;
      const isFuture = loan.is_future === 1;
      const loanEnd = loan.actual_return
        ? new Date(loan.actual_return + 'T00:00:00')
        : new Date(loan.expected_return + 'T00:00:00');
      const isOverdue = !isReturned && !isFuture && loanEnd < today;
      const isActive = !isReturned && !isFuture && !isOverdue;

      const leftPct = toPct(lStart);
      const widthPct = toPct(lEnd) - leftPct;

      segs.push({
        loan,
        start: lStart, end: lEnd,
        leftPct, widthPct,
        isFree: false, isActive, isOverdue, isFuture,
        isReturned,
        label: loan.borrower_name,
        tooltip: `${loan.borrower_name} · ${loan.loan_date} – ${loan.actual_return ?? loan.expected_return}${isOverdue ? ' ⚠️ איחור' : isActive ? ' (פעיל)' : isFuture ? ' (עתידי)' : ' (הוחזר)'}`,
      } as any);

      prevEnd = new Date(Math.max(lEnd.getTime(), prevEnd.getTime()));
    }

    // Add trailing free segment
    if (prevEnd < windowEnd) {
      const w = toPct(windowEnd) - toPct(prevEnd);
      if (w > 0.3) {
        segs.push({
          loan: null, start: prevEnd, end: windowEnd,
          leftPct: toPct(prevEnd), widthPct: w,
          isFree: true, isActive: false, isOverdue: false, isFuture: false,
          label: 'פנוי', tooltip: `פנוי מ-${this.fmt(prevEnd)}`,
        });
      }
    }

    this.segments = segs;

    // Next free date — first gap at or after today
    const activeOrFuture = this.loans.filter(l => !l.actual_return && !l.is_future);
    const futureOnly = this.loans.filter(l => l.is_future);
    const anyActive = activeOrFuture.length > 0;
    if (anyActive) {
      const latestReturn = activeOrFuture.reduce((latest, l) => {
        const d = l.expected_return;
        return d > latest ? d : latest;
      }, '');
      this.nextFreeDate = latestReturn;
    } else if (futureOnly.length > 0) {
      // Already free but has upcoming bookings — not needed to show "next free" since free now
      this.nextFreeDate = null;
    } else {
      this.nextFreeDate = null;
    }
  }

  private fmt(d: Date): string {
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
}

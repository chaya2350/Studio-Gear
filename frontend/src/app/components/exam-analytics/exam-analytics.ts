import {
  Component, Input, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ElementRef, ViewChild, AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface GradeDistBar {
  range: string;   // e.g. "90–100"
  count: number;
  pct: number;     // % of total graded
  color: string;
}

interface TrackStats {
  track: string;
  avg: number;
  count: number;
}

@Component({
  selector: 'app-exam-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="analytics" aria-label="ניתוח ציונים">
      <header class="analytics-header">
        <h3 class="analytics-title">📊 ניתוח ציונים — {{ examName }}</h3>
        <div class="kpis">
          <div class="kpi" [class.kpi--warn]="average != null && average < 60">
            <span class="kpi-val">{{ average != null ? (average | number:'1.1-1') : '—' }}</span>
            <span class="kpi-label">ממוצע כיתה</span>
          </div>
          <div class="kpi">
            <span class="kpi-val">{{ gradedCount }}</span>
            <span class="kpi-label">נבחנו</span>
          </div>
          <div class="kpi" [class.kpi--warn]="passPct != null && passPct < 50">
            <span class="kpi-val">{{ passPct != null ? (passPct | number:'1.0-0') + '%' : '—' }}</span>
            <span class="kpi-label">עברו (≥60)</span>
          </div>
          <div class="kpi">
            <span class="kpi-val">{{ topScore != null ? topScore : '—' }}</span>
            <span class="kpi-label">ציון גבוה</span>
          </div>
        </div>
      </header>

      @if (gradedCount === 0) {
        <div class="no-data">
          <span>📋</span>
          <p>אין ציונים עדיין לניתוח</p>
        </div>
      } @else {
        <div class="charts-row">
          <!-- Histogram -->
          <div class="chart-box">
            <p class="chart-label">התפלגות ציונים</p>
            <div class="histogram" role="img" aria-label="גרף עמודות ציונים">
              @for (bar of distribution; track bar.range) {
                <div class="hist-col" [title]="bar.range + ': ' + bar.count + ' תלמידות (' + (bar.pct | number:'1.0-0') + '%)'">
                  <div class="hist-bar-wrap">
                    <span class="hist-count" *ngIf="bar.count > 0">{{ bar.count }}</span>
                    <div class="hist-bar"
                      [style.height.%]="bar.pct > 0 ? Math.max(bar.pct / maxPct * 100, 4) : 0"
                      [style.background]="bar.color">
                    </div>
                  </div>
                  <span class="hist-label">{{ bar.range }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Pass/Fail donut -->
          <div class="chart-box chart-box--donut">
            <p class="chart-label">עמידה בסף</p>
            <div class="donut-wrap">
              <svg viewBox="0 0 80 80" class="donut-svg" aria-hidden="true">
                <!-- Background circle -->
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
                <!-- Pass arc -->
                <circle cx="40" cy="40" r="30" fill="none"
                  stroke="#10b981" stroke-width="10"
                  [attr.stroke-dasharray]="passArc + ' ' + (188.5 - passArc)"
                  stroke-dashoffset="47.1"
                  stroke-linecap="round"
                  transform="rotate(-90 40 40)"/>
              </svg>
              <div class="donut-center">
                <span class="donut-pct">{{ passPct != null ? (passPct | number:'1.0-0') : '—' }}%</span>
                <span class="donut-sub">עברו</span>
              </div>
            </div>
            <div class="donut-legend">
              <span class="dl-dot" style="background:#10b981"></span>
              <span>עברו ({{ passCount }})</span>
              <span class="dl-dot" style="background:var(--danger); margin-right: 6px;"></span>
              <span>לא עברו ({{ failCount }})</span>
            </div>
          </div>

          <!-- Track comparison (if data exists) -->
          @if (trackStats.length > 1) {
            <div class="chart-box chart-box--tracks">
              <p class="chart-label">השוואת מסלולים</p>
              <div class="track-bars">
                @for (t of trackStats; track t.track) {
                  <div class="track-row">
                    <span class="track-name">{{ t.track }}</span>
                    <div class="track-bar-wrap">
                      <div class="track-bar"
                        [style.width.%]="(t.avg / 100) * 100"
                        [class.track-bar--low]="t.avg < 60"
                        [class.track-bar--ok]="t.avg >= 60 && t.avg < 80"
                        [class.track-bar--good]="t.avg >= 80">
                      </div>
                    </div>
                    <span class="track-avg">{{ t.avg | number:'1.1-1' }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .analytics {
      padding: 22px 24px;
    }

    .analytics-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .analytics-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.2px;
    }

    /* KPIs */
    .kpis {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .kpi {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 14px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      min-width: 60px;
      transition: border-color 0.15s;

      &--warn {
        border-color: rgba(245,158,11,0.4);
        background: rgba(245,158,11,0.06);
        .kpi-val { color: var(--warning); }
      }
    }

    .kpi-val {
      font-size: 1.3rem;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: -1px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .kpi-label {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-top: 4px;
      white-space: nowrap;
    }

    /* No data */
    .no-data {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.9rem;
      span { font-size: 2rem; }
    }

    /* Charts row */
    .charts-row {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .chart-box {
      flex: 1;
      min-width: 180px;
    }
    .chart-box--donut { max-width: 180px; }
    .chart-box--tracks { flex: 2; }

    .chart-label {
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--text-light);
      margin-bottom: 12px;
    }

    /* ── Histogram ── */
    .histogram {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 100px;
    }

    .hist-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      height: 100%;
    }

    .hist-bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      width: 100%;
      position: relative;
    }

    .hist-count {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 2px;
      position: absolute;
      top: -2px;
    }

    .hist-bar {
      width: 100%;
      border-radius: 4px 4px 0 0;
      transition: height 0.4s cubic-bezier(0.34,1.56,0.64,1);
      min-height: 2px;
    }

    .hist-label {
      font-size: 0.6rem;
      color: var(--text-light);
      text-align: center;
      white-space: nowrap;
    }

    /* ── Donut ── */
    .donut-wrap {
      position: relative;
      width: 100px;
      height: 100px;
      margin: 0 auto 10px;
    }

    .donut-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      overflow: visible;
    }

    .donut-center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform: rotate(90deg);
    }

    .donut-pct {
      font-size: 1.3rem;
      font-weight: 900;
      color: var(--text);
      letter-spacing: -1px;
      line-height: 1;
    }

    .donut-sub {
      font-size: 0.6rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .donut-legend {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      font-size: 0.7rem;
      color: var(--text-muted);
      justify-content: center;
    }

    .dl-dot {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      display: inline-block;
      flex-shrink: 0;
    }

    /* ── Track bars ── */
    .track-bars {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .track-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .track-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text);
      min-width: 80px;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-bar-wrap {
      flex: 1;
      height: 16px;
      background: var(--surface-2);
      border-radius: 8px;
      overflow: hidden;
    }

    .track-bar {
      height: 100%;
      border-radius: 8px;
      transition: width 0.5s cubic-bezier(0.34,1.2,0.64,1);

      &--low  { background: var(--grad-danger); }
      &--ok   { background: var(--grad-warning); }
      &--good { background: var(--grad-primary); }
    }

    .track-avg {
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--text);
      min-width: 32px;
      text-align: left;
      font-variant-numeric: tabular-nums;
    }
  `],
})
export class ExamAnalyticsComponent implements OnChanges {
  @Input() students: any[] = [];   // from getExam(id).students
  @Input() examName = '';

  distribution: GradeDistBar[] = [];
  trackStats: TrackStats[] = [];

  average: number | null = null;
  gradedCount = 0;
  topScore: number | null = null;
  passCount = 0;
  failCount = 0;
  passPct: number | null = null;
  passArc = 0;
  maxPct = 1;

  Math = Math;

  private readonly BUCKETS: { label: string; min: number; max: number; color: string }[] = [
    { label: '0–39',   min: 0,  max: 39,  color: '#e11d48' },
    { label: '40–59',  min: 40, max: 59,  color: '#f97316' },
    { label: '60–69',  min: 60, max: 69,  color: '#eab308' },
    { label: '70–79',  min: 70, max: 79,  color: '#22c55e' },
    { label: '80–89',  min: 80, max: 89,  color: '#14b8a6' },
    { label: '90–100', min: 90, max: 100, color: '#6366f1' },
  ];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['students']) this.compute();
  }

  private compute() {
    const graded = this.students.filter(s => s.grade != null);
    this.gradedCount = graded.length;

    if (graded.length === 0) {
      this.average = null;
      this.topScore = null;
      this.passPct = null;
      this.passArc = 0;
      this.passCount = 0;
      this.failCount = 0;
      this.distribution = [];
      this.trackStats = [];
      return;
    }

    const grades = graded.map(s => Number(s.grade));
    this.average = grades.reduce((a, b) => a + b, 0) / grades.length;
    this.topScore = Math.max(...grades);
    this.passCount = grades.filter(g => g >= 60).length;
    this.failCount = grades.length - this.passCount;
    this.passPct = (this.passCount / grades.length) * 100;
    // SVG arc: circumference of r=30 circle ≈ 188.5
    this.passArc = (this.passPct / 100) * 188.5;

    // Histogram
    const bucketCounts = this.BUCKETS.map(b => ({
      range: b.label,
      count: grades.filter(g => g >= b.min && g <= b.max).length,
      color: b.color,
      pct: 0,
    }));
    const maxCount = Math.max(...bucketCounts.map(b => b.count), 1);
    bucketCounts.forEach(b => b.pct = (b.count / maxCount) * 100);
    this.distribution = bucketCounts;
    this.maxPct = maxCount;

    // Track comparison
    const byTrack = new Map<string, number[]>();
    for (const s of graded) {
      const t = s.track || 'לא מצוין';
      if (!byTrack.has(t)) byTrack.set(t, []);
      byTrack.get(t)!.push(Number(s.grade));
    }
    this.trackStats = [...byTrack.entries()]
      .map(([track, gs]) => ({
        track,
        avg: gs.reduce((a, b) => a + b, 0) / gs.length,
        count: gs.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  }
}

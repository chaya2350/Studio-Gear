import {
  Component, Input, OnChanges, SimpleChanges,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-student-profile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="profile-card" [class.profile-card--complete]="completionPct === 100">

      <!-- Completion glow aura (full completion only) -->
      @if (completionPct === 100) {
        <div class="aura" aria-hidden="true"></div>
      }

      <!-- Avatar + identity -->
      <div class="identity">
        <div class="avatar" [style.background]="avatarColor">
          <span>{{ initials }}</span>
          @if (completionPct === 100) {
            <span class="avatar-crown" title="כל הדרישות הושלמו">✓</span>
          }
        </div>
        <div class="identity-text">
          <h2 class="student-name">{{ name }}</h2>
          <p class="student-meta">{{ idNumber }}<span *ngIf="track"> · {{ track }}{{ year ? ' ' + year : '' }}</span></p>
          <p class="student-meta" *ngIf="phone">
            <a [href]="'tel:' + phone" class="phone-link">{{ phone }}</a>
          </p>
        </div>

        <!-- Status badge -->
        <div class="status-badge"
          [class.status-badge--ok]="statusLevel === 'ok'"
          [class.status-badge--warn]="statusLevel === 'warn'"
          [class.status-badge--danger]="statusLevel === 'danger'">
          <span class="status-icon">{{ statusIcon }}</span>
          <span class="status-label">{{ statusLabel }}</span>
        </div>
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat" [routerLink]="['/students', idNumber]">
          <span class="stat-val">{{ totalLoans }}</span>
          <span class="stat-lbl">השאלות</span>
        </div>
        <div class="stat">
          <span class="stat-val">{{ examAvg != null ? (examAvg | number:'1.1-1') : '—' }}</span>
          <span class="stat-lbl">ממוצע מבחנים</span>
        </div>
        <div class="stat" [class.stat--warn]="missingRequired > 0">
          <span class="stat-val">{{ completedReqs }}/{{ totalReqs }}</span>
          <span class="stat-lbl">דרישות</span>
        </div>
        <div class="stat" *ngIf="activeLoans > 0" [class.stat--warn]="true">
          <span class="stat-val">{{ activeLoans }}</span>
          <span class="stat-lbl">ציוד בחוץ</span>
        </div>
      </div>

      <!-- Requirements progress bar -->
      @if (totalReqs > 0) {
        <div class="progress-section">
          <div class="progress-header">
            <span class="progress-label">דרישות מסלול</span>
            <span class="progress-pct" [class.progress-pct--done]="completionPct === 100">
              {{ completionPct | number:'1.0-0' }}%
            </span>
          </div>
          <div class="progress-track" role="progressbar" [attr.aria-valuenow]="completionPct" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill"
              [style.width.%]="completionPct"
              [class.progress-fill--done]="completionPct === 100"
              [class.progress-fill--warn]="completionPct < 50">
            </div>
          </div>
          @if (missingRequired > 0) {
            <p class="progress-hint">
              <span>⚠️</span> חסרות {{ missingRequired }} דרישות חובה
            </p>
          }
        </div>
      }

      <!-- Exam sparkline (mini bar chart) -->
      @if (examGrades.length > 0) {
        <div class="sparkline-section">
          <span class="sparkline-label">ציונות מבחנים</span>
          <div class="sparkline" role="img" aria-label="מיני גרף ציונים">
            @for (g of examGrades; track $index) {
              <div class="spark-bar-wrap" [title]="g.name + ': ' + g.grade">
                <div class="spark-bar"
                  [style.height.%]="g.grade"
                  [class.spark-bar--fail]="g.grade < 60"
                  [class.spark-bar--ok]="g.grade >= 60 && g.grade < 80"
                  [class.spark-bar--good]="g.grade >= 80">
                </div>
              </div>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .profile-card {
      position: relative;
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: box-shadow 0.2s;

      &--complete {
        border-color: #10b981;
        box-shadow: var(--shadow), 0 0 0 1px rgba(16,185,129,0.2);
      }
    }

    /* ── Completion aura ── */
    .aura {
      position: absolute;
      top: -40px;
      right: -40px;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%);
      pointer-events: none;
      animation: aura-pulse 3s ease-in-out infinite;
    }
    @keyframes aura-pulse {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50%       { opacity: 1;   transform: scale(1.12); }
    }

    /* ── Identity ── */
    .identity {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }

    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      font-weight: 900;
      color: white;
      flex-shrink: 0;
      position: relative;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .avatar-crown {
      position: absolute;
      bottom: -3px;
      right: -3px;
      width: 18px;
      height: 18px;
      background: #10b981;
      border: 2px solid var(--surface);
      border-radius: 50%;
      font-size: 0.6rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 900;
    }

    .identity-text {
      flex: 1;
      min-width: 0;
    }

    .student-name {
      font-size: 1.2rem;
      font-weight: 900;
      color: var(--text);
      letter-spacing: -0.4px;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .student-meta {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 2px;
    }

    .phone-link {
      color: var(--primary);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }

    /* ── Status badge ── */
    .status-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 800;
      flex-shrink: 0;
      white-space: nowrap;

      &--ok {
        background: rgba(16,185,129,0.1);
        color: #059669;
        border: 1px solid rgba(16,185,129,0.2);
      }
      &--warn {
        background: rgba(245,158,11,0.1);
        color: #d97706;
        border: 1px solid rgba(245,158,11,0.25);
      }
      &--danger {
        background: rgba(225,29,72,0.08);
        color: var(--danger);
        border: 1px solid rgba(225,29,72,0.2);
      }
    }

    .status-icon { font-size: 0.85rem; }

    /* ── Stats row ── */
    .stats-row {
      display: flex;
      gap: 6px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }

    .stat {
      flex: 1;
      min-width: 52px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: border-color 0.15s;
      cursor: default;

      &--warn {
        border-color: rgba(245,158,11,0.3);
        background: rgba(245,158,11,0.05);
        .stat-val { color: var(--warning); }
      }
    }

    .stat-val {
      font-size: 1.2rem;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: -0.5px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .stat-lbl {
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--text-light);
      margin-top: 4px;
      text-align: center;
    }

    /* ── Progress bar ── */
    .progress-section {
      margin-bottom: 16px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 7px;
    }

    .progress-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.3px;
    }

    .progress-pct {
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--text-muted);

      &--done { color: #059669; }
    }

    .progress-track {
      height: 8px;
      background: var(--surface-2);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .progress-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--grad-primary);
      transition: width 0.7s cubic-bezier(0.34, 1.2, 0.64, 1);

      &--done { background: var(--grad-success); }
      &--warn { background: var(--grad-danger); }
    }

    .progress-hint {
      font-size: 0.72rem;
      color: var(--warning);
      font-weight: 600;
      margin-top: 5px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* ── Sparkline ── */
    .sparkline-section {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .sparkline-label {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--text-light);
      white-space: nowrap;
      letter-spacing: 0.3px;
    }

    .sparkline {
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 28px;
    }

    .spark-bar-wrap {
      flex: 1;
      height: 100%;
      display: flex;
      align-items: flex-end;
      max-width: 20px;
    }

    .spark-bar {
      width: 100%;
      border-radius: 2px 2px 0 0;
      min-height: 2px;
      transition: height 0.4s cubic-bezier(0.34, 1.5, 0.64, 1);

      &--fail { background: var(--danger); }
      &--ok   { background: var(--warning); }
      &--good { background: var(--primary); }
    }
  `],
})
export class StudentProfileCardComponent implements OnChanges {
  @Input() name = '';
  @Input() idNumber = '';
  @Input() track = '';
  @Input() year = '';
  @Input() phone = '';
  @Input() totalReqs = 0;
  @Input() completedReqs = 0;
  @Input() missingRequired = 0;
  @Input() totalLoans = 0;
  @Input() activeLoans = 0;
  @Input() examAvg: number | null = null;
  @Input() examGrades: { name: string; grade: number }[] = [];

  initials = '';
  avatarColor = '#0d9488';
  completionPct = 0;
  statusLevel: 'ok' | 'warn' | 'danger' = 'ok';
  statusLabel = '';
  statusIcon = '';

  private readonly PALETTE = [
    '#0d9488', '#0891b2', '#6366f1', '#8b5cf6',
    '#ec4899', '#f97316', '#10b981', '#f59e0b',
  ];

  ngOnChanges(changes: SimpleChanges) {
    this.compute();
  }

  private compute() {
    // Initials from name
    const parts = (this.name || '').trim().split(/\s+/);
    this.initials = parts.length >= 2
      ? parts[0][0] + parts[1][0]
      : (parts[0]?.[0] ?? '?');

    // Deterministic color from id_number
    let hash = 0;
    for (const ch of this.idNumber) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
    this.avatarColor = this.PALETTE[hash % this.PALETTE.length];

    // Completion %
    this.completionPct = this.totalReqs > 0
      ? Math.round((this.completedReqs / this.totalReqs) * 100)
      : 100;

    // Status
    if (this.missingRequired > 0) {
      this.statusLevel = 'danger';
      this.statusIcon = '⚠️';
      this.statusLabel = `${this.missingRequired} חובה חסרות`;
    } else if (this.activeLoans > 0) {
      this.statusLevel = 'warn';
      this.statusIcon = '📦';
      this.statusLabel = 'ציוד בחוץ';
    } else if (this.completionPct === 100) {
      this.statusLevel = 'ok';
      this.statusIcon = '✅';
      this.statusLabel = 'הכל הושלם';
    } else {
      this.statusLevel = 'ok';
      this.statusIcon = '📋';
      this.statusLabel = 'תקין';
    }
  }
}

import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ApiService, CalendarEvent } from '../../services/api.service';

interface Task {
  id: number;
  title: string;
  due_date: string;
  completed: boolean;
  completed_at?: string;
}

interface DashboardStats {
  overdueLoans: number;
  activeLoans: number;
  unreadMessages: number;
  totalStudents: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule],
  template: `
<div class="page">

  <!-- ══════════════  HERO  ══════════════ -->
  <section class="hero">
    <div class="hero-bg-lines" aria-hidden="true">
      <span></span><span></span><span></span><span></span>
    </div>

    <div class="hero-content">
      <div class="hero-left">
        <p class="hero-eyebrow">{{ todayLabel }}</p>
        <h1 class="hero-heading">
          שלום,&nbsp;<em>{{ auth.user()?.name || '' }}</em>
        </h1>
        <p class="hero-sub">{{ greetingSub }}</p>
      </div>

      <div class="hero-video-wrap" aria-hidden="true">
        <video src="/mcp.mp4" autoplay loop muted playsinline class="hero-video"></video>
      </div>

      <div class="hero-metrics">
        <a routerLink="/loans" class="metric" [class.metric--warn]="(stats()?.overdueLoans ?? 0) > 0">
          <span class="metric-number">{{ stats()?.overdueLoans ?? '—' }}</span>
          <span class="metric-label">איחורים</span>
          <span class="metric-line"></span>
        </a>
        <a routerLink="/loans" class="metric">
          <span class="metric-number">{{ stats()?.activeLoans ?? '—' }}</span>
          <span class="metric-label">השאלות פעילות</span>
          <span class="metric-line"></span>
        </a>
        <a routerLink="/messages" class="metric" [class.metric--info]="(stats()?.unreadMessages ?? 0) > 0">
          <span class="metric-number">{{ stats()?.unreadMessages ?? '—' }}</span>
          <span class="metric-label">הודעות חדשות</span>
          <span class="metric-line"></span>
        </a>
        <a routerLink="/students" class="metric">
          <span class="metric-number">{{ stats()?.totalStudents ?? '—' }}</span>
          <span class="metric-label">תלמידות</span>
          <span class="metric-line"></span>
        </a>
      </div>
    </div>
  </section>

  <!-- ══════════════  BODY  ══════════════ -->
  <div class="body-grid">

    <!-- ── LEFT: live panels ── -->
    <div class="panels-stack">

      <!-- Tasks -->
      <article class="card card--tasks">
        <header class="card-header">
          <span class="card-eyebrow">היום</span>
          <h2 class="card-title">משימות</h2>
          <a routerLink="/messages" class="card-cta">
            כל המשימות
            <svg viewBox="0 0 16 16" fill="none"><path d="M10 8H6m4 0-2.5-2.5M10 8l-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </a>
        </header>

        <div class="card-body">
          @if (tasksLoading()) {
            <div class="shimmer-stack">
              <div class="shimmer w-full"></div>
              <div class="shimmer w-3q"></div>
              <div class="shimmer w-full"></div>
            </div>
          } @else if (todayTasks().length === 0) {
            <div class="nil-state">
              <div class="nil-rule"></div>
              <p>אין משימות להיום</p>
            </div>
          } @else {
            <ul class="task-list">
              @for (task of todayTasks(); track task.id) {
                <li class="task" [class.task--done]="task.completed">
                  <button class="task-check" (click)="toggleTask(task)" [attr.aria-pressed]="task.completed">
                    <svg viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
                      @if (task.completed) {
                        <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      }
                    </svg>
                  </button>
                  <span>{{ task.title }}</span>
                </li>
              }
            </ul>
          }
        </div>

        @if (upcomingTasks().length > 0) {
          <footer class="card-footer">
            <p class="footer-eyebrow">בקרוב · {{ upcomingTasks().length }}</p>
            @for (t of upcomingTasks().slice(0, 3); track t.id) {
              <div class="footer-row">
                <span class="footer-date">{{ formatDate(t.due_date) }}</span>
                <span class="footer-text">{{ t.title }}</span>
              </div>
            }
          </footer>
        }
      </article>

      <!-- Events -->
      <article class="card card--events">
        <header class="card-header">
          <span class="card-eyebrow">לוח שנה</span>
          <h2 class="card-title">אירועים היום</h2>
          <a routerLink="/calendar/personal" class="card-cta">
            לוח מלא
            <svg viewBox="0 0 16 16" fill="none"><path d="M10 8H6m4 0-2.5-2.5M10 8l-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </a>
        </header>

        <div class="card-body">
          @if (eventsLoading()) {
            <div class="shimmer-stack">
              <div class="shimmer w-3q"></div>
              <div class="shimmer w-full"></div>
            </div>
          } @else if (todayEvents().length === 0) {
            <div class="nil-state">
              <div class="nil-rule"></div>
              <p>אין אירועים מתוכננים להיום</p>
            </div>
          } @else {
            <ul class="event-list">
              @for (ev of todayEvents(); track ev.id) {
                <li class="event">
                  <div class="event-stripe"></div>
                  <div>
                    <p class="event-name">{{ ev.title }}</p>
                    @if (ev.category) {
                      <span class="event-chip">{{ ev.category }}</span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        @if (upcomingEvents().length > 0) {
          <footer class="card-footer">
            <p class="footer-eyebrow">קרובים</p>
            @for (ev of upcomingEvents().slice(0, 3); track ev.id) {
              <div class="footer-row">
                <span class="footer-date">{{ formatDate(ev.event_date) }}</span>
                <span class="footer-text">{{ ev.title }}</span>
              </div>
            }
          </footer>
        }
      </article>

    </div>

    <!-- ── RIGHT: nav ── -->
    <nav class="nav-panel" aria-label="ניווט מהיר">
      <p class="nav-eyebrow">ניווט מהיר</p>
      <div class="nav-grid">
        @for (mod of modules; track mod.link) {
          <a [routerLink]="mod.link" class="nav-item">
            <div class="nav-item-inner">
              <span class="nav-title">{{ mod.title }}</span>
              <span class="nav-desc">{{ mod.desc }}</span>
            </div>
            @if (mod.badge > 0) {
              <span class="nav-badge">{{ mod.badge }}</span>
            }
            <svg class="nav-arrow" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 10H7.5m5 0L10 7.5m2.5 2.5L10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
        }
      </div>
    </nav>

  </div>
</div>
  `,
  styles: [`
    :host { display: block; }

    /* ── tokens ───────────────────────────────────────────── */
    /* uses global vars: --primary, --grad-primary, etc.      */

    /* ══════════════════════════════════════════════════════
       PAGE SHELL
    ══════════════════════════════════════════════════════ */
    .page {
      min-height: calc(100vh - 66px);
      display: flex;
      flex-direction: column;
    }

    /* ══════════════════════════════════════════════════════
       HERO
    ══════════════════════════════════════════════════════ */
    .hero {
      background: var(--grad-primary);
      position: relative;
      overflow: hidden;
    }

    /* animated ruled lines for texture */
    .hero-bg-lines {
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: space-around;
      pointer-events: none;
      span {
        display: block;
        width: 1px;
        height: 100%;
        background: rgba(255,255,255,0.06);
        transform-origin: top center;
        animation: line-grow 1s ease both;
        @for $i from 1 through 4 {
          &:nth-child(#{$i}) { animation-delay: #{($i - 1) * 60}ms; }
        }
      }
    }
    @keyframes line-grow {
      from { transform: scaleY(0); opacity: 0; }
      to   { transform: scaleY(1); opacity: 1; }
    }

    .hero-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 44px 44px 40px;
      display: flex;
      align-items: center;
      gap: 48px;
    }

    .hero-left { flex-shrink: 0; }

    /* סרטון הברכה גדול וקריא, משתלב כאיור לצד הכותרת. */
    .hero-video-wrap {
      flex-shrink: 0;
      order: -1;
      width: 188px;
      height: 188px;
      border-radius: 50%;
      aspect-ratio: 1 / 1;
      overflow: hidden;
      border: 3px solid rgba(255,255,255,0.7);
      box-shadow: 0 8px 28px rgba(0,0,0,0.28);
      line-height: 0;
      background: rgba(255,255,255,0.12);
    }
    .hero-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .hero-eyebrow {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 8px;
    }

    .hero-heading {
      font-size: 2.4rem;
      font-weight: 900;
      color: #fff;
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: 10px;
      em { font-style: normal; opacity: 0.75; }
    }

    .hero-sub {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.48);
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    /* ── metrics row ── */
    .hero-metrics {
      flex: 1;
      display: flex;
      justify-content: flex-end;
      gap: 2px;
    }

    .metric {
      flex: 1;
      max-width: 160px;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px 20px 20px;
      text-decoration: none;
      cursor: pointer;
      position: relative;
      transition: background 0.18s;
      border-radius: var(--radius-sm);

      &:hover { background: rgba(255,255,255,0.08); }

      &--warn .metric-number { color: #fde68a; }
      &--info .metric-number { color: #bae6fd; }
    }

    .metric-number {
      font-size: 2.6rem;
      font-weight: 900;
      color: rgba(255,255,255,0.95);
      letter-spacing: -2px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      transition: color 0.2s;
    }

    .metric-label {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
      margin-top: 5px;
      text-align: center;
    }

    .metric-line {
      position: absolute;
      bottom: 0;
      left: 50%;
      translate: -50% 0;
      width: 0;
      height: 2px;
      background: rgba(255,255,255,0.5);
      border-radius: 2px;
      transition: width 0.2s;
    }
    .metric:hover .metric-line { width: 40%; }

    /* ══════════════════════════════════════════════════════
       BODY GRID
    ══════════════════════════════════════════════════════ */
    .body-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 420px 1fr;
      gap: 28px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 36px 44px 56px;
      align-items: start;
    }

    .panels-stack {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ══════════════════════════════════════════════════════
       CARD (base)
    ══════════════════════════════════════════════════════ */
    .card {
      background: var(--surface);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .card-header {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      column-gap: 12px;
      padding: 22px 24px 18px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }

    .card-eyebrow {
      grid-column: 1 / 2;
      grid-row: 1 / 2;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--primary);
      margin-bottom: 3px;
    }

    .card-title {
      grid-column: 1 / 2;
      grid-row: 2 / 3;
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.3px;
    }

    .card-cta {
      grid-column: 2 / 3;
      grid-row: 1 / 3;
      align-self: center;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-decoration: none;
      padding: 5px 10px;
      border-radius: 20px;
      border: 1px solid var(--border);
      transition: all 0.18s;
      white-space: nowrap;

      svg { width: 14px; height: 14px; transition: transform 0.18s; }
      &:hover {
        color: var(--primary);
        border-color: var(--primary);
        background: var(--primary-light);
        svg { transform: translateX(-3px); }
      }
    }

    .card-body { padding: 6px 0; flex: 1; }

    /* ── shimmer ── */
    .shimmer-stack { padding: 16px 24px; display: flex; flex-direction: column; gap: 10px; }
    .shimmer {
      height: 13px;
      border-radius: 6px;
      background: linear-gradient(90deg,
        var(--surface-2) 0%,
        var(--surface-3) 45%,
        var(--surface-2) 100%);
      background-size: 300% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
    }
    .w-full { width: 100%; }
    .w-3q   { width: 65%; }
    @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

    /* ── nil state ── */
    .nil-state {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 22px 24px;
      color: var(--text-light);
      font-size: 0.85rem;
      font-weight: 500;
    }
    .nil-rule {
      width: 3px;
      height: 28px;
      border-radius: 3px;
      background: var(--border);
      flex-shrink: 0;
    }

    /* ── tasks ── */
    .task-list { list-style: none; padding: 4px 0 10px; }

    .task {
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 10px 24px;
      transition: background 0.15s;

      &:hover { background: var(--surface-2); }

      &--done {
        > span { text-decoration: line-through; color: var(--text-light); }
        .task-check { color: var(--success); }
      }

      > span {
        font-size: 0.875rem;
        color: var(--text);
        font-weight: 500;
        line-height: 1.45;
      }
    }

    .task-check {
      width: 22px;
      height: 22px;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--border);
      flex-shrink: 0;
      transition: color 0.18s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;

      svg { width: 22px; height: 22px; }
      &:hover { color: var(--primary); transform: scale(1.12); }
    }

    /* ── events ── */
    .event-list { list-style: none; padding: 4px 0 10px; }

    .event {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 11px 24px;
      transition: background 0.15s;
      &:hover { background: var(--surface-2); }
    }

    .event-stripe {
      width: 3px;
      min-height: 22px;
      border-radius: 3px;
      background: var(--grad-primary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .event-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
    }

    .event-chip {
      display: inline-block;
      margin-top: 4px;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--primary);
      background: var(--primary-light);
      border-radius: 4px;
      padding: 2px 8px;
    }

    /* ── card footer (upcoming) ── */
    .card-footer {
      border-top: 1px solid var(--border);
      padding: 14px 24px;
      background: var(--surface-2);
    }

    .footer-eyebrow {
      font-size: 0.63rem;
      font-weight: 800;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--text-light);
      margin-bottom: 9px;
    }

    .footer-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 3px 0;
    }

    .footer-date {
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--primary);
      flex-shrink: 0;
      min-width: 44px;
    }

    .footer-text {
      font-size: 0.78rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ══════════════════════════════════════════════════════
       NAV PANEL
    ══════════════════════════════════════════════════════ */
    .nav-panel {}

    .nav-eyebrow {
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-light);
      margin-bottom: 14px;
      padding-right: 2px;
    }

    .nav-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0;
      text-decoration: none;
      color: inherit;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      position: relative;
      transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;

      /* teal left-edge reveal */
      &::before {
        content: '';
        position: absolute;
        top: 0;
        right: 0;        /* RTL — border on the right side */
        bottom: 0;
        width: 3px;
        background: var(--grad-primary);
        transform: scaleY(0);
        transform-origin: bottom;
        border-radius: 0 var(--radius) var(--radius) 0;
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      &:hover {
        border-color: var(--primary);
        box-shadow: var(--shadow), 0 0 0 3px var(--primary-glow);
        transform: translateY(-3px);

        &::before { transform: scaleY(1); }
        .nav-title { color: var(--primary); }
        .nav-arrow { opacity: 1; transform: translateX(-4px); }
      }
    }

    .nav-item-inner {
      flex: 1;
      padding: 18px 16px 18px 0;
      padding-right: 20px;
      min-width: 0;
    }

    .nav-title {
      display: block;
      font-size: 0.92rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.2px;
      margin-bottom: 3px;
      transition: color 0.18s;
    }

    .nav-desc {
      display: block;
      font-size: 0.73rem;
      color: var(--text-muted);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-badge {
      background: var(--danger);
      color: white;
      font-size: 0.66rem;
      font-weight: 900;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      flex-shrink: 0;
    }

    .nav-arrow {
      width: 18px;
      height: 18px;
      color: var(--text-light);
      margin-left: 12px;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.18s, transform 0.18s;
    }

    /* ══════════════════════════════════════════════════════
       RESPONSIVE
    ══════════════════════════════════════════════════════ */
    @media (max-width: 1060px) {
      .body-grid {
        grid-template-columns: 1fr;
        padding: 24px 24px 48px;
      }
      .nav-panel { order: -1; }
      .nav-grid { grid-template-columns: repeat(4, 1fr); }
      .nav-desc { display: none; }
    }

    @media (max-width: 740px) {
      .hero-content {
        flex-direction: column;
        align-items: stretch;
        padding: 32px 24px 28px;
        gap: 24px;
      }
      .hero-video-wrap { align-self: flex-start; order: -1; width: 156px; height: 156px; border-radius: 50%; aspect-ratio: 1 / 1; }
      .hero-video { width: 100%; height: 100%; }
      .hero-metrics { justify-content: flex-start; width: 100%; }
      .metric { max-width: none; padding: 12px 16px 16px; }
      .metric-number { font-size: 2rem; }
      .hero-heading { font-size: 1.9rem; }
      .nav-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 480px) {
      .hero-video-wrap { width: 132px; height: 132px; border-radius: 50%; aspect-ratio: 1 / 1; }
      .hero-video { width: 100%; height: 100%; }
      .hero-heading { font-size: 1.65rem; }
      .hero-metrics { gap: 0; }
      .metric { padding: 10px 10px 14px; }
      .metric-number { font-size: 1.6rem; }
      .nav-grid { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class HomeComponent implements OnInit {

  readonly tasksLoading = signal(true);
  readonly eventsLoading = signal(true);
  readonly tasks         = signal<Task[]>([]);
  readonly events        = signal<CalendarEvent[]>([]);
  readonly stats         = signal<DashboardStats | null>(null);

  readonly todayStr = new Date().toISOString().slice(0, 10);

  readonly todayLabel = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  readonly greetingSub = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'בוקר טוב — הנה סיכום היום שלך';
    if (h < 17) return 'צהריים טובים — הנה מה שמחכה לך';
    return 'ערב טוב — הנה סיכום היום';
  })();

  readonly todayTasks = computed(() =>
    this.tasks().filter(t => t.due_date === this.todayStr)
  );
  readonly upcomingTasks = computed(() =>
    this.tasks().filter(t => t.due_date > this.todayStr && !t.completed)
  );
  readonly todayEvents = computed(() =>
    this.events().filter(e => e.event_date === this.todayStr)
  );
  readonly upcomingEvents = computed(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 14);
    const limitStr = limit.toISOString().slice(0, 10);
    return this.events()
      .filter(e => e.event_date > this.todayStr && e.event_date <= limitStr)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
  });

  readonly modules = [
    { link: '/equipment',          title: 'השאלת ציוד',    desc: 'ניהול ציוד והשאלות',       badge: 0 },
    { link: '/students',           title: 'תלמידות',       desc: 'פרטים אישיים והיסטוריה',    badge: 0 },
    { link: '/approvals',          title: 'אישורים',       desc: 'הפקת אישורי נוכחות',        badge: 0 },
    { link: '/exams',              title: 'מבחנים',        desc: 'ברקודים ורישום ציונים',      badge: 0 },
    { link: '/pages',              title: 'דפים',          desc: 'נושאים ודפים אישיים',        badge: 0 },
    { link: '/messages',           title: 'הודעות',        desc: 'שיחות פרטיות',              badge: 0 },
    { link: '/calendar/personal',  title: 'לוח שנה',       desc: 'הלוח האישי ולוח הציוד',     badge: 0 },
    { link: '/admin',              title: 'ניהול',         desc: 'נתוני תלמידות ומסלולים',    badge: 0 },
  ];

  constructor(
    public  auth: AuthService,
    private http: HttpClient,
    private api:  ApiService,
  ) {}

  ngOnInit(): void {
    this.loadTasks();
    this.loadEvents();
    this.loadStats();
  }

  private loadTasks(): void {
    const to = new Date();
    to.setDate(to.getDate() + 7);
    this.http.get<Task[]>(`/api/tasks?from=${this.todayStr}&to=${to.toISOString().slice(0, 10)}`).subscribe({
      next: d  => { this.tasks.set(d);  this.tasksLoading.set(false); },
      error: () =>   this.tasksLoading.set(false),
    });
  }

  private loadEvents(): void {
    this.api.getCalendarEvents().subscribe({
      next: d  => { this.events.set(d);  this.eventsLoading.set(false); },
      error: () =>   this.eventsLoading.set(false),
    });
  }

  private loadStats(): void {
    let loans: any[] | null    = null;
    let overdue: any[] | null  = null;
    let msgs: number | null    = null;
    let students: any[] | null = null;

    const commit = () => {
      if ([loans, overdue, msgs, students].some(v => v === null)) return;
      this.stats.set({
        activeLoans:    (loans  as any[]).filter(l => !l.actual_return).length,
        overdueLoans:   (overdue as any[]).length,
        unreadMessages: msgs as number,
        totalStudents:  (students as any[]).length,
      });
      const m = this.modules;
      const msg = m.find(x => x.link === '/messages');
      const eq  = m.find(x => x.link === '/equipment');
      if (msg) msg.badge = msgs as number;
      if (eq)  eq.badge  = (overdue as any[]).length;
    };

    this.api.getLoans().subscribe({
      next: d => { loans = d; commit(); }, error: () => { loans = []; commit(); }
    });
    this.api.getOverdueLoans().subscribe({
      next: d => { overdue = d; commit(); }, error: () => { overdue = []; commit(); }
    });
    this.http.get<{ count: number }>('/api/messages/unread-count').subscribe({
      next: d => { msgs = d.count; commit(); }, error: () => { msgs = 0; commit(); }
    });
    this.api.getStudents().subscribe({
      next: d => { students = d; commit(); }, error: () => { students = []; commit(); }
    });
  }

  toggleTask(task: Task): void {
    const next = !task.completed;
    this.http.patch(`/api/tasks/${task.id}/completion`, { completed: next }).subscribe({
      next: () => this.tasks.update(list =>
        list.map(t => t.id === task.id
          ? { ...t, completed: next, completed_at: next ? new Date().toISOString() : undefined }
          : t)
      ),
    });
  }

  formatDate(dateStr: string): string {
    const d    = new Date(dateStr + 'T12:00:00');
    const diff = Math.round((d.getTime() - Date.now()) / 86400000);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff <= 6) return d.toLocaleDateString('he-IL', { weekday: 'short' });
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
}

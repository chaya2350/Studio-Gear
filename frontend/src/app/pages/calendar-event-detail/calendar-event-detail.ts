import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CalendarEvent } from '../../services/api.service';
import { HDate, months } from '@hebcal/core';

const HEBREW_MONTH_NAMES: Record<number, string> = {
  [months.TISHREI]: 'תשרי', [months.CHESHVAN]: 'חשוון', [months.KISLEV]: 'כסלו',
  [months.TEVET]: 'טבת', [months.SHVAT]: 'שבט', [months.ADAR_I]: 'אדר',
  [months.ADAR_II]: 'אדר ב׳', [months.NISAN]: 'ניסן', [months.IYYAR]: 'אייר',
  [months.SIVAN]: 'סיוון', [months.TAMUZ]: 'תמוז', [months.AV]: 'אב', [months.ELUL]: 'אלול',
};

function hebrewDateLabel(dateStr: string): string {
  try {
    const hd = new HDate(new Date(`${dateStr}T12:00:00`));
    const day = hd.getDate();
    const monthName = HEBREW_MONTH_NAMES[hd.getMonth()] ?? '';
    const year = hd.getFullYear();
    const yearStr = toHebrewYear(year);
    return `${hebrewNumeral(day)} ${monthName} ${yearStr}`;
  } catch {
    return '';
  }
}

function hebrewNumeral(n: number): string {
  const nums = ['','א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳','ט׳','י׳','י״א','י״ב','י״ג','י״ד','ט״ו','ט״ז','י״ז','י״ח','י״ט','כ׳','כ״א','כ״ב','כ״ג','כ״ד','כ״ה','כ״ו','כ״ז','כ״ח','כ״ט','ל׳'];
  return nums[n] ?? String(n);
}

function toHebrewYear(year: number): string {
  let value = year % 1000;
  let label = '';
  const vals: [number, string][] = [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
  for (const [n, l] of vals) { while (value >= n) { label += l; value -= n; } }
  return label.length === 1 ? `${label}׳` : `${label.slice(0,-1)}״${label.slice(-1)}`;
}

function formatGregorianDate(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

@Component({
  selector: 'app-calendar-event-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
<div class="container">
  <!-- Loading -->
  <div *ngIf="loading()" class="loading-state">
    <div class="spinner"></div>
    <span>טוענת...</span>
  </div>

  <!-- Error -->
  <div *ngIf="!loading() && !event()" class="alert alert-error">
    הארוע לא נמצא.
    <a routerLink="/calendar/schedule" class="back-link">חזרה ללוח</a>
  </div>

  <!-- Content -->
  <ng-container *ngIf="event() as ev">

    <!-- Page header -->
    <div class="page-header">
      <div class="header-top">
        <a href="#" class="back-btn" (click)="goBack($event)" title="חזרה">→</a>
        <div class="header-info">
          <h1>{{ ev.title }}</h1>
          <p class="subtitle">
            {{ ev.category }}
            <span class="sep">·</span>
            {{ formatGregorianDate(ev.event_date) }}
            <span *ngIf="hebrewLabel(ev.event_date)" class="sep">·</span>
            <span *ngIf="hebrewLabel(ev.event_date)" class="hebrew-date">{{ hebrewLabel(ev.event_date) }}</span>
          </p>
        </div>
        <span class="source-badge" [class.manual]="ev.source_sheet === 'ידני'">
          {{ ev.source_sheet === 'ידני' ? 'נוסף ידנית' : ev.source_sheet }}
        </span>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost action-btn" (click)="printEvent(ev)">🖨&nbsp;הדפסה</button>
        <button *ngIf="ev.source_sheet === 'ידני' && !editing()" class="btn btn-ghost action-btn" (click)="startEdit(ev)">✏️&nbsp;עריכה</button>
        <button *ngIf="ev.source_sheet === 'ידני'" class="btn btn-danger action-btn" (click)="deleteEvent(ev)">🗑&nbsp;מחיקה</button>
      </div>
    </div>

    <!-- ── Main grid ── -->
    <div class="detail-grid">

      <!-- Info card -->
      <div class="card info-card">
        <div class="section-title">פרטי האירוע</div>

        <div class="info-row">
          <span class="info-label">תאריך לועזי</span>
          <span class="info-value">{{ formatGregorianDate(ev.event_date) }}</span>
        </div>
        <div class="info-row" *ngIf="hebrewLabel(ev.event_date)">
          <span class="info-label">תאריך עברי</span>
          <span class="info-value hebrew-date">{{ hebrewLabel(ev.event_date) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">קטגוריה</span>
          <span class="category-chip" [style.background]="categoryColor(ev) + '22'" [style.color]="categoryColor(ev)">
            {{ ev.category }}
          </span>
        </div>
        <ng-container *ngIf="ev.source_sheet === 'ידני'">
          <div class="info-row">
            <span class="info-label">שעות</span>
            <span class="info-value">{{ ev.all_day ? 'כל היום' : (ev.start_time || '') + '–' + (ev.end_time || '') }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">כיתות</span>
            <span class="info-value">
              {{ ev.class_scope === 'all' ? 'כל הכיתות' : ev.class_scope === 'grade' ? 'שכבה ' + ev.class_year : ev.class_scope === 'class' ? 'כיתה ' + ev.class_year + ev.class_parallel : 'לא הוגדר' }}
            </span>
          </div>
        </ng-container>
        <div class="info-row">
          <span class="info-label">מקור</span>
          <span class="info-value">{{ ev.source_sheet === 'ידני' ? 'נוסף ידנית' : ev.source_sheet }}</span>
        </div>
      </div>

      <!-- Edit / Notes card -->
      <div class="card notes-card">

        <!-- View mode: show notes + edit button for manual events -->
        <ng-container *ngIf="!editing()">
          <div class="section-title">פרטים נוספים</div>
          <div class="notes-display" *ngIf="ev.notes; else noNotes">
            <p class="notes-text">{{ ev.notes }}</p>
          </div>
          <ng-template #noNotes>
            <p class="empty-notes">אין פרטים נוספים עדיין</p>
          </ng-template>
          <div class="notes-actions">
            <button class="btn btn-ghost" (click)="startEdit(ev)">✏️ עריכת פרטים</button>
          </div>
        </ng-container>

        <!-- Edit mode -->
        <ng-container *ngIf="editing()">
          <div class="section-title">עריכת ארוע</div>

          <ng-container *ngIf="ev.source_sheet === 'ידני'">
            <div class="form-group">
              <label>כותרת *</label>
              <input [(ngModel)]="draft.title" placeholder="שם האירוע">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>תאריך</label>
                <input type="date" [(ngModel)]="draft.event_date">
              </div>
              <div class="form-group">
                <label>קטגוריה</label>
                <input [(ngModel)]="draft.category" placeholder="לדוגמה: חג, טיול...">
              </div>
            </div>
          </ng-container>

          <div class="form-group">
            <label>פרטים / הערות</label>
            <textarea
              [(ngModel)]="draft.notes"
              rows="8"
              placeholder="כתבי כאן פרטים על האירוע — תיאור, לו״ז, משתתפים, הנחיות..."></textarea>
          </div>

          <p *ngIf="saveError()" class="alert alert-error save-error">{{ saveError() }}</p>

          <div class="form-actions">
            <button class="btn btn-primary" [disabled]="saving()" (click)="save(ev)">
              {{ saving() ? 'שומר...' : 'שמור שינויים' }}
            </button>
            <button class="btn btn-secondary" [disabled]="saving()" (click)="cancelEdit()">ביטול</button>
          </div>
        </ng-container>

      </div>
    </div>

    <!-- Save success toast -->
    <div *ngIf="savedToast()" class="toast toast-success" role="status">✓ השינויים נשמרו</div>

  </ng-container>
</div>
`,
  styles: [`
    .loading-state {
      display: flex; align-items: center; gap: 12px;
      padding: 40px 0; color: var(--text-muted); font-size: 0.9rem;
    }
    .spinner {
      width: 22px; height: 22px; border: 3px solid var(--border);
      border-top-color: var(--primary); border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Page header ── */
    .page-header {
      display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;
    }
    .header-top {
      display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap;
    }
    .back-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 10px;
      border: 1.5px solid var(--border); color: var(--text-muted);
      font-size: 1.1rem; text-decoration: none; flex-shrink: 0; margin-top: 2px;
      transition: all var(--transition);
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }
    .header-info {
      flex: 1; min-width: 0;
      h1 { font-size: 1.6rem; font-weight: 900; color: var(--text); letter-spacing: -0.5px; margin: 0; }
      .subtitle { font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    }
    .sep { color: var(--border); }
    .hebrew-date { color: var(--primary); font-weight: 700; }
    .source-badge {
      display: inline-flex; align-items: center;
      padding: 4px 12px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;
      background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--border);
      flex-shrink: 0; margin-top: 2px;
      &.manual { background: var(--primary-light); color: var(--primary); border-color: var(--primary); }
    }
    .page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .action-btn { font-size: 0.83rem; }

    /* ── Grid ── */
    .detail-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 700px) {
      .detail-grid { grid-template-columns: 1fr; }
    }

    /* ── Info card ── */
    .info-card { display: flex; flex-direction: column; gap: 0; }
    .section-title {
      font-size: 0.72rem; font-weight: 800; letter-spacing: 0.7px;
      text-transform: uppercase; color: var(--text-muted);
      margin-bottom: 14px; padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .info-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .info-label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
    .info-value { font-size: 0.88rem; color: var(--text); text-align: left; }
    .category-chip {
      display: inline-block; padding: 3px 12px; border-radius: 999px;
      font-size: 0.8rem; font-weight: 700;
    }

    /* ── Notes card ── */
    .notes-card { display: flex; flex-direction: column; gap: 12px; min-height: 240px; }
    .notes-display { flex: 1; }
    .notes-text {
      font-size: 0.93rem; line-height: 1.75; color: var(--text);
      white-space: pre-wrap; word-break: break-word;
    }
    .empty-notes {
      color: var(--text-muted); font-size: 0.88rem; font-style: italic;
      padding: 12px 0;
    }
    .notes-actions { display: flex; }

    /* ── Edit form ── */
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 480px) { .form-row { grid-template-columns: 1fr; } }
    .form-actions { display: flex; gap: 8px; margin-top: 4px; }
    .save-error { margin: 0; }

    /* ── Toast ── */
    .toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 10px 22px; border-radius: 999px; font-size: 0.88rem; font-weight: 700;
      box-shadow: var(--shadow); z-index: 2000; pointer-events: none;
      animation: toastIn 0.25s ease, toastOut 0.3s ease 2s forwards;
    }
    .toast-success { background: var(--success); color: white; }
    @keyframes toastIn  { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes toastOut { from { opacity: 1; } to { opacity: 0; transform: translateX(-50%) translateY(12px); } }

    .back-link { color: var(--primary); margin-right: 8px; }

    /* Print */
    @media print {
      .page-actions, .back-btn, .notes-actions, .form-actions, .toast { display: none !important; }
      .detail-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class CalendarEventDetailComponent implements OnInit {
  event    = signal<CalendarEvent | null>(null);
  loading  = signal(true);
  editing  = signal(false);
  saving   = signal(false);
  saveError = signal('');
  savedToast = signal(false);

  draft: { title: string; event_date: string; category: string; notes: string } =
    { title: '', event_date: '', category: '', notes: '' };

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private api: ApiService,
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.params['id']);
    this.api.getCalendarEventById(id).subscribe({
      next: ev => { this.event.set(ev); this.loading.set(false); },
      error: () => { this.loading.set(false); }
    });
  }

  goBack(e: Event) {
    e.preventDefault();
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/calendar/schedule']);
  }

  hebrewLabel(dateStr: string): string {
    return hebrewDateLabel(dateStr);
  }

  formatGregorianDate(dateStr: string): string {
    return formatGregorianDate(dateStr);
  }

  categoryColor(ev: CalendarEvent): string {
    const palette = ['#0d9488','#0891b2','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f97316','#06b6d4','#84cc16'];
    let hash = 0;
    for (const c of ev.category) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return palette[hash % palette.length];
  }

  startEdit(ev: CalendarEvent) {
    this.draft = { title: ev.title, event_date: ev.event_date, category: ev.category, notes: ev.notes ?? '' };
    this.saveError.set('');
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);
    this.saveError.set('');
  }

  save(ev: CalendarEvent) {
    if (ev.source_sheet === 'ידני' && !this.draft.title.trim()) {
      this.saveError.set('כותרת האירוע חסרה');
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    this.api.updateCalendarEvent(ev.id, {
      title: this.draft.title,
      event_date: this.draft.event_date,
      category: this.draft.category,
      notes: this.draft.notes,
    }).subscribe({
      next: () => {
        this.event.update(e => e ? { ...e, ...this.draft } : e);
        this.saving.set(false);
        this.editing.set(false);
        this.showToast();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err.error?.error || 'שגיאה בשמירה');
      }
    });
  }

  deleteEvent(ev: CalendarEvent) {
    if (!confirm(`למחוק את הארוע "${ev.title}"?`)) return;
    this.api.deleteCalendarEvent(ev.id).subscribe({
      next: () => this.router.navigate(['/calendar/schedule']),
      error: err => alert(err.error?.error || 'שגיאה במחיקה')
    });
  }

  printEvent(ev: CalendarEvent) {
    const hebrew = this.hebrewLabel(ev.event_date);
    const gregorian = this.formatGregorianDate(ev.event_date);
    const notes = (ev.notes ?? '').replace(/\n/g, '<br>');
    const w = window.open('', '_blank')!;
    w.document.write(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${ev.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', 'Segoe UI', sans-serif; direction: rtl; padding: 32px 40px; color: #1e293b; line-height: 1.6; }
    h1 { font-size: 2rem; font-weight: 900; color: #0d9488; margin-bottom: 4px; }
    .meta { font-size: 0.9rem; color: #64748b; margin-bottom: 24px; display: flex; gap: 14px; flex-wrap: wrap; }
    .meta span { display: inline-flex; align-items: center; gap: 4px; }
    .divider { border: none; border-top: 2px solid #e2e8f0; margin: 20px 0; }
    .label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; }
    .notes-body { font-size: 1rem; line-height: 1.75; white-space: pre-wrap; color: #1e293b; }
    .category-chip { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #f0fdfa; color: #0d9488; font-size: 0.8rem; font-weight: 700; border: 1px solid #0d9488; }
    @media print { body { padding: 20px 28px; } }
  </style>
</head>
<body>
  <h1>${ev.title}</h1>
  <div class="meta">
    <span>📅 ${gregorian}</span>
    ${hebrew ? `<span class="hebrew">· ${hebrew}</span>` : ''}
    <span><span class="category-chip">${ev.category}</span></span>
  </div>
  <hr class="divider">
  ${notes ? `<div class="label">פרטים</div><div class="notes-body">${notes}</div>` : '<p style="color:#94a3b8;font-style:italic;">אין פרטים נוספים</p>'}
</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
    setTimeout(() => w.close(), 60000);
  }

  private showToast() {
    this.savedToast.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.savedToast.set(false), 2500);
  }
}

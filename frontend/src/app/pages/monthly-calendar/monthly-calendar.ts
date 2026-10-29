import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HDate, months } from '@hebcal/core';
import { ApiService, CalendarEvent } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Loan } from '../../models';
import { MessagesService, PersonalTask } from '../../services/messages.service';
import { toStudyYear } from '../approvals/study-year';
import { collectTrackNames } from '../../utils/track-names';

// ── Hebrew calendar helpers ──────────────────────────────────
const HEBREW_MONTH_NAMES: Record<number, string> = {
  [months.TISHREI]: 'תשרי', [months.CHESHVAN]: 'חשוון', [months.KISLEV]: 'כסלו',
  [months.TEVET]: 'טבת', [months.SHVAT]: 'שבט', [months.ADAR_I]: 'אדר',
  [months.ADAR_II]: 'אדר ב׳', [months.NISAN]: 'ניסן', [months.IYYAR]: 'אייר',
  [months.SIVAN]: 'סיוון', [months.TAMUZ]: 'תמוז', [months.AV]: 'אב', [months.ELUL]: 'אלול',
};

const HEBREW_DAY_NUMERALS = [
  '', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳',
  'י׳', 'י״א', 'י״ב', 'י״ג', 'י״ד', 'ט״ו', 'ט״ז', 'י״ז', 'י״ח', 'י״ט',
  'כ׳', 'כ״א', 'כ״ב', 'כ״ג', 'כ״ד', 'כ״ה', 'כ״ו', 'כ״ז', 'כ״ח', 'כ״ט', 'ל׳'
];

const MONTHS_IN_COMMON_YEAR = [
  months.TISHREI, months.CHESHVAN, months.KISLEV, months.TEVET, months.SHVAT,
  months.ADAR_I, months.NISAN, months.IYYAR, months.SIVAN, months.TAMUZ, months.AV, months.ELUL
];

const MONTHS_IN_LEAP_YEAR = [
  months.TISHREI, months.CHESHVAN, months.KISLEV, months.TEVET, months.SHVAT,
  months.ADAR_I, months.ADAR_II, months.NISAN, months.IYYAR, months.SIVAN,
  months.TAMUZ, months.AV, months.ELUL
];

function toHebrewYear(year: number): string {
  let value = year % 1000;
  let label = '';
  const values: [number, string][] = [
    [400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],
    [60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],
    [7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']
  ];
  for (const [n, l] of values) { while (value >= n) { label += l; value -= n; } }
  return label.length === 1 ? `${label}׳` : `${label.slice(0, -1)}״${label.slice(-1)}`;
}

// ── Types ────────────────────────────────────────────────────
type CalendarLayer = 'equipment' | 'personal' | 'schedule' | 'exams';

interface CalendarItem {
  kind: 'loan' | 'task' | 'event' | 'exam';
  loan?: Loan;
  task?: PersonalTask;
  event?: CalendarEvent;
  exam?: any;
  completed?: boolean;
}

interface CalendarDay {
  date: string;
  hebrewDay: string;
  gregorianDay: number;
  gregorianMonth: number;
  loans: Loan[];
  tasks: PersonalTask[];
  calendarEvents: CalendarEvent[];
  exams: any[];
}

// ── Context-menu ─────────────────────────────────────────────
interface CtxMenu {
  x: number;
  y: number;
  date: string;
}

@Component({
  selector: 'app-monthly-calendar',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
<!-- Context menu (right-click) -->
<div *ngIf="ctxMenu()" class="ctx-menu"
     [style.top.px]="ctxMenu()!.y" [style.left.px]="ctxMenu()!.x">
  <div class="ctx-header">{{ formatShortDate(ctxMenu()!.date) }}</div>
  <button (click)="openAddTask()"> הוספת משימה</button>
  <button (click)="openAddExam()"> הוספת מבחן</button>
  <button (click)="openAddEvent()"> הוספת אירוע</button>
</div>

<!-- Add-task dialog -->
<div *ngIf="addTaskOpen()" class="modal-backdrop" (click)="closeDialogs()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <div class="modal-title"> משימה חדשה ל-{{ formatShortDate(selectedDate()) }}</div>
    <div class="form-group">
      <label>כותרת *</label>
      <input [(ngModel)]="newTask.title" placeholder="מה צריך לעשות?" (keyup.enter)="saveTask()">
    </div>
    <div class="form-group">
      <label>מי יכול לראות?</label>
      <div class="visibility-toggle">
        <button [class.active]="newTask.visibility==='private'" (click)="newTask.visibility='private'">
           רק אני
        </button>
        <button [class.active]="newTask.visibility==='public'" (click)="newTask.visibility='public'">
           כולם
        </button>
      </div>
      <p class="hint">משימה ציבורית תראה לכל הצוות בלוח האישי שלהם</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" [disabled]="!newTask.title.trim()" (click)="saveTask()">שמור</button>
      <button class="btn btn-secondary" (click)="closeDialogs()">ביטול</button>
    </div>
    <p *ngIf="dialogError()" class="hint" style="color:var(--danger)">{{ dialogError() }}</p>
  </div>
</div>

<!-- Add-exam dialog -->
<div *ngIf="addExamOpen()" class="modal-backdrop" (click)="closeDialogs()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <div class="modal-title"> מבחן חדש ל-{{ formatShortDate(selectedDate()) }}</div>
    <div class="form-group">
      <label>שם המבחן *</label>
      <input [(ngModel)]="newExam.name" placeholder="לדוגמה: מבחן עברית מחצית א'" (keyup.enter)="saveExam()">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>מסלול</label>
        <select [(ngModel)]="newExam.track">
          <option value="">כל המסלולים</option>
          <option *ngFor="let t of trackOptions()" [value]="t">{{ t }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>שנה</label>
        <select [(ngModel)]="newExam.year">
          <option value="">כל השנים</option>
          <option *ngFor="let y of yearOptions()" [value]="y">{{ toStudyYear(y) }}</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" [disabled]="!newExam.name.trim()" (click)="saveExam()">שמור</button>
      <button class="btn btn-secondary" (click)="closeDialogs()">ביטול</button>
    </div>
    <p *ngIf="dialogError()" class="hint" style="color:var(--danger)">{{ dialogError() }}</p>
  </div>
</div>

<!-- Add-event dialog -->
<div *ngIf="addEventOpen()" class="modal-backdrop" (click)="closeDialogs()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <div class="modal-title"> אירוע חדש ל-{{ formatShortDate(selectedDate()) }}</div>
    <div class="form-group">
      <label>כותרת *</label>
      <input [(ngModel)]="newEvent.title" placeholder="שם האירוע" (keyup.enter)="saveEvent()">
    </div>
    <div class="form-group">
      <label>קטגוריה</label>
      <input [(ngModel)]="newEvent.category" placeholder="לדוגמה: חג, טיול, בחינות...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" [disabled]="!newEvent.title.trim()" (click)="saveEvent()">שמור</button>
      <button class="btn btn-secondary" (click)="closeDialogs()">ביטול</button>
    </div>
    <p *ngIf="dialogError()" class="hint" style="color:var(--danger)">{{ dialogError() }}</p>
  </div>
</div>

<!-- ── Main layout ── -->
<div class="page-header">
  <div>
    <h1>📅 לוח שנה</h1>
    <p class="subtitle">תצוגה חודשית לפי הלוח העברי</p>
  </div>
</div>

<div class="month-toolbar">
  <button type="button" class="month-nav" (click)="changeMonth(-1)" aria-label="החודש הקודם">‹</button>
  <div class="month-heading">
    <h2>{{ monthName() }} {{ hebrewYearLabel() }}</h2>
    <span>{{ gregorianRangeLabel() }}</span>
  </div>
  <button type="button" class="today-btn" (click)="goToToday()" title="קפוץ להיום">היום</button>
  <button type="button" class="month-nav" (click)="changeMonth(1)" aria-label="החודש הבא">›</button>
</div>

<!-- Layer chips with month badge counts -->
<nav class="calendar-tabs" role="group" aria-label="בחירת לוחות להצגה">
  <button type="button" class="layer-chip" [class.active]="has('equipment')"
          (click)="toggleLayer('equipment')">
    השאלת ציוד
    <span class="chip-badge" *ngIf="monthBadge('equipment') as n">{{ n }}</span>
  </button>
  <button type="button" class="layer-chip" [class.active]="has('personal')"
          (click)="toggleLayer('personal')">
    הלוח האישי
    <span class="chip-badge" *ngIf="monthBadge('personal') as n">{{ n }}</span>
  </button>
  <button type="button" class="layer-chip" [class.active]="has('schedule')"
          (click)="toggleLayer('schedule')">
    לוח אירועים
    <span class="chip-badge" *ngIf="monthBadge('schedule') as n">{{ n }}</span>
  </button>
  <button type="button" class="layer-chip" [class.active]="has('exams')"
          (click)="toggleLayer('exams')">
    לוח מבחנים
    <span class="chip-badge" *ngIf="monthBadge('exams') as n">{{ n }}</span>
  </button>
</nav>

<!-- Sheet sub-tabs (only when schedule active) -->
<nav *ngIf="has('schedule') && calendarSheets().length"
     class="sheet-tabs" role="tablist">
  <button type="button" [class.active]="selectedSourceSheet()===null"
          (click)="selectSourceSheet(null)">כל הגיליונות</button>
  <button *ngFor="let sheet of calendarSheets()" type="button"
          [class.active]="selectedSourceSheet()===sheet"
          (click)="selectSourceSheet(sheet)">{{ sheet }}</button>
</nav>

<!-- Upload panel (admin/secretary, schedule active) -->
<section *ngIf="has('schedule') && canImportCalendar()" class="upload-panel">
  <label class="upload-button" [class.uploading]="uploading">
    <input type="file" accept=".xlsx" [disabled]="uploading" (change)="onCalendarFileSelected($event)">
    {{ uploading ? 'מעלה ומייבאת...' : '📤 העלאת לוח שנה מאקסל' }}
  </label>
  <span class="upload-help">קובץ Excel ‎.xlsx — אירועים מהגיליונות יישמרו בלוח האירועים</span>
  <p *ngIf="uploadMessage" class="upload-success" role="status">{{ uploadMessage }}</p>
  <p *ngIf="uploadError"   class="upload-error"   role="alert">{{ uploadError }}</p>
</section>

<div *ngIf="loadError" class="calendar-error" role="alert">{{ loadError }}</div>
<p *ngIf="!layers().size"  class="empty-state">בחרי לפחות לוח אחד להצגה</p>

<!-- Legend -->
<div class="calendar-legend">
  <span class="legend-item" *ngIf="has('equipment')"><span class="legend-dot equipment-dot"></span> ציוד מושאל</span>
  <span class="legend-item" *ngIf="has('personal')">
    <span class="legend-dot task-dot"></span> משימה פרטית
    <span class="legend-dot public-task-dot"></span> משימה ציבורית
    <span class="legend-dot completed-dot"></span> בוצעה
  </span>
  <span class="legend-item" *ngIf="has('schedule')"><span class="legend-dot event-sample-dot"></span> אירוע (צבע לפי קטגוריה)</span>
  <span class="legend-item" *ngIf="has('exams')"><span class="legend-dot exam-dot"></span> מבחן</span>
  <span class="legend-hint">לחצי ימני על יום להוספה מהירה</span>
</div>

<!-- ── Calendar grid ── -->
<section class="month-card" [attr.aria-label]="'לוח חודש ' + monthName()">
  <div class="month-grid">
    <span *ngFor="let dayName of dayNames" class="weekday">{{ dayName }}</span>

    <ng-container *ngFor="let day of monthCells()">
      <span *ngIf="!day" class="empty-day" aria-hidden="true"></span>

      <button *ngIf="day as cd" type="button" class="calendar-day"
              [class.today]="cd.date === today"
              [class.selected]="selectedDate() === cd.date"
              [class.has-exam]="has('exams') && cd.exams.length > 0"
              [attr.aria-label]="dayLabel(cd)"
              (click)="selectDate(cd.date)"
              (contextmenu)="onRightClick($event, cd.date)">

        <span class="day-numbers">
          <span class="hebrew-day">{{ cd.hebrewDay }}</span>
          <span class="gregorian-day">{{ cd.gregorianDay }}<span *ngIf="cd.gregorianDay===1">/{{ cd.gregorianMonth }}</span></span>
        </span>

        <!-- Schedule-only: text labels -->
        <span *ngIf="visibleItems(cd).length && onlyScheduleOrExams()"
              class="schedule-event-labels" aria-hidden="true">
          <span *ngFor="let item of visibleItems(cd).slice(0,2)" class="schedule-event-label"
                [style.border-inline-start-color]="item.kind==='exam' ? '#e11d48' : schoolEventColor(item.event!)">
            {{ item.kind==='exam' ? '📝 '+item.exam!.name : item.event?.title }}
          </span>
          <span *ngIf="visibleItems(cd).length > 2" class="more-events">+{{ visibleItems(cd).length-2 }}</span>
        </span>

        <!-- Mixed: dots -->
        <span *ngIf="visibleItems(cd).length && !onlyScheduleOrExams()"
              class="event-markers" aria-hidden="true">
          <span *ngFor="let item of visibleItems(cd).slice(0,4)" class="event-dot"
                [class.task-dot]="item.kind==='task' && item.task?.visibility==='private'"
                [class.public-task-dot]="item.kind==='task' && item.task?.visibility==='public'"
                [class.completed-dot]="item.kind==='task' && item.completed"
                [style.background]="dotColor(item)"></span>
          <span *ngIf="visibleItems(cd).length > 4" class="more-events">+{{ visibleItems(cd).length-4 }}</span>
        </span>

        <!-- Tooltip -->
        <span *ngIf="visibleItems(cd).length" class="day-tooltip" role="tooltip">
          <span *ngFor="let item of visibleItems(cd)">
            <ng-container *ngIf="item.kind==='loan'">🎥 {{ item.loan?.equipment_name }} · {{ item.loan?.borrower_name }}</ng-container>
            <ng-container *ngIf="item.kind==='task'">{{ item.completed ? '✅' : (item.task?.visibility==='public' ? '🌐' : '📌') }} {{ item.task?.title }}<span *ngIf="item.task?.visibility==='public'"> ({{ item.task?.creator_name }})</span></ng-container>
            <ng-container *ngIf="item.kind==='event'">📅 {{ item.event?.title }}</ng-container>
            <ng-container *ngIf="item.kind==='exam'">📝 {{ item.exam?.name }}{{ item.exam?.track ? ' · '+item.exam?.track : '' }}</ng-container>
          </span>
        </span>
      </button>
    </ng-container>
  </div>
</section>

<!-- ── Selected-day panel ── -->
<section class="selected-day-card">
  <div class="day-panel-header">
    <h2>{{ selectedDateLabel() }}</h2>
    <div class="day-quick-add">
      <button class="btn-quick" (click)="openAddTaskForSelected()">+ משימה</button>
      <button class="btn-quick" (click)="openAddExamForSelected()">+ מבחן</button>
      <button class="btn-quick" (click)="openAddEventForSelected()">+ אירוע</button>
    </div>
  </div>

  <p *ngIf="layers().size && !selectedDayCount()" class="empty-state">
    אין פריטים ביום זה — לחצי ימין על יום בלוח להוספה מהירה
  </p>

  <!-- Equipment -->
  <ng-container *ngIf="has('equipment') && selectedDayLoans().length">
    <h3 class="layer-title">📦 השאלת ציוד</h3>
    <div *ngFor="let loan of selectedDayLoans()" class="detail-row">
      <span class="detail-dot" [style.background]="loanColor(loan)"></span>
      <div class="detail-main">
        <a [routerLink]="['/equipment', loan.equipment_id]">{{ loan.equipment_name }}</a>
        <span>{{ loan.borrower_name }}{{ loan.track ? ' — '+loan.track : '' }}</span>
      </div>
      <span class="detail-date">{{ loan.loan_date }} → {{ loan.expected_return }}</span>
    </div>
  </ng-container>

  <!-- Personal tasks -->
  <ng-container *ngIf="has('personal') && selectedDayTasks().length">
    <h3 class="layer-title">📌 הלוח האישי</h3>
    <div *ngFor="let task of selectedDayTasks()" class="detail-row" [class.completed]="task.completed">
      <button type="button" class="task-check"
              [attr.aria-pressed]="task.completed"
              [disabled]="updatingTaskId===task.id"
              (click)="toggleTask(task)">{{ task.completed ? '✔' : '' }}</button>
      <div class="detail-main">
        <span class="task-title">{{ task.title }}</span>
        <span *ngIf="task.visibility==='public'" class="task-public-badge">🌐 ציבורי · {{ task.creator_name }}</span>
      </div>
      <button *ngIf="task.user_id === currentUserId()" class="del-task-btn" title="מחק" (click)="deleteTask(task)">✕</button>
    </div>
  </ng-container>

  <!-- Schedule events -->
  <ng-container *ngIf="has('schedule') && selectedDayEvents().length">
    <h3 class="layer-title">📅 לוח אירועים</h3>
    <div *ngFor="let event of selectedDayEvents()" class="detail-row">
      <span class="detail-dot" [style.background]="schoolEventColor(event)"></span>
      <div class="detail-main">
        <strong>{{ event.title }}</strong>
        <span>{{ event.category }}{{ event.source_sheet ? ' · '+event.source_sheet : '' }}</span>
      </div>
    </div>
  </ng-container>

  <!-- Exams -->
  <ng-container *ngIf="has('exams') && selectedDayExams().length">
    <h3 class="layer-title">📝 מבחנים</h3>
    <div *ngFor="let exam of selectedDayExams()" class="detail-row">
      <span class="detail-dot exam-dot"></span>
      <div class="detail-main">
        <a [routerLink]="['/exams', exam.id, 'print']"><strong>{{ exam.name }}</strong></a>
        <span>{{ exam.track || 'כל המסלולים' }}{{ exam.year ? ' · '+toStudyYear(exam.year) : '' }}
              · {{ exam.codes_count || 0 }} ברקודים · ממוצע {{ exam.avg_grade ?? '—' }}</span>
      </div>
      <div class="exam-row-btns">
        <a [routerLink]="['/exams', exam.id, 'edit']" class="btn-quick">✏️ עריכה</a>
        <a [routerLink]="['/exams', exam.id, 'print']" class="btn-quick">🖨 הדפסה</a>
      </div>
    </div>
  </ng-container>
</section>
`,
  styles: [`
    /* ── Context menu ── */
    .ctx-menu {
      position: fixed; z-index: 1000; min-width: 180px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,.18);
      overflow: hidden;
    }
    .ctx-header {
      padding: 8px 14px; font-size: 0.78rem; font-weight: 700;
      color: var(--text-muted); background: var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    .ctx-menu button {
      display: block; width: 100%; text-align: right; padding: 10px 14px;
      border: none; background: transparent; font: inherit; font-size: 0.88rem;
      cursor: pointer; color: var(--text);
      &:hover { background: var(--primary-light); color: var(--primary); }
    }

    /* ── Modal ── */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,.4);
      display: flex; align-items: center; justify-content: center;
    }
    .modal-card {
      background: var(--surface); border-radius: var(--radius); padding: 24px;
      width: min(420px, 95vw); box-shadow: 0 16px 40px rgba(0,0,0,.25);
      display: flex; flex-direction: column; gap: 12px;
    }
    .modal-title {
      font-size: 1rem; font-weight: 800; color: var(--primary); margin-bottom: 4px;
    }
    .modal-actions { display: flex; gap: 8px; }
    .form-group { display: flex; flex-direction: column; gap: 4px;
      label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); }
      input, select { height: 38px; padding: 0 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font: inherit; background: var(--surface); }
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .visibility-toggle { display: flex; gap: 6px;
      button { flex: 1; padding: 8px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); font: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer;
        &.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } }
    }
    .hint { font-size: 0.75rem; color: var(--text-muted); margin: 0; line-height: 1.5; }

    /* ── Toolbar ── */
    .month-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin: 0 0 14px; padding: 10px 14px;
      border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface); box-shadow: var(--shadow-sm);
    }
    .month-heading { flex: 1; text-align: center;
      h2 { margin: 0; color: var(--primary); font-size: 1.1rem; }
      span { color: var(--text-muted); font-size: 0.78rem; }
    }
    .month-nav {
      width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--primary); font-size: 1.2rem; cursor: pointer;
    }
    .today-btn {
      padding: 5px 12px; border: 1.5px solid var(--primary); border-radius: 8px;
      background: var(--surface); color: var(--primary); font: inherit; font-size: 0.78rem;
      font-weight: 700; cursor: pointer;
      &:hover { background: var(--primary-light); }
    }

    /* ── Layer chips ── */
    .calendar-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
    .layer-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 999px; border: 1.5px solid var(--border);
      background: var(--surface); color: var(--text-muted); font: inherit; font-weight: 700;
      cursor: pointer; transition: all var(--transition);
      &:hover { border-color: var(--primary); color: var(--primary); }
      &.active { background: var(--primary); border-color: var(--primary); color: #fff; box-shadow: var(--shadow-sm); }
    }
    .chip-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      background: rgba(255,255,255,.3); color: inherit; border-radius: 999px;
      font-size: 0.7rem; font-weight: 800;
    }
    .layer-chip:not(.active) .chip-badge { background: var(--primary-light); color: var(--primary); }

    /* ── Sheet sub-tabs ── */
    .sheet-tabs {
      display: flex; gap: 6px; overflow-x: auto; margin: -4px 0 14px; padding: 4px 2px 8px;
      scrollbar-width: thin;
      button {
        flex: 0 0 auto; padding: 7px 13px; border: 1px solid var(--border); border-radius: 999px;
        background: var(--surface); color: var(--text-muted); cursor: pointer; font: inherit;
        font-size: 0.83rem; font-weight: 700; white-space: nowrap;
        &:hover { border-color: var(--primary); color: var(--primary); }
        &.active { border-color: var(--primary); background: var(--primary); color: white; }
      }
    }

    /* ── Upload panel ── */
    .upload-panel {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      margin: 0 0 14px; padding: 12px; border: 1px solid var(--border);
      border-radius: 10px; background: var(--surface);
    }
    .upload-button {
      display: inline-flex; align-items: center; gap: 8px;
      min-height: 36px; padding: 7px 14px; border-radius: 8px;
      background: var(--primary); color: white; cursor: pointer; font-weight: 700; font-size: 0.88rem;
      &.uploading { opacity: .65; cursor: wait; }
      input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    }
    .upload-help { color: var(--text-muted); font-size: 0.78rem; }
    .upload-success { flex-basis: 100%; margin: 0; font-size: 0.83rem; color: var(--success); }
    .upload-error   { flex-basis: 100%; margin: 0; font-size: 0.83rem; color: var(--danger); }

    /* ── Legend ── */
    .calendar-legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
      margin: 0 0 12px; color: var(--text-muted); font-size: 0.78rem;
    }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .legend-hint { margin-right: auto; font-size: 0.72rem; color: var(--text-muted); font-style: italic; }
    .equipment-dot  { background: #0d9488; }
    .task-dot       { background: #6366f1; }
    .public-task-dot{ background: #f59e0b; }
    .completed-dot  { background: #10b981; }
    .exam-dot       { background: #e11d48; }
    .event-sample-dot { background: #0891b2; }

    /* ── Calendar grid ── */
    .month-card {
      padding: 10px; border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--surface); box-shadow: var(--shadow-sm);
    }
    .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
    .weekday { padding: 6px 0; color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-align: center; }
    .calendar-day, .empty-day {
      position: relative; min-width: 0; min-height: 82px; padding: 6px;
      border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--text);
    }
    .calendar-day {
      display: flex; flex-direction: column; align-items: stretch;
      cursor: pointer; font: inherit;
      &:hover, &:focus-visible { z-index: 2; border-color: var(--primary); background: var(--primary-light); }
      &.today { border-color: var(--primary); }
      &.selected { border-color: var(--primary); background: var(--primary); color: white; }
      &.has-exam { border-bottom: 3px solid #e11d48; }
    }
    .day-numbers { display: flex; justify-content: space-between; align-items: baseline; gap: 2px; }
    .hebrew-day { font-size: 0.88rem; font-weight: 700; }
    .gregorian-day { color: var(--text-muted); font-size: 0.7rem; direction: ltr; }
    .calendar-day.today .hebrew-day { color: var(--primary); }
    .calendar-day.selected .hebrew-day,
    .calendar-day.selected .gregorian-day { color: white; }

    .event-markers { display: flex; align-items: center; gap: 2px; margin-top: auto; min-height: 8px; }
    .event-dot { width: 8px; height: 8px; flex-basis: 8px; border-radius: 50%; }
    .schedule-event-labels { display: grid; gap: 2px; overflow: hidden; margin-top: auto; }
    .schedule-event-label {
      overflow: hidden; padding-inline-start: 4px; border-inline-start: 2px solid;
      font-size: 0.67rem; text-overflow: ellipsis; white-space: nowrap;
    }
    .more-events { color: var(--text-muted); font-size: 0.62rem; }

    .day-tooltip {
      display: none; position: absolute; z-index: 10; right: 50%; bottom: calc(100% + 6px);
      transform: translateX(50%); width: max-content; max-width: min(230px, 75vw);
      padding: 8px 10px; border-radius: 8px;
      background: #1e1e2e; box-shadow: 0 4px 16px rgba(0,0,0,.28);
      color: white; text-align: right; pointer-events: none;
      span { display: block; font-size: 0.77rem; line-height: 1.55; overflow-wrap: anywhere; }
    }
    .calendar-day:hover .day-tooltip,
    .calendar-day:focus-visible .day-tooltip { display: block; }

    /* ── Selected-day card ── */
    .selected-day-card {
      margin-top: 16px; padding: 14px; border: 1px solid var(--border);
      border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm);
    }
    .day-panel-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
      h2 { margin: 0; font-size: 0.95rem; }
    }
    .day-quick-add { display: flex; gap: 6px; }
    .btn-quick {
      padding: 5px 10px; border: 1.5px solid var(--border); border-radius: 6px;
      background: var(--surface); font: inherit; font-size: 0.78rem; font-weight: 700;
      cursor: pointer; color: var(--text-muted); text-decoration: none; display: inline-flex; align-items: center;
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }
    .layer-title { margin: 14px 0 6px; font-size: 0.88rem; font-weight: 700; color: var(--text-muted); }
    .detail-row {
      display: flex; align-items: center; gap: 10px; min-height: 40px; margin-top: 6px;
      padding: 7px 10px; border: 1px solid var(--border); border-radius: 9px;
      background: var(--surface-2);
    }
    .detail-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0;
      a { color: var(--primary); font-weight: 700; text-decoration: none; }
      span { color: var(--text-muted); font-size: 0.75rem; }
    }
    .detail-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .detail-date { color: var(--text-muted); font-size: 0.75rem; direction: ltr; white-space: nowrap; }

    .task-check {
      flex: 0 0 23px; width: 23px; height: 23px; border: 1.5px solid var(--primary);
      border-radius: 6px; background: var(--surface); color: white;
      cursor: pointer; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
    }
    .detail-row.completed .task-check { background: var(--primary); }
    .detail-row.completed .task-title { color: var(--text-muted); text-decoration: line-through; }
    .task-title { overflow-wrap: anywhere; font-size: 0.88rem; }
    .task-public-badge { font-size: 0.72rem; color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 20px; }
    .del-task-btn {
      border: none; background: transparent; cursor: pointer; font-size: 0.85rem;
      color: var(--text-muted); padding: 4px; border-radius: 4px;
      &:hover { color: var(--danger); background: #fee2e2; }
    }
    .exam-row-btns { display: flex; gap: 4px; flex-shrink: 0; }

    .empty-state { color: var(--text-muted); font-size: 0.85rem; }
    .calendar-error { color: var(--danger); font-size: 0.85rem; margin-bottom: 10px; }

    @media (max-width: 560px) {
      .month-card { padding: 6px; }
      .calendar-day, .empty-day { min-height: 62px; padding: 4px; }
      .weekday { font-size: 0.65rem; }
      .hebrew-day { font-size: 0.78rem; }
      .gregorian-day { font-size: 0.62rem; }
      .day-quick-add { display: none; }
    }
  `]
})
export class MonthlyCalendarComponent implements OnInit, OnDestroy {

  readonly dayNames = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
  readonly today = this.toDateString(new Date());

  // ── Layers ──
  readonly layers = signal<Set<CalendarLayer>>(new Set<CalendarLayer>(['equipment']));

  // ── Date navigation ──
  private readonly _init = new HDate(new Date());
  readonly displayedYear  = signal(this._init.getFullYear());
  readonly displayedMonth = signal(this._init.getMonth());
  readonly selectedDate   = signal(this.today);

  // ── Data ──
  readonly loans          = signal<Loan[]>([]);
  readonly tasks          = signal<PersonalTask[]>([]);
  readonly calendarEvents = signal<CalendarEvent[]>([]);
  readonly exams          = signal<any[]>([]);
  readonly allStudents    = signal<any[]>([]);

  // ── Schedule sheet filter ──
  readonly selectedSourceSheet = signal<string | null>(null);
  readonly calendarSheets = computed(() =>
    [...new Set(this.calendarEvents().map(e => e.source_sheet))].sort((a,b) => a.localeCompare(b,'he'))
  );

  // ── Computed cells ──
  readonly monthCells = computed(() => this.buildMonthCells());

  readonly selectedDayLoans  = computed(() => this.loansForDate(this.selectedDate()));
  readonly selectedDayTasks  = computed(() => this.tasksForDate(this.selectedDate()));
  readonly selectedDayEvents = computed(() => this.eventsForDate(this.selectedDate()));
  readonly selectedDayExams  = computed(() => this.examsForDate(this.selectedDate()));

  readonly selectedDayCount = computed(() =>
    (this.has('equipment') ? this.selectedDayLoans().length  : 0) +
    (this.has('personal')  ? this.selectedDayTasks().length  : 0) +
    (this.has('schedule')  ? this.selectedDayEvents().length : 0) +
    (this.has('exams')     ? this.selectedDayExams().length  : 0)
  );

  readonly selectedDateLabel = computed(() => this.formatDateLabel(this.selectedDate()));

  // ── Context menu ──
  readonly ctxMenu = signal<CtxMenu | null>(null);

  // ── Dialogs ──
  readonly addTaskOpen  = signal(false);
  readonly addExamOpen  = signal(false);
  readonly addEventOpen = signal(false);
  readonly dialogError  = signal('');

  newTask  = { title: '', visibility: 'private' as 'private' | 'public' };
  newExam  = { name: '', track: '', year: '' };
  newEvent = { title: '', category: '' };

  // ── Upload / misc ──
  loadError     = '';
  uploadError   = '';
  uploadMessage = '';
  uploading     = false;
  updatingTaskId: number | null = null;

  private colorMap = new Map<number, string>();
  private readonly colors = ['#0d9488','#0891b2','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f97316','#06b6d4','#84cc16'];
  private readonly eventColors = ['#0d9488','#0891b2','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#84cc16'];
  private readonly destroy$ = new Subject<void>();

  toStudyYear = toStudyYear;

  constructor(
    private api: ApiService,
    private messages: MessagesService,
    private route: ActivatedRoute,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.data.subscribe(data => {
      const view = data['view'];
      this.layers.set(new Set<CalendarLayer>([
        view === 'personal' || view === 'schedule' ? view : 'equipment'
      ]));
    });

    this.route.queryParamMap.subscribe(params => {
      const d = params.get('date');
      if (d && this.isValidDate(d)) {
        this.selectedDate.set(d);
        const hd = new HDate(new Date(`${d}T12:00:00`));
        this.displayedYear.set(hd.getFullYear());
        this.displayedMonth.set(hd.getMonth());
      }
    });

    this.loadAll();
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadAll());
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  private loadAll() {
    this.api.getLoans().subscribe({ next: v => this.loans.set(v), error: () => {} });
    this.messages.getTasks().subscribe({ next: v => this.tasks.set(v), error: () => {} });
    this.api.getCalendarEvents().subscribe({ next: v => this.calendarEvents.set(v), error: () => {} });
    this.api.getExams().subscribe({ next: v => this.exams.set(v), error: () => {} });
    this.api.getStudents().subscribe({ next: v => this.allStudents.set(v), error: () => {} });
  }

  // ── Layer helpers ──
  has(l: CalendarLayer) { return this.layers().has(l); }

  toggleLayer(l: CalendarLayer) {
    const s = new Set(this.layers());
    if (!s.delete(l)) s.add(l);
    this.layers.set(s);
  }

  onlyScheduleOrExams() {
    return [...this.layers()].every(l => l === 'schedule' || l === 'exams');
  }

  // ── Badge counts for current month ──
  monthBadge(layer: CalendarLayer): number {
    const cells = this.monthCells().filter((c): c is CalendarDay => c !== null);
    if (layer === 'equipment') return cells.reduce((s, c) => s + c.loans.length, 0);
    if (layer === 'personal')  return cells.reduce((s, c) => s + c.tasks.length, 0);
    if (layer === 'schedule')  return cells.reduce((s, c) => s + c.calendarEvents.length, 0);
    if (layer === 'exams')     return cells.reduce((s, c) => s + c.exams.length, 0);
    return 0;
  }

  // ── Data helpers ──
  private loansForDate(date: string): Loan[] {
    return this.loans().filter(l =>
      !l.actual_return && l.loan_date <= date && l.expected_return >= date &&
      l.category !== 'מצלמות אישיות' && l.category !== 'מחשב נייד'
    );
  }

  private tasksForDate(date: string): PersonalTask[] {
    return this.tasks().filter(t => t.due_date === date);
  }

  private examsForDate(date: string): any[] {
    return this.exams().filter(e => e.exam_date === date);
  }

  private eventsForDate(date: string): CalendarEvent[] {
    const sheet = this.selectedSourceSheet();
    const events = this.calendarEvents().filter(e =>
      e.event_date === date && (sheet === null || e.source_sheet === sheet)
    );
    const seen = new Map<string, CalendarEvent>();
    for (const ev of events) {
      const k = `${ev.source_sheet}\x00${ev.title}\x00${ev.category}`;
      if (!seen.has(k)) seen.set(k, ev);
    }
    return [...seen.values()];
  }

  visibleItems(day: CalendarDay): CalendarItem[] {
    return [
      ...(this.has('equipment') ? day.loans.map((loan): CalendarItem => ({ kind: 'loan', loan })) : []),
      ...(this.has('personal')  ? day.tasks.map((task): CalendarItem => ({ kind: 'task', task, completed: task.completed })) : []),
      ...(this.has('schedule')  ? day.calendarEvents.map((event): CalendarItem => ({ kind: 'event', event })) : []),
      ...(this.has('exams')     ? day.exams.map((exam): CalendarItem => ({ kind: 'exam', exam })) : []),
    ];
  }

  // ── Calendar build ──
  private buildMonthCells(): (CalendarDay | null)[] {
    const year = this.displayedYear(), month = this.displayedMonth();
    const count = HDate.daysInMonth(month, year);
    const firstWd = new HDate(1, month, year).getDay();
    const cells: (CalendarDay | null)[] = Array.from({ length: firstWd }, () => null);
    for (let d = 1; d <= count; d++) {
      const hd = new HDate(d, month, year);
      const gr = hd.greg();
      const date = this.toDateString(gr);
      cells.push({
        date, hebrewDay: HEBREW_DAY_NUMERALS[d],
        gregorianDay: gr.getDate(), gregorianMonth: gr.getMonth() + 1,
        loans: this.loansForDate(date), tasks: this.tasksForDate(date),
        calendarEvents: this.eventsForDate(date), exams: this.examsForDate(date),
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  // ── Navigation ──
  changeMonth(dir: -1 | 1) {
    const months = this.monthNumbers(this.displayedYear());
    let idx = months.indexOf(this.displayedMonth()) + dir;
    let yr = this.displayedYear();
    if (idx < 0) { yr--; idx = this.monthNumbers(yr).length - 1; }
    else if (idx >= months.length) { yr++; idx = 0; }
    const m = this.monthNumbers(yr)[idx];
    this.displayedYear.set(yr); this.displayedMonth.set(m);
    this.selectedDate.set(this.toDateString(new HDate(1, m, yr).greg()));
  }

  goToToday() {
    const hd = new HDate(new Date());
    this.displayedYear.set(hd.getFullYear());
    this.displayedMonth.set(hd.getMonth());
    this.selectedDate.set(this.today);
  }

  selectDate(date: string) { this.selectedDate.set(date); }

  selectSourceSheet(s: string | null) { this.selectedSourceSheet.set(s); }

  // ── Context menu ──
  onRightClick(ev: MouseEvent, date: string) {
    ev.preventDefault();
    this.selectDate(date);
    this.ctxMenu.set({ x: ev.clientX, y: ev.clientY, date });
  }

  @HostListener('document:click')
  @HostListener('document:contextmenu')
  closeCtxMenu() { this.ctxMenu.set(null); }

  // ── Dialogs: open ──
  openAddTask() {
    this.ctxMenu.set(null);
    this.newTask = { title: '', visibility: 'private' };
    this.dialogError.set('');
    this.addTaskOpen.set(true);
  }
  openAddTaskForSelected() { this.openAddTask(); }

  openAddExam() {
    this.ctxMenu.set(null);
    this.newExam = { name: '', track: '', year: '' };
    this.dialogError.set('');
    this.addExamOpen.set(true);
  }
  openAddExamForSelected() { this.openAddExam(); }

  openAddEvent() {
    this.ctxMenu.set(null);
    this.newEvent = { title: '', category: '' };
    this.dialogError.set('');
    this.addEventOpen.set(true);
  }
  openAddEventForSelected() { this.openAddEvent(); }

  closeDialogs() {
    this.addTaskOpen.set(false);
    this.addExamOpen.set(false);
    this.addEventOpen.set(false);
    this.dialogError.set('');
  }

  // ── Save actions ──
  saveTask() {
    const title = this.newTask.title.trim();
    if (!title) return;
    this.messages.createTask(title, this.selectedDate(), this.newTask.visibility).subscribe({
      next: task => {
        this.tasks.update(ts => [...ts, task]);
        this.closeDialogs();
        if (!this.has('personal')) this.toggleLayer('personal');
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  saveExam() {
    const name = this.newExam.name.trim();
    if (!name) return;
    this.api.createExam({
      name,
      track: this.newExam.track || undefined,
      year: this.newExam.year || undefined,
      exam_date: this.selectedDate()
    }).subscribe({
      next: () => {
        this.api.getExams().subscribe(v => this.exams.set(v));
        this.closeDialogs();
        if (!this.has('exams')) this.toggleLayer('exams');
        // ניווט לטאב מבחנים
        this.router.navigate(['/calendar/exams'], { queryParams: { date: this.selectedDate() } });
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  saveEvent() {
    const title = this.newEvent.title.trim();
    if (!title) return;
    // שמירה דרך API — נשתמש ב-route החדש שניצור
    this.api.createCalendarEvent({
      title,
      event_date: this.selectedDate(),
      category: this.newEvent.category.trim() || 'כללי',
      source_sheet: 'ידני'
    }).subscribe({
      next: () => {
        this.api.getCalendarEvents().subscribe(v => this.calendarEvents.set(v));
        this.closeDialogs();
        if (!this.has('schedule')) this.toggleLayer('schedule');
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  // ── Task actions ──
  toggleTask(task: PersonalTask) {
    if (this.updatingTaskId !== null) return;
    this.updatingTaskId = task.id;
    this.messages.setTaskCompleted(task.id, !task.completed).subscribe({
      next: () => {
        this.tasks.update(ts => ts.map(t => t.id === task.id ? { ...t, completed: !task.completed } : t));
        this.updatingTaskId = null;
      },
      error: () => { this.updatingTaskId = null; }
    });
  }

  deleteTask(task: PersonalTask) {
    if (!confirm(`למחוק את המשימה "${task.title}"?`)) return;
    this.messages.deleteTask(task.id).subscribe({
      next: () => this.tasks.update(ts => ts.filter(t => t.id !== task.id)),
      error: e => this.loadError = e.error?.error || 'מחיקה נכשלה'
    });
  }

  // ── Current user ──
  currentUserId() { return this.auth.user()?.id ?? -1; }

  // ── Colors ──
  loanColor(loan: Loan): string {
    if (!this.colorMap.has(loan.equipment_id)) {
      this.colorMap.set(loan.equipment_id, this.colors[this.colorMap.size % this.colors.length]);
    }
    return this.colorMap.get(loan.equipment_id)!;
  }

  schoolEventColor(ev: CalendarEvent): string {
    const cats = [...new Set(this.calendarEvents().map(e => e.category))];
    const i = cats.indexOf(ev.category);
    return this.eventColors[(i < 0 ? 0 : i) % this.eventColors.length];
  }

  dotColor(item: CalendarItem): string | null {
    if (item.kind === 'loan') return this.loanColor(item.loan!);
    if (item.kind === 'exam') return '#e11d48';
    if (item.kind === 'event') return this.schoolEventColor(item.event!);
    return null; // tasks use CSS class
  }

  // ── Misc helpers ──
  canImportCalendar() {
    const r = this.auth.user()?.role;
    return r === 'admin' || r === 'secretary';
  }

  onCalendarFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading = true; this.uploadError = ''; this.uploadMessage = '';
    this.api.importCalendarWorkbook(file).subscribe({
      next: r => {
        this.uploading = false;
        this.uploadMessage = `נשמרו ${r.imported} אירועים מ-${r.sheets} גיליונות.`;
        if (r.warnings.length) this.uploadMessage += ` ללא תאריכים: ${r.warnings.join(', ')}.`;
        this.api.getCalendarEvents().subscribe(v => this.calendarEvents.set(v));
      },
      error: e => { this.uploading = false; this.uploadError = e.error?.error || 'ייבוא נכשל'; }
    });
  }

  formatShortDate(date: string): string {
    if (!date) return '';
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' });
  }

  toStudyYearSuffix(year?: string) { const y = toStudyYear(year); return y ? ' ' + y : ''; }

  trackOptions(): string[] {
    return collectTrackNames(this.allStudents().map(s => s.track)).filter(t => !/התמחות/i.test(t));
  }

  yearOptions(): string[] {
    const seen = new Map<string, string>();
    for (const y of this.allStudents().map(s => s.year).filter(Boolean)) {
      const lbl = toStudyYear(y);
      if (!seen.has(lbl)) seen.set(lbl, y);
    }
    return [...seen.values()];
  }

  dayLabel(day: CalendarDay): string {
    const n = this.visibleItems(day).length;
    return `${day.date}${n ? `, ${n} פריטים` : ''}`;
  }

  private formatDateLabel(date: string): string {
    const g = new Date(`${date}T12:00:00`);
    const hd = new HDate(g);
    const mName = hd.getMonth() === months.ADAR_I && HDate.isLeapYear(hd.getFullYear())
      ? 'אדר א׳' : HEBREW_MONTH_NAMES[hd.getMonth()];
    return `${HEBREW_DAY_NUMERALS[hd.getDate()]} ${mName} ${toHebrewYear(hd.getFullYear())} | ${g.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  }

  monthName(): string {
    const m = this.displayedMonth();
    return m === months.ADAR_I && HDate.isLeapYear(this.displayedYear()) ? 'אדר א׳' : HEBREW_MONTH_NAMES[m];
  }

  hebrewYearLabel(): string { return toHebrewYear(this.displayedYear()); }

  gregorianRangeLabel(): string {
    const days = this.monthCells().filter((d): d is CalendarDay => d !== null);
    if (!days.length) return '';
    const fmt = (d: CalendarDay) => `${d.gregorianDay}/${d.gregorianMonth}/${d.date.slice(0,4)}`;
    return `${fmt(days[0])} — ${fmt(days[days.length-1])}`;
  }

  private monthNumbers(year: number): number[] {
    return HDate.isLeapYear(year) ? MONTHS_IN_LEAP_YEAR : MONTHS_IN_COMMON_YEAR;
  }

  private toDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  private isValidDate(v: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T12:00:00`);
    return !isNaN(d.getTime()) && this.toDateString(d) === v;
  }
}

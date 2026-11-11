import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, OnDestroy, signal, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { interval, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HDate, months } from '@hebcal/core';
import { ApiService, CalendarEvent } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Loan, Student } from '../../models';
import { MessagesService, PersonalTask, MessageUser } from '../../services/messages.service';
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
type CalendarLayer = 'equipment' | 'personal' | 'schedule' | 'exams' | 'weddings' | 'birthdays';

interface CalendarItem {
  kind: 'loan' | 'task' | 'event' | 'exam' | 'wedding' | 'birthday';
  loan?: Loan;
  task?: PersonalTask;
  event?: CalendarEvent;
  exam?: any;
  wedding?: any;
  birthday?: Student;
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
  weddings: any[];
  birthdays: Student[];
}

// ── Context-menu ─────────────────────────────────────────────
interface CtxMenu {
  x: number;
  y: number;
  date: string;
}

// ── Gantt ────────────────────────────────────────────────────
interface GanttEntry {
  kind: 'loan' | 'task' | 'event' | 'exam' | 'wedding' | 'birthday';
  label: string;
  details: string;
  timeLabel: string;
  color: string;
  date: string;
  icon: string;
  startMinute: number;
  endMinute: number;
  allDay: boolean;
  lane: number;
  laneCount: number;
}

@Component({
  selector: 'app-monthly-calendar',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
<!-- Context menu (right-click) -->
<div *ngIf="ctxMenu()" class="ctx-menu"
     [style.top.px]="ctxMenu()!.y" [style.left.px]="ctxMenu()!.x"
     (click)="$event.stopPropagation()">
  <div class="ctx-header">{{ formatShortDate(ctxMenu()!.date) }}</div>
  <button (click)="openAddTask()"> הוספת משימה</button>
  <button (click)="openAddExam()"> הוספת מבחן</button>
  <button (click)="openAddEvent()"> הוספת אירוע</button>
  <button *ngIf="canAddWedding()" (click)="openAddWedding()">💍 הוספת חתונה</button>
</div>

<div *ngIf="addWeddingOpen()" class="modal-backdrop" (click)="closeDialogs()">
  <div class="modal-card wedding-dialog" role="dialog" aria-modal="true" aria-labelledby="wedding-title" (click)="$event.stopPropagation()">
    <h2 id="wedding-title" class="modal-title">הוספת חתונה ל־{{ formatShortDate(selectedDate()) }}</h2>
    <div class="form-group">
      <label for="wedding-student">בחירת תלמידה *</label>
      <input id="wedding-student" [ngModel]="weddingQuery()" (ngModelChange)="onWeddingQueryChange($event)"
             placeholder="חפשי לפי שם או מספר זהות" autocomplete="off" [disabled]="savingWedding()"
             aria-describedby="wedding-search-hint">
      <small id="wedding-search-hint" class="wedding-search-hint">
        {{ weddingStudentsLoading() ? 'טוענת תלמידות...' : 'הקלידי לפחות שני תווים לחיפוש' }}
      </small>
      <div *ngIf="weddingStudentId" class="wedding-selected">התלמידה שנבחרה: {{ weddingSelectedName }}</div>
      <div *ngIf="!weddingStudentId && weddingQuery().trim().length >= 2 && !weddingStudentsLoading() && !weddingStudentsLoadError()" class="wedding-results">
        <button type="button" *ngFor="let student of weddingStudentResults() | slice:0:20" (click)="selectWeddingStudent(student)">
          <strong>{{ student.name }}</strong><span>{{ student.id_number }}</span>
        </button>
        <span *ngIf="!weddingStudentResults().length" class="wedding-search-hint">לא נמצאו תלמידות מתאימות</span>
        <span *ngIf="weddingStudentResults().length > 20" class="wedding-search-hint">מוצגות 20 תוצאות ראשונות; אפשר לדייק את החיפוש</span>
      </div>
    </div>
    <div class="form-group">
      <label for="wedding-venue">מקום החתונה</label>
      <input id="wedding-venue" [(ngModel)]="weddingVenue" maxlength="200">
    </div>
    <p>חתונה עתידית תסמן את התלמידה כמאורסת, וביום החתונה הסטטוס יעודכן לנשואה.</p>
    <p *ngIf="dialogError()" class="alert alert-error" role="alert">{{ dialogError() }}</p>
    <div class="modal-actions">
      <button class="btn btn-primary" type="button" [disabled]="savingWedding() || !weddingStudentId" (click)="saveWedding()">שמירה</button>
      <button class="btn btn-secondary" type="button" [disabled]="savingWedding()" (click)="closeDialogs()">ביטול</button>
    </div>
  </div>
</div>

<!-- Add-task dialog -->
<div *ngIf="addTaskOpen()" class="modal-backdrop" (click)="closeDialogs()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <div class="modal-title"> משימה חדשה ל-{{ formatShortDate(selectedDate()) }}</div>
    <div class="form-group">
      <label>כותרת *</label>
      <input [(ngModel)]="newTask.title" placeholder="מה צריך לעשות?" (keyup.enter)="saveTask()">
    </div>
    <label class="gantt-all-day-toggle"><input type="checkbox" [(ngModel)]="newTask.all_day"> כל היום</label>
    <div class="form-row" *ngIf="!newTask.all_day">
      <div class="form-group"><label>משעה</label><input type="time" [(ngModel)]="newTask.start_time"></div>
      <div class="form-group"><label>עד שעה</label><input type="time" [(ngModel)]="newTask.end_time"></div>
    </div>
    <div class="form-group">
      <label>מי יכול לראות?</label>
      <div class="visibility-toggle">
        <button [class.active]="newTask.visibility==='private'" (click)="newTask.visibility='private'; showUserPicker.set(false)">
           רק אני
        </button>
        <button [class.active]="newTask.visibility==='public'" (click)="newTask.visibility='public'; showUserPicker.set(false)">
           כולם
        </button>
        <button [class.active]="newTask.visibility==='shared'" (click)="newTask.visibility='shared'; showUserPicker.set(true)">
          👥 נבחרים
        </button>
      </div>
      <div *ngIf="showUserPicker()" class="share-picker">
        <div *ngIf="!taskUsers().length" class="hint">טוען רשימת משתמשות...</div>
        <label *ngFor="let u of taskUsers()" class="share-option">
          <input type="checkbox" [checked]="newTask.sharedUserIds.includes(u.id)"
                 (change)="toggleSharedUser(u.id)">
          <span>{{ u.name }}</span>
        </label>
        <p *ngIf="taskUsers().length && !newTask.sharedUserIds.length" class="hint">בחרי לפחות איש אחד</p>
      </div>
      <p class="hint" *ngIf="newTask.visibility==='private'">משימה ציבורית תראה לכל הצוות בלוח האישי שלהם</p>
      <p class="hint" *ngIf="newTask.visibility==='public'">משימה ציבורית תראה לכל הצוות בלוח האישי שלהם</p>
      <p class="hint" *ngIf="newTask.visibility==='shared'">רק האנשים שתבחרי יראו את המשימה</p>
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
  <div class="modal-card" (click)="$event.stopPropagation()" style="width:min(500px,95vw)">
    <div class="modal-title"> מבחן חדש ל-{{ formatShortDate(selectedDate()) }}</div>
    <div class="form-group">
      <label>מקצוע (אופציונלי)</label>
      <input [(ngModel)]="newExam.subject" placeholder="לדוגמה: מתמטיקה">
    </div>
    <div class="form-group">
      <label>שם המבחן *</label>
      <input [(ngModel)]="newExam.name" placeholder="לדוגמה: מבחן עברית מחצית א'" (keyup.enter)="saveExam()">
    </div>
    <label class="gantt-all-day-toggle"><input type="checkbox" [(ngModel)]="newExam.all_day"> כל היום</label>
    <div class="form-row" *ngIf="!newExam.all_day">
      <div class="form-group"><label>משעה</label><input type="time" [(ngModel)]="newExam.start_time"></div>
      <div class="form-group"><label>עד שעה</label><input type="time" [(ngModel)]="newExam.end_time"></div>
    </div>
    <div style="display:flex;gap:6px;margin:8px 0 10px">
      <button type="button"
        (click)="newExam.filterMode='track'; newExam.parallel=''"
        [style.border-color]="newExam.filterMode==='track' ? 'var(--primary)' : ''"
        [style.color]="newExam.filterMode==='track' ? 'var(--primary)' : ''"
        [style.background]="newExam.filterMode==='track' ? 'var(--primary-light)' : ''"
        style="flex:1;padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);font:inherit;font-size:0.82rem;font-weight:700;cursor:pointer">לפי מסלול ושנה</button>
      <button type="button"
        (click)="newExam.filterMode='class'; newExam.track=''; newExam.year=''"
        [style.border-color]="newExam.filterMode==='class' ? 'var(--primary)' : ''"
        [style.color]="newExam.filterMode==='class' ? 'var(--primary)' : ''"
        [style.background]="newExam.filterMode==='class' ? 'var(--primary-light)' : ''"
        style="flex:1;padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);font:inherit;font-size:0.82rem;font-weight:700;cursor:pointer">לפי כיתה (מקבילה)</button>
    </div>
    <div *ngIf="newExam.filterMode==='track'" class="form-row">
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
    <div *ngIf="newExam.filterMode==='class'" class="form-group">
      <label>כיתה</label>
      <select [(ngModel)]="newExam.parallel">
        <option value="">כל הכיתות</option>
        <option *ngFor="let c of classOptions()" [value]="c.parallel">{{ c.label }} ({{ c.count }} תלמידות)</option>
      </select>
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
    <div class="form-row">
      <div class="form-group"><label>מתאריך</label><input type="date" [(ngModel)]="newEvent.start_date"></div>
      <div class="form-group"><label>עד תאריך</label><input type="date" [(ngModel)]="newEvent.end_date"></div>
    </div>
    <div class="form-group">
      <label>כותרת *</label>
      <input [(ngModel)]="newEvent.title" placeholder="שם האירוע" (keyup.enter)="saveEvent()">
    </div>
    <div class="form-group">
      <label>קטגוריה</label>
      <input [(ngModel)]="newEvent.category" placeholder="לדוגמה: חג, טיול, בחינות...">
    </div>
    <div class="form-group">
      <label class="event-all-day"><input type="checkbox" [(ngModel)]="newEvent.all_day"> כל היום</label>
    </div>
    <div class="form-group">
      <label class="event-all-day"><input type="checkbox" [(ngModel)]="newEvent.is_school_holiday" (ngModelChange)="setHolidayMode(newEvent, $event)"> יום חופש ללא לימודים</label>
    </div>
    <div class="form-row" *ngIf="!newEvent.all_day">
      <div class="form-group"><label>משעה</label><input type="time" [(ngModel)]="newEvent.start_time"></div>
      <div class="form-group"><label>עד שעה</label><input type="time" [(ngModel)]="newEvent.end_time"></div>
    </div>
    <div class="form-group">
      <label>על אילו כיתות האירוע משפיע?</label>
      <select [(ngModel)]="newEvent.class_scope">
        <option value="all">כל הכיתות</option>
        <option value="grade">שכבה ה או ו</option>
        <option value="class">כיתה ספציפית</option>
      </select>
    </div>
    <div class="form-row" *ngIf="newEvent.class_scope !== 'all'">
      <div class="form-group">
        <label>{{ newEvent.class_scope === 'grade' ? 'שכבה' : 'שנת כיתה' }}</label>
        <select [(ngModel)]="newEvent.class_year" (ngModelChange)="newEvent.class_parallel = ''">
          <option value="ה">ה</option><option value="ו">ו</option>
        </select>
      </div>
      <div class="form-group" *ngIf="newEvent.class_scope === 'class'">
        <label>מקבילה</label>
        <select [(ngModel)]="newEvent.class_parallel">
          <option value="">בחירת כיתה</option>
          <option *ngFor="let parallel of eventParallels(newEvent.class_year)" [value]="parallel">{{ newEvent.class_year }}{{ parallel }}</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" [disabled]="!newEvent.title.trim() || !validEventDateRange(newEvent.start_date, newEvent.end_date)" (click)="saveEvent()">שמור</button>
      <button class="btn btn-secondary" (click)="closeDialogs()">ביטול</button>
    </div>
    <p *ngIf="dialogError()" class="hint" style="color:var(--danger)">{{ dialogError() }}</p>
  </div>
</div>

<!-- Event detail / edit dialog -->
<div *ngIf="eventDetailOpen()" class="modal-backdrop" (click)="closeEventDetail()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <ng-container *ngIf="!editingEvent()">
      <div class="modal-title" [style.color]="schoolEventColor(selectedEvent()!)">
        {{ selectedEvent()!.title }}
      </div>
      <div class="event-detail-info">
        <div class="event-info-row">
          <span class="event-detail-label">תאריך</span>
          <span>{{ formatShortDate(selectedEvent()!.event_date) }}</span>
        </div>
        <div class="event-info-row">
          <span class="event-detail-label">קטגוריה</span>
          <span class="event-category-chip" [style.background]="schoolEventColor(selectedEvent()!) + '22'" [style.color]="schoolEventColor(selectedEvent()!)">{{ selectedEvent()!.category }}</span>
        </div>
        <ng-container *ngIf="selectedEvent()!.source_sheet === 'ידני'">
          <div class="event-info-row"><span class="event-detail-label">שעות</span><span>{{ eventTimeLabel(selectedEvent()!) }}</span></div>
          <div class="event-info-row"><span class="event-detail-label">כיתות</span><span>{{ eventAudienceLabel(selectedEvent()!) }}</span></div>
        </ng-container>
        <div class="event-info-row" *ngIf="selectedEvent()!.source_sheet">
          <span class="event-detail-label">מקור</span>
          <span>{{ selectedEvent()!.source_sheet === 'ידני' ? 'נוסף ידנית' : selectedEvent()!.source_sheet }}</span>
        </div>
      </div>
      <div class="modal-actions">
        <a class="btn btn-primary" [routerLink]="['/calendar/events', selectedEvent()!.id]" (click)="closeEventDetail()">📄 דף פרטים</a>
        <button *ngIf="selectedEvent()!.source_sheet === 'ידני'" class="btn btn-secondary" (click)="startEditEvent()">עריכה</button>
        <button *ngIf="selectedEvent()!.source_sheet === 'ידני'" class="btn btn-danger" (click)="deleteEvent(selectedEvent()!)">מחיקה</button>
        <button class="btn btn-secondary" (click)="closeEventDetail()">סגור</button>
      </div>
    </ng-container>
    <ng-container *ngIf="editingEvent()">
      <div class="modal-title">עריכת אירוע</div>
      <div class="form-group">
        <label>כותרת *</label>
        <input [(ngModel)]="editEventDraft.title" placeholder="שם האירוע">
      </div>
      <div class="form-group">
        <label>קטגוריה</label>
        <input [(ngModel)]="editEventDraft.category" placeholder="לדוגמה: חג, טיול, בחינות...">
      </div>
      <div class="form-group">
        <label class="event-all-day"><input type="checkbox" [(ngModel)]="editEventDraft.all_day"> כל היום</label>
      </div>
      <div class="form-group">
        <label class="event-all-day"><input type="checkbox" [(ngModel)]="editEventDraft.is_school_holiday" (ngModelChange)="setHolidayMode(editEventDraft, $event)"> יום חופש ללא לימודים</label>
      </div>
      <div class="form-row" *ngIf="!editEventDraft.all_day">
        <div class="form-group"><label>משעה</label><input type="time" [(ngModel)]="editEventDraft.start_time"></div>
        <div class="form-group"><label>עד שעה</label><input type="time" [(ngModel)]="editEventDraft.end_time"></div>
      </div>
      <div class="form-group">
        <label>על אילו כיתות האירוע משפיע?</label>
        <select [(ngModel)]="editEventDraft.class_scope">
          <option value="all">כל הכיתות</option>
          <option value="grade">שכבה ה או ו</option>
          <option value="class">כיתה ספציפית</option>
        </select>
      </div>
      <div class="form-row" *ngIf="editEventDraft.class_scope !== 'all'">
        <div class="form-group">
          <label>{{ editEventDraft.class_scope === 'grade' ? 'שכבה' : 'שנת כיתה' }}</label>
          <select [(ngModel)]="editEventDraft.class_year" (ngModelChange)="editEventDraft.class_parallel = ''">
            <option value="ה">ה</option><option value="ו">ו</option>
          </select>
        </div>
        <div class="form-group" *ngIf="editEventDraft.class_scope === 'class'">
          <label>מקבילה</label>
          <select [(ngModel)]="editEventDraft.class_parallel">
            <option value="">בחירת כיתה</option>
            <option *ngFor="let parallel of eventParallels(editEventDraft.class_year)" [value]="parallel">{{ editEventDraft.class_year }}{{ parallel }}</option>
          </select>
        </div>
      </div>
      <p *ngIf="dialogError()" class="hint" style="color:var(--danger)">{{ dialogError() }}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" [disabled]="!editEventDraft.title.trim()" (click)="saveEditEvent()">שמור</button>
        <button class="btn btn-secondary" (click)="editingEvent.set(false)">ביטול</button>
      </div>
    </ng-container>
  </div>
</div>

<div *ngIf="taskToDelete() as task" class="modal-backdrop" (click)="cancelDeleteTask()">
  <section class="modal-card delete-task-dialog" role="alertdialog" aria-modal="true"
           aria-labelledby="delete-task-title" (click)="$event.stopPropagation()">
    <div class="delete-task-icon" aria-hidden="true">!</div>
    <h2 id="delete-task-title" class="modal-title">מחיקת משימה</h2>
    <p class="delete-task-copy">למחוק את המשימה הזו?</p>
    <strong class="delete-task-name">{{ task.title }}</strong>
    <p *ngIf="deleteTaskError()" class="delete-task-error" role="alert">{{ deleteTaskError() }}</p>
    <div class="modal-actions delete-task-actions">
      <button type="button" class="btn btn-danger" [disabled]="deletingTaskId() !== null" (click)="confirmDeleteTask()">
        {{ deletingTaskId() === task.id ? 'מוחקת...' : 'מחקי משימה' }}
      </button>
      <button type="button" class="btn btn-secondary" [disabled]="deletingTaskId() !== null" (click)="cancelDeleteTask()">ביטול</button>
    </div>
  </section>
</div>


<div class="page-header">
  <div>
    <h1>לוח שנה</h1>
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
  <div class="view-toggle">
    <button type="button" [class.active]="viewMode()==='grid'" (click)="viewMode.set('grid')" title="תצוגת לוח">▦</button>
    <button type="button" [class.active]="viewMode()==='gantt'" (click)="viewMode.set('gantt')" title="תצוגת גאנט">▬</button>
  </div>
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
  <button type="button" class="layer-chip wedding-chip" [class.active]="has('weddings')"
          (click)="toggleLayer('weddings')">
    💍 חתונות
    <span class="chip-badge" *ngIf="monthBadge('weddings') as n">{{ n }}</span>
  </button>
  <button *ngIf="canViewBirthdays()" type="button" class="layer-chip birthday-chip" [class.active]="has('birthdays')"
          (click)="toggleLayer('birthdays')">
    🎂 ימי הולדת
    <span class="chip-badge" *ngIf="monthBadge('birthdays') as n">{{ n }}</span>
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
    {{ uploading ? 'מעלה ומייבאת...' : 'העלאת לוח שנה מאקסל' }}
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
    <span class="legend-dot shared-task-dot"></span> משימה משותפת
    <span class="legend-dot completed-dot"></span> בוצעה
  </span>
  <span class="legend-item" *ngIf="has('schedule')"><span class="legend-dot event-sample-dot"></span> אירוע (צבע לפי קטגוריה)</span>
  <span class="legend-item" *ngIf="has('exams')"><span class="legend-dot exam-dot"></span> מבחן</span>
  <span class="legend-item" *ngIf="has('weddings')">💍 חתונה</span>
  <span class="legend-item" *ngIf="has('birthdays')">🎂 יום הולדת</span>
  <span class="legend-hint">לחצי ימני על יום להוספה מהירה</span>
</div>

<!-- ── Calendar grid ── -->
<section *ngIf="viewMode()==='grid'" class="month-card" [attr.aria-label]="'לוח חודש ' + monthName()">
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
            {{ item.kind==='exam' ? item.exam!.name : item.event?.title }}
          </span>
          <span *ngIf="visibleItems(cd).length > 2" class="more-events">+{{ visibleItems(cd).length-2 }}</span>
        </span>

        <!-- Mixed: dots -->
        <span *ngIf="visibleItems(cd).length && !onlyScheduleOrExams()"
              class="event-markers" aria-hidden="true">
          <ng-container *ngFor="let item of visibleItems(cd).slice(0,4)">
            <span *ngIf="item.kind !== 'wedding' && item.kind !== 'birthday'" class="event-dot"
                  [class.task-dot]="item.kind==='task' && item.task?.visibility==='private'"
                  [class.public-task-dot]="item.kind==='task' && item.task?.visibility==='public'"
                  [class.shared-task-dot]="item.kind==='task' && item.task?.visibility==='shared'"
                  [class.completed-dot]="item.kind==='task' && item.completed"
                  [style.background]="dotColor(item)"></span>
            <span *ngIf="item.kind === 'wedding'" class="wedding-dot-icon" title="{{ item.wedding?.name }}">💍</span>
            <span *ngIf="item.kind === 'birthday'" class="birthday-dot-icon" title="{{ item.birthday?.name }}">🎂</span>
          </ng-container>
          <span *ngIf="visibleItems(cd).length > 4" class="more-events">+{{ visibleItems(cd).length-4 }}</span>
        </span>

        <!-- Tooltip -->
        <span *ngIf="visibleItems(cd).length" class="day-tooltip" role="tooltip">
          <span *ngFor="let item of visibleItems(cd)">
            <ng-container *ngIf="item.kind==='loan'">{{ item.loan?.equipment_name }} · {{ item.loan?.borrower_name }}</ng-container>
            <ng-container *ngIf="item.kind==='task'">{{ item.task?.title }}<span *ngIf="item.task?.visibility==='public'"> ({{ item.task?.creator_name }})</span><span *ngIf="item.task?.visibility==='shared'"> (👥 {{ item.task?.creator_name }})</span></ng-container>
            <ng-container *ngIf="item.kind==='event'">{{ item.event?.title }}</ng-container>
            <ng-container *ngIf="item.kind==='exam'">{{ item.exam?.name }}{{ item.exam?.track ? ' · '+item.exam?.track : '' }}</ng-container>
            <ng-container *ngIf="item.kind==='wedding'">💍 {{ item.wedding?.name }}{{ item.wedding?.wedding_venue ? ' · 📍' + item.wedding?.wedding_venue : '' }}</ng-container>
            <ng-container *ngIf="item.kind==='birthday'">🎂 {{ item.birthday?.name }}</ng-container>
          </span>
        </span>
      </button>
    </ng-container>
  </div>
</section>

<!-- ── Gantt view ── -->
<section *ngIf="viewMode()==='gantt'" class="gantt-card">
  <p *ngIf="!ganttEntries().length" class="empty-state">אין פריטים להצגה בחודש זה</p>
  <nav class="gantt-legend" aria-label="מקרא צבעים">
    <span *ngFor="let item of ganttLegend()" class="gantt-legend-item">
      <span class="gantt-legend-swatch" [style.background]="item.color"></span>{{ item.label }}
    </span>
  </nav>
  <div class="gantt-scroll">
    <div class="gantt-board" [style.grid-template-columns]="ganttGridTemplate()">
      <div class="gantt-day-heading gantt-hour-heading">שעה</div>
      <div *ngFor="let date of ganttDays()" class="gantt-day-heading"
           [class.today]="date === today" [class.selected]="date === selectedDate()"
           (click)="selectDate(date)">
        <strong>{{ formatHebrewGanttDate(date) }}</strong>
        <span>{{ formatGanttDay(date) }} · {{ dayNames[dateWeekday(date)] }}</span>
        <div class="gantt-birthday-list">
          <button *ngFor="let entry of ganttBirthdaysForDay(date)" type="button" class="gantt-birthday"
                  (mouseenter)="showGanttDetails($event, entry)" (mouseleave)="hideGanttDetails()"
                  (focus)="showGanttDetails($event, entry)" (blur)="hideGanttDetails()"
                  [attr.aria-label]="'יום הולדת: ' + entry.label">
            🎂 {{ entry.label }}
          </button>
        </div>
      </div>

      <div class="gantt-hour-axis">
        <span *ngFor="let hour of ganttHours" [style.top.px]="hour * 44 + 2">{{ formatGanttHour(hour) }}</span>
      </div>
      <div *ngFor="let date of ganttDays()" class="gantt-day-track"
           [class.today]="date === today" [class.selected]="date === selectedDate()"
           (click)="selectDate(date)">
        <div *ngFor="let entry of ganttEntriesForDay(date)" class="gantt-time-block"
             [style.top.px]="ganttTop(entry.startMinute)"
             [style.height.px]="ganttHeight(entry.startMinute, entry.endMinute)"
             [style.right.%]="entry.lane / entry.laneCount * 100"
             [style.width.%]="100 / entry.laneCount"
             [style.background]="entry.allDay ? ganttPastelColor(entry.color) : entry.color"
             [style.border-color]="entry.color"
             [style.color]="entry.allDay ? '#1e293b' : '#fff'"
             [class.all-day]="entry.allDay"
             (mouseenter)="showGanttDetails($event, entry)" (mouseleave)="hideGanttDetails()"
             (focus)="showGanttDetails($event, entry)" (blur)="hideGanttDetails()"
             tabindex="0"
             [attr.aria-label]="entry.label + ' · ' + entry.timeLabel + (entry.details ? ' · ' + entry.details : '')">
          <strong>{{ entry.icon }} {{ entry.label }}</strong>
          <span *ngIf="entry.timeLabel && ganttHeight(entry.startMinute, entry.endMinute) >= 34">{{ entry.timeLabel }}</span>
        </div>
      </div>
    </div>
  </div>
  <div *ngIf="ganttHover()" class="gantt-hover-card" role="tooltip"
       [style.left.px]="ganttHover()!.left" [style.top.px]="ganttHover()!.top">
    <strong>{{ ganttHover()!.entry.label }}</strong>
    <span>{{ ganttHover()!.entry.timeLabel || 'כל היום' }}</span>
    <span *ngIf="ganttHover()!.entry.details">{{ ganttHover()!.entry.details }}</span>
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
      <button *ngIf="canAddWedding()" class="btn-quick" (click)="openAddWedding()">+ חתונה</button>
    </div>
  </div>

  <p *ngIf="layers().size && !selectedDayCount()" class="empty-state">
    אין פריטים ביום זה — לחצי ימין על יום בלוח להוספה מהירה
  </p>

  <!-- Equipment -->
  <ng-container *ngIf="has('equipment') && selectedDayLoans().length">
    <h3 class="layer-title">השאלת ציוד</h3>
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
    <h3 class="layer-title">הלוח האישי</h3>
    <div *ngFor="let task of selectedDayTasks()" class="detail-row" [class.completed]="task.completed">
      <button type="button" class="task-check"
              [attr.aria-pressed]="task.completed"
              [disabled]="updatingTaskId===task.id"
              (click)="toggleTask(task)">{{ task.completed ? '✔' : '' }}</button>
      <div class="detail-main">
        <span class="task-title">{{ task.title }}</span>
        <span *ngIf="task.visibility==='public'" class="task-public-badge">🌐 ציבורי · {{ task.creator_name }}</span>
        <span *ngIf="task.visibility==='shared'" class="task-shared-badge">👥 {{ (task.shared_with || []).map(u => u.name).join(', ') || 'משותף' }} · {{ task.creator_name }}</span>
      </div>
      <button *ngIf="task.user_id === currentUserId()" class="del-task-btn" title="מחק" (click)="deleteTask(task)">✕</button>
    </div>
  </ng-container>

  <!-- Schedule events -->
  <ng-container *ngIf="has('schedule') && selectedDayEvents().length">
    <h3 class="layer-title">לוח אירועים</h3>
    <div *ngFor="let event of selectedDayEvents()" class="detail-row event-detail-row clickable" (click)="openEventDetail(event)">
      <span class="detail-dot" [style.background]="schoolEventColor(event)"></span>
      <div class="detail-main">
        <strong>{{ event.title }}</strong>
        <span>{{ event.category }}{{ event.source_sheet && event.source_sheet !== 'ידני' ? ' · '+event.source_sheet : '' }}</span>
      </div>
      <span *ngIf="event.source_sheet === 'ידני'" class="manual-badge">ידני</span>
    </div>
  </ng-container>

  <!-- Exams -->
  <ng-container *ngIf="has('exams') && selectedDayExams().length">
    <h3 class="layer-title">מבחנים</h3>
    <div *ngFor="let exam of selectedDayExams()" class="detail-row">
      <span class="detail-dot exam-dot"></span>
      <div class="detail-main">
        <a [routerLink]="['/exams', exam.id, 'print']"><strong>{{ exam.name }}</strong></a>
        <span>{{ exam.track || 'כל המסלולים' }}{{ exam.year ? ' · '+toStudyYear(exam.year) : '' }}
              · {{ exam.codes_count || 0 }} ברקודים · ממוצע {{ exam.avg_grade ?? '—' }}</span>
      </div>
      <div class="exam-row-btns">
        <a [routerLink]="['/exams', exam.id, 'edit']" class="btn-quick">עריכה</a>
        <a [routerLink]="['/exams', exam.id, 'print']" class="btn-quick">הדפסה</a>
      </div>
    </div>
  </ng-container>

  <!-- Weddings -->
  <ng-container *ngIf="has('weddings') && selectedDayWeddings().length">
    <h3 class="layer-title">💍 חתונות</h3>
    <div *ngFor="let s of selectedDayWeddings()" class="detail-row wedding-row">
      <span class="wedding-heart">💍</span>
      <div class="detail-main">
        <a [routerLink]="['/students', s.id_number]"><strong>{{ s.name }}</strong></a>
        <span>{{ s.track || '' }}{{ s.year ? ' · ' + s.year : '' }}{{ s.class_name ? ' · כיתה ' + s.class_name : '' }}<span *ngIf="s.married_name"> ← {{ s.married_name }}</span></span>
        <span *ngIf="s.wedding_venue" class="wedding-venue-label">📍 {{ s.wedding_venue }}</span>
        <span *ngIf="!s.wedding_venue" class="wedding-venue-label no-venue">📍 מקום לא הוזן</span>
      </div>
    </div>
  </ng-container>

  <ng-container *ngIf="has('birthdays') && selectedDayBirthdays().length">
    <h3 class="layer-title">🎂 ימי הולדת</h3>
    <div *ngFor="let student of selectedDayBirthdays()" class="detail-row">
      <span class="birthday-dot-icon" aria-hidden="true">🎂</span>
      <div class="detail-main">
        <a [routerLink]="['/students', student.id_number]"><strong>{{ student.name }}</strong></a>
        <span>{{ student.track || '' }}{{ student.year ? ' · שנה ' + student.year : '' }}{{ student.class_name ? ' · כיתה ' + student.class_name : '' }}</span>
        <span>{{ formatHebrewBirthDate(student.birth_date_hebrew) }}</span>
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
    .wedding-dialog { max-height: 95vh; overflow-y: auto; }
    .wedding-search-hint { color: var(--text-muted); font-size: .8rem; }
    .wedding-results { display: flex; flex-direction: column; gap: 4px; max-height: 210px; overflow-y: auto; padding: 5px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
    .wedding-results button { display: flex; justify-content: space-between; gap: 12px; text-align: right; padding: 9px; border: 0; border-radius: var(--radius-xs); background: transparent; color: var(--text); font: inherit; cursor: pointer; }
    .wedding-results button:hover, .wedding-results button:focus-visible { background: var(--primary-light); }
    .wedding-results button span { color: var(--text-muted); direction: ltr; }
    .wedding-results .wedding-search-hint { padding: 8px; }
    .wedding-selected { color: var(--primary); font-size: .85rem; font-weight: 700; }
    .delete-task-dialog { position: relative; gap: 10px; text-align: center; border: 1px solid var(--border); animation: delete-dialog-enter 150ms ease-out; }
    .delete-task-icon { display: grid; place-items: center; width: 38px; height: 38px; margin: 0 auto; border-radius: 50%; background: #fff1f0; color: #b42318; font-size: 1.25rem; font-weight: 900; }
    .delete-task-dialog .modal-title { margin: 0; color: var(--text); font-size: 1.05rem; }
    .delete-task-copy { color: var(--text-muted); font-size: .88rem; }
    .delete-task-name { padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); overflow-wrap: anywhere; }
    .delete-task-error { color: var(--danger); font-size: .85rem; }
    .delete-task-actions { justify-content: center; margin-top: 4px; }
    @keyframes delete-dialog-enter { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
    .form-group { display: flex; flex-direction: column; gap: 4px;
      label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); }
      input, select { height: 38px; padding: 0 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font: inherit; background: var(--surface); }
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .visibility-toggle { display: flex; gap: 6px;
      button { flex: 1; padding: 8px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); font: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer;
        &.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } }
    }
    .share-picker { margin-top: 8px; max-height: 180px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px; background: var(--surface-2); }
    .share-option { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: 0.85rem; cursor: pointer; border-radius: 6px;
      &:hover { background: var(--surface); }
      input { margin: 0; }
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
    .birthday-chip.active { background: #db2777; border-color: #db2777; }
    .birthday-dot-icon { font-size: .9rem; }

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
      border: 0; font: inherit;
      &.uploading { opacity: .65; cursor: wait; }
      &:disabled { opacity: .65; cursor: wait; }
      input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    }
    .upload-help { color: var(--text-muted); font-size: 0.78rem; }
    .upload-success { flex-basis: 100%; margin: 0; font-size: 0.83rem; color: var(--success); }
    .upload-error   { flex-basis: 100%; margin: 0; font-size: 0.83rem; color: var(--danger); }

    /* ── Legend ── */
    .calendar-legend-wrap { margin: 0 0 12px; }
    .legend-toggle {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 5px 12px; font: inherit; font-size: 0.78rem; font-weight: 700;
      color: var(--text-muted); cursor: pointer;
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }
    .calendar-legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
      margin: 8px 0 0; padding: 10px 12px;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
      color: var(--text-muted); font-size: 0.78rem;
    }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .legend-hint { margin-right: auto; font-size: 0.72rem; color: var(--text-muted); font-style: italic; }
    .equipment-dot  { background: #0d9488; }
    .task-dot       { background: #6366f1; }
    .public-task-dot{ background: #f59e0b; }
    .shared-task-dot{ background: #8b5cf6; }
    .completed-dot  { background: #10b981; }
    .exam-dot       { background: #e11d48; }
    .event-sample-dot { background: #0891b2; }
    .wedding-chip.active { background: linear-gradient(135deg, #ec4899, #f97316); border-color: #ec4899; }
    .wedding-chip:not(.active):hover { border-color: #ec4899; color: #ec4899; background: #fdf2f8; }
    .wedding-row { background: linear-gradient(135deg, #fdf2f8, var(--surface)); border-color: #f9a8d4 !important; }
    .wedding-heart { font-size: 1.1rem; flex-shrink: 0; }
    .wedding-venue-label { font-size: 0.75rem; color: #be185d; font-weight: 700; display: block; }
    .wedding-venue-label.no-venue { color: var(--text-muted); font-weight: 400; font-style: italic; }
    .wedding-dot-icon { font-size: 0.75rem; line-height: 1; flex-shrink: 0; }

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
    .task-shared-badge { font-size: 0.72rem; color: #6366f1; background: #e0e7ff; padding: 1px 6px; border-radius: 20px; }
    .del-task-btn {
      border: none; background: transparent; cursor: pointer; font-size: 0.85rem;
      color: var(--text-muted); padding: 4px; border-radius: 4px;
      &:hover { color: var(--danger); background: #fee2e2; }
    }
    .exam-row-btns { display: flex; gap: 4px; flex-shrink: 0; }

    /* ── Event detail styles ── */
    .event-detail-row.clickable {
      cursor: pointer;
      &:hover { background: var(--surface-3); }
    }
    .manual-badge {
      font-size: 0.68rem; font-weight: 700; color: var(--primary);
      background: var(--primary-light); border-radius: 999px; padding: 2px 8px;
      flex-shrink: 0;
    }
    .event-detail-info { display: flex; flex-direction: column; gap: 10px; }
    .event-info-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 6px 0; border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
      cursor: default;
    }
    .event-detail-label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }
    .event-category-chip {
      display: inline-block; padding: 3px 10px; border-radius: 999px;
      font-size: 0.8rem; font-weight: 700;
    }

    .empty-state { color: var(--text-muted); font-size: 0.85rem; }
    .calendar-error { color: var(--danger); font-size: 0.85rem; margin-bottom: 10px; }

    /* ── View toggle ── */
    .view-toggle {
      display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
      button {
        width: 32px; height: 32px; border: none; background: var(--surface);
        color: var(--text-muted); font-size: 1rem; cursor: pointer;
        &:hover { background: var(--primary-light); color: var(--primary); }
        &.active { background: var(--primary); color: white; }
      }
    }

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

  // ── View mode: grid or gantt ──
  readonly viewMode = signal<'grid' | 'gantt'>('grid');

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

  readonly ganttHours = Array.from({ length: 24 }, (_, hour) => hour);
  readonly ganttHover = signal<{ entry: GanttEntry; left: number; top: number } | null>(null);

  // ── Gantt: one hourly column for each day ──
  readonly ganttDays = computed(() => {
    const cells = this.monthCells().filter((c): c is CalendarDay => c !== null);
    return cells.map(c => c.date);
  });

  readonly ganttEntries = computed(() => {
    const days = this.ganttDays();
    if (!days.length) return [];
    const entries: GanttEntry[] = [];
    const add = (
      kind: GanttEntry['kind'], label: string, details: string, color: string, icon: string, date: string,
      start?: string | null, end?: string | null, allDay = false
    ) => {
      const range = this.ganttTimeRange(start, end, allDay);
      entries.push({
        kind, label, details, color, icon, date, timeLabel: range.label,
        startMinute: range.start, endMinute: range.end, allDay: range.allDay, lane: 0, laneCount: 1
      });
    };

    for (const date of days) {
      if (this.has('equipment')) {
        for (const loan of this.loansForDate(date)) {
          add('loan', loan.equipment_name || 'ציוד', loan.borrower_name || '', '#0f766e', '💻', date, null, null, true);
        }
      }

      if (this.has('personal')) {
        for (const task of this.tasksForDate(date)) {
          const color = task.completed ? '#b45309' : '#2563eb';
          const taskDetails = [
            task.visibility === 'public' ? `ציבורית · ${task.creator_name || ''}` : '',
            task.visibility === 'shared' ? `משותפת · ${task.creator_name || ''}` : '',
            task.completed ? 'בוצעה' : ''
          ].filter(Boolean).join(' · ');
          add('task', task.title, taskDetails, color, '☑', date, task.start_time, task.end_time);
        }
      }

      if (this.has('schedule')) {
        const sheet = this.selectedSourceSheet();
        const events = this.calendarEvents().filter(event =>
          event.event_date === date && (sheet === null || event.source_sheet === sheet)
        );
        const seen = new Set<string>();
        for (const event of events) {
          const key = `${event.source_sheet}\x00${event.event_date}\x00${event.title}\x00${event.category}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const eventDetails = [event.category, event.source_sheet, event.notes].filter(Boolean).join(' · ');
          add('event', event.title, eventDetails, this.ganttEventColor(event.category, Boolean(event.is_school_holiday)), '📅', date,
            event.start_time, event.end_time, Boolean(event.all_day));
        }
      }

      if (this.has('exams')) {
        for (const exam of this.examsForDate(date)) {
          const examDetails = [exam.track, exam.year ? `שנה ${exam.year}` : ''].filter(Boolean).join(' · ');
          add('exam', exam.name, examDetails, '#dc2626', '📝', date, exam.start_time, exam.end_time);
        }
      }

      if (this.has('weddings')) {
        for (const student of this.weddingsForDate(date)) {
          const weddingDetails = [student.track, student.class_name && `כיתה ${student.class_name}`, student.wedding_venue]
            .filter(Boolean).join(' · ');
          add('wedding', student.name, weddingDetails, '#9333ea', '💍', date, null, null, true);
        }
      }

      if (this.has('birthdays')) {
        for (const student of this.birthdaysForDate(date)) {
          const birthdayDetails = [student.track, student.class_name && `כיתה ${student.class_name}`]
            .filter(Boolean).join(' · ');
          add('birthday', student.name, birthdayDetails, '#db2777', '🎂', date, null, null, true);
        }
      }
    }

    const byDate = new Map<string, GanttEntry[]>();
    for (const entry of entries) {
      if (entry.kind === 'birthday') continue;
      const dayEntries = byDate.get(entry.date) || [];
      dayEntries.push(entry);
      byDate.set(entry.date, dayEntries);
    }
    for (const dayEntries of byDate.values()) {
      for (const isAllDay of [true, false]) {
        const group = dayEntries.filter(entry => entry.allDay === isAllDay)
          .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
        const laneEnds: number[] = [];
        for (const entry of group) {
          let lane = laneEnds.findIndex(end => end <= entry.startMinute);
          if (lane < 0) lane = laneEnds.length;
          laneEnds[lane] = entry.endMinute;
          entry.lane = lane;
        }
        const laneCount = Math.max(1, laneEnds.length);
        for (const entry of group) entry.laneCount = laneCount;
      }
    }
    return entries;
  });

  // ── Computed cells ──
  readonly monthCells = computed(() => this.buildMonthCells());

  readonly selectedDayLoans  = computed(() => this.loansForDate(this.selectedDate()));
  readonly selectedDayTasks  = computed(() => this.tasksForDate(this.selectedDate()));
  readonly selectedDayEvents = computed(() => this.eventsForDate(this.selectedDate()));
  readonly selectedDayExams  = computed(() => this.examsForDate(this.selectedDate()));
  readonly selectedDayWeddings = computed(() => this.weddingsForDate(this.selectedDate()));
  readonly selectedDayBirthdays = computed(() => this.birthdaysForDate(this.selectedDate()));

  readonly selectedDayCount = computed(() =>
    (this.has('equipment') ? this.selectedDayLoans().length   : 0) +
    (this.has('personal')  ? this.selectedDayTasks().length   : 0) +
    (this.has('schedule')  ? this.selectedDayEvents().length  : 0) +
    (this.has('exams')     ? this.selectedDayExams().length   : 0) +
    (this.has('weddings')  ? this.selectedDayWeddings().length : 0) +
    (this.has('birthdays') ? this.selectedDayBirthdays().length : 0)
  );

  readonly selectedDateLabel = computed(() => this.formatDateLabel(this.selectedDate()));

  // ── Context menu ──
  readonly ctxMenu = signal<CtxMenu | null>(null);

  // ── Legend collapse ──
  readonly legendOpen = signal(false);

  // ── Dialogs ──
  readonly addTaskOpen  = signal(false);
  readonly addExamOpen  = signal(false);
  readonly addEventOpen = signal(false);
  readonly addWeddingOpen = signal(false);
  readonly savingWedding = signal(false);
  readonly weddingStudentsLoading = signal(false);
  readonly weddingStudentsLoadError = signal(false);
  weddingStudentId = '';
  weddingSelectedName = '';
  readonly weddingQuery = signal('');
  readonly weddingStudentResults = computed<Student[]>(() => {
    const query = this.weddingQuery().trim().toLocaleLowerCase('he');
    if (query.length < 2) return [];
    return this.allStudents().filter(student =>
      String(student.name || '').toLocaleLowerCase('he').includes(query) ||
      String(student.id_number || '').includes(query)
    ).slice(0, 21);
  });
  private weddingStudentsRequest?: Subscription;
  weddingVenue = '';
  readonly dialogError  = signal('');

  newTask = { title: '', start_time: '08:00', end_time: '09:00', all_day: false, visibility: 'private' as 'private' | 'public' | 'shared', sharedUserIds: [] as number[] };
  taskUsers = signal<MessageUser[]>([]);
  showUserPicker = signal(false);
  newExam  = { name: '', subject: '', track: '', year: '', start_time: '08:00', end_time: '09:00', all_day: false, filterMode: 'track' as 'track' | 'class', parallel: '' };
  newEvent = {
    title: '', category: '', start_date: this.today, end_date: this.today,
    all_day: true, start_time: '08:00', end_time: '09:00',
    class_scope: 'all' as 'all' | 'grade' | 'class', class_year: 'ה', class_parallel: '', is_school_holiday: false
  };

  // ── Upload / misc ──
  loadError     = '';
  uploadError   = '';
  uploadMessage = '';
  uploading     = false;
  updatingTaskId: number | null = null;

  // ── Event detail ──
  readonly eventDetailOpen = signal(false);
  readonly selectedEvent   = signal<CalendarEvent | null>(null);
  readonly editingEvent    = signal(false);
  readonly taskToDelete = signal<PersonalTask | null>(null);
  readonly deletingTaskId = signal<number | null>(null);
  readonly deleteTaskError = signal('');
  editEventDraft = {
    title: '', category: '', all_day: true, start_time: '08:00', end_time: '09:00',
    class_scope: 'all' as 'all' | 'grade' | 'class', class_year: 'ה', class_parallel: '', is_school_holiday: false
  };

  private colorMap = new Map<number, string>();
  private readonly colors = ['#0d9488','#0891b2','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f97316','#06b6d4','#84cc16'];
  private readonly eventColors = ['#0891b2','#f59e0b','#6366f1','#ec4899','#14b8a6','#8b5cf6','#f97316','#84cc16','#06b6d4','#ef4444'];
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
      const activeLayers: CalendarLayer[] = view === 'personal'
        ? ['personal', 'schedule']
        : view === 'schedule'
          ? ['schedule']
          : ['equipment', 'schedule'];
      this.layers.set(new Set<CalendarLayer>(activeLayers));
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

  ngOnDestroy() { this.weddingStudentsRequest?.unsubscribe(); this.destroy$.next(); this.destroy$.complete(); }

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
    if (l === 'birthdays' && !this.canViewBirthdays()) return;
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
    if (layer === 'weddings')  return cells.reduce((s, c) => s + c.weddings.length, 0);
    if (layer === 'birthdays') return cells.reduce((s, c) => s + c.birthdays.length, 0);
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

  private weddingsForDate(date: string): any[] {
    return this.allStudents().filter(s =>
      (s.marital_status === 'מאורסת' || s.marital_status === 'נשואה') && s.wedding_date === date
    );
  }

  formatHebrewBirthDate(value?: string): string {
    const parsed = /^(\d{1,2})-(\d{1,2})$/.exec(String(value || '').trim());
    if (!parsed) return '';
    const day = Number(parsed[1]);
    const month = Number(parsed[2]);
    const monthNames: Record<number, string> = {
      1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
      7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
      12: 'אדר א׳', 13: 'אדר ב׳', 14: 'אדר'
    };
    return HEBREW_DAY_NUMERALS[day] && monthNames[month]
      ? `${HEBREW_DAY_NUMERALS[day]} ${monthNames[month]}`
      : '';
  }

  private birthdaysForDate(date: string): Student[] {
    if (!this.canViewBirthdays() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const hebrewDate = new HDate(new Date(`${date}T12:00:00`));
    return this.allStudents().filter(student => {
      const birthDate = /^(\d{1,2})-(\d{1,2})$/.exec(String(student.birth_date_hebrew || '').trim());
      if (!birthDate || Number(birthDate[1]) !== hebrewDate.getDate()) return false;
      const birthMonth = Number(birthDate[2]);
      const currentMonth = hebrewDate.getMonth();
      if (birthMonth === 14) {
        return currentMonth === months.ADAR_I ||
          (hebrewDate.isLeapYear() && currentMonth === months.ADAR_II);
      }
      if (birthMonth === months.ADAR_II && !hebrewDate.isLeapYear()) {
        return currentMonth === months.ADAR_I;
      }
      return currentMonth === birthMonth;
    });
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
      ...(this.has('weddings')  ? day.weddings.map((wedding): CalendarItem => ({ kind: 'wedding', wedding })) : []),
      ...(this.has('birthdays') ? day.birthdays.map((birthday): CalendarItem => ({ kind: 'birthday', birthday })) : []),
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
        weddings: this.weddingsForDate(date), birthdays: this.birthdaysForDate(date),
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
    ev.stopPropagation();
    this.selectDate(date);
    // מוודא שהתפריט לא יוצא מהמסך
    const menuW = 200, menuH = 200;
    const x = ev.clientX + menuW > window.innerWidth  ? ev.clientX - menuW : ev.clientX;
    const y = ev.clientY + menuH > window.innerHeight ? ev.clientY - menuH : ev.clientY;
    this.ctxMenu.set({ x, y, date });
  }

  @HostListener('document:click')
  closeCtxMenu() { this.ctxMenu.set(null); }

  // ── Dialogs: open ──
  openAddTask() {
    this.ctxMenu.set(null);
    this.eventDetailOpen.set(false);
    this.newTask = { title: '', start_time: '08:00', end_time: '09:00', all_day: false, visibility: 'private', sharedUserIds: [] };
    this.showUserPicker.set(false);
    this.dialogError.set('');
    this.addTaskOpen.set(true);
    if (!this.taskUsers().length) {
      this.messages.getUsers().subscribe({ next: u => this.taskUsers.set(u), error: () => {} });
    }
  }
  openAddTaskForSelected() { this.openAddTask(); }

  toggleSharedUser(userId: number) {
    const ids = this.newTask.sharedUserIds;
    const idx = ids.indexOf(userId);
    if (idx >= 0) ids.splice(idx, 1);
    else ids.push(userId);
  }

  openAddExam() {
    this.ctxMenu.set(null);
    this.eventDetailOpen.set(false);
    this.newExam = { name: '', subject: '', track: '', year: '', start_time: '08:00', end_time: '09:00', all_day: false, filterMode: 'track', parallel: '' };
    this.dialogError.set('');
    this.addExamOpen.set(true);
  }
  openAddExamForSelected() { this.openAddExam(); }

  openAddEvent() {
    this.ctxMenu.set(null);
    this.eventDetailOpen.set(false);
    this.editingEvent.set(false);
    this.newEvent = {
      title: '', category: '', start_date: this.selectedDate(), end_date: this.selectedDate(),
      all_day: true, start_time: '08:00', end_time: '09:00',
      class_scope: 'all', class_year: 'ה', class_parallel: '', is_school_holiday: false
    };
    this.dialogError.set('');
    this.addEventOpen.set(true);
  }
  openAddEventForSelected() { this.openAddEvent(); }

  canAddWedding() {
    return this.auth.hasPermission('students') && this.auth.hasPermission('students', 'change');
  }

  openAddWedding() {
    this.ctxMenu.set(null);
    this.eventDetailOpen.set(false);
    this.weddingStudentId = '';
    this.weddingSelectedName = '';
    this.weddingQuery.set('');
    this.weddingVenue = '';
    this.dialogError.set('');
    this.addWeddingOpen.set(true);
    this.weddingStudentsLoading.set(true);
    this.weddingStudentsLoadError.set(false);
    this.weddingStudentsRequest?.unsubscribe();
    this.weddingStudentsRequest = this.api.getStudents().subscribe({
      next: students => { this.allStudents.set(students); this.weddingStudentsLoading.set(false); },
      error: () => {
        this.weddingStudentsLoading.set(false);
        this.weddingStudentsLoadError.set(true);
        this.dialogError.set('לא ניתן לטעון את רשימת התלמידות. סגרי את החלון ונסי שוב.');
      },
    });
  }

  onWeddingQueryChange(query: string) {
    this.weddingQuery.set(query);
    this.weddingStudentId = '';
    this.weddingSelectedName = '';
  }

  selectWeddingStudent(student: Student) {
    this.weddingStudentId = student.id_number;
    this.weddingSelectedName = student.name;
    this.weddingQuery.set(`${student.name} · ${student.id_number}`);
  }

  saveWedding() {
    if (!this.weddingStudentId || this.savingWedding()) return;
    this.savingWedding.set(true);
    this.dialogError.set('');
    this.api.addStudentWedding(this.weddingStudentId, this.selectedDate(), this.weddingVenue).subscribe({
      next: () => {
        this.savingWedding.set(false);
        this.closeDialogs();
        if (!this.has('weddings')) this.toggleLayer('weddings');
        this.api.getStudents().subscribe({
          next: students => this.allStudents.set(students),
          error: () => { this.loadError = 'החתונה נשמרה, אך טעינת התלמידות נכשלה. יש לרענן את הדף.'; },
        });
      },
      error: error => {
        this.savingWedding.set(false);
        this.dialogError.set(error.error?.error || 'שמירת החתונה נכשלה');
      },
    });
  }

  closeDialogs() {
    if (this.savingWedding()) return;
    this.weddingStudentsRequest?.unsubscribe();
    this.weddingQuery.set('');
    this.weddingStudentId = '';
    this.weddingSelectedName = '';
    this.addTaskOpen.set(false);
    this.addExamOpen.set(false);
    this.addEventOpen.set(false);
    this.addWeddingOpen.set(false);
    this.dialogError.set('');
  }

  // ── Save actions ──
  saveTask() {
    const title = this.newTask.title.trim();
    if (!title) return;
    this.messages.createTask(
      title,
      this.selectedDate(),
      this.newTask.visibility,
      this.newTask.visibility === 'shared' ? this.newTask.sharedUserIds : undefined,
      this.newTask.all_day ? undefined : this.newTask.start_time,
      this.newTask.all_day ? undefined : this.newTask.end_time
    ).subscribe({
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
    const examData: any = {
      name, subject: this.newExam.subject.trim() || undefined, exam_date: this.selectedDate(),
      start_time: this.newExam.all_day ? undefined : this.newExam.start_time,
      end_time: this.newExam.all_day ? undefined : this.newExam.end_time
    };
    if (this.newExam.filterMode === 'class') {
      if (this.newExam.parallel) examData.parallel = this.newExam.parallel;
    } else {
      if (this.newExam.track) examData.track = this.newExam.track;
      if (this.newExam.year) examData.year = this.newExam.year;
    }
    this.api.createExam(examData).subscribe({
      next: (result) => {
        const codeParams: any = {};
        if (this.newExam.filterMode === 'class' && examData.parallel) codeParams.parallel = examData.parallel;
        else { if (examData.track) codeParams.track = examData.track; if (examData.year) codeParams.year = examData.year; }
        this.api.generateExamCodes(result.id, codeParams).subscribe();
        this.api.getExams().subscribe(v => this.exams.set(v));
        this.closeDialogs();
        if (!this.has('exams')) this.toggleLayer('exams');
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  saveEvent() {
    const title = this.newEvent.title.trim();
    if (!title || !this.validEventDateRange(this.newEvent.start_date, this.newEvent.end_date)) return;
    this.api.createCalendarEvent({
      title,
      event_date: this.newEvent.start_date,
      end_date: this.newEvent.end_date,
      category: this.newEvent.category.trim() || 'כללי',
      source_sheet: 'ידני',
      all_day: this.newEvent.all_day,
      start_time: this.newEvent.start_time,
      end_time: this.newEvent.end_time,
      class_scope: this.newEvent.class_scope,
      class_year: this.newEvent.class_scope === 'all' ? '' : this.newEvent.class_year,
      class_parallel: this.newEvent.class_scope === 'class' ? this.newEvent.class_parallel : '',
      is_school_holiday: this.newEvent.is_school_holiday
    }).subscribe({
      next: () => {
        this.api.getCalendarEvents().subscribe(v => this.calendarEvents.set(v));
        this.closeDialogs();
        if (!this.has('schedule')) this.toggleLayer('schedule');
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  validEventDateRange(startDate: string, endDate: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate;
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
    this.taskToDelete.set(task);
    this.deleteTaskError.set('');
  }

  cancelDeleteTask() {
    if (this.deletingTaskId() !== null) return;
    this.taskToDelete.set(null);
    this.deleteTaskError.set('');
  }

  confirmDeleteTask() {
    const task = this.taskToDelete();
    if (!task || this.deletingTaskId() !== null) return;
    this.deletingTaskId.set(task.id);
    this.deleteTaskError.set('');
    this.messages.deleteTask(task.id).subscribe({
      next: () => {
        this.tasks.update(ts => ts.filter(t => t.id !== task.id));
        this.deletingTaskId.set(null);
        this.taskToDelete.set(null);
      },
      error: e => {
        this.deletingTaskId.set(null);
        this.deleteTaskError.set(e.error?.error || 'מחיקת המשימה נכשלה');
      }
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
    let hash = 0;
    for (const c of ev.category || '') hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return this.eventColors[hash % this.eventColors.length];
  }

  categoryToColor(category: string): string {
    let hash = 0;
    for (const c of category || '') hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return this.eventColors[hash % this.eventColors.length];
  }

  eventLegend = computed(() => {
    const cats = [...new Set(this.calendarEvents().map(e => e.category))].sort();
    return cats.map(cat => ({ name: cat, color: this.categoryToColor(cat) }));
  });

  eventParallels(year: string): string[] {
    return [...new Set(this.allStudents()
      .filter(student => student.year === year && student.parallel)
      .map(student => String(student.parallel)))].sort((a, b) => a.localeCompare(b, 'he', { numeric: true }));
  }

  eventTimeLabel(event: CalendarEvent): string {
    return event.all_day ? 'כל היום' : `${event.start_time || ''}–${event.end_time || ''}`;
  }

  eventAudienceLabel(event: CalendarEvent): string {
    if (event.class_scope === 'all') return 'כל הכיתות';
    if (event.class_scope === 'grade') return `שכבה ${event.class_year}`;
    if (event.class_scope === 'class') return `כיתה ${event.class_year}${event.class_parallel}`;
    return 'לא הוגדר';
  }

  setHolidayMode(event: { all_day: boolean; class_scope: 'all' | 'grade' | 'class' }, enabled: boolean) {
    if (!enabled) return;
    event.all_day = true;
    event.class_scope = 'all';
  }

  dotColor(item: CalendarItem): string | null {
    if (item.kind === 'loan') return this.loanColor(item.loan!);
    if (item.kind === 'exam') return '#e11d48';
    if (item.kind === 'event') return this.schoolEventColor(item.event!);
    if (item.kind === 'birthday') return '#db2777';
    return null; // tasks use CSS class
  }

  // ── Misc helpers ──
  canImportCalendar() {
    const r = this.auth.user()?.role;
    return r === 'admin' || r === 'secretary';
  }

  canViewBirthdays() {
    return this.auth.hasPermission('students');
  }

  openEventDetail(event: CalendarEvent) {
    this.addTaskOpen.set(false);
    this.addExamOpen.set(false);
    this.addEventOpen.set(false);
    this.selectedEvent.set(event);
    this.editingEvent.set(false);
    this.dialogError.set('');
    this.eventDetailOpen.set(true);
  }

  closeEventDetail() {
    this.eventDetailOpen.set(false);
    this.editingEvent.set(false);
    this.dialogError.set('');
  }

  startEditEvent() {
    const ev = this.selectedEvent();
    if (!ev) return;
    this.editEventDraft = {
      title: ev.title, category: ev.category, all_day: ev.class_scope === 'none' || !!ev.all_day,
      start_time: ev.start_time || '08:00', end_time: ev.end_time || '09:00',
      class_scope: ev.class_scope === 'none' ? 'all' : ev.class_scope,
      class_year: ev.class_year || 'ה', class_parallel: ev.class_parallel || '',
      is_school_holiday: !!ev.is_school_holiday
    };
    this.editingEvent.set(true);
  }

  saveEditEvent() {
    const ev = this.selectedEvent();
    if (!ev || !this.editEventDraft.title.trim()) return;
    this.api.updateCalendarEvent(ev.id, {
      title: this.editEventDraft.title.trim(),
      event_date: ev.event_date,
      category: this.editEventDraft.category.trim() || 'כללי',
      notes: ev.notes || '',
      all_day: this.editEventDraft.all_day,
      start_time: this.editEventDraft.start_time,
      end_time: this.editEventDraft.end_time,
      class_scope: this.editEventDraft.class_scope,
      class_year: this.editEventDraft.class_scope === 'all' ? '' : this.editEventDraft.class_year,
      class_parallel: this.editEventDraft.class_scope === 'class' ? this.editEventDraft.class_parallel : '',
      is_school_holiday: this.editEventDraft.is_school_holiday
    }).subscribe({
      next: () => {
        this.api.getCalendarEvents().subscribe(v => this.calendarEvents.set(v));
        this.closeEventDetail();
      },
      error: e => this.dialogError.set(e.error?.error || 'שמירה נכשלה')
    });
  }

  deleteEvent(event: CalendarEvent) {
    if (!confirm(`למחוק את האירוע "${event.title}"?`)) return;
    this.api.deleteCalendarEvent(event.id).subscribe({
      next: () => {
        this.calendarEvents.update(evs => evs.filter(e => e.id !== event.id));
        this.closeEventDetail();
      },
      error: e => this.loadError = e.error?.error || 'מחיקה נכשלה'
    });
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

  classOptions(): { parallel: string; label: string; count: number }[] {
    const map = new Map<string, { label: string; count: number }>();
    for (const s of this.allStudents()) {
      if (!s.parallel) continue;
      const existing = map.get(s.parallel);
      if (existing) existing.count++;
      else map.set(s.parallel, { label: s.class_name || s.parallel, count: 1 });
    }
    return Array.from(map, ([parallel, v]) => ({ parallel, label: v.label, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'he'));
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

  formatGanttDay(date: string): string {
    const d = new Date(`${date}T12:00:00`);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  formatHebrewGanttDate(date: string): string {
    const hebrewDate = new HDate(new Date(`${date}T12:00:00`));
    const monthName = hebrewDate.getMonth() === months.ADAR_I && hebrewDate.isLeapYear()
      ? 'אדר א׳' : HEBREW_MONTH_NAMES[hebrewDate.getMonth()];
    return `${HEBREW_DAY_NUMERALS[hebrewDate.getDate()]} ${monthName || ''}`;
  }

  dateWeekday(date: string): number {
    return new Date(`${date}T12:00:00`).getDay();
  }

  ganttGridTemplate(): string {
    return `52px repeat(${this.ganttDays().length}, minmax(0, 1fr))`;
  }

  ganttEntriesForDay(date: string): GanttEntry[] {
    return this.ganttEntries().filter(entry => entry.date === date && entry.kind !== 'birthday');
  }

  ganttBirthdaysForDay(date: string): GanttEntry[] {
    return this.ganttEntries().filter(entry => entry.date === date && entry.kind === 'birthday');
  }

  ganttLegend(): { label: string; color: string }[] {
    const fixed = [
      { label: 'משימה', color: '#2563eb' },
      { label: 'משימה שבוצעה', color: '#b45309' },
      { label: 'מבחן', color: '#dc2626' },
      { label: 'יום הולדת', color: '#db2777' },
      { label: 'חתונה', color: '#9333ea' },
      { label: 'ציוד', color: '#0f766e' }
    ];
    const visibleFixed = fixed.filter(item =>
      (item.label === 'משימה' && this.has('personal')) ||
      (item.label === 'משימה שבוצעה' && this.has('personal') &&
        this.ganttEntries().some(entry => entry.kind === 'task' && entry.color === item.color)) ||
      (item.label === 'מבחן' && this.has('exams')) ||
      (item.label === 'יום הולדת' && this.has('birthdays')) ||
      (item.label === 'חתונה' && this.has('weddings')) ||
      (item.label === 'ציוד' && this.has('equipment'))
    );
    if (!this.has('schedule')) return visibleFixed;
    const categories = new Map<string, { label: string; color: string }>([
      ['חג / יום חופש', { label: 'חג / יום חופש', color: '#7c3aed' }],
      ['טיול / סיור', { label: 'טיול / סיור', color: '#15803d' }]
    ]);
    for (const event of this.calendarEvents()) {
      if (!event.category) continue;
      const label = this.ganttEventLabel(event.category, Boolean(event.is_school_holiday));
      categories.set(label, {
        label,
        color: this.ganttEventColor(event.category, Boolean(event.is_school_holiday))
      });
    }
    return [...new Map(
      [...visibleFixed, ...categories.values()]
        .map(item => [item.label, item] as const)
    ).values()];
  }

  ganttEventLabel(category: string, isHoliday = false): string {
    const normalized = String(category || '').replace(/[\s־-]/g, '');
    if (isHoliday || /חג|חופשה|אסרוחג/.test(normalized)) return 'חג / יום חופש';
    if (/טיול|סיור|מסע/.test(normalized)) return 'טיול / סיור';
    if (/מבחן|בחינה/.test(normalized)) return 'מבחן';
    return category;
  }

  ganttEventColor(category: string, isHoliday = false): string {
    const normalized = String(category || '').replace(/[\s־-]/g, '');
    if (isHoliday || /חג|חופשה|אסרוחג/.test(normalized)) return '#7c3aed';
    if (/טיול|סיור|מסע/.test(normalized)) return '#15803d';
    if (/מבחן|בחינה/.test(normalized)) return '#dc2626';
    return '#0369a1';
  }

  showGanttDetails(event: Event, entry: GanttEntry) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 270;
    const preferredLeft = rect.left >= width + 16 ? rect.left - width - 8 : rect.right + 8;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 130));
    this.ganttHover.set({ entry, left, top });
  }

  hideGanttDetails() {
    this.ganttHover.set(null);
  }

  ganttPastelColor(color: string): string {
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
    if (!match) return '#e2e8f0';
    const hex = match[1].length === 3 ? [...match[1]].map(char => char + char).join('') : match[1];
    const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
    return `#${channels.map(channel => Math.round(channel * 0.22 + 255 * 0.78).toString(16).padStart(2, '0')).join('')}`;
  }

  formatGanttHour(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  ganttTop(minute: number): number {
    return minute * 44 / 60;
  }

  ganttHeight(startMinute: number, endMinute: number): number {
    return (endMinute - startMinute) * 44 / 60;
  }

  private ganttTimeRange(start?: string | null, end?: string | null, allDay = false) {
    const startMinute = this.ganttTimeToMinutes(start);
    const endMinute = this.ganttTimeToMinutes(end);
    if (allDay || startMinute === null || endMinute === null || endMinute <= startMinute) {
      return { start: 0, end: 1440, label: '', allDay: true };
    }
    return {
      start: startMinute,
      end: endMinute,
      label: `${start}–${end}`,
      allDay: false
    };
  }

  private ganttTimeToMinutes(value?: string | null): number | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  private isValidDate(v: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T12:00:00`);
    return !isNaN(d.getTime()) && this.toDateString(d) === v;
  }
}

import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HDate, months } from '@hebcal/core';
import { ApiService, CalendarEvent } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Loan } from '../../models';
import { MessagesService, PersonalTask } from '../../services/messages.service';
import { toStudyYear } from '../approvals/study-year';

const HEBREW_MONTH_NAMES: Record<number, string> = {
[months.TISHREI]: 'תשרי',
[months.CHESHVAN]: 'חשוון',
[months.KISLEV]: 'כסלו',
[months.TEVET]: 'טבת',
[months.SHVAT]: 'שבט',
[months.ADAR_I]: 'אדר',
[months.ADAR_II]: 'אדר ב׳',
[months.NISAN]: 'ניסן',
[months.IYYAR]: 'אייר',
[months.SIVAN]: 'סיוון',
[months.TAMUZ]: 'תמוז',
[months.AV]: 'אב',
[months.ELUL]: 'אלול',
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
months.ADAR_I, months.ADAR_II, months.NISAN, months.IYYAR, months.SIVAN, months.TAMUZ,
months.AV, months.ELUL
];

function toHebrewYear(year: number): string {
let value = year % 1000;
let label = '';
const values: [number, string][] = [
[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'],
[80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'],
[30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'],
[7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
];
for (const [number, letter] of values) {
while (value >= number) {
label += letter;
value -= number;
}
}
return label.length === 1 ? `${label}׳` : `${label.slice(0, -1)}״${label.slice(-1)}`;
}

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

@Component({
selector: 'app-monthly-calendar',
imports: [CommonModule, RouterLink, FormsModule],
template: `
<div class="page-header">
<div>
<h1> לוח שנה</h1>
<p class="subtitle">תצוגה חודשית לפי הלוח העברי</p>
</div>
</div>

<div class="month-toolbar">
<button type="button" class="month-nav" (click)="changeMonth(-1)" aria-label="החודש הקודם">‹</button>
<div class="month-heading">
<h2>{{ monthName() }} {{ hebrewYearLabel() }}</h2>
<span>{{ gregorianRangeLabel() }}</span>
</div>
<button type="button" class="month-nav" (click)="changeMonth(1)" aria-label="החודש הבא">›</button>
</div>

<nav class="calendar-tabs" role="group" aria-label="בחירת לוחות להצגה">
<button type="button" class="layer-chip" [class.active]="has('equipment')"
[attr.aria-pressed]="has('equipment')" (click)="toggleLayer('equipment')">
השאלת ציוד
</button>
<button type="button" class="layer-chip" [class.active]="has('personal')"
[attr.aria-pressed]="has('personal')" (click)="toggleLayer('personal')">
הלוח האישי
</button>
<button type="button" class="layer-chip" [class.active]="has('schedule')"
[attr.aria-pressed]="has('schedule')" (click)="toggleLayer('schedule')">
לוח המערכת
</button>
<button type="button" class="layer-chip" [class.active]="has('exams')"
[attr.aria-pressed]="has('exams')" (click)="toggleLayer('exams')">
לוח מבחנים
</button>
</nav>

<nav *ngIf="has('schedule') && calendarSheets().length"
class="sheet-tabs" role="tablist" aria-label="גיליונות לוח המערכת">
<button type="button" role="tab" [attr.aria-selected]="selectedSourceSheet() === null"
[class.active]="selectedSourceSheet() === null" (click)="selectSourceSheet(null)">
כל הגיליונות
</button>
<button *ngFor="let sheet of calendarSheets()" type="button" role="tab"
[attr.aria-selected]="selectedSourceSheet() === sheet"
[class.active]="selectedSourceSheet() === sheet" (click)="selectSourceSheet(sheet)">
{{ sheet }}
</button>
</nav>

<section *ngIf="has('schedule') && canImportCalendar()" class="upload-panel">
<label class="upload-button" [class.uploading]="uploading">
<input type="file" accept=".xlsx" [disabled]="uploading" (change)="onCalendarFileSelected($event)">
{{ uploading ? 'מעלה ומייבאת...' : ' העלאת לוח שנה מאקסל' }}
</label>
<span class="upload-help">בחרי קובץ Excel מסוג ‎.xlsx. אירועים מהגיליונות יישמרו בלוח המערכת.</span>
<p *ngIf="uploadMessage" class="upload-success" role="status">{{ uploadMessage }}</p>
<p *ngIf="uploadError" class="upload-error" role="alert">{{ uploadError }}</p>
</section>

<div *ngIf="loadError" class="calendar-error" role="alert">{{ loadError }}</div>
<p *ngIf="!layers().size" class="empty-state">בחרי לפחות לוח אחד להצגה</p>
<div class="calendar-legend">
<span class="legend-item" *ngIf="has('equipment')">
<span class="legend-dot equipment-dot"></span> ציוד מושאל
</span>
<span class="legend-item" *ngIf="has('personal')">
<span class="legend-dot task-dot"></span> משימה פתוחה
<span class="legend-dot completed-dot"></span> משימה שבוצעה
</span>
<span class="legend-item" *ngIf="has('schedule')">
אירוע בלוח המערכת (צבע לפי קטגוריה)
</span>
</div>

<section class="month-card" [attr.aria-label]="'לוח חודש ' + monthName() + ' ' + hebrewYearLabel()">
<div class="month-grid">
<span *ngFor="let dayName of dayNames" class="weekday">{{ dayName }}</span>
<ng-container *ngFor="let day of monthCells()">
<span *ngIf="!day" class="empty-day" aria-hidden="true"></span>
<button *ngIf="day as calendarDay" type="button" class="calendar-day"
[class.today]="calendarDay.date === today"
[class.selected]="selectedDate() === calendarDay.date"
[class.has-events]="visibleItems(calendarDay).length > 0"
[attr.aria-label]="dayLabel(calendarDay)"
(click)="selectDate(calendarDay.date)">
<span class="day-numbers">
<span class="hebrew-day">{{ calendarDay.hebrewDay }}</span>
<span class="gregorian-day">{{ calendarDay.gregorianDay }}<span
*ngIf="calendarDay.gregorianDay === 1">/{{ calendarDay.gregorianMonth }}</span></span>
</span>
<span *ngIf="visibleItems(calendarDay).length && onlySchedule()"
class="schedule-event-labels" aria-hidden="true">
<span *ngFor="let item of visibleItems(calendarDay).slice(0, 2)"
class="schedule-event-label"
[style.border-inline-start-color]="item.kind === 'exam' ? '#e11d48' : schoolEventColor(item.event!)">
{{ item.kind === 'exam' ? ' ' + item.exam!.name : item.event?.title }}
</span>
<span *ngIf="visibleItems(calendarDay).length > 2" class="more-events">
+{{ visibleItems(calendarDay).length - 2 }}
</span>
</span>
<span *ngIf="visibleItems(calendarDay).length && !onlySchedule()"
class="event-markers" aria-hidden="true">
<span *ngFor="let item of visibleItems(calendarDay).slice(0, 4)"
class="event-dot" [class.task-dot]="item.kind === 'task'"
[class.completed-dot]="item.kind === 'task' && item.completed"
[style.background]="item.kind === 'loan'
? loanColor(item.loan!)
: item.kind === 'exam' ? '#e11d48' : item.kind === 'event' ? schoolEventColor(item.event!) : null"></span>
<span *ngIf="visibleItems(calendarDay).length > 4" class="more-events">
+{{ visibleItems(calendarDay).length - 4 }}
</span>
</span>
<span *ngIf="visibleItems(calendarDay).length" class="day-tooltip" role="tooltip">
<span *ngFor="let item of visibleItems(calendarDay)">
<ng-container *ngIf="item.kind === 'loan'">
{{ item.loan?.equipment_name }} · {{ item.loan?.borrower_name }}
</ng-container>
<ng-container *ngIf="item.kind === 'task'">
{{ item.task?.completed ? '' : '' }} {{ item.task?.title }}
</ng-container>
<ng-container *ngIf="item.kind === 'exam'">
{{ item.exam?.name }}{{ item.exam?.track ? ' · ' + item.exam?.track + toStudyYearSuffix(item.exam?.year) : '' }}
</ng-container>
</span>
</span>
</button>
</ng-container>
</div>
</section>

<section class="selected-day-card">
<h2>{{ selectedDateLabel() }}</h2>
<p *ngIf="layers().size && !selectedDayCount()" class="empty-state">אין פריטים ביום זה בלוחות שנבחרו</p>
<ng-container *ngIf="has('equipment') && selectedDayLoans().length">
<h3 class="layer-title"> השאלת ציוד</h3>
<div *ngFor="let loan of selectedDayLoans()" class="detail-row">
<span class="detail-dot" [style.background]="loanColor(loan)"></span>
<div class="detail-main">
<a [routerLink]="['/equipment', loan.equipment_id]">{{ loan.equipment_name }}</a>
<span>{{ loan.borrower_name }}{{ loan.track ? ' — ' + loan.track : '' }}</span>
</div>
<span class="detail-date">{{ loan.loan_date }} → {{ loan.expected_return }}</span>
</div>
</ng-container>
<ng-container *ngIf="has('personal') && selectedDayTasks().length">
<h3 class="layer-title"> הלוח האישי</h3>
<div *ngFor="let task of selectedDayTasks()" class="detail-row" [class.completed]="task.completed">
<button type="button" class="task-check" [disabled]="updatingTaskId === task.id"
[attr.aria-label]="task.completed ? 'סמני כלא בוצעה' : 'סמני כבוצעה'"
[attr.aria-pressed]="task.completed" (click)="toggleTask(task)">
{{ task.completed ? '' : '' }}
</button>
<span class="task-title">{{ task.title }}</span>
</div>
</ng-container>
<ng-container *ngIf="has('schedule') && selectedDayEvents().length">
<h3 class="layer-title"> לוח המערכת</h3>
<div *ngFor="let event of selectedDayEvents()" class="detail-row">
<span class="detail-dot" [style.background]="schoolEventColor(event)"></span>
<div class="detail-main">
<strong>{{ event.title }}</strong>
<span>{{ event.category }} · {{ event.source_sheet }}</span>
</div>
</div>
</ng-container>
<ng-container *ngIf="has('exams') && selectedDayExams().length">
<h3 class="layer-title"> מבחנים</h3>
<div *ngFor="let exam of selectedDayExams()" class="detail-row">
<span class="detail-dot exam-dot"></span>
<div class="detail-main">
<a [routerLink]="['/exams']" [queryParams]="{ exam: exam.id, print: '1' }"><strong>{{ exam.name }}</strong></a>
<span>{{ exam.track || 'כל המסלולים' }}{{ exam.year ? ' · ' + toStudyYear(exam.year) : '' }} — לחצי להדפסת ברקודים</span>
</div>
<span class="detail-date"></span>
</div>
</ng-container>
</section>
`,
styles: [`
.month-toolbar {
display: flex; align-items: center; justify-content: space-between; gap: 12px;
margin: 0 0 14px; padding: 12px; border: 1px solid var(--border);
border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm);
}
.month-heading { flex: 1; text-align: center; }
.month-heading h2 { margin: 0; color: var(--primary); font-size: 1.15rem; }
.month-heading span { color: var(--text-muted); font-size: 0.8rem; }
.month-nav {
width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 9px;
background: var(--surface); color: var(--primary); font-size: 1.25rem; cursor: pointer;
}
.calendar-tabs {
display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px;
}
.layer-chip {
padding: 9px 18px; border-radius: 999px; border: 1.5px solid var(--border);
background: var(--surface); color: var(--text-muted); font: inherit; font-weight: 700; cursor: pointer;
transition: all var(--transition);
}
.layer-chip:hover { border-color: var(--primary); color: var(--primary); }
.layer-chip.active { background: var(--primary); border-color: var(--primary); color: #fff; box-shadow: var(--shadow-sm); }
.layer-title { margin: 14px 0 6px; font-size: 0.95rem; color: var(--text-muted); }
.sheet-tabs {
display: flex; gap: 6px; overflow-x: auto; margin: -4px 0 14px; padding: 4px 2px 8px;
scrollbar-width: thin;
}
.sheet-tabs button {
flex: 0 0 auto; padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px;
background: var(--surface); color: var(--text-muted); cursor: pointer; font: inherit;
font-size: 0.85rem; font-weight: 700; white-space: nowrap;
}
.sheet-tabs button:hover { border-color: var(--primary); color: var(--primary); }
.sheet-tabs button.active {
border-color: var(--primary); background: var(--primary); color: white;
}
.upload-panel {
display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
margin: 0 0 14px; padding: 12px; border: 1px solid var(--border);
border-radius: 10px; background: var(--surface);
}
.upload-button {
display: inline-flex; align-items: center; justify-content: center; gap: 8px;
min-height: 38px; padding: 8px 14px; border-radius: 9px;
background: var(--primary); color: white; cursor: pointer; font-weight: 700;
}
.upload-button.uploading { opacity: 0.65; cursor: wait; }
.upload-button input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.upload-help { color: var(--text-muted); font-size: 0.78rem; }
.upload-success, .upload-error { flex-basis: 100%; margin: 0; font-size: 0.85rem; }
.upload-success { color: var(--success); }
.upload-error { color: var(--danger); }
.calendar-legend {
display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
margin: 0 0 12px; color: var(--text-muted); font-size: 0.78rem;
}
.legend-item { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot, .event-dot, .detail-dot {
display: inline-block; width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%;
}
.equipment-dot { background: #0d9488; }
  .task-dot { background: #6366f1; }
.completed-dot { background: #10b981; }
.exam-dot { background: #e11d48; }
.month-card, .selected-day-card {
min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius);
background: var(--surface); box-shadow: var(--shadow-sm);
}
.month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.weekday { padding: 6px 0; color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-align: center; }
.calendar-day, .empty-day {
position: relative; min-width: 0; min-height: 82px; padding: 7px; border: 1px solid var(--border);
border-radius: 8px; background: var(--surface); color: var(--text);
}
.calendar-day { display: flex; flex-direction: column; align-items: stretch; cursor: pointer; font: inherit; }
.calendar-day:hover, .calendar-day:focus-visible { z-index: 2; border-color: var(--primary); background: var(--primary-light); }
.calendar-day.today { border-color: var(--primary); }
.calendar-day.selected { border-color: var(--primary); background: var(--primary); color: white; }
.day-numbers { display: flex; justify-content: space-between; align-items: baseline; gap: 2px; }
.hebrew-day { font-size: 0.88rem; font-weight: 700; }
.gregorian-day { color: var(--text-muted); font-size: 0.72rem; direction: ltr; }
.calendar-day.today .hebrew-day { color: var(--primary); }
.calendar-day.selected .hebrew-day, .calendar-day.selected .gregorian-day { color: white; }
.event-markers { display: flex; align-items: center; gap: 2px; min-height: 8px; margin-top: auto; }
.schedule-event-labels {
display: grid; gap: 2px; overflow: hidden;
}
.schedule-event-label {
overflow: hidden; padding-inline-start: 4px; border-inline-start: 2px solid;
font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap;
}
.event-dot { width: 8px; height: 8px; flex-basis: 8px; }
.more-events { color: var(--text-muted); font-size: 0.65rem; }
.day-tooltip {
display: none; position: absolute; z-index: 3; right: 50%; bottom: calc(100% + 5px);
transform: translateX(50%); width: max-content; max-width: min(220px, 70vw); padding: 8px 10px;
border-radius: 8px; background: #1e1e2e; box-shadow: 0 4px 14px rgba(0, 0, 0, .22);
color: white; text-align: right; white-space: normal; pointer-events: none;
}
.day-tooltip > span { display: block; overflow-wrap: anywhere; font-size: 0.78rem; line-height: 1.5; }
.calendar-day:hover .day-tooltip, .calendar-day:focus-visible .day-tooltip { display: block; }
.selected-day-card { margin-top: 16px; }
.selected-day-card h2 { margin: 0 0 10px; font-size: 1rem; }
.detail-row {
display: flex; align-items: center; gap: 10px; min-height: 40px; margin-top: 7px;
padding: 7px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2);
}
.detail-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.detail-main a { color: var(--primary); font-weight: 700; text-decoration: none; }
.detail-main span, .detail-date { color: var(--text-muted); font-size: 0.75rem; }
.detail-date { direction: ltr; white-space: nowrap; }
.task-check {
display: inline-flex; flex: 0 0 23px; width: 23px; height: 23px; align-items: center; justify-content: center;
border: 1.5px solid var(--primary); border-radius: 6px; background: var(--surface); color: white;
cursor: pointer; font-weight: 800;
}
.detail-row.completed .task-check { background: var(--primary); }
.detail-row.completed .task-title { color: var(--text-muted); text-decoration: line-through; }
.task-title { overflow-wrap: anywhere; }
.empty-state { margin: 0; color: var(--text-muted); font-size: 0.88rem; }
.calendar-error { margin-bottom: 10px; color: var(--danger); font-size: 0.88rem; }
@media (max-width: 560px) {
.month-card { padding: 8px; }
.calendar-day, .empty-day { min-height: 64px; padding: 5px; }
.weekday { font-size: 0.68rem; }
.hebrew-day { font-size: 0.78rem; }
.gregorian-day { font-size: 0.65rem; }
}
`]
})
export class MonthlyCalendarComponent implements OnInit {
readonly dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
readonly today = this.toDateString(new Date());
readonly layers = signal<Set<CalendarLayer>>(new Set<CalendarLayer>(['equipment']));
private readonly initialHebrewDate = new HDate(new Date());
readonly displayedYear = signal(this.initialHebrewDate.getFullYear());
readonly displayedMonth = signal(this.initialHebrewDate.getMonth());
readonly selectedDate = signal(this.today);
readonly loans = signal<Loan[]>([]);
readonly tasks = signal<PersonalTask[]>([]);
readonly calendarEvents = signal<CalendarEvent[]>([]);
readonly exams = signal<any[]>([]);
readonly selectedSourceSheet = signal<string | null>(null);
readonly calendarSheets = computed(() =>
[...new Set(this.calendarEvents().map(event => event.source_sheet))]
.sort((left, right) => left.localeCompare(right, 'he'))
);
readonly monthCells = computed(() => this.buildMonthCells());
readonly selectedDayLoans = computed(() => this.loansForDate(this.selectedDate()));
readonly selectedDayTasks = computed(() => this.tasksForDate(this.selectedDate()));
readonly selectedDayEvents = computed(() => this.eventsForDate(this.selectedDate()));
readonly selectedDayExams = computed(() => this.examsForDate(this.selectedDate()));
readonly selectedDayCount = computed(() =>
(this.has('equipment') ? this.selectedDayLoans().length : 0) +
(this.has('personal') ? this.selectedDayTasks().length : 0) +
(this.has('schedule') ? this.selectedDayEvents().length : 0) +
(this.has('exams') ? this.selectedDayExams().length : 0)
);
readonly selectedDateLabel = computed(() => this.formatDateLabel(this.selectedDate()));
loadError = '';
uploadError = '';
uploadMessage = '';
uploading = false;
updatingTaskId: number | null = null;
private colorMap = new Map<number, string>();
  private readonly colors = ['#0d9488', '#0891b2', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];
  private readonly eventColors = ['#0d9488', '#0891b2', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#84cc16'];

constructor(
private api: ApiService,
private messages: MessagesService,
private route: ActivatedRoute,
private auth: AuthService
) {}

ngOnInit() {
this.route.data.subscribe(data => {
const view = data['view'];
this.layers.set(new Set<CalendarLayer>([view === 'personal' || view === 'schedule' ? view : 'equipment']));
});
this.route.queryParamMap.subscribe(params => {
const requestedDate = params.get('date');
if (requestedDate && this.isValidDate(requestedDate)) {
this.selectedDate.set(requestedDate);
const hebrewDate = new HDate(new Date(`${requestedDate}T12:00:00`));
this.displayedYear.set(hebrewDate.getFullYear());
this.displayedMonth.set(hebrewDate.getMonth());
}
});
this.api.getLoans().subscribe({
next: loans => this.loans.set(loans),
error: error => this.loadError = error.error?.error || 'לא ניתן לטעון את השאלות הציוד'
});
this.messages.getTasks().subscribe({
next: tasks => this.tasks.set(tasks),
error: error => this.loadError = error.error?.error || 'לא ניתן לטעון את המשימות האישיות'
});
this.loadCalendarEvents();
this.api.getExams().subscribe(exams => this.exams.set(exams));
}

private toDateString(date: Date): string {
return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

private isValidDate(value: string): boolean {
if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
const date = new Date(`${value}T12:00:00`);
return !Number.isNaN(date.getTime()) && this.toDateString(date) === value;
}

private monthNumbers(year: number): number[] {
return HDate.isLeapYear(year) ? MONTHS_IN_LEAP_YEAR : MONTHS_IN_COMMON_YEAR;
}

private buildMonthCells(): (CalendarDay | null)[] {
const year = this.displayedYear();
const month = this.displayedMonth();
const count = HDate.daysInMonth(month, year);
const firstWeekday = new HDate(1, month, year).getDay();
const cells: (CalendarDay | null)[] = Array.from({ length: firstWeekday }, () => null);
for (let day = 1; day <= count; day++) {
const hebrewDate = new HDate(day, month, year);
const gregorian = hebrewDate.greg();
const date = this.toDateString(gregorian);
cells.push({
date,
hebrewDay: HEBREW_DAY_NUMERALS[day],
gregorianDay: gregorian.getDate(),
gregorianMonth: gregorian.getMonth() + 1,
loans: this.loansForDate(date),
tasks: this.tasksForDate(date),
calendarEvents: this.eventsForDate(date),
exams: this.examsForDate(date)
});
}
while (cells.length % 7 !== 0) cells.push(null);
return cells;
}

private loansForDate(date: string): Loan[] {
return this.loans().filter(loan =>
!loan.actual_return &&
loan.loan_date <= date &&
loan.expected_return >= date &&
!this.isHiddenFromGeneralView(loan) &&
loan.category !== 'מחשב נייד'
);
}

private tasksForDate(date: string): PersonalTask[] {
return this.tasks().filter(task => task.due_date === date);
}

private examsForDate(date: string): any[] {
return this.exams().filter(e => e.exam_date === date);
}

toStudyYear = toStudyYear;

toStudyYearSuffix(year?: string): string {
const y = toStudyYear(year);
return y ? ' ' + y : '';
}

private eventsForDate(date: string): CalendarEvent[] {
const sourceSheet = this.selectedSourceSheet();
const events = this.calendarEvents().filter(event =>
event.event_date === date && (sourceSheet === null || event.source_sheet === sourceSheet)
);
const unique = new Map<string, CalendarEvent>();
for (const event of events) {
const key = `${event.source_sheet}\u0000${event.title}\u0000${event.category}`;
if (!unique.has(key)) unique.set(key, event);
}
return [...unique.values()];
}

selectSourceSheet(sourceSheet: string | null) {
this.selectedSourceSheet.set(sourceSheet);
}

has(layer: CalendarLayer): boolean {
return this.layers().has(layer);
}

onlySchedule(): boolean {
return this.layers().size === 1 && this.has('schedule');
}

toggleLayer(layer: CalendarLayer) {
const next = new Set(this.layers());
if (!next.delete(layer)) next.add(layer);
this.layers.set(next);
}

visibleItems(day: CalendarDay): CalendarItem[] {
return [
...(this.has('equipment') ? day.loans.map((loan): CalendarItem => ({ kind: 'loan', loan })) : []),
...(this.has('personal') ? day.tasks.map((task): CalendarItem => ({ kind: 'task', task, completed: task.completed })) : []),
...(this.has('schedule') ? day.calendarEvents.map((event): CalendarItem => ({ kind: 'event', event })) : []),
...(this.has('exams') ? day.exams.map((exam): CalendarItem => ({ kind: 'exam', exam })) : [])
];
}

private isHiddenFromGeneralView(loan: Loan): boolean {
return loan.category === 'מצלמות אישיות' ||
(loan.category === 'ציוד צילום' && (loan as Loan & { subcategory?: string }).subcategory === 'מצלמות אישיות');
}

private formatDateLabel(date: string): string {
const gregorianDate = new Date(`${date}T12:00:00`);
const hebrewDate = new HDate(gregorianDate);
const monthName = hebrewDate.getMonth() === months.ADAR_I && HDate.isLeapYear(hebrewDate.getFullYear())
? 'אדר א׳'
: HEBREW_MONTH_NAMES[hebrewDate.getMonth()];
return `${HEBREW_DAY_NUMERALS[hebrewDate.getDate()]} ${monthName} ${toHebrewYear(hebrewDate.getFullYear())} | ${gregorianDate.toLocaleDateString('he-IL', {
weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
})}`;
}

monthName(): string {
const month = this.displayedMonth();
return month === months.ADAR_I && HDate.isLeapYear(this.displayedYear())
? 'אדר א׳'
: HEBREW_MONTH_NAMES[month];
}

hebrewYearLabel(): string {
return toHebrewYear(this.displayedYear());
}

gregorianRangeLabel(): string {
const days = this.monthCells().filter((day): day is CalendarDay => day !== null);
if (!days.length) return '';
const format = (day: CalendarDay) =>
`${day.gregorianDay}/${day.gregorianMonth}/${day.date.slice(0, 4)}`;
return `${format(days[0])} — ${format(days[days.length - 1])}`;
}

changeMonth(direction: -1 | 1) {
const monthsForYear = this.monthNumbers(this.displayedYear());
const currentIndex = monthsForYear.indexOf(this.displayedMonth());
let nextYear = this.displayedYear();
let nextIndex = currentIndex + direction;
if (nextIndex < 0) {
nextYear--;
nextIndex = this.monthNumbers(nextYear).length - 1;
} else if (nextIndex >= monthsForYear.length) {
nextYear++;
nextIndex = 0;
}
const nextMonth = this.monthNumbers(nextYear)[nextIndex];
this.displayedYear.set(nextYear);
this.displayedMonth.set(nextMonth);
const firstDate = this.toDateString(new HDate(1, nextMonth, nextYear).greg());
this.selectedDate.set(firstDate);
}

selectDate(date: string) {
this.selectedDate.set(date);
}

dayLabel(day: CalendarDay): string {
const itemCount = this.visibleItems(day).length;
return `${day.date}${itemCount ? `, ${itemCount} פריטים` : ''}`;
}

loanColor(loan: Loan): string {
if (!this.colorMap.has(loan.equipment_id)) {
this.colorMap.set(loan.equipment_id, this.colors[this.colorMap.size % this.colors.length]);
}
return this.colorMap.get(loan.equipment_id)!;
}

schoolEventColor(calendarEvent: CalendarEvent): string {
const categories = [...new Set(this.calendarEvents().map(item => item.category))];
const categoryIndex = categories.indexOf(calendarEvent.category);
return this.eventColors[(categoryIndex < 0 ? 0 : categoryIndex) % this.eventColors.length];
}

canImportCalendar(): boolean {
const role = this.auth.user()?.role;
return role === 'admin' || role === 'secretary';
}

private loadCalendarEvents() {
this.api.getCalendarEvents().subscribe({
next: events => this.calendarEvents.set(events),
error: error => this.loadError = error.error?.error || 'לא ניתן לטעון את אירועי לוח המערכת'
});
}

onCalendarFileSelected(event: Event) {
const input = event.target as HTMLInputElement;
const file = input.files?.[0];
input.value = '';
if (!file) return;

this.uploading = true;
this.uploadError = '';
this.uploadMessage = '';
this.api.importCalendarWorkbook(file).subscribe({
next: result => {
this.uploading = false;
this.uploadMessage = `נשמרו ${result.imported} אירועים מ-${result.sheets} גיליונות.`;
if (result.warnings.length) {
this.uploadMessage += ` גיליונות ללא תאריכים: ${result.warnings.join(', ')}.`;
}
this.loadCalendarEvents();
},
error: error => {
this.uploading = false;
this.uploadError = error.error?.error || 'לא ניתן לייבא את קובץ האקסל';
}
});
}

toggleTask(task: PersonalTask) {
if (this.updatingTaskId !== null) return;
this.updatingTaskId = task.id;
this.loadError = '';
this.messages.setTaskCompleted(task.id, !task.completed).subscribe({
next: () => {
this.tasks.update(items => items.map(item =>
item.id === task.id ? { ...item, completed: !task.completed } : item
));
this.updatingTaskId = null;
},
error: error => {
this.updatingTaskId = null;
this.loadError = error.error?.error || 'לא ניתן לעדכן את מצב המשימה';
}
});
}
}

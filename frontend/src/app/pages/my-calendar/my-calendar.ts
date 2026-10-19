import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HDate, months } from '@hebcal/core';
import { MessagesService, PersonalTask } from '../../services/messages.service';

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

  if (label.length === 1) return `${label}׳`;
  return `${label.slice(0, -1)}״${label.slice(-1)}`;
}

interface TaskCalendarDay {
  date: string;
  day: number;
  hebrewDayLabel: string;
  gregorianDay: number;
  gregorianMonth: number;
  inMonth: boolean;
  isToday: boolean;
  tasks: PersonalTask[];
}

@Component({
  selector: 'app-my-calendar',
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div>
        <h1>🗓 היומן שלי</h1>
        <p class="subtitle">המשימות האישיות שלך בלבד</p>
      </div>
    </div>

    <section class="today-card">
      <h2>✅ המשימות שלי להיום</h2>
      <p class="empty-state" *ngIf="!tasksForDate(today).length">אין משימות להיום</p>
      <div *ngFor="let task of tasksForDate(today)" class="task-row" [class.completed]="task.completed">
        <button type="button" class="task-check"
          [attr.aria-label]="task.completed ? 'סמני כלא בוצעה' : 'סמני כבוצעה'"
          [attr.aria-pressed]="task.completed" [disabled]="updatingTaskId === task.id"
          (click)="toggleTask(task)">{{ task.completed ? '✓' : '' }}</button>
        <span class="task-title">{{ task.title }}</span>
      </div>
    </section>

    <div *ngIf="tasksError" class="task-error" role="alert">{{ tasksError }}</div>

    <section class="calendar-card" aria-label="לוח שנה אישי של משימות">
      <div class="calendar-header">
        <button type="button" class="calendar-nav" (click)="changeMonth(-1)" aria-label="החודש הקודם">‹</button>
        <div>
          <h2>{{ monthName() }} {{ hebrewYearLabel() }}</h2>
          <span>{{ gregorianRangeLabel() }}</span>
        </div>
        <button type="button" class="calendar-nav" (click)="changeMonth(1)" aria-label="החודש הבא">›</button>
      </div>
      <div class="calendar-grid">
        <div *ngFor="let dayName of dayNames" class="day-name">{{ dayName }}</div>
        <button *ngFor="let day of calendarDays()" type="button" class="calendar-day"
          [class.outside-month]="!day.inMonth" [class.today]="day.isToday"
          [class.selected]="selectedDate() === day.date" [class.has-tasks]="day.tasks.length > 0"
          [attr.aria-label]="day.date + (day.tasks.length ? ', ' + day.tasks.length + ' משימות' : '')"
          (click)="day.inMonth && selectDate(day.date)">
          <span class="day-numbers">
            <span class="hebrew-day">{{ day.hebrewDayLabel }}</span>
            <span class="gregorian-day">{{ day.gregorianDay }}<span *ngIf="day.day === 1 || day.gregorianDay === 1">/{{ day.gregorianMonth }}</span></span>
          </span>
          <span *ngIf="day.tasks.length" class="task-dots" aria-hidden="true">
            <span *ngFor="let task of day.tasks.slice(0, 3)" class="task-dot"
              [class.task-dot-completed]="task.completed"></span>
            <span *ngIf="day.tasks.length > 3" class="task-dot-more">+{{ day.tasks.length - 3 }}</span>
          </span>
          <span *ngIf="day.tasks.length" class="day-task-tooltip" role="tooltip">
            <span *ngFor="let task of day.tasks" [class.tooltip-completed]="task.completed">
              {{ task.completed ? '✓' : '•' }} {{ task.title }}
            </span>
          </span>
        </button>
      </div>
    </section>

    <section class="selected-day-card">
      <h2>{{ selectedDateLabel() }}</h2>
      <p class="empty-state" *ngIf="!selectedTasks().length">אין משימות בתאריך זה</p>
      <div *ngFor="let task of selectedTasks()" class="task-row" [class.completed]="task.completed">
        <button type="button" class="task-check"
          [attr.aria-label]="task.completed ? 'סמני כלא בוצעה' : 'סמני כבוצעה'"
          [attr.aria-pressed]="task.completed" [disabled]="updatingTaskId === task.id"
          (click)="toggleTask(task)">{{ task.completed ? '✓' : '' }}</button>
        <span class="task-title">{{ task.title }}</span>
        <span class="task-source">מהודעה</span>
      </div>
    </section>
  `,
  styles: [`
    .today-card, .calendar-card, .selected-day-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow-sm); padding: 18px; margin-bottom: 18px;
    }
    .today-card h2, .selected-day-card h2 { margin: 0 0 12px; font-size: 1rem; }
    .calendar-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; text-align: center; }
    .calendar-header h2 { margin: 0; font-size: 1.15rem; }
    .calendar-header span, .task-source { color: var(--text-muted); font-size: 0.75rem; }
    .calendar-nav { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); color: var(--primary); font-size: 1.4rem; cursor: pointer; }
    .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
    .day-name { padding: 5px 0; color: var(--text-muted); text-align: center; font-size: 0.75rem; font-weight: 700; }
    .calendar-day { position: relative; min-height: 66px; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; padding: 7px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
    .calendar-day:hover, .calendar-day.selected { border-color: var(--primary); background: var(--primary-light); }
    .calendar-day:hover, .calendar-day:focus-visible { z-index: 2; }
    .calendar-day.outside-month { opacity: 0.42; }
    .calendar-day.today { outline: 2px solid var(--primary); outline-offset: -2px; }
    .day-numbers { display: flex; justify-content: space-between; align-items: baseline; width: 100%; margin-bottom: 4px; }
    .hebrew-day { font-size: 0.88rem; font-weight: 700; }
    .gregorian-day { color: var(--text-muted); font-size: 0.68rem; }
    .calendar-day.today .hebrew-day { color: var(--primary); }
    .calendar-day.selected { border-color: var(--primary); background: var(--primary); color: white; }
    .calendar-day.selected .hebrew-day, .calendar-day.selected .gregorian-day { color: white; }
    .task-dots { display: flex; align-items: center; gap: 3px; min-height: 9px; }
    .task-dot { width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6; box-shadow: 0 1px 3px rgba(139, 92, 246, 0.3); }
    .task-dot-completed { background: #10b981; box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3); }
    .task-dot-more { color: var(--text-muted); font-size: 0.6rem; line-height: 1; }
    .day-task-tooltip { display: none; position: absolute; z-index: 3; bottom: calc(100% + 6px); right: 50%; transform: translateX(50%); width: max-content; max-width: min(260px, 75vw); padding: 9px 11px; border-radius: 8px; background: #1e1e2e; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22); color: white; text-align: right; white-space: normal; pointer-events: none; }
    .day-task-tooltip > span { display: block; overflow-wrap: anywhere; font-size: 0.78rem; line-height: 1.5; }
    .day-task-tooltip .tooltip-completed { color: rgba(255, 255, 255, 0.62); text-decoration: line-through; }
    .calendar-day:hover .day-task-tooltip, .calendar-day:focus-visible .day-task-tooltip { display: block; }
    .task-row { display: flex; align-items: center; gap: 10px; min-height: 40px; margin-top: 7px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); }
    .task-check { flex: 0 0 24px; width: 24px; height: 24px; border: 1.5px solid var(--primary); border-radius: 6px; background: var(--surface); color: white; cursor: pointer; font-weight: 800; }
    .task-row.completed .task-check { background: var(--primary); }
    .task-row.completed .task-title { color: var(--text-muted); text-decoration: line-through; }
    .task-title { overflow-wrap: anywhere; }
    .task-source { margin-right: auto; }
    .empty-state { color: var(--text-muted); margin: 0; font-size: 0.88rem; }
    .task-error { margin-bottom: 12px; color: var(--danger); }
    @media (max-width: 520px) {
      .today-card, .calendar-card, .selected-day-card { padding: 12px; }
      .calendar-day { min-height: 54px; padding: 5px; font-size: 0.85rem; }
      .task-dot { width: 7px; height: 7px; }
    }
  `]
})
export class MyCalendarComponent implements OnInit {
  readonly today = this.toDateString(new Date());
  readonly dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  readonly tasks = signal<PersonalTask[]>([]);
  readonly selectedDate = signal(this.today);
  private month = signal(new HDate(new Date()).getMonth());
  private year = signal(new HDate(new Date()).getFullYear());
  tasksError = '';
  updatingTaskId: number | null = null;

  constructor(private messages: MessagesService, private route: ActivatedRoute) {}

  ngOnInit() {
    const requestedDate = this.route.snapshot.queryParamMap.get('date');
    if (requestedDate && this.isValidDate(requestedDate)) {
      const date = new Date(`${requestedDate}T12:00:00`);
      const hebrewDate = new HDate(date);
      this.selectedDate.set(requestedDate);
      this.month.set(hebrewDate.getMonth());
      this.year.set(hebrewDate.getFullYear());
    }
    this.loadTasks();
  }

  private toDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && this.toDateString(date) === value;
  }

  loadTasks() {
    this.tasksError = '';
    this.messages.getTasks().subscribe({
      next: tasks => this.tasks.set(tasks),
      error: error => this.tasksError = error.error?.error || 'לא ניתן לטעון את המשימות האישיות'
    });
  }

  tasksForDate(date: string): PersonalTask[] {
    return this.tasks().filter(task => task.due_date === date);
  }

  selectedTasks(): PersonalTask[] {
    return this.tasksForDate(this.selectedDate());
  }

  calendarDays(): TaskCalendarDay[] {
    const month = this.month();
    const year = this.year();
    const count = HDate.daysInMonth(month, year);
    const firstDayOfWeek = new HDate(1, month, year).getDay();
    const trailingDays = (7 - ((firstDayOfWeek + count) % 7)) % 7;
    const cells: TaskCalendarDay[] = [];
    for (let offset = firstDayOfWeek; offset > 0; offset--) {
      const hebrewDay = new HDate(1, month, year).subtract(offset);
      const gregorian = hebrewDay.greg();
      const date = this.toDateString(gregorian);
      cells.push({
        date,
        day: hebrewDay.getDate(),
        hebrewDayLabel: HEBREW_DAY_NUMERALS[hebrewDay.getDate()],
        gregorianDay: gregorian.getDate(),
        gregorianMonth: gregorian.getMonth() + 1,
        inMonth: false,
        isToday: date === this.today,
        tasks: this.tasksForDate(date)
      });
    }
    for (let day = 1; day <= count; day++) {
      const hebrewDay = new HDate(day, month, year);
      const gregorian = hebrewDay.greg();
      const date = this.toDateString(gregorian);
      cells.push({
        date,
        day: hebrewDay.getDate(),
        hebrewDayLabel: HEBREW_DAY_NUMERALS[hebrewDay.getDate()],
        gregorianDay: gregorian.getDate(),
        gregorianMonth: gregorian.getMonth() + 1,
        inMonth: true,
        isToday: date === this.today,
        tasks: this.tasksForDate(date)
      });
    }
    for (let offset = 1; offset <= trailingDays; offset++) {
      const hebrewDay = new HDate(count, month, year).add(offset);
      const gregorian = hebrewDay.greg();
      const date = this.toDateString(gregorian);
      cells.push({
        date,
        day: hebrewDay.getDate(),
        hebrewDayLabel: HEBREW_DAY_NUMERALS[hebrewDay.getDate()],
        gregorianDay: gregorian.getDate(),
        gregorianMonth: gregorian.getMonth() + 1,
        inMonth: false,
        isToday: date === this.today,
        tasks: this.tasksForDate(date)
      });
    }
    return cells;
  }

  changeMonth(direction: -1 | 1) {
    const date = new HDate(1, this.month(), this.year());
    const adjacent = direction < 0 ? date.subtract(1) : date.add(HDate.daysInMonth(this.month(), this.year()));
    this.month.set(adjacent.getMonth());
    this.year.set(adjacent.getFullYear());
  }

  monthName(): string {
    const month = this.month();
    return month === months.ADAR_I && HDate.isLeapYear(this.year())
      ? 'אדר א׳'
      : HEBREW_MONTH_NAMES[month] || '';
  }

  hebrewYear(): number {
    return this.year();
  }

  hebrewYearLabel(): string {
    return toHebrewYear(this.year());
  }

  gregorianRangeLabel(): string {
    const dates = this.calendarDays().filter(day => day.inMonth);
    if (!dates.length) return '';
    const format = (day: TaskCalendarDay) =>
      `${day.gregorianDay}/${day.gregorianMonth}/${day.date.slice(0, 4)}`;
    return `${format(dates[0])} — ${format(dates[dates.length - 1])}`;
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
  }

  selectedDateLabel(): string {
    const date = this.selectedDate();
    const gregorianLabel = new Date(`${date}T12:00:00`).toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const hebrewDate = new HDate(new Date(`${date}T12:00:00`));
    const hebrewMonth = hebrewDate.getMonth() === months.ADAR_I && HDate.isLeapYear(hebrewDate.getFullYear())
      ? 'אדר א׳'
      : HEBREW_MONTH_NAMES[hebrewDate.getMonth()];
    return `${HEBREW_DAY_NUMERALS[hebrewDate.getDate()]} ${hebrewMonth} ${toHebrewYear(hebrewDate.getFullYear())}  |  ${gregorianLabel}`;
  }

  toggleTask(task: PersonalTask) {
    if (this.updatingTaskId !== null) return;
    this.updatingTaskId = task.id;
    this.tasksError = '';
    this.messages.setTaskCompleted(task.id, !task.completed).subscribe({
      next: () => {
        this.tasks.update(items => items.map(item =>
          item.id === task.id ? { ...item, completed: !task.completed } : item
        ));
        this.updatingTaskId = null;
      },
      error: error => {
        this.updatingTaskId = null;
        this.tasksError = error.error?.error || 'לא ניתן לעדכן את מצב המשימה';
      }
    });
  }
}

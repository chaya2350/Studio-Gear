import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Observable } from 'rxjs';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
const YEARS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const PARALLELS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatHebDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

function toHebrewNumeral(value: number): string {
  if (value === 15) return 'ט״ו';
  if (value === 16) return 'ט״ז';
  let remainder = value;
  let result = '';
  const numerals: [number, string][] = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'],
    [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'],
    [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
    [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
  ];
  for (const [amount, letter] of numerals) {
    while (remainder >= amount) {
      result += letter;
      remainder -= amount;
    }
  }
  if (result.length === 1) return `${result}׳`;
  return `${result.slice(0, -1)}״${result.slice(-1)}`;
}

function formatHebrewDayHeading(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  const weekday = part('weekday').replace(/^יום\s*/, '');
  return `${weekday} - ${toHebrewNumeral(Number(part('day')))} ${part('month')} ${toHebrewNumeral(Number(part('year')) % 1000)}`;
}

@Component({
  selector: 'app-schedule',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="page-header schedule-page-header">
  <div>
    <h1>מערכת שעות</h1>
  </div>
  <div class="header-actions">
    <button *ngIf="activeTab() === 'grid'" type="button" class="btn btn-secondary" (click)="activeTab.set('manage')">ניהול שיעורים</button>
    <button *ngIf="activeTab() === 'manage'" type="button" class="btn btn-secondary" (click)="activeTab.set('grid')">חזרה למערכת</button>
    <a routerLink="/schedule/print" class="btn btn-secondary">הדפסת דפי נוכחות</a>
  </div>
</div>

<p *ngIf="kodeshAvailabilityError()" class="error-msg" role="alert">{{ kodeshAvailabilityError() }}</p>

<!-- GRID VIEW -->
<div *ngIf="activeTab() === 'grid'" class="grid-view">
  <div *ngIf="loading()" class="loading-state">טוען...</div>

  <div *ngIf="!loading() && !slots().length && !classOptions().length" class="empty-state">
    <div class="empty-icon">📅</div>
    <p>אין שיעורים לשבוע זה</p>
    <button class="btn btn-primary" (click)="activeTab.set('manage')">הוסף שיעורים</button>
    <button class="btn btn-secondary" (click)="showCopyWeek=true" style="margin-top:8px;">העתק משבוע קודם</button>
  </div>

  <div *ngIf="!loading() && (slots().length || classOptions().length)" class="schedule-workspace">
    <aside class="schedule-control-rail" aria-label="בקרות תצוגת מערכת השעות">
      <div class="week-control">
        <button type="button" class="week-arrow" (click)="prevWeek()" title="שבוע קודם" aria-label="שבוע קודם">‹</button>
        <div class="week-control-label">
          <strong>{{ formatHebDate(weekStart()) }} – {{ formatHebDate(weekEnd()) }}</strong>
          <small>{{ weekStart() }}</small>
        </div>
        <button type="button" class="week-arrow" (click)="nextWeek()" title="שבוע הבא" aria-label="שבוע הבא">›</button>
      </div>
      <button type="button" class="current-week-btn" (click)="goToCurrentWeek()">השבוע הנוכחי</button>
      <div class="view-toggle" role="group" aria-label="סוג תצוגת מערכת השעות">
        <button type="button" [class.active]="scheduleView() === 'days'"
                [attr.aria-pressed]="scheduleView() === 'days'" (click)="scheduleView.set('days')">
          ימים
        </button>
        <button type="button" [class.active]="scheduleView() === 'classes'"
                [attr.aria-pressed]="scheduleView() === 'classes'" (click)="scheduleView.set('classes')">
          כיתות
        </button>
      </div>
      <ng-container *ngIf="scheduleView() === 'days'; else classPickerControl">
        <div class="day-selector" role="group" aria-label="בחירת יום">
          <button *ngFor="let d of DAYS; let i = index" type="button"
                  [class.active]="selectedDay() === i" [attr.aria-pressed]="selectedDay() === i"
                  (click)="selectedDay.set(i)">
            <span>יום {{ d }}</span>
            <small>{{ formatHebDate(addDays(weekStart(), i)) }}</small>
          </button>
        </div>
      </ng-container>
      <ng-template #classPickerControl>
        <label class="class-picker">
          <span>כיתה</span>
          <select [ngModel]="selectedClassKey() || gridRows()[0]?.className || ''"
                  (ngModelChange)="selectedClassKey.set($event)">
            <option *ngFor="let row of gridRows()" [value]="row.className">{{ row.className }}</option>
          </select>
        </label>
      </ng-template>
    </aside>

    <main class="schedule-display">
      <ng-container *ngIf="scheduleView() === 'days'; else classSchedule">

      <h2 class="day-table-title">{{ formatHebrewDayHeading(addDays(weekStart(), selectedDay())) }}</h2>
      <div class="table-wrap schedule-table-wrap">
        <table class="schedule-table day-schedule-table">
          <thead>
            <tr>
              <th class="day-time-heading">שעה</th>
              <th *ngFor="let row of gridRows()">{{ row.className }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let boardRow of dayScheduleRows()">
              <td class="schedule-time day-time-cell">
                <strong>{{ boardRow.start_time }}</strong>
                <small>{{ boardRow.end_time }}</small>
              </td>
              <td *ngFor="let entry of boardRow.classes" class="day-class-cell"
                  [ngClass]="'period-' + entry.availability"
                  [attr.aria-disabled]="entry.availability !== 'kodesh'">
                <ng-container *ngIf="entry.availability === 'kodesh'; else unavailablePeriod">
                  <ng-container *ngIf="eventForPeriod(addDays(weekStart(), selectedDay()), entry.row.classYear, entry.row.classParallel, entry.period) as event; else dayLesson">
                    <div class="day-school-event">{{ event.title }}<small>{{ event.category }}</small></div>
                  </ng-container>
                  <ng-template #dayLesson>
                    <div *ngFor="let slot of slotsForPeriod(entry.row.byDay[selectedDay()], entry.period)" class="day-lesson"
                      [class.schedule-changed]="slot.change_reason" [title]="slot.change_reason || ''">
                      <a class="teacher-profile-link day-teacher-link" [routerLink]="['/teachers', slot.teacher_id]"
                         [style.--teacher-color]="teacherColor(slot.teacher_id)">{{ slot.teacher_name }}</a>
                      <span *ngIf="slot.subject || slot.teacher_subject" class="day-lesson-subject">{{ slot.subject || slot.teacher_subject }}</span>
                      <span *ngIf="slot.change_reason" class="changed-lesson-tag">
                        {{ slot.change_from_teacher_id && slot.change_from_teacher_id !== slot.teacher_id ? 'הוחלף מ־' + (slot.change_from_teacher_name || 'המורה הקודמת') : 'שונה' }}
                      </span>
                      <div class="day-lesson-actions">
                        <button type="button" class="slot-icon-btn slot-icon-edit" (click)="startEditSlot(slot)" title="עריכת שיעור" aria-label="עריכת שיעור">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                        </button>
                        <button type="button" class="slot-icon-btn slot-icon-delete" (click)="deleteSlot(slot)" title="מחיקת שיעור" aria-label="מחיקת שיעור">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                        </button>
                        <button *ngIf="slot.change_reason" type="button" class="slot-icon-btn slot-icon-print" (click)="printChangedLesson(slot)"
                                title="הדפסת דף נוכחות לשיעור ששונה" aria-label="הדפסת דף נוכחות לשיעור ששונה">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>
                        </button>
                      </div>
                    </div>
                    <button *ngIf="!slotsForPeriod(entry.row.byDay[selectedDay()], entry.period).length" class="day-add-lesson"
                            (click)="openAddSlot(selectedDay(), entry.row.classYear, entry.row.classParallel, entry.period)" aria-label="הוספת שיעור קודש">+</button>
                  </ng-template>
                </ng-container>
                <ng-template #unavailablePeriod>
                  <ng-container *ngIf="eventForPeriod(addDays(weekStart(), selectedDay()), entry.row.classYear, entry.row.classParallel, entry.period) as event; else unavailableDayLabel">
                    <div class="day-school-event">{{ event.title }}<small>{{ event.category }}</small></div>
                  </ng-container>
                  <ng-template #unavailableDayLabel><span class="day-period-label">{{ periodAvailabilityLabel(entry.availability) }}</span></ng-template>
                </ng-template>
              </td>
            </tr>
            <tr *ngIf="!dayScheduleRows().length">
              <td [attr.colspan]="gridRows().length + 1" class="schedule-empty">אין שעות להצגה ביום זה</td>
            </tr>
          </tbody>
        </table>
      </div>
    </ng-container>

    <ng-template #classSchedule>
      <ng-container *ngIf="selectedClassRow() as selectedClass; else noScheduleClasses">
        <h2 class="day-table-title">מערכת שעות — כיתה {{ selectedClass.className }}</h2>
        <div class="table-wrap schedule-table-wrap">
          <table class="schedule-table day-schedule-table class-day-table">
            <thead>
              <tr>
                <th class="day-time-heading">שעה</th>
                <th *ngFor="let d of DAYS; let i = index">
                  <span>יום {{ d }}</span>
                  <small>{{ formatHebDate(addDays(weekStart(), i)) }}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let scheduleRow of selectedClassScheduleRows()">
                <td class="schedule-time day-time-cell">
                  <strong>{{ scheduleRow.start_time }}</strong>
                  <small>{{ scheduleRow.end_time }}</small>
                </td>
                <td *ngFor="let cell of scheduleRow.days" class="day-class-cell"
                    [ngClass]="'period-' + (cell?.availability || 'empty')"
                    [attr.aria-disabled]="cell?.availability !== 'kodesh'">
                  <ng-container *ngIf="cell as periodCell">
                    <ng-container *ngIf="periodCell.availability === 'kodesh'; else unavailableClassPeriod">
                      <ng-container *ngIf="eventForPeriod(addDays(weekStart(), periodCell.day), selectedClass.classYear, selectedClass.classParallel, periodCell.period) as event; else classDayLesson">
                        <div class="day-school-event">{{ event.title }}<small>{{ event.category }}</small></div>
                      </ng-container>
                      <ng-template #classDayLesson>
                            <div *ngFor="let slot of slotsForPeriod(selectedClass.byDay[periodCell.day], periodCell.period)" class="day-lesson"
                              [class.schedule-changed]="slot.change_reason" [title]="slot.change_reason || ''">
                          <a class="teacher-profile-link day-teacher-link" [routerLink]="['/teachers', slot.teacher_id]"
                             [style.--teacher-color]="teacherColor(slot.teacher_id)">{{ slot.teacher_name }}</a>
                          <span *ngIf="slot.subject || slot.teacher_subject" class="day-lesson-subject">{{ slot.subject || slot.teacher_subject }}</span>
                            <span *ngIf="slot.change_reason" class="changed-lesson-tag">
                              {{ slot.change_from_teacher_id && slot.change_from_teacher_id !== slot.teacher_id ? 'הוחלף מ־' + (slot.change_from_teacher_name || 'המורה הקודמת') : 'שונה' }}
                            </span>
                          <div class="day-lesson-actions">
                            <button type="button" class="slot-icon-btn slot-icon-edit" (click)="startEditSlot(slot)" title="עריכת שיעור" aria-label="עריכת שיעור">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                            </button>
                            <button type="button" class="slot-icon-btn slot-icon-delete" (click)="deleteSlot(slot)" title="מחיקת שיעור" aria-label="מחיקת שיעור">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                            </button>
                            <button *ngIf="slot.change_reason" type="button" class="slot-icon-btn slot-icon-print" (click)="printChangedLesson(slot)"
                                    title="הדפסת דף נוכחות לשיעור ששונה" aria-label="הדפסת דף נוכחות לשיעור ששונה">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>
                            </button>
                          </div>
                        </div>
                        <button *ngIf="!slotsForPeriod(selectedClass.byDay[periodCell.day], periodCell.period).length" class="day-add-lesson"
                                (click)="openAddSlot(periodCell.day, selectedClass.classYear, selectedClass.classParallel, periodCell.period)" aria-label="הוספת שיעור קודש">+</button>
                      </ng-template>
                    </ng-container>
                    <ng-template #unavailableClassPeriod>
                      <ng-container *ngIf="eventForPeriod(addDays(weekStart(), periodCell.day), selectedClass.classYear, selectedClass.classParallel, periodCell.period) as event; else unavailableClassLabel">
                        <div class="day-school-event">{{ event.title }}<small>{{ event.category }}</small></div>
                      </ng-container>
                      <ng-template #unavailableClassLabel><span class="day-period-label">{{ periodAvailabilityLabel(periodCell.availability) }}</span></ng-template>
                    </ng-template>
                  </ng-container>
                </td>
              </tr>
              <tr *ngIf="!selectedClassScheduleRows().length">
                <td colspan="6" class="schedule-empty">אין שעות להצגה לכיתה זו</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
      <ng-template #noScheduleClasses>
        <div class="schedule-empty">לא נמצאו כיתות להצגה</div>
      </ng-template>
    </ng-template>
    </main>
  </div>
</div>

<!-- MANAGE TAB -->
<div *ngIf="activeTab() === 'manage'" class="manage-view">
  <div class="section-header">
    <h3>הוספת שיעור לשבוע {{ weekStart() }}</h3>
  </div>

  <!-- Lesson type toggle -->
  <div class="lesson-type-bar">
    <button class="lesson-type-btn" [class.active]="lessonType() === 'class'" (click)="lessonType.set('class')">
      שיעור לכיתה
    </button>
    <button class="lesson-type-btn" [class.active]="lessonType() === 'specialization'" (click)="lessonType.set('specialization')">
      שיעור להתמחות
    </button>
  </div>

  <div class="add-slot-form card">
    <!-- Class lesson form -->
    <div *ngIf="lessonType() === 'class'" class="form-grid">
      <label class="field">
        <span>מורה</span>
        <select [(ngModel)]="newSlot.teacher_id">
          <option value="">בחר מורה</option>
          <option *ngFor="let t of kodeshTeachers()" [value]="t.id">{{ t.name }}{{ t.subject ? ' (' + t.subject + ')' : '' }}</option>
        </select>
      </label>
      <label class="field">
        <span>כיתה</span>
        <select [(ngModel)]="newSlot.class_key" (ngModelChange)="onNewSlotScheduleChanged()">
          <option value="">בחר כיתה</option>
          <option *ngFor="let c of classOptions()" [value]="c.parallel">{{ c.label }} ({{ c.count }})</option>
        </select>
      </label>
      <label class="field">
        <span>יום</span>
        <select [(ngModel)]="newSlot.day_of_week" (ngModelChange)="onNewSlotScheduleChanged()">
          <option value="">יום</option>
          <option *ngFor="let d of DAYS; let i=index" [value]="i">יום {{ d }} – {{ formatHebDate(addDays(weekStart(), i)) }}</option>
        </select>
      </label>
      <label class="field">
        <span>שיעור</span>
        <select [ngModel]="newSlot.period_id" (ngModelChange)="pickPeriod(newSlot, $event)">
          <option value="">בחר שיעור</option>
          <option *ngFor="let p of kodeshPeriodsForClass(newSlot.class_key, newSlot.day_of_week)" [value]="p.id">
            {{ p.name }} ({{ p.start_time }}–{{ p.end_time }})
          </option>
        </select>
        <small *ngIf="newSlot.class_key && newSlot.day_of_week !== '' && !kodeshAvailabilityLoading() &&
                      !kodeshPeriodsForClass(newSlot.class_key, newSlot.day_of_week).length" class="availability-hint">
          אין שעות קודש זמינות לכיתה ביום זה
        </small>
        <small *ngIf="kodeshAvailabilityLoading()" class="availability-hint">טוען זמני קודש...</small>
      </label>
      <label class="field">
        <span>מקצוע (אופציונלי)</span>
        <input [(ngModel)]="newSlot.subject" placeholder="אם שונה מהמורה">
      </label>
    </div>

    <!-- Specialization lesson form (placeholder) -->
    <div *ngIf="lessonType() === 'specialization'" class="specialization-placeholder">
      <p>טופס שיעור להתמחות – יוגדר בהמשך</p>
    </div>

    <div class="form-actions" *ngIf="lessonType() === 'class'">
      <button class="btn btn-primary" [disabled]="savingSlot()" (click)="createSlot()">
        {{ savingSlot() ? 'שומר...' : '+ הוסף שיעור' }}
      </button>
    </div>
    <p *ngIf="slotError()" class="error-msg">{{ slotError() }}</p>
    <p *ngIf="slotSuccess()" class="success-msg">✓ {{ slotSuccess() }}</p>
  </div>

  <div class="week-actions">
    <button class="btn btn-secondary" (click)="showCopyWeek=!showCopyWeek">העתק משבוע קודם</button>
    <button class="btn btn-danger" *ngIf="slots().length" (click)="deleteWeek()">מחק את כל שיעורי השבוע</button>
  </div>

  <div class="school-year-copy card">
    <label class="field">
      <span>שבוע מקור לכל השנה</span>
      <input type="date" [(ngModel)]="copyYearSourceWeek">
    </label>
    <button class="btn btn-primary" [disabled]="copyYearLoading()" (click)="copySchoolYearSchedule()">
      {{ copyYearLoading() ? 'מעתיק...' : 'השלם מערכת לשנת הלימודים' }}
    </button>
    <p *ngIf="copyYearMessage()" class="success-msg">{{ copyYearMessage() }}</p>
    <p *ngIf="copyYearError()" class="error-msg">{{ copyYearError() }}</p>
  </div>

  <div *ngIf="showCopyWeek" class="copy-week-card card">
    <h4>העתקת שיעורים</h4>
    <label>שבוע מקור (תאריך ראשון בשבוע):
      <input type="date" [(ngModel)]="copyFromWeek">
    </label>
    <label>סיבת ההעתקה:
      <select [(ngModel)]="copyWeekChange.change_category">
        <option value="">בחירת סיבה</option>
        <option *ngFor="let option of changeCategoryOptions" [value]="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label>פירוט:
      <textarea [(ngModel)]="copyWeekChange.change_reason" rows="2" placeholder="יש לפרט"></textarea>
    </label>
    <div class="copy-actions">
      <button class="btn btn-primary" [disabled]="copyLoading()" (click)="doCopyWeek()">
        {{ copyLoading() ? 'מעתיק...' : 'העתק' }}
      </button>
      <button class="btn btn-secondary" (click)="showCopyWeek=false">ביטול</button>
    </div>
    <p *ngIf="copyError()" class="error-msg">{{ copyError() }}</p>
    <p *ngIf="copySuccess()" class="success-msg">{{ copySuccess() }}</p>
  </div>

  <!-- Current week slots list -->
  <div *ngIf="slots().length" class="slots-list">
    <h4>שיעורים בשבוע זה ({{ slots().length }})</h4>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>מורה</th><th>כיתה</th><th>יום</th><th>שעה</th><th>מקצוע</th><th></th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let s of slots()" [class.schedule-row-changed]="s.change_reason" [title]="s.change_reason || ''">
            <td>{{ s.teacher_name }}</td>
            <td><span class="class-badge">{{ s.class_year }}{{ s.class_parallel }}</span></td>
            <td>יום {{ DAYS[s.day_of_week] }}</td>
            <td>{{ s.start_time }}{{ s.end_time ? ' – ' + s.end_time : '' }}</td>
            <td>{{ s.subject || s.teacher_subject || '—' }}</td>
            <td>
              <button type="button" class="slot-icon-btn slot-icon-delete" (click)="deleteSlot(s)"
                      title="מחיקת שיעור" aria-label="מחיקת שיעור">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
              </button>
              <button *ngIf="s.change_reason" type="button" class="slot-icon-btn slot-icon-print" (click)="printChangedLesson(s)"
                      title="הדפסת דף נוכחות לשיעור ששונה" aria-label="הדפסת דף נוכחות לשיעור ששונה">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Add slot modal (from grid click) -->
<div *ngIf="quickAddSlot" class="modal-overlay" (click)="quickAddSlot=null">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <h3>הוספת שיעור – יום {{ DAYS[quickAddSlot.day] }}</h3>
    <fieldset class="quick-class-picker">
      <legend>כיתות (אפשר לבחור כמה)</legend>
      <label *ngFor="let row of quickAvailableClasses()">
        <input type="checkbox"
               [checked]="quickAddSlot.classKeys.includes(quickClassKey(row))"
               (change)="toggleQuickClass(row, $any($event.target).checked)">
        {{ row.className }}
      </label>
    </fieldset>
    <label>מורה:
      <select [(ngModel)]="quickAddSlot.teacher_id">
        <option value="">בחר מורה</option>
        <option *ngFor="let t of kodeshTeachers()" [value]="t.id">{{ t.name }}</option>
      </select>
    </label>
    <label>שיעור:
      <select [ngModel]="quickAddSlot.period_id" (ngModelChange)="pickPeriod(quickAddSlot, $event)">
        <option value="">בחר שיעור</option>
        <option *ngFor="let p of quickKodeshPeriods()" [value]="p.id">
          {{ p.name }} ({{ p.start_time }}–{{ p.end_time }})
        </option>
      </select>
    </label>
    <p *ngIf="!kodeshAvailabilityLoading() &&
              !quickKodeshPeriods().length" class="availability-hint">
      אין שעה זמינה שמתאימה לכל הכיתות שנבחרו ביום זה
    </p>
    <label>מקצוע: <input [(ngModel)]="quickAddSlot.subject" placeholder="מקצוע"></label>
    <div class="form-actions">
      <button class="btn btn-primary" [disabled]="savingQuickSlot()" (click)="saveQuickSlot()">
        {{ savingQuickSlot() ? 'שומר...' : 'הוסף' }}
      </button>
      <button class="btn btn-secondary" (click)="quickAddSlot=null">ביטול</button>
    </div>
    <p *ngIf="quickSlotError()" class="error-msg">{{ quickSlotError() }}</p>
  </div>
</div>

<div *ngIf="editingSlot()" class="modal-overlay" (click)="cancelEditSlot()">
  <div class="modal-card edit-slot-modal" role="dialog" aria-modal="true" aria-labelledby="edit-slot-title"
       (click)="$event.stopPropagation()">
    <h3 id="edit-slot-title">עריכת שיעור</h3>
    <p class="locked-class">כיתה {{ editingSlot()!.class_year }}{{ editingSlot()!.class_parallel }} — לא ניתן לשינוי</p>
    <label>מורה:
      <select [(ngModel)]="editSlotDraft.teacher_id">
      <option *ngFor="let t of kodeshTeachers()" [ngValue]="t.id">{{ t.name }}</option>
      </select>
    </label>
    <div class="edit-time-fields">
      <label>שעה:
        <select [ngModel]="editSlotDraft.period_id" (ngModelChange)="pickPeriod(editSlotDraft, $event)">
          <option value="">בחרי שעה</option>
          <option *ngFor="let p of kodeshPeriodsForYear(editingSlot()!.class_year, editingSlot()!.day_of_week)"
                  [value]="p.id">{{ p.name }} ({{ p.start_time }}–{{ p.end_time }})</option>
        </select>
      </label>
    </div>
    <label>שם השיעור / מקצוע:
      <input [(ngModel)]="editSlotDraft.subject" placeholder="שם השיעור">
    </label>
    <label>תוקף השינוי:
      <select [(ngModel)]="editSlotDraft.change_scope"><option value="">בחירת תוקף</option><option value="once">חד־פעמי</option><option value="permanent">קבוע עד סוף השנה</option></select>
    </label>
    <label>סיבת השינוי:
      <select [(ngModel)]="editSlotDraft.change_category">
        <option value="">בחירת סיבה</option>
        <option *ngFor="let option of changeCategoryOptions" [value]="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label>פירוט הסיבה:
      <textarea [(ngModel)]="editSlotDraft.change_reason" rows="2" placeholder="יש לפרט את הסיבה"></textarea>
    </label>
    <p *ngIf="editSlotError()" class="error-msg" role="alert">{{ editSlotError() }}</p>
    <div class="form-actions">
      <button class="btn btn-primary" [disabled]="savingEditSlot()" (click)="saveEditedSlot()">
        {{ savingEditSlot() ? 'שומרת...' : 'שמירה' }}
      </button>
      <button class="btn btn-secondary" [disabled]="savingEditSlot()" (click)="cancelEditSlot()">ביטול</button>
    </div>
  </div>
</div>

<div *ngIf="deletingSlot() as slot" class="modal-overlay" (click)="cancelDeleteSlot()">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-slot-title" (click)="$event.stopPropagation()">
    <h3 id="delete-slot-title">מחיקת שיעור בכיתה {{ slot.class_year }}{{ slot.class_parallel }}</h3>
    <label>תוקף המחיקה:
      <select [(ngModel)]="deleteSlotDraft.change_scope"><option value="">בחירת תוקף</option><option value="once">רק השבוע</option><option value="permanent">גם בהמשך השנה</option></select>
    </label>
    <label>סיבת המחיקה:
      <select [(ngModel)]="deleteSlotDraft.change_category">
        <option value="">בחירת סיבה</option>
        <option *ngFor="let option of changeCategoryOptions" [value]="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label>פירוט הסיבה:
      <textarea [(ngModel)]="deleteSlotDraft.change_reason" rows="3" placeholder="יש לפרט את הסיבה"></textarea>
    </label>
    <p *ngIf="deleteSlotError()" class="error-msg">{{ deleteSlotError() }}</p>
    <div class="form-actions">
      <button class="btn btn-danger" [disabled]="deletingSlotSaving()" (click)="confirmDeleteSlot()">מחק שיעור</button>
      <button class="btn btn-secondary" (click)="cancelDeleteSlot()">ביטול</button>
    </div>
  </div>
</div>

<div *ngIf="deletingWeek()" class="modal-overlay" (click)="deletingWeek.set(false)">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-week-title" (click)="$event.stopPropagation()">
    <h3 id="delete-week-title">מחיקת מערכת לשבוע {{ weekStart() }}</h3>
    <label>סיבת המחיקה:
      <select [(ngModel)]="deleteWeekDraft.change_category">
        <option value="">בחירת סיבה</option>
        <option *ngFor="let option of changeCategoryOptions" [value]="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label>פירוט:
      <textarea [(ngModel)]="deleteWeekDraft.change_reason" rows="3" placeholder="יש לפרט"></textarea>
    </label>
    <p *ngIf="deleteWeekError()" class="error-msg">{{ deleteWeekError() }}</p>
    <div class="form-actions">
      <button class="btn btn-danger" [disabled]="deletingWeekSaving()" (click)="confirmDeleteWeek()">מחקי את כל שיעורי השבוע</button>
      <button class="btn btn-secondary" (click)="deletingWeek.set(false)">ביטול</button>
    </div>
  </div>
</div>
`,
  styles: [`
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.schedule-page-header { margin-bottom: 8px; align-items: center; }
.header-actions { display: flex; gap: 8px; }

.tab-bar {
  display: flex; gap: 4px; margin-bottom: 16px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 4px;
  button { flex: 1; padding: 8px 12px; border: none; border-radius: var(--radius-sm);
    background: transparent; font: inherit; font-size: 0.88rem; cursor: pointer;
    color: var(--text-muted); transition: all var(--transition);
    &.active { background: var(--surface); color: var(--primary); font-weight: 700;
      box-shadow: var(--shadow-xs); } }
}

.schedule-table-wrap { flex: 1; min-height: 0; overflow: auto; box-shadow: var(--shadow-sm); background: var(--surface); }
.schedule-table { min-width: 100%; }
.schedule-table th small { display: block; margin-top: 3px; font-size: 0.72rem; font-weight: 500; text-transform: none; letter-spacing: 0; }
.day-school-event {
  display: grid; gap: 3px; padding: 6px; border: 1px solid #f0c66e; border-radius: 6px;
  background: #fff5d9; color: #694d12; font-size: 0.76rem; font-weight: 700;
}
.day-school-event small { font-size: 0.67rem; font-weight: 500; }
.day-lesson.schedule-changed { padding: 5px 7px; border: 1px solid #f0d292; border-inline-start: 3px solid #bf7900; border-radius: 6px; background: #fffaf0; }
.changed-lesson-tag { flex: 0 0 auto; padding: 2px 6px; border-radius: 4px; background: #f5e8c8; color: #76520c; font-size: 0.64rem; font-weight: 700; }
.schedule-row-changed { background: #fff7e6; box-shadow: inset -3px 0 #d97706; }
.slot-icon-print { color: #a45b08; }
.class-schedule-table { min-width: 900px; }
.class-schedule-table .class-heading { width: 90px; text-align: center; }
.class-schedule-cell { min-width: 145px; vertical-align: top !important; padding: 8px !important; }
.class-period {
  display: grid; align-content: start; gap: 8px; margin-bottom: 8px; padding: 9px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2);
  transition: box-shadow 0.16s ease, transform 0.16s ease;
}
.class-period:last-child { margin-bottom: 0; }
.period-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
.period-heading strong { font-size: 0.76rem; color: var(--text); white-space: nowrap; }
.period-status-label { color: var(--text-muted); font-size: 0.68rem; font-weight: 700; }
.class-period .period-status-label {
  padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.72);
}
.period-track .period-status-label { color: #707780; }
.period-instruction .period-status-label { color: #815b18; }
.period-kodesh .period-status-label { color: #277347; }
.class-period.period-track { min-height: 64px; align-content: center; padding: 12px; border-color: #d8dee8; background: linear-gradient(140deg, #f7f8fc, #edf1f7); color: #667085; }
.class-period.period-track .period-status-label { background: #e4e9f1; }
.class-period.period-instruction { min-height: 64px; align-content: center; padding: 12px; border-color: #f1d89e; background: linear-gradient(140deg, #fffaf0, #fff1d2); color: #815b18; }
.class-period.period-instruction .period-status-label { background: #ffebbd; }
.class-period.period-kodesh { border-color: #b8dfc7; background: linear-gradient(140deg, #f2fbf5, #e8f6ed); }
.class-period.period-kodesh .period-status-label { background: #dff1e5; }
.add-period-btn {
  justify-self: start; width: auto; height: auto; margin: 0; padding: 4px 8px;
  border: 1px dashed #6ba982; border-radius: 6px; background: rgba(255,255,255,0.65);
  color: #277347; font: inherit; font-size: 0.7rem; font-weight: 700; cursor: pointer;
  &:hover { background: white; }
}
.class-slot { display: flex; align-items: center; overflow: hidden; white-space: nowrap; }
.class-slot {
  gap: 6px; min-width: 0;
  margin-bottom: 2px; padding: 5px 7px; border: 1px solid #dce8e1;
  border-inline-start: 3px solid var(--primary); border-radius: 8px; background: #fff;
  font-size: 0.72rem;
}
.class-slot-teacher { display: flex; align-items: center; gap: 5px; flex: 1 1 auto; min-width: 0; }
.class-slot-teacher-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.class-slot-teacher .teacher-profile-link { overflow: hidden; color: #263b32; font-weight: 700; text-overflow: ellipsis; }
.class-slot-subject {
  overflow: hidden; flex: 0 1 auto; max-width: 25%; color: #5b6d63;
  font-size: 0.66rem; text-overflow: ellipsis;
}
.class-slot-actions { display: flex; flex: 0 0 auto; flex-wrap: nowrap; gap: 4px; }
.slot-del, .slot-edit-btn { padding: 2px 5px; border-radius: 6px; font: inherit; font-size: 0.62rem; font-weight: 700; white-space: nowrap; cursor: pointer; }
.slot-del { border: 1px solid #f1d6d6; background: #fff7f7; color: #a34646; }
.add-slot-btn {
  width: 26px; height: 26px; border: 1px dashed var(--primary); border-radius: 50%;
  background: transparent; color: var(--primary); font-size: 1rem; cursor: pointer;
  &:hover { background: var(--primary-light); }
}
.schedule-time { white-space: nowrap; font-weight: 700; color: var(--primary); }
.availability-hint { color: var(--text-muted); font-size: 0.8rem; }
.quick-class-picker {
  display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 8px;
}
.quick-class-picker legend { padding: 0 5px; font-size: 0.82rem; font-weight: 700; }
.quick-class-picker label { display: inline-flex; align-items: center; gap: 5px; font-size: 0.85rem; }
.schedule-teacher { display: inline-flex; align-items: center; gap: 8px; }
.schedule-teacher .teacher-color { width: 10px; height: 10px; }
.teacher-profile-link { color: inherit; text-decoration: none; }
.teacher-profile-link:hover { color: var(--primary); text-decoration: underline; }
.schedule-delete { padding: 5px 10px; font-size: 0.78rem; }
.schedule-edit { padding: 5px 10px; font-size: 0.78rem; }
.slot-edit-btn { border: 1px solid #cfe4d6; background: #f1f8f3; color: #277347; }
.edit-slot-modal { width: 420px; }
.edit-slot-modal .locked-class { margin: -8px 0 0; color: var(--text-muted); font-size: 0.85rem; }
.edit-time-fields { display: grid; grid-template-columns: 1fr; gap: 10px; }
.edit-time-fields label { display: grid; gap: 5px; font-size: 0.85rem; font-weight: 600; }
.edit-time-fields select { min-width: 0; border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; }
.schedule-empty { padding: 28px !important; text-align: center !important; color: var(--text-muted); }
/* Teachers */
.teachers-list { display: flex; flex-direction: column; gap: 8px; }
.teacher-search { display: block; margin-bottom: 12px; }
.teacher-search input {
  width: 100%; max-width: 420px; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 10px; background: var(--surface); color: var(--text); font: inherit;
}
.teacher-row { padding: 12px 16px; }
.teacher-info { display: flex; align-items: center; gap: 12px; }
.teacher-color { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.teacher-name-link { color: var(--text); text-decoration: none; &:hover { color: var(--primary); text-decoration: underline; } }
.teacher-subject { color: var(--text-muted); font-size: 0.82rem; margin-right: 8px; }
.teacher-specialization { background: var(--primary-light); color: var(--primary); border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; font-weight: 600; margin-right: 8px; }
.teacher-count { margin-inline-start: auto; font-size: 0.8rem; color: var(--text-muted); }
.teacher-actions { display: flex; gap: 6px; }
.teacher-edit { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  input { border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 0.88rem; } }

/* Lesson type toggle */
.lesson-type-bar { display: flex; gap: 4px; margin-bottom: 12px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.lesson-type-btn { flex: 1; padding: 10px 16px; border: none; border-radius: var(--radius-sm);
  background: transparent; font: inherit; font-size: 0.95rem; font-weight: 600; cursor: pointer;
  color: var(--text-muted); transition: all var(--transition);
  &.active { background: var(--surface); color: var(--primary); font-weight: 700;
    box-shadow: var(--shadow-xs); } }
.specialization-placeholder { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 0.95rem; }

/* Forms */
.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.field { display: grid; gap: 5px; font-size: 0.82rem; font-weight: 700; color: var(--text-muted);
  input, select { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px;
    font: inherit; font-size: 0.9rem; background: var(--surface-2);
    &:focus { outline: none; border-color: var(--primary); } } }
.form-actions { display: flex; gap: 8px; margin-top: 12px; }
.form-row { display: flex; gap: 12px; flex-wrap: wrap;
  label { flex: 1; min-width: 160px; display: grid; gap: 5px; font-size: 0.85rem; font-weight: 600;
    input { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 0.9rem; } } }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.error-msg { color: var(--danger); font-size: 0.85rem; margin-top: 8px; }
.success-msg { color: #059669; font-size: 0.85rem; margin-top: 8px; }

/* Week actions */
.week-actions { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.copy-week-card { padding: 16px; margin-bottom: 12px;
  h4 { margin: 0 0 12px; }
  label { display: grid; gap: 5px; font-size: 0.85rem; font-weight: 600; max-width: 280px;
    input { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; } }
}
.copy-actions { display: flex; gap: 8px; margin-top: 10px; }

/* Slots list */
.slots-list { margin-top: 16px; h4 { margin-bottom: 10px; } }
.class-badge { background: var(--primary-light); color: var(--primary);
  border-radius: 12px; padding: 2px 10px; font-weight: 700; font-size: 0.82rem; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200;
  display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--surface); border-radius: var(--radius); padding: 24px; width: 360px;
  max-width: 95vw; display: grid; gap: 12px;
  h3 { margin: 0 0 4px; font-size: 1rem; }
  label { display: grid; gap: 5px; font-size: 0.85rem; font-weight: 600;
    input, select { border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px;
      font: inherit; font-size: 0.9rem; width: 100%; box-sizing: border-box; } }
}

.loading-state { text-align: center; padding: 40px; color: var(--text-muted); }
.empty-state { text-align: center; padding: 48px 20px;
  .empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
  p { color: var(--text-muted); margin-bottom: 16px; }
}
.add-form { padding: 16px; margin-bottom: 12px; h4 { margin: 0 0 12px; } }
  `]
})
export class ScheduleComponent implements OnInit {
  readonly DAYS = DAYS;
  readonly YEARS = YEARS;
  readonly PARALLELS = PARALLELS;
  readonly changeCategoryOptions = [
    { value: 'seminary_constraints', label: 'אילוצי סמינר' },
    { value: 'absent_teacher', label: 'המורה המתוכננת אינה יכולה להגיע' },
    { value: 'replacement_teacher', label: 'סיבה הקשורה למורה המחליפה' }
  ];

  loading = signal(false);
  teachers = signal<any[]>([]);
  slots = signal<any[]>([]);
  events = signal<any[]>([]);
  activeTab = signal<'grid' | 'manage'>('grid');
  scheduleView = signal<'days' | 'classes'>('classes');
  selectedDay = signal(0);
  selectedClassKey = signal('');

  // Week navigation
  private _weekStart = signal(getWeekStart(new Date()));
  weekStart = computed(() => this._weekStart());
  weekEnd = computed(() => addDays(this._weekStart(), 4));

  // Lesson type toggle: 'class' = שיעור לכיתה, 'specialization' = שיעור להתמחות
  lessonType = signal<'class' | 'specialization'>('class');

  // Slot CRUD
  newSlot: any = { teacher_id: '', class_key: '', day_of_week: '', start_time: '', end_time: '', subject: '' };
  savingSlot = signal(false);
  slotError = signal('');
  slotSuccess = signal('');

  // Copy week
  showCopyWeek = false;
  copyFromWeek = '';
  copyLoading = signal(false);
  copyError = signal('');
  copySuccess = signal('');
  copyWeekChange = { change_category: '', change_reason: '' };
  copyYearSourceWeek = getWeekStart(new Date());
  copyYearLoading = signal(false);
  copyYearMessage = signal('');
  copyYearError = signal('');

  // Quick add from grid
  quickAddSlot: any = null;
  quickSlotError = signal('');
  savingQuickSlot = signal(false);
  editingSlot = signal<any | null>(null);
  editSlotDraft = { teacher_id: 0, period_id: '', start_time: '', end_time: '', subject: '', change_scope: '', change_category: '', change_reason: '' };
  savingEditSlot = signal(false);
  editSlotError = signal('');
  deletingSlot = signal<any | null>(null);
  deleteSlotDraft = { change_scope: '', change_category: '', change_reason: '' };
  deleteSlotError = signal('');
  deletingSlotSaving = signal(false);
  deletingWeek = signal(false);
  deleteWeekDraft = { change_category: '', change_reason: '' };
  deleteWeekError = signal('');
  deletingWeekSaving = signal(false);
  kodeshAvailability = signal<{
    kodesh: Record<string, Record<string, string>>;
    instruction: Record<string, Record<string, { start: string; end: string }>>;
  }>({ kodesh: {}, instruction: {} });
  kodeshAvailabilityLoading = signal(true);
  kodeshAvailabilityError = signal('');

  // Teacher colors
  private colors = ['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#ffedd5','#e0f2fe','#f0fdf4'];

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.loadTeachers();
    this.api.getKodeshAvailability().subscribe({
      next: availability => {
        this.kodeshAvailability.set(availability);
        this.kodeshAvailabilityLoading.set(false);
      },
      error: e => {
        this.kodeshAvailabilityLoading.set(false);
        this.kodeshAvailabilityError.set(e.error?.error || 'טעינת שעות הקודש נכשלה');
      }
    });
    this.loadSchedule();
  }

  loadTeachers() {
    this.api.getTeachers().subscribe({ next: t => this.teachers.set(t), error: () => {} });
    this.api.getLessonPeriods().subscribe({ next: p => this.periods.set(p), error: () => {} });
    this.api.getStudentClasses().subscribe({ next: c => this.classOptions.set(c), error: () => {} });
  }

  classOptions = signal<{ parallel: string; label: string; count: number }[]>([]);

  periods = signal<any[]>([]);
  lessonPeriods = computed(() => this.periods().filter(p => !p.is_break));

  kodeshPeriodsForClass(classKey: string, day: string | number) {
    const classYear = String(classKey || '').split('_')[0]
      .replace(/^שנה\s*/, '')
      .replace(/[\u05f3\u05f4'"]/g, '');
    return this.kodeshPeriodsForYear(classYear, day);
  }

  kodeshPeriodsForYear(classYear: string, day: string | number) {
    if (day === '' || day == null || this.kodeshAvailabilityLoading()) return [];
    const year = String(classYear || '').trim()
      .replace(/^שנה\s*/, '')
      .replace(/[\u05f3\u05f4'"]/g, '');
    const cutoff = this.kodeshAvailability().kodesh[year]?.[String(Number(day))];
    if (!cutoff) return [];
    return this.lessonPeriods().filter(period =>
      period.start_time < period.end_time && period.end_time <= cutoff
    );
  }

  onNewSlotScheduleChanged() {
    this.newSlot.period_id = '';
    this.newSlot.start_time = '';
    this.newSlot.end_time = '';
  }

  periodAvailability(classYear: string, day: number, period: any): 'kodesh' | 'instruction' | 'track' {
    const year = String(classYear || '').trim().replace(/^שנה\s*/, '').replace(/[\u05f3\u05f4'"]/g, '');
    const normalizedDay = String(Number(day));
    const start = String(period?.start_time || '');
    const end = String(period?.end_time || '');
    if (!start || !end || end <= start) return 'track';

    const kodeshCutoff = this.kodeshAvailability().kodesh[year]?.[normalizedDay];
    if (kodeshCutoff && end <= kodeshCutoff) return 'kodesh';

    const instruction = this.kodeshAvailability().instruction[year]?.[normalizedDay];
    if (instruction && start >= instruction.start && end <= instruction.end) return 'instruction';

    return 'track';
  }

  periodAvailabilityLabel(availability: 'kodesh' | 'instruction' | 'track') {
    return availability === 'kodesh' ? 'קודש' : availability === 'instruction' ? 'הוראה' : 'מסלול';
  }

  scheduleSegments(classYear: string, day: number) {
    const segments: { start_time: string; end_time: string; availability: 'kodesh' | 'instruction' | 'track'; period?: any }[] = [];
    const periods = [...this.lessonPeriods()].sort((a, b) => a.start_time.localeCompare(b.start_time));

    for (const period of periods) {
      const availability = this.periodAvailability(classYear, day, period);
      const previous = segments[segments.length - 1];
      if (availability !== 'kodesh' && previous?.availability === availability && !previous.period) {
        previous.end_time = period.end_time;
        continue;
      }

      segments.push({
        start_time: period.start_time,
        end_time: period.end_time,
        availability,
        ...(availability === 'kodesh' ? { period } : {})
      });
    }

    return segments;
  }

  dayScheduleRows() {
    const rows = new Map<string, {
      start_time: string;
      end_time: string;
      classes: { row: any; availability: 'kodesh' | 'instruction' | 'track'; period?: any }[];
    }>();

    for (const row of this.gridRows()) {
      for (const period of this.lessonPeriods()) {
        const availability = this.periodAvailability(row.classYear, this.selectedDay(), period);
        const key = `${period.start_time}-${period.end_time}`;
        if (!rows.has(key)) {
          rows.set(key, { start_time: period.start_time, end_time: period.end_time, classes: [] });
        }
        rows.get(key)!.classes.push({ row, availability, period });
      }
    }

    return Array.from(rows.values()).sort((a, b) =>
      a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)
    );
  }

  slotsForPeriod(slots: any[], period: any) {
    return (slots || []).filter(slot =>
      slot.start_time === period.start_time && slot.end_time === period.end_time
    );
  }

  eventForPeriod(date: string, classYear: string, classParallel: string, period: any) {
    return this.events().find(event => {
      if (event.event_date !== date) return false;
      if (event.class_scope === 'grade' && event.class_year !== classYear) return false;
      if (event.class_scope === 'class' &&
          (event.class_year !== classYear || String(event.class_parallel) !== String(classParallel))) return false;
      if (event.class_scope !== 'all' && event.class_scope !== 'grade' && event.class_scope !== 'class') return false;
      if (event.all_day) return true;
      return Boolean(event.start_time && event.end_time &&
        event.start_time < period.end_time && event.end_time > period.start_time);
    }) || null;
  }

  printChangedLesson(slot: any) {
    this.router.navigate(['/attendance/print'], {
      queryParams: { week: slot.week_start, changedSlotId: slot.id }
    });
  }

  pickPeriod(target: any, id: string) {
    const p = this.periods().find(x => String(x.id) === String(id));
    target.period_id = id;
    target.start_time = p?.start_time || '';
    target.end_time = p?.end_time || '';
  }

  // Teachers and coordinators who may teach Kodesh lessons
  kodeshTeachers = computed(() => {
    return this.teachers().filter(t => {
      const specialization = String(t.specialization || '').replace(/\s+/g, '').trim();
      return specialization === 'קודש' ||
        specialization === 'רכזתקודש' ||
        specialization === 'רכזתחינוכית' ||
        specialization === 'רכזתחנוכית';
    });
  });
  loadSchedule() {
    this.loading.set(true);
    this.api.getSchedule(this._weekStart()).subscribe({
      next: r => { this.slots.set(r.slots); this.events.set(r.events || []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  prevWeek() {
    this._weekStart.set(addDays(this._weekStart(), -7));
    this.loadSchedule();
  }

  nextWeek() {
    this._weekStart.set(addDays(this._weekStart(), 7));
    this.loadSchedule();
  }

  goToCurrentWeek() {
    this._weekStart.set(getWeekStart(new Date()));
    this.loadSchedule();
  }

  prevWeekStr() { return addDays(this._weekStart(), -7); }

  copySchoolYearSchedule() {
    if (!this.copyYearSourceWeek || this.copyYearLoading()) return;
    if (!confirm(`להשלים את המערכת עד תאריך הסיום שהוגדר בניהול, לפי שבוע המקור ${this.copyYearSourceWeek}? שבועות קיימים לא יידרסו.`)) return;
    this.copyYearLoading.set(true);
    this.copyYearMessage.set('');
    this.copyYearError.set('');
    this.api.copySchoolYearSchedule(this.copyYearSourceWeek).subscribe({
      next: result => {
        this.copyYearLoading.set(false);
        this.copyYearMessage.set(`נוספו ${result.inserted} שיעורים עד ${result.through_date}; ${result.linked} שיעורים קיימים קושרו למערכת.` +
          (result.skipped ? ` ${result.skipped} שיעורים דולגו בגלל התנגשות או חוסר זמינות.` : ''));
        this.loadSchedule();
      },
      error: error => {
        this.copyYearLoading.set(false);
        this.copyYearError.set(error.error?.error || 'השלמת המערכת השנתית נכשלה');
      }
    });
  }

  formatHebDate(d: string) { return formatHebDate(d); }
  formatHebrewDayHeading(d: string) { return formatHebrewDayHeading(d); }
  addDays(d: string, n: number) { return addDays(d, n); }

  teacherColor(id: number) { return this.colors[(id - 1) % this.colors.length]; }
  slotCountForTeacher(id: number) { return this.slots().filter(s => s.teacher_id === id).length; }

  // Grid rows: collect unique classes
  gridRows() {
    const classMap = new Map<string, { className: string; classYear: string; classParallel: string; byDay: Record<number, any[]> }>();
    for (const c of this.classOptions()) {
      const [classYear, classParallel] = String(c.parallel).split('_');
      if (!classYear || !classParallel) continue;
      const key = `${classYear}${classParallel}`;
      if (!classMap.has(key)) {
        classMap.set(key, {
          className: key,
          classYear,
          classParallel,
          byDay: { 0: [], 1: [], 2: [], 3: [], 4: [] }
        });
      }
    }
    for (const s of this.slots()) {
      const key = `${s.class_year}${s.class_parallel}`;
      if (!classMap.has(key)) {
        classMap.set(key, { className: key, classYear: s.class_year, classParallel: s.class_parallel, byDay: { 0: [], 1: [], 2: [], 3: [], 4: [] } });
      }
      classMap.get(key)!.byDay[s.day_of_week].push(s);
    }
    return Array.from(classMap.values())
      .map(row => {
        Object.values(row.byDay).forEach(daySlots => daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time)));
        return row;
      })
      .sort((a, b) => a.className.localeCompare(b.className, 'he'));
  }

  selectedClassRow() {
    const rows = this.gridRows();
    return rows.find(row => row.className === this.selectedClassKey()) || rows[0] || null;
  }

  selectedClassScheduleRows() {
    const selectedClass = this.selectedClassRow();
    if (!selectedClass) return [];

    const rows = new Map<string, {
      start_time: string;
      end_time: string;
      days: ({ day: number; availability: 'kodesh' | 'instruction' | 'track'; period?: any } | null)[];
    }>();

    for (let day = 0; day < this.DAYS.length; day++) {
      for (const period of this.lessonPeriods()) {
        const key = `${period.start_time}-${period.end_time}`;
        if (!rows.has(key)) {
          rows.set(key, {
            start_time: period.start_time,
            end_time: period.end_time,
            days: Array(this.DAYS.length).fill(null)
          });
        }
        rows.get(key)!.days[day] = {
          day,
          availability: this.periodAvailability(selectedClass.classYear, day, period),
          period
        };
      }
    }

    return Array.from(rows.values()).sort((a, b) =>
      a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)
    );
  }

  openAddSlot(day: number, year: string, parallel: string, period?: any) {
    this.quickAddSlot = {
      day, classKeys: [`${year}_${parallel}`], teacher_id: '',
      period_id: period ? String(period.id) : '',
      start_time: period?.start_time || '',
      end_time: period?.end_time || '',
      subject: ''
    };
    this.quickSlotError.set('');
  }

  quickClassKey(row: { classYear: string; classParallel: string }) {
    return `${row.classYear}_${row.classParallel}`;
  }

  quickAvailableClasses() {
    if (!this.quickAddSlot) return [];
    return this.gridRows().filter(row =>
      this.kodeshPeriodsForYear(row.classYear, this.quickAddSlot.day).length > 0
    );
  }

  quickKodeshPeriods() {
    const selectedRows = this.gridRows().filter(row =>
      this.quickAddSlot?.classKeys.includes(this.quickClassKey(row))
    );
    if (!selectedRows.length) return [];
    return this.lessonPeriods().filter(period =>
      selectedRows.every(row => this.kodeshPeriodsForYear(row.classYear, this.quickAddSlot.day).some(available =>
        available.start_time === period.start_time && available.end_time === period.end_time
      ))
    );
  }

  toggleQuickClass(row: { classYear: string; classParallel: string }, selected: boolean) {
    const q = this.quickAddSlot;
    if (!q) return;
    const key = this.quickClassKey(row);
    const classKeys = new Set<string>(q.classKeys);
    if (selected) classKeys.add(key);
    else classKeys.delete(key);
    q.classKeys = Array.from(classKeys);
    if (!this.quickKodeshPeriods().some(period => String(period.id) === q.period_id)) {
      q.period_id = '';
      q.start_time = '';
      q.end_time = '';
    }
  }

  startEditSlot(slot: any) {
    this.editingSlot.set(slot);
    const matchingPeriod = this.kodeshPeriodsForYear(slot.class_year, slot.day_of_week)
      .find(period => period.start_time === slot.start_time && period.end_time === slot.end_time);
    this.editSlotDraft = {
      teacher_id: Number(slot.teacher_id),
      period_id: matchingPeriod ? String(matchingPeriod.id) : '',
      start_time: slot.start_time,
      end_time: slot.end_time || '',
      subject: slot.subject || '', change_scope: '', change_category: '', change_reason: ''
    };
    this.editSlotError.set('');
  }

  cancelEditSlot() {
    if (this.savingEditSlot()) return;
    this.editingSlot.set(null);
    this.editSlotError.set('');
  }

  private validateChangeDraft(draft: any): string {
    if (!['once', 'permanent'].includes(draft.change_scope)) return 'יש לבחור אם השינוי חד־פעמי או קבוע';
    if (!this.changeCategoryOptions.some(option => option.value === draft.change_category)) return 'יש לבחור סיבת שינוי';
    if (!String(draft.change_reason || '').trim()) return 'יש לפרט את סיבת השינוי';
    return '';
  }

  private submitScheduleWithConfirmation(
    request: (allowConflicts: boolean) => Observable<unknown>,
    onSuccess: () => void,
    onError: (error: any) => void,
    onCancel: () => void
  ) {
    const submit = (allowConflicts: boolean) => request(allowConflicts).subscribe({
      next: () => onSuccess(),
      error: error => {
        if (!allowConflicts && error.status === 409 && error.error?.confirmationRequired) {
          if (confirm(error.error.message)) submit(true);
          else onCancel();
          return;
        }
        onError(error);
      }
    });
    submit(false);
  }

  saveEditedSlot() {
    const slot = this.editingSlot();
    if (!slot) return;
    if (!this.editSlotDraft.teacher_id || !this.editSlotDraft.start_time) {
      this.editSlotError.set('יש לבחור מורה ושעה מתוך זמני הקודש של הכיתה');
      return;
    }
    const changeError = this.validateChangeDraft(this.editSlotDraft);
    if (changeError) { this.editSlotError.set(changeError); return; }
    if (!this.kodeshPeriodsForYear(slot.class_year, slot.day_of_week).some(period =>
      period.start_time === this.editSlotDraft.start_time && period.end_time === this.editSlotDraft.end_time
    )) {
      this.editSlotError.set('השעה שבחרת אינה זמינה לשיעור קודש בכיתה זו');
      return;
    }

    this.savingEditSlot.set(true);
    this.editSlotError.set('');
    const data = {
      teacher_id: this.editSlotDraft.teacher_id,
      start_time: this.editSlotDraft.start_time,
      end_time: this.editSlotDraft.end_time || null,
      subject: this.editSlotDraft.subject.trim() || null,
      change_scope: this.editSlotDraft.change_scope as 'once' | 'permanent',
      change_category: this.editSlotDraft.change_category,
      change_reason: this.editSlotDraft.change_reason.trim()
    };
    this.submitScheduleWithConfirmation(
      allowConflicts => this.api.updateScheduleSlot(slot.id, {
        ...data,
        ...(allowConflicts ? { allow_conflicts: true } : {})
      }),
      () => {
        this.savingEditSlot.set(false);
        this.editingSlot.set(null);
        this.loadSchedule();
      },
      e => {
        this.savingEditSlot.set(false);
        this.editSlotError.set(e.error?.error || 'שמירת השינויים נכשלה');
      },
      () => this.savingEditSlot.set(false)
    );
  }

  saveQuickSlot() {
    const q = this.quickAddSlot;
    const selectedRows = this.gridRows().filter(row => q?.classKeys.includes(this.quickClassKey(row)));
    if (!q?.teacher_id || !selectedRows.length || !q.start_time) {
      this.quickSlotError.set('בחרי מורה, כיתה אחת לפחות ושעה'); return;
    }
    if (!this.quickKodeshPeriods().some(period =>
      period.start_time === q.start_time && period.end_time === q.end_time
    )) {
      this.quickSlotError.set('השעה שבחרת אינה זמינה לשיעור קודש בכיתה זו');
      return;
    }
    const data = {
      teacher_id: Number(q.teacher_id),
      classes: selectedRows.map(row => ({ class_year: row.classYear, class_parallel: row.classParallel })),
      day_of_week: q.day,
      start_time: q.start_time,
      end_time: q.end_time || null,
      subject: q.subject || null,
      week_start: this._weekStart()
    };
    this.savingQuickSlot.set(true);
    this.quickSlotError.set('');
    this.submitScheduleWithConfirmation(
      allowConflicts => this.api.createScheduleSlot({
        ...data,
        ...(allowConflicts ? { allow_conflicts: true } : {})
      }),
      () => {
        this.savingQuickSlot.set(false);
        this.quickAddSlot = null;
        this.loadSchedule();
      },
      e => {
        this.savingQuickSlot.set(false);
        this.quickSlotError.set(e.error?.error || 'שמירת השיעור נכשלה');
      },
      () => this.savingQuickSlot.set(false)
    );
  }

  createSlot() {
    const s = this.newSlot;
    if (!s.teacher_id || !s.class_key || s.day_of_week === '' || !s.start_time) {
      this.slotError.set('יש למלא: מורה, כיתה, יום, שיעור'); return;
    }
    const [class_year, class_parallel] = String(s.class_key).split('_');
    if (!this.kodeshPeriodsForYear(class_year, s.day_of_week).some(period =>
      period.start_time === s.start_time && period.end_time === s.end_time
    )) {
      this.slotError.set('השעה שבחרת אינה זמינה לשיעור קודש בכיתה זו');
      return;
    }
    this.savingSlot.set(true); this.slotError.set(''); this.slotSuccess.set('');
    const data = { ...s, class_year, class_parallel, teacher_id: Number(s.teacher_id), day_of_week: Number(s.day_of_week), week_start: this._weekStart() };
    this.submitScheduleWithConfirmation(
      allowConflicts => this.api.createScheduleSlot({
        ...data,
        ...(allowConflicts ? { allow_conflicts: true } : {})
      }),
      () => {
        this.savingSlot.set(false);
        this.slotSuccess.set('שיעור נוסף בהצלחה');
        this.newSlot = { teacher_id: '', class_key: '', day_of_week: '', start_time: '', end_time: '', subject: '' };
        this.loadSchedule();
      },
      e => { this.savingSlot.set(false); this.slotError.set(e.error?.error || 'שגיאה'); },
      () => this.savingSlot.set(false)
    );
  }

  deleteSlot(slot: any) {
    this.deletingSlot.set(slot);
    this.deleteSlotDraft = { change_scope: '', change_category: '', change_reason: '' };
    this.deleteSlotError.set('');
  }

  cancelDeleteSlot() {
    if (this.deletingSlotSaving()) return;
    this.deletingSlot.set(null);
    this.deleteSlotError.set('');
  }

  confirmDeleteSlot() {
    const slot = this.deletingSlot();
    if (!slot) return;
    const changeError = this.validateChangeDraft(this.deleteSlotDraft);
    if (changeError) { this.deleteSlotError.set(changeError); return; }
    this.deletingSlotSaving.set(true);
    this.api.deleteScheduleSlot(slot.id, {
      change_scope: this.deleteSlotDraft.change_scope as 'once' | 'permanent',
      change_category: this.deleteSlotDraft.change_category,
      change_reason: this.deleteSlotDraft.change_reason.trim()
    }).subscribe({
      next: () => {
        this.deletingSlotSaving.set(false);
        this.deletingSlot.set(null);
        this.loadSchedule();
      },
      error: error => {
        this.deletingSlotSaving.set(false);
        this.deleteSlotError.set(error.error?.error || 'מחיקת השיעור נכשלה');
      }
    });
  }

  deleteWeek() {
    this.deleteWeekDraft = { change_category: '', change_reason: '' };
    this.deleteWeekError.set('');
    this.deletingWeek.set(true);
  }

  confirmDeleteWeek() {
    const changeError = this.validateChangeDraft({ ...this.deleteWeekDraft, change_scope: 'once' });
    if (changeError) { this.deleteWeekError.set(changeError); return; }
    this.deletingWeekSaving.set(true);
    this.api.deleteWeekSchedule(this._weekStart(), {
      change_category: this.deleteWeekDraft.change_category,
      change_reason: this.deleteWeekDraft.change_reason.trim()
    }).subscribe({
      next: () => {
        this.deletingWeekSaving.set(false);
        this.deletingWeek.set(false);
        this.loadSchedule();
      },
      error: error => {
        this.deletingWeekSaving.set(false);
        this.deleteWeekError.set(error.error?.error || 'מחיקת השבוע נכשלה');
      }
    });
  }

  doCopyWeek() {
    if (!this.copyFromWeek) { this.copyError.set('בחרי שבוע מקור'); return; }
    const changeError = this.validateChangeDraft({ ...this.copyWeekChange, change_scope: 'once' });
    if (changeError) { this.copyError.set(changeError); return; }
    // Normalize to week start
    const from = getWeekStart(new Date(this.copyFromWeek));
    this.copyLoading.set(true); this.copyError.set(''); this.copySuccess.set('');
    this.api.copyWeekSchedule(from, this._weekStart(), this.copyWeekChange).subscribe({
      next: r => {
        this.copyLoading.set(false);
        const skipped = r.skipped ? `; ${r.skipped} שיעורים לא הועתקו כי אינם בשעות הקודש של הכיתה` : '';
        this.copySuccess.set(`הועתקו ${r.copied} שיעורים${skipped}`);
        this.showCopyWeek = false;
        this.loadSchedule();
      },
      error: e => { this.copyLoading.set(false); this.copyError.set(e.error?.error || 'שגיאה'); }
    });
  }

}

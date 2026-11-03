import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Observable } from 'rxjs';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
const YEARS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const PARALLELS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatHebDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

@Component({
  selector: 'app-schedule',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="page-header">
  <div>
    <h1>מערכת שעות</h1>
    <p class="subtitle">ניהול שיעורים שבועיים לפי מורה וכיתה</p>
  </div>
  <div class="header-actions">
    <a routerLink="/schedule/print" class="btn btn-secondary">הדפסת דפי נוכחות</a>
  </div>
</div>

<!-- Week Navigation -->
<div class="week-nav card">
  <button class="btn btn-secondary" (click)="prevWeek()">→ שבוע קודם</button>
  <div class="week-info">
    <strong>שבוע: {{ weekStart() }}</strong>
    <span class="week-range">
      {{ formatHebDate(weekStart()) }} – {{ formatHebDate(weekEnd()) }}
    </span>
  </div>
  <button class="btn btn-secondary" (click)="nextWeek()">שבוע הבא ←</button>
  <button class="btn btn-primary" (click)="goToCurrentWeek()">השבוע הנוכחי</button>
</div>

<!-- Tabs -->
<div class="tab-bar">
  <button [class.active]="activeTab() === 'grid'" (click)="activeTab.set('grid')">תצוגת לוח</button>
  <button [class.active]="activeTab() === 'teachers'" (click)="activeTab.set('teachers')">מורות</button>
  <button [class.active]="activeTab() === 'manage'" (click)="activeTab.set('manage')">ניהול</button>
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

  <div *ngIf="!loading() && !slots().length && classOptions().length" class="empty-state card no-week-slots">
    <p>עדיין לא שובצו שיעורי קודש לשבוע זה. השעות מסומנות לפי סוגן.</p>
    <button class="btn btn-secondary" (click)="showCopyWeek=true">העתק משבוע קודם</button>
  </div>

  <!-- Copy week prompt -->
  <div *ngIf="showCopyWeek" class="copy-week-card card">
    <h3>העתקת שיעורים משבוע קודם</h3>
    <label>שבוע מקור:
      <input type="date" [(ngModel)]="copyFromWeek" [value]="prevWeekStr()">
    </label>
    <div class="copy-actions">
      <button class="btn btn-primary" [disabled]="copyLoading()" (click)="doCopyWeek()">
        {{ copyLoading() ? 'מעתיק...' : 'העתק שיעורים' }}
      </button>
      <button class="btn btn-secondary" (click)="showCopyWeek=false">ביטול</button>
    </div>
    <p *ngIf="copyError()" class="error-msg">{{ copyError() }}</p>
  </div>

  <div *ngIf="!loading() && (slots().length || classOptions().length)" class="schedule-display">
    <div class="schedule-view-toolbar card">
      <div class="schedule-view-copy">
        <strong>תצוגת המערכת</strong>
        <span>בחרי איך נוח לך לראות את השיעורים</span>
      </div>
      <div class="view-toggle" role="group" aria-label="סוג תצוגת מערכת השעות">
        <button type="button" [class.active]="scheduleView() === 'days'"
                [attr.aria-pressed]="scheduleView() === 'days'" (click)="scheduleView.set('days')">
          לפי ימים
        </button>
        <button type="button" [class.active]="scheduleView() === 'classes'"
                [attr.aria-pressed]="scheduleView() === 'classes'" (click)="scheduleView.set('classes')">
          לפי כיתות
        </button>
      </div>
    </div>

    <ng-container *ngIf="scheduleView() === 'days'; else classSchedule">
      <div class="day-selector" role="group" aria-label="בחירת יום">
        <button *ngFor="let d of DAYS; let i = index" type="button"
                [class.active]="selectedDay() === i" [attr.aria-pressed]="selectedDay() === i"
                (click)="selectedDay.set(i)">
          <span>יום {{ d }}</span>
          <small>{{ formatHebDate(addDays(weekStart(), i)) }}</small>
        </button>
      </div>

      <div class="table-wrap schedule-table-wrap">
        <table class="schedule-table day-schedule-table">
          <thead>
            <tr><th>שעה</th><th>כיתות</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let boardRow of dayScheduleRows()">
              <td class="schedule-time">{{ boardRow.start_time }} – {{ boardRow.end_time }}</td>
              <td class="day-lessons-cell">
                <div class="day-classes-grid">
                  <div *ngFor="let entry of boardRow.classes" class="day-class-availability"
                       [ngClass]="'period-' + entry.availability"
                       [attr.aria-disabled]="entry.availability !== 'kodesh'">
                    <span class="class-badge">{{ entry.row.className }}</span>
                    <ng-container *ngIf="entry.availability === 'kodesh' &&
                                        slotsForPeriod(entry.row.byDay[selectedDay()], entry.period) as periodSlots">
                      <ng-container *ngIf="periodSlots.length; else emptyDayPeriod">
                        <div *ngFor="let slot of periodSlots" class="day-lesson">
                          <a class="schedule-teacher teacher-profile-link" [routerLink]="['/teachers', slot.teacher_id]">
                            <span class="teacher-color" [style.background]="teacherColor(slot.teacher_id)"></span>
                            <span class="day-teacher-name">המורה {{ slot.teacher_name }}</span>
                          </a>
                          <span *ngIf="slot.subject || slot.teacher_subject" class="day-lesson-subject">
                            {{ slot.subject || slot.teacher_subject }}
                          </span>
                          <button class="btn btn-secondary schedule-edit" (click)="startEditSlot(slot)">עריכה</button>
                          <button class="btn btn-danger schedule-delete" (click)="deleteSlot(slot.id)">מחקי</button>
                        </div>
                      </ng-container>
                      <ng-template #emptyDayPeriod>
                        <button class="add-period-btn"
                                (click)="openAddSlot(selectedDay(), entry.row.classYear, entry.row.classParallel, entry.period)"
                                aria-label="הוספת שיעור קודש">+ הוספת שיעור</button>
                      </ng-template>
                    </ng-container>
                    <span *ngIf="entry.availability !== 'kodesh'" class="period-status-label">
                      {{ periodAvailabilityLabel(entry.availability) }}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
            <tr *ngIf="!dayScheduleRows().length">
              <td colspan="2" class="schedule-empty">אין שיעורים ביום זה</td>
            </tr>
          </tbody>
        </table>
      </div>
    </ng-container>

    <ng-template #classSchedule>
      <div class="table-wrap schedule-table-wrap">
        <table class="schedule-table class-schedule-table">
          <thead>
            <tr>
              <th class="class-heading">כיתה</th>
              <th *ngFor="let d of DAYS; let i = index">
                <span>יום {{ d }}</span>
                <small>{{ formatHebDate(addDays(weekStart(), i)) }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of gridRows()">
              <th scope="row" class="class-heading">
                <span class="class-badge">{{ row.className }}</span>
              </th>
              <td *ngFor="let day of [0,1,2,3,4]" class="class-schedule-cell">
                <div *ngFor="let segment of scheduleSegments(row.classYear, day)" class="class-period"
                     [ngClass]="'period-' + segment.availability"
                     [attr.aria-disabled]="segment.availability !== 'kodesh'">
                  <div class="period-heading">
                    <strong>{{ segment.start_time }} – {{ segment.end_time }}</strong>
                    <span class="period-status-label">
                      {{ periodAvailabilityLabel(segment.availability) }}
                    </span>
                  </div>
                  <div *ngFor="let slot of segment.availability === 'kodesh' ? slotsForPeriod(row.byDay[day], segment.period) : []"
                       class="class-slot" [style.border-inline-start-color]="teacherColor(slot.teacher_id)">
                    <div class="class-slot-teacher">
                      <span class="class-slot-teacher-dot" [style.background]="teacherColor(slot.teacher_id)"></span>
                      <a class="teacher-profile-link" [routerLink]="['/teachers', slot.teacher_id]">
                        {{ slot.teacher_name }}
                      </a>
                    </div>
                    <small *ngIf="slot.subject || slot.teacher_subject" class="class-slot-subject">
                      {{ slot.subject || slot.teacher_subject }}
                    </small>
                    <div class="class-slot-actions">
                      <button class="slot-edit-btn" (click)="startEditSlot(slot)">עריכה</button>
                      <button class="slot-del" (click)="deleteSlot(slot.id)" title="מחיקת שיעור" aria-label="מחיקת שיעור">מחיקה</button>
                    </div>
                  </div>
                  <button *ngIf="segment.availability === 'kodesh' &&
                                  !slotsForPeriod(row.byDay[day], segment.period).length"
                          class="add-period-btn"
                          (click)="openAddSlot(day, row.classYear, row.classParallel, segment.period)"
                          aria-label="הוספת שיעור קודש">+ הוספת שיעור</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ng-template>
  </div>
</div>

<!-- TEACHERS TAB -->
<div *ngIf="activeTab() === 'teachers'" class="teachers-view">
  <div class="section-header">
    <h3>רשימת מורות</h3>
    <button class="btn btn-primary" (click)="showAddTeacher=true">+ הוסף מורה</button>
  </div>

  <label class="teacher-search">
    <input type="search" aria-label="חיפוש מורה לפי שם, מקצוע או התמחות"
           [ngModel]="teacherSearch()" (ngModelChange)="teacherSearch.set($event)"
           placeholder="חיפוש לפי שם, מקצוע או התמחות">
  </label>

  <div *ngIf="showAddTeacher" class="add-form card">
    <h4>מורה חדשה</h4>
    <div class="form-row">
      <label>שם מלא <input [(ngModel)]="newTeacher.name" placeholder="שם המורה"></label>
      <label>מקצוע <input [(ngModel)]="newTeacher.subject" placeholder="מקצוע הוראה"></label>
      <label>התמחות <input [(ngModel)]="newTeacher.specialization" placeholder="לדוגמה: קודש"></label>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" [disabled]="savingTeacher()" (click)="createTeacher()">
        {{ savingTeacher() ? 'שומר...' : 'שמור' }}
      </button>
      <button class="btn btn-secondary" (click)="showAddTeacher=false; newTeacher={name:'',subject:'',specialization:''}">ביטול</button>
    </div>
    <p *ngIf="teacherError()" class="error-msg">{{ teacherError() }}</p>
  </div>

  <div class="teachers-list">
    <div *ngFor="let t of filteredTeachers()" class="teacher-row card">
      <div class="teacher-info" *ngIf="editingTeacherId() !== t.id">
        <div class="teacher-color" [style.background]="teacherColor(t.id)"></div>
        <div>
          <a [routerLink]="['/teachers', t.id]" class="teacher-name-link"><strong>{{ t.name }}</strong></a>
          <span *ngIf="t.subject" class="teacher-subject">{{ t.subject }}</span>
          <span *ngIf="t.specialization" class="teacher-specialization">{{ t.specialization }}</span>
        </div>
        <div class="teacher-count">
          {{ slotCountForTeacher(t.id) }} שיעורים השבוע
        </div>
        <div class="teacher-actions">
          <button class="btn btn-secondary" (click)="startEditTeacher(t)" title="עריכה">✎</button>
          <button class="btn btn-danger" (click)="deleteTeacher(t.id)" title="מחיקה">⌫</button>
        </div>
      </div>
      <div class="teacher-edit" *ngIf="editingTeacherId() === t.id">
        <input [(ngModel)]="editTeacherDraft.name" placeholder="שם">
        <input [(ngModel)]="editTeacherDraft.subject" placeholder="מקצוע">
        <input [(ngModel)]="editTeacherDraft.specialization" placeholder="התמחות">
        <button class="btn btn-primary" (click)="saveTeacher(t.id)">שמור</button>
        <button class="btn btn-secondary" (click)="editingTeacherId.set(0)">ביטול</button>
      </div>
    </div>
    <p *ngIf="!filteredTeachers().length" class="empty-state card">
      {{ teacherSearch().trim() ? 'לא נמצאו מורות התואמות לחיפוש' : 'אין מורות להצגה' }}
    </p>
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

  <div *ngIf="showCopyWeek" class="copy-week-card card">
    <h4>העתקת שיעורים</h4>
    <label>שבוע מקור (תאריך ראשון בשבוע):
      <input type="date" [(ngModel)]="copyFromWeek">
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
          <tr *ngFor="let s of slots()">
            <td>{{ s.teacher_name }}</td>
            <td><span class="class-badge">{{ s.class_year }}{{ s.class_parallel }}</span></td>
            <td>יום {{ DAYS[s.day_of_week] }}</td>
            <td>{{ s.start_time }}{{ s.end_time ? ' – ' + s.end_time : '' }}</td>
            <td>{{ s.subject || s.teacher_subject || '—' }}</td>
            <td><button class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" (click)="deleteSlot(s.id)">מחק</button></td>
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
    <p *ngIf="editSlotError()" class="error-msg" role="alert">{{ editSlotError() }}</p>
    <div class="form-actions">
      <button class="btn btn-primary" [disabled]="savingEditSlot()" (click)="saveEditedSlot()">
        {{ savingEditSlot() ? 'שומרת...' : 'שמירה' }}
      </button>
      <button class="btn btn-secondary" [disabled]="savingEditSlot()" (click)="cancelEditSlot()">ביטול</button>
    </div>
  </div>
</div>
`,
  styles: [`
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.header-actions { display: flex; gap: 8px; }

.week-nav {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
  padding: 12px 16px;
}
.week-info { flex: 1; text-align: center; }
.week-info strong { display: block; font-size: 1rem; }
.week-range { font-size: 0.82rem; color: var(--text-muted); }

.tab-bar {
  display: flex; gap: 4px; margin-bottom: 16px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 4px;
  button { flex: 1; padding: 8px 12px; border: none; border-radius: var(--radius-sm);
    background: transparent; font: inherit; font-size: 0.88rem; cursor: pointer;
    color: var(--text-muted); transition: all var(--transition);
    &.active { background: var(--surface); color: var(--primary); font-weight: 700;
      box-shadow: var(--shadow-xs); } }
}

.schedule-display { display: grid; gap: 14px; }
.schedule-view-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 18px; margin: 0;
}
.schedule-view-copy { display: grid; gap: 3px; }
.schedule-view-copy strong { font-size: 0.95rem; }
.schedule-view-copy span { color: var(--text-muted); font-size: 0.8rem; }
.view-toggle {
  display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--surface-2);
  button {
    padding: 8px 16px; border: 0; border-radius: var(--radius-sm); background: transparent;
    color: var(--text-muted); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer;
    &.active { color: var(--primary); background: var(--surface); box-shadow: var(--shadow-xs); }
  }
}
.schedule-table-wrap { box-shadow: var(--shadow-sm); background: var(--surface); }
.schedule-table { min-width: 100%; }
.schedule-table th small { display: block; margin-top: 3px; font-size: 0.72rem; font-weight: 500; text-transform: none; letter-spacing: 0; }
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
@media (max-width: 640px) {
  .schedule-view-toolbar { align-items: stretch; flex-direction: column; }
  .view-toggle button { flex: 1; }
}

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

  loading = signal(false);
  teachers = signal<any[]>([]);
  teacherSearch = signal('');
  slots = signal<any[]>([]);
  activeTab = signal<'grid' | 'teachers' | 'manage'>('grid');
  scheduleView = signal<'days' | 'classes'>('classes');
  selectedDay = signal(0);

  // Week navigation
  private _weekStart = signal(getWeekStart(new Date()));
  weekStart = computed(() => this._weekStart());
  weekEnd = computed(() => addDays(this._weekStart(), 4));

  // Teacher CRUD
  showAddTeacher = false;
  newTeacher = { name: '', subject: '', specialization: '' };
  savingTeacher = signal(false);
  teacherError = signal('');
  editingTeacherId = signal(0);
  editTeacherDraft = { name: '', subject: '', specialization: '' };

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

  // Quick add from grid
  quickAddSlot: any = null;
  quickSlotError = signal('');
  savingQuickSlot = signal(false);
  editingSlot = signal<any | null>(null);
  editSlotDraft = { teacher_id: 0, period_id: '', start_time: '', end_time: '', subject: '' };
  savingEditSlot = signal(false);
  editSlotError = signal('');
  kodeshAvailability = signal<{
    kodesh: Record<string, Record<string, string>>;
    instruction: Record<string, Record<string, { start: string; end: string }>>;
  }>({ kodesh: {}, instruction: {} });
  kodeshAvailabilityLoading = signal(true);
  kodeshAvailabilityError = signal('');

  // Teacher colors
  private colors = ['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#ffedd5','#e0f2fe','#f0fdf4'];

  constructor(private api: ApiService) {}

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
  filteredTeachers = computed(() => {
    const query = this.teacherSearch().trim().toLocaleLowerCase('he');
    if (!query) return this.teachers();
    return this.teachers().filter(teacher =>
      [teacher.name, teacher.subject, teacher.specialization]
        .some(value => String(value || '').toLocaleLowerCase('he').includes(query))
    );
  });

  loadSchedule() {
    this.loading.set(true);
    this.api.getSchedule(this._weekStart()).subscribe({
      next: r => { this.slots.set(r.slots); this.loading.set(false); },
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

  formatHebDate(d: string) { return formatHebDate(d); }
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
      subject: slot.subject || ''
    };
    this.editSlotError.set('');
  }

  cancelEditSlot() {
    if (this.savingEditSlot()) return;
    this.editingSlot.set(null);
    this.editSlotError.set('');
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
      subject: this.editSlotDraft.subject.trim() || null
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

  deleteSlot(id: number) {
    if (!confirm('למחוק שיעור זה?')) return;
    this.api.deleteScheduleSlot(id).subscribe({ next: () => this.loadSchedule() });
  }

  deleteWeek() {
    if (!confirm(`למחוק את כל ${this.slots().length} שיעורי שבוע ${this._weekStart()}?`)) return;
    this.api.deleteWeekSchedule(this._weekStart()).subscribe({ next: () => this.loadSchedule() });
  }

  doCopyWeek() {
    if (!this.copyFromWeek) { this.copyError.set('בחרי שבוע מקור'); return; }
    // Normalize to week start
    const from = getWeekStart(new Date(this.copyFromWeek));
    this.copyLoading.set(true); this.copyError.set(''); this.copySuccess.set('');
    this.api.copyWeekSchedule(from, this._weekStart()).subscribe({
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

  createTeacher() {
    if (!this.newTeacher.name.trim()) { this.teacherError.set('שם חובה'); return; }
    this.savingTeacher.set(true); this.teacherError.set('');
    this.api.createTeacher(this.newTeacher).subscribe({
      next: () => { this.savingTeacher.set(false); this.showAddTeacher = false; this.newTeacher = { name: '', subject: '', specialization: '' }; this.loadTeachers(); },
      error: e => { this.savingTeacher.set(false); this.teacherError.set(e.error?.error || 'שגיאה'); }
    });
  }

  startEditTeacher(t: any) {
    this.editingTeacherId.set(t.id);
    this.editTeacherDraft = { name: t.name, subject: t.subject || '', specialization: t.specialization || '' };
  }

  saveTeacher(id: number) {
    this.api.updateTeacher(id, this.editTeacherDraft).subscribe({
      next: () => { this.editingTeacherId.set(0); this.loadTeachers(); },
      error: e => alert(e.error?.error || 'שגיאה')
    });
  }

  deleteTeacher(id: number) {
    if (!confirm('למחוק מורה זו? כל השיעורים שלה יימחקו.')) return;
    this.api.deleteTeacher(id).subscribe({ next: () => { this.loadTeachers(); this.loadSchedule(); } });
  }
}

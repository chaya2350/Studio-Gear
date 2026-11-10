import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { getPeriodAvailability, ScheduleAvailabilityMap } from '../../utils/schedule-availability';

interface TrackScheduleSlot {
  id: number;
  track_id: number;
  study_year: string;
  teacher_id: number;
  teacher_name: string;
  teacher_subject: string | null;
  day_of_week: number;
  period_name: string;
  start_time: string;
  end_time: string;
  subject: string | null;
  room_number: string | null;
  room_name: string | null;
}

@Component({
  selector: 'app-track-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>מערכות שעות למסלולים</h1>
        <p class="subtitle">מערכת שבועית נפרדת לכל מסלול ושנה</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary no-print" type="button" (click)="print()">הדפסה</button>
        <a routerLink="/schedule" class="btn btn-secondary no-print">חזרה למערכת השעות</a>
      </div>
    </div>

    <p *ngIf="pageError()" class="alert alert-error" role="alert">{{ pageError() }}</p>
    <div *ngIf="loadingMeta()" class="loading-state">טוען מסלולים ושעות...</div>
    <div *ngIf="!loadingMeta() && !selectableTracks().length" class="card empty-state">
      <p>לא נמצאו מסלולים עם תלמידות.</p>
      <a routerLink="/admin">מעבר לניהול מסלולים</a>
    </div>

    <ng-container *ngIf="!loadingMeta() && selectableTracks().length">
      <section class="card selector-card no-print">
        <label>
          <span>מסלול</span>
          <select [ngModel]="selectedTrackId()" (ngModelChange)="selectTrack($event)">
            <option *ngFor="let track of selectableTracks()" [ngValue]="track.id">{{ track.name }}</option>
          </select>
        </label>
        <label>
          <span>שנה</span>
          <select [ngModel]="selectedYear()" (ngModelChange)="selectYear($event)">
            <option *ngFor="let year of studyYears()" [ngValue]="year.year">
              {{ year.year }}׳ · {{ year.student_count }} תלמידות
            </option>
          </select>
        </label>
        <div class="selection-summary" *ngIf="schedule() as current">
          <strong>{{ current.track.name }} · שנה {{ current.study_year }}׳</strong>
          <span>{{ current.student_count }} תלמידות במסלול ובשנה</span>
        </div>
      </section>

      <div *ngIf="loadingSchedule()" class="loading-state">טוען מערכת...</div>
      <section *ngIf="!loadingSchedule() && schedule()" class="card timetable-card">
        <div class="timetable-heading">
          <div>
            <h2>{{ schedule()!.track.name }} · שנה {{ schedule()!.study_year }}׳</h2>
            <p>שיעורים חוזרים במהלך שנת הלימודים</p>
          </div>
          <div class="timetable-actions">
            <div class="week-navigation no-print" aria-label="ניווט בין שבועות">
              <button class="btn btn-secondary" type="button" (click)="changeWeek(-1)" aria-label="לשבוע הקודם">‹</button>
              <strong>{{ formatWeekDate(weekStart()) }} – {{ formatWeekDate(weekEnd()) }}</strong>
              <button class="btn btn-secondary" type="button" (click)="changeWeek(1)" aria-label="לשבוע הבא">לשבוע הבא ›</button>
            </div>
            <button class="btn btn-primary no-print" type="button" (click)="openAdd()">הוספת שיעור</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="timetable">
            <thead>
              <tr>
                <th class="time-heading">שעה</th>
                <th *ngFor="let day of days; let dayIndex = index">
                  יום {{ day }}
                  <small class="day-date">{{ formatWeekDate(dateForDay(dayIndex)) }}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let period of lessonPeriods()">
                <th class="period-heading">
                  <strong>{{ period.start_time }}–{{ period.end_time }}</strong>
                  <span>{{ period.name }}</span>
                </th>
                <td *ngFor="let day of days; let dayIndex = index"
                    [class.unavailable-cell]="periodAvailability(dayIndex, period) !== 'track'">
                  <span *ngIf="periodAvailability(dayIndex, period) === 'kodesh'" class="availability-label">קודש</span>
                  <span *ngIf="periodAvailability(dayIndex, period) === 'instruction'" class="availability-label">הוראה</span>
                  <ng-container *ngIf="periodAvailability(dayIndex, period) === 'track'">
                    <article *ngFor="let slot of slotsFor(dayIndex, period)" class="lesson-card">
                      <strong>{{ slot.subject || slot.teacher_subject || slot.period_name }}</strong>
                      <span>{{ slot.teacher_name }}</span>
                      <small *ngIf="slot.room_number">חדר {{ slot.room_number }}<span *ngIf="slot.room_name"> · {{ slot.room_name }}</span></small>
                      <div class="lesson-actions no-print">
                        <button type="button" (click)="edit(slot)">עריכה</button>
                        <button type="button" (click)="remove(slot)">מחיקה</button>
                      </div>
                    </article>
                    <button *ngIf="!slotsFor(dayIndex, period).length" class="cell-add no-print"
                            type="button" (click)="openAdd(dayIndex, period)" aria-label="הוספת שיעור">+</button>
                  </ng-container>
                </td>
              </tr>
              <tr *ngIf="!lessonPeriods().length">
                <td colspan="6" class="empty-row">לא הוגדרו שעות שיעור במערכת.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </ng-container>

    <div *ngIf="formOpen()" class="modal-overlay no-print" (click)="closeForm()">
      <section class="editor-dialog" role="dialog" aria-modal="true"
               [attr.aria-labelledby]="'track-slot-title'" (click)="$event.stopPropagation()">
        <div class="dialog-heading">
          <h2 id="track-slot-title">{{ editingSlot() ? 'עריכת שיעור' : 'הוספת שיעור למסלול' }}</h2>
          <button type="button" class="dialog-close" aria-label="סגירה" [disabled]="saving()" (click)="closeForm()">×</button>
        </div>
        <form (ngSubmit)="save()">
          <div class="editor-grid">
            <label>
              <span>יום</span>
              <select name="day" [(ngModel)]="draft.day_of_week" (ngModelChange)="onDraftDayChange($event)" [disabled]="!!editingSlot()" required>
                <option *ngFor="let day of days; let i = index" [ngValue]="i">יום {{ day }}</option>
              </select>
            </label>
            <label>
              <span>שעת התחלה</span>
              <input name="start_time" type="time" [(ngModel)]="draft.start_time" required>
            </label>
            <label>
              <span>שעת סיום</span>
              <input name="end_time" type="time" [(ngModel)]="draft.end_time" required>
            </label>
            <label>
              <span>מורה</span>
              <select name="teacher" [(ngModel)]="draft.teacher_id" [disabled]="!trackTeachers().length" required>
                <option [ngValue]="null">בחרי מורה</option>
                <option *ngFor="let teacher of trackTeachers()" [ngValue]="teacher.id">
                  {{ teacher.name }}{{ teacher.subject ? ' · ' + teacher.subject : '' }}
                </option>
              </select>
            </label>
            <label>
              <span>מקצוע / נושא</span>
              <input name="subject" [(ngModel)]="draft.subject" maxlength="120" placeholder="לא חובה">
            </label>
            <label>
              <span>חדר</span>
              <select name="room" [(ngModel)]="draft.room_number">
                <option [ngValue]="null">ללא חדר קבוע</option>
                <option *ngFor="let room of rooms()" [ngValue]="room.number">{{ room.number }} · {{ room.name }}</option>
              </select>
            </label>
          </div>
          <p class="time-hint">אפשר לקבוע שעות מסלול גם אחרי 15:30. שעות קודש והוראה נשארות חסומות.</p>
          <p *ngIf="!trackTeachers().length" class="alert alert-error" role="status">
            לא נמצאו מורות שתחום ההתמחות שלהן תואם למסלול. יש לעדכן את תחום ההתמחות בפרטי המורה.
          </p>
          <p *ngIf="formError()" class="alert alert-error" role="alert">{{ formError() }}</p>
          <div class="editor-actions">
            <button class="btn btn-primary" type="submit" [disabled]="saving() || !availabilityLoaded() || !trackTeachers().length">
              {{ saving() ? 'שומר...' : 'שמירה' }}
            </button>
            <button class="btn btn-secondary" type="button" [disabled]="saving()" (click)="closeForm()">ביטול</button>
          </div>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .selector-card { display: flex; align-items: end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .selector-card label, .editor-grid label { display: grid; gap: 6px; min-width: 180px; }
    label > span { font-size: .82rem; font-weight: 700; color: var(--text-muted); }
    select, input { min-height: 40px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; }
    .selection-summary { display: grid; gap: 3px; margin-right: auto; color: var(--text-muted); font-size: .85rem; }
    .selection-summary strong { color: var(--text); font-size: .98rem; }
    .timetable-card { padding: 18px; }
    .timetable-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    .timetable-actions { display: grid; justify-items: end; gap: 10px; }
    .week-navigation { display: flex; align-items: center; gap: 10px; }
    .week-navigation strong { white-space: nowrap; font-size: .88rem; }
    .day-date { display: block; margin-top: 3px; color: var(--text-muted); font-weight: 400; }
    .timetable-heading h2 { margin: 0; font-size: 1.15rem; }
    .timetable-heading p { margin: 6px 0 0; color: var(--text-muted); font-size: .82rem; }
    .timetable { width: 100%; min-width: 760px; border-collapse: separate; border-spacing: 0; }
    .timetable th, .timetable td { border-left: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 8px; text-align: center; vertical-align: middle; }
    .timetable thead th { position: sticky; top: 0; background: var(--surface-2); font-size: .85rem; }
    .timetable tr > :first-child { border-right: 1px solid var(--border); }
    .time-heading { min-width: 135px; }
    .period-heading { min-width: 135px; background: var(--surface-2); }
    .period-heading strong, .period-heading span { display: block; }
    .period-heading strong { direction: ltr; font-size: .86rem; }
    .period-heading span { color: var(--text-muted); font-size: .75rem; margin-top: 3px; }
    .timetable td { min-width: 112px; height: 75px; }
    .unavailable-cell { background: var(--surface-2); }
    .availability-label { color: var(--text-muted); font-size: .78rem; }
    .lesson-card { display: grid; gap: 4px; padding: 8px; border-radius: 9px; background: var(--primary-light); color: var(--text); text-align: right; }
    .lesson-card strong { color: var(--primary); }
    .lesson-card span, .lesson-card small { font-size: .78rem; }
    .lesson-actions { display: flex; gap: 8px; }
    .lesson-actions button, .cell-add { border: 0; color: var(--primary); background: transparent; cursor: pointer; font: inherit; }
    .lesson-actions button { padding: 2px 0; text-decoration: underline; font-size: .74rem; }
    .cell-add { width: 100%; min-height: 55px; border: 1px dashed var(--border); border-radius: 8px; font-size: 1.35rem; }
    .cell-add:hover { background: var(--surface-2); }
    .empty-row { padding: 24px !important; color: var(--text-muted); }
    .editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .editor-actions { display: flex; gap: 8px; margin-top: 16px; }
    .modal-overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .48); }
    .editor-dialog { width: min(620px, 100%); max-height: min(90vh, 760px); overflow-y: auto; padding: 22px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
    .dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .dialog-heading h2 { margin: 0; font-size: 1.15rem; }
    .dialog-close { width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 1.5rem; line-height: 1; }
    @media (max-width: 700px) {
      .selector-card { align-items: stretch; }
      .selector-card label { flex: 1 1 100%; }
      .timetable-heading { align-items: flex-start; flex-direction: column; }
      .timetable-actions { justify-items: stretch; width: 100%; }
      .week-navigation { justify-content: space-between; }
      .editor-dialog { padding: 18px; }
    }
    @media print {
      .no-print, .page-header .header-actions, .selector-card { display: none !important; }
      .page-header { margin-bottom: 8px; }
      .timetable-card { box-shadow: none; border: 0; padding: 0; }
      .timetable { min-width: 0; font-size: 10px; }
      .timetable td, .period-heading { min-width: 0; }
    }
  `]
})
export class TrackScheduleComponent implements OnInit {
  readonly days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  private readonly defaultAvailability: ScheduleAvailabilityMap = { kodesh: {}, instruction: {} };
  tracks = signal<{ id: number; name: string; years: { year: string; student_count: number }[] }[]>([]);
  teachers = signal<{ id: number; name: string; subject: string | null; specialization: string | null }[]>([]);
  periods = signal<{ id: number; name: string; start_time: string; end_time: string; is_break?: number }[]>([]);
  selectableTracks = computed(() => this.tracks().filter(track =>
    track.years.some(year => year.student_count > 0)
  ));
  lessonPeriods = computed(() => {
    const periods = new Map<string, { id?: number; name: string; start_time: string; end_time: string }>();
    for (const period of this.periods().filter(item => !item.is_break)) {
      periods.set(`${period.start_time}-${period.end_time}`, period);
    }
    for (const slot of this.schedule()?.slots || []) {
      const key = `${slot.start_time}-${slot.end_time}`;
      if (!periods.has(key)) {
        periods.set(key, {
          name: slot.period_name, start_time: slot.start_time, end_time: slot.end_time
        });
      }
    }
    return Array.from(periods.values()).sort((a, b) =>
      a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)
    );
  });
  rooms = signal<{ number: string; name: string }[]>([]);
  availability = signal<ScheduleAvailabilityMap>(this.defaultAvailability);
  availabilityLoaded = signal(false);
  schedule = signal<{ track: { id: number; name: string }; study_year: string; student_count: number; slots: TrackScheduleSlot[] } | null>(null);
  selectedTrackId = signal<number | null>(null);
  selectedYear = signal('ה');
  weekOffset = signal(0);
  weekStart = computed(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay() + this.weekOffset() * 7);
    return date;
  });
  weekEnd = computed(() => this.dateForDay(4));
  loadingMeta = signal(true);
  loadingSchedule = signal(false);
  pageError = signal('');
  formError = signal('');
  formOpen = signal(false);
  saving = signal(false);
  editingSlot = signal<TrackScheduleSlot | null>(null);
  draft = {
    day_of_week: 0, start_time: '', end_time: '', teacher_id: null as number | null,
    subject: '', room_number: null as string | null
  };

  studyYears = computed(() => {
    const track = this.selectableTracks().find(item => item.id === this.selectedTrackId());
    return track?.years || [];
  });
  trackTeachers = computed(() => {
    const track = this.selectableTracks().find(item => item.id === this.selectedTrackId());
    const trackName = String(track?.name || '').trim();
    return this.teachers().filter(teacher => String(teacher.specialization || '').trim() === trackName);
  });

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getKodeshAvailability().subscribe({
      next: value => {
        this.availability.set(value);
        this.availabilityLoaded.set(true);
      },
      error: error => this.pageError.set(error.error?.error || 'טעינת שעות קודש/הוראה נכשלה')
    });
    this.api.getTrackScheduleMeta().subscribe({
      next: meta => {
        this.tracks.set(meta.tracks);
        this.teachers.set(meta.teachers);
        this.periods.set(meta.periods);
        this.rooms.set(meta.rooms);
        const trackId = this.selectableTracks()[0]?.id ?? null;
        this.selectedTrackId.set(trackId);
        if (trackId !== null) this.loadSchedule(trackId, this.selectedYear());
        this.loadingMeta.set(false);
      },
      error: error => {
        this.loadingMeta.set(false);
        this.pageError.set(error.error?.error || 'טעינת המסלולים נכשלה');
      }
    });
  }

  selectTrack(value: number | string) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || !this.selectableTracks().some(track => track.id === id)) return;
    this.selectedTrackId.set(id);
    const years = this.selectableTracks().find(track => track.id === id)?.years || [];
    const year = years.some(item => item.year === this.selectedYear()) ? this.selectedYear() : years[0]?.year || 'ה';
    this.selectedYear.set(year);
    this.loadSchedule(id, year);
  }

  selectYear(year: string) {
    this.selectedYear.set(year);
    const trackId = this.selectedTrackId();
    if (trackId !== null) this.loadSchedule(trackId, year);
  }

  dateForDay(day: number) {
    const date = new Date(this.weekStart());
    date.setDate(date.getDate() + day);
    return date;
  }

  formatWeekDate(date: Date) {
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  changeWeek(offset: number) {
    this.weekOffset.update(current => current + offset);
  }

  loadSchedule(trackId: number, year: string) {
    this.loadingSchedule.set(true);
    this.schedule.set(null);
    this.closeForm();
    this.pageError.set('');
    this.api.getTrackSchedule(trackId, year).subscribe({
      next: value => { this.schedule.set(value); this.loadingSchedule.set(false); },
      error: error => {
        this.loadingSchedule.set(false);
        this.pageError.set(error.error?.error || 'טעינת מערכת המסלול נכשלה');
      }
    });
  }

  slotsFor(day: number, period: { start_time: string; end_time: string }) {
    return (this.schedule()?.slots || []).filter(slot =>
      slot.day_of_week === day && slot.start_time === period.start_time && slot.end_time === period.end_time
    );
  }

  periodAvailability(day: number, period: { start_time: string; end_time: string }) {
    return getPeriodAvailability(this.selectedYear(), day, period, this.availability());
  }

  onDraftDayChange(day: number) {
    this.draft.day_of_week = Number(day);
  }

  openAdd(day = 0, period?: { start_time: string; end_time: string }) {
    this.editingSlot.set(null);
    this.formError.set('');
    this.draft = {
      day_of_week: day,
      start_time: period?.start_time || '',
      end_time: period?.end_time || '',
      teacher_id: null,
      subject: '',
      room_number: null
    };
    this.formOpen.set(true);
  }

  edit(slot: TrackScheduleSlot) {
    this.editingSlot.set(slot);
    this.formError.set('');
    this.draft = {
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      teacher_id: slot.teacher_id,
      subject: slot.subject || '',
      room_number: slot.room_number
    };
    this.formOpen.set(true);
  }

  closeForm() {
    this.formOpen.set(false);
    this.editingSlot.set(null);
    this.formError.set('');
  }

  save() {
    const trackId = this.selectedTrackId();
    const { teacher_id, start_time, end_time, day_of_week, subject, room_number } = this.draft;
    if (trackId === null || teacher_id === null || !start_time || !end_time) {
      this.formError.set('יש לבחור שעה ומורה');
      return;
    }
    if (end_time <= start_time) {
      this.formError.set('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return;
    }
    if (this.periodAvailability(day_of_week, { start_time, end_time }) !== 'track') {
      this.formError.set('יש לבחור שעה שאינה מיועדת ללימודי קודש או הוראה');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    const request = this.editingSlot()
      ? this.api.updateTrackScheduleSlot(this.editingSlot()!.id, { teacher_id, start_time, end_time, subject, room_number }).pipe(map(() => undefined))
      : this.api.createTrackScheduleSlot(trackId, this.selectedYear(), { teacher_id, day_of_week, start_time, end_time, subject, room_number }).pipe(map(() => undefined));
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.loadSchedule(trackId, this.selectedYear());
      },
      error: error => {
        this.saving.set(false);
        this.formError.set(error.error?.error || 'שמירת השיעור נכשלה');
      }
    });
  }

  remove(slot: TrackScheduleSlot) {
    if (!window.confirm(`למחוק את ${slot.period_name} ביום ${this.days[slot.day_of_week]} ממערכת המסלול?`)) return;
    this.api.deleteTrackScheduleSlot(slot.id).subscribe({
      next: () => {
        const trackId = this.selectedTrackId();
        if (trackId !== null) this.loadSchedule(trackId, this.selectedYear());
      },
      error: error => this.pageError.set(error.error?.error || 'מחיקת השיעור נכשלה')
    });
  }

  print() {
    window.print();
  }
}

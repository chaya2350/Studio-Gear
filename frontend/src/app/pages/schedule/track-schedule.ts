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

        <div class="timeline-scroll">
          <div class="timeline" [style.--timeline-height.px]="timelineHeight()">
            <div class="timeline-header">
              <div class="timeline-time-heading">שעה</div>
              <div *ngFor="let day of days; let dayIndex = index" class="timeline-day-heading">
                יום {{ day }}
                <small class="day-date">{{ formatWeekDate(dateForDay(dayIndex)) }}</small>
              </div>
            </div>
            <div class="timeline-body">
              <div class="timeline-ruler">
                <span *ngFor="let minute of timelineHourMarkers()"
                      class="timeline-hour-label"
                      [style.top.px]="timelinePosition(minute)">
                  {{ formatTime(minute) }}
                </span>
              </div>
              <div *ngFor="let day of days; let dayIndex = index" class="timeline-day">
                <span *ngFor="let minute of timelineHourMarkers()"
                      class="timeline-gridline"
                      [style.top.px]="timelinePosition(minute)"
                      aria-hidden="true"></span>
                <div *ngFor="let period of unavailablePeriods(dayIndex)"
                     class="timeline-blocked"
                     [class.blocked-instruction]="periodAvailability(dayIndex, period) === 'instruction'"
                     [style.top.px]="timelineItemPosition(period.start_time)"
                     [style.height.px]="timelineItemHeight(period.start_time, period.end_time)">
                  {{ periodAvailability(dayIndex, period) === 'kodesh' ? 'קודש' : 'הוראה' }}
                </div>
                <button *ngFor="let period of addablePeriods(dayIndex)" type="button"
                        class="timeline-add-slot no-print"
                        [style.top.px]="timelineItemPosition(period.start_time)"
                        [style.height.px]="timelineItemHeight(period.start_time, period.end_time)"
                        [attr.aria-label]="'הוספת שיעור ביום ' + days[dayIndex] + ' בשעה ' + period.start_time"
                        [title]="'הוספת שיעור · ' + period.name + ' · יום ' + days[dayIndex]"
                        (click)="openAdd(dayIndex, period)">
                  <span aria-hidden="true">+</span>
                </button>
                <article *ngFor="let slot of slotsForDay(dayIndex)"
                         class="lesson-card"
                         [style.top.px]="timelineItemPosition(slot.start_time)"
                         [style.height.px]="timelineItemHeight(slot.start_time, slot.end_time)">
                  <strong>{{ slot.subject || slot.teacher_subject || slot.period_name }}</strong>
                  <span>{{ slot.teacher_name }}</span>
                  <div class="lesson-meta">
                    <small class="lesson-time">{{ slot.start_time }}–{{ slot.end_time }}</small>
                    <small *ngIf="slot.room_number" class="lesson-room">
                      חדר {{ slot.room_number }}<span *ngIf="slot.room_name"> · {{ slot.room_name }}</span>
                    </small>
                  </div>
                  <div class="lesson-actions no-print">
                    <button type="button" (click)="edit(slot)">עריכה</button>
                    <button type="button" (click)="remove(slot)">מחיקה</button>
                  </div>
                </article>
              </div>
            </div>
          </div>
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
    .timeline-scroll { overflow-x: auto; }
    .timeline { min-width: 900px; }
    .timeline-header, .timeline-body { display: grid; grid-template-columns: 72px repeat(5, minmax(140px, 1fr)); direction: rtl; }
    .timeline-header { position: sticky; top: 0; z-index: 5; background: var(--surface-2); }
    .timeline-time-heading, .timeline-day-heading { padding: 10px 6px; border-left: 1px solid var(--border); border-bottom: 1px solid var(--border); text-align: center; font-size: .85rem; font-weight: 700; }
    .timeline-day-heading { border-right: 1px solid var(--border); }
    .timeline-body { height: var(--timeline-height); }
    .timeline-ruler, .timeline-day { position: relative; height: var(--timeline-height); border-left: 1px solid var(--border); }
    .timeline-ruler { border-right: 1px solid var(--border); background: var(--surface-2); }
    .timeline-hour-label { position: absolute; right: 3px; z-index: 2; padding: 0 2px; transform: translateY(-50%); background: var(--surface-2); color: var(--text-muted); direction: ltr; font-size: .7rem; }
    .timeline-day { border-bottom: 1px solid var(--border); }
    .timeline-gridline { position: absolute; right: 0; left: 0; z-index: 0; border-top: 1px solid var(--border); pointer-events: none; }
    .timeline-blocked { position: absolute; right: 2px; left: 2px; z-index: 1; box-sizing: border-box; display: grid; place-items: center; overflow: hidden; border-radius: 5px; background: var(--surface-2); color: var(--text-muted); font-size: .72rem; opacity: .8; pointer-events: none; }
    .blocked-instruction { background: var(--primary-light); }
    .timeline-add-slot { position: absolute; right: 4px; left: 4px; z-index: 1; display: grid; place-items: center; min-height: 28px; padding: 2px 6px; border: 1px dashed var(--primary); border-radius: 6px; background: var(--surface); color: var(--primary); opacity: .28; cursor: pointer; font: inherit; font-size: 1.15rem; font-weight: 800; }
    .timeline-add-slot:hover, .timeline-add-slot:focus-visible { z-index: 3; background: var(--primary-light); opacity: 1; outline: 2px solid var(--primary); outline-offset: 1px; }
    .lesson-card { position: absolute; right: 4px; left: 4px; z-index: 2; box-sizing: border-box; display: grid; align-content: start; gap: 1px; overflow: hidden; padding: 4px 6px; border: 1px solid var(--primary); border-radius: 8px; background: var(--surface); color: var(--text); text-align: right; }
    .lesson-card strong, .lesson-card > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lesson-card strong { color: var(--primary); font-size: .8rem; line-height: 1.2; }
    .lesson-card span, .lesson-card small { font-size: .68rem; line-height: 1.15; }
    .lesson-meta { display: flex; justify-content: space-between; gap: 4px; min-width: 0; }
    .lesson-time { flex: 0 0 auto; direction: ltr; text-align: right; }
    .lesson-room { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lesson-actions { position: absolute; bottom: 2px; left: 4px; display: flex; gap: 8px; padding: 1px 3px; border-radius: 4px; background: var(--surface); opacity: 0; }
    .lesson-card:hover .lesson-actions, .lesson-card:focus-within .lesson-actions { opacity: 1; }
    .lesson-actions button { border: 0; color: var(--primary); background: transparent; cursor: pointer; font: inherit; }
    .lesson-actions button { padding: 2px 0; text-decoration: underline; font-size: .74rem; }
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
      .timeline { min-width: 0; }
      .timeline-header, .timeline-body { grid-template-columns: 44px repeat(5, minmax(0, 1fr)); }
      .timeline-day-heading, .timeline-time-heading { padding: 5px 2px; font-size: 8px; }
      .lesson-card { right: 1px; left: 1px; padding: 2px; font-size: 8px; }
      .lesson-card span, .lesson-card small { font-size: 7px; }
    }
  `]
})
export class TrackScheduleComponent implements OnInit {
  readonly days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  private readonly pixelsPerMinute = 1.8;
  private readonly defaultAvailability: ScheduleAvailabilityMap = { kodesh: {}, instruction: {} };
  tracks = signal<{ id: number; name: string; years: { year: string; student_count: number }[] }[]>([]);
  teachers = signal<{ id: number; name: string; subject: string | null; specialization: string | null; track_ids: number[] }[]>([]);
  periods = signal<{ id: number; name: string; start_time: string; end_time: string; is_break?: number }[]>([]);
  roomDefaults = signal<{ track_id: number; study_year: string; room_number: string }[]>([]);
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
  private timelineRange = computed(() => {
    const times = [
      ...this.lessonPeriods().flatMap(period => [period.start_time, period.end_time]),
      ...(this.schedule()?.slots || []).flatMap(slot => [slot.start_time, slot.end_time])
    ].map(time => this.minutesFromTime(time)).filter((minute): minute is number => minute !== null);
    if (!times.length) return { start: 8 * 60, end: 20 * 60 };
    const start = Math.floor(Math.min(...times) / 60) * 60;
    const end = Math.ceil(Math.max(...times) / 60) * 60;
    return { start, end: Math.max(end, start + 60) };
  });
  timelineHourMarkers = computed(() => {
    const { start, end } = this.timelineRange();
    return Array.from({ length: (end - start) / 60 + 1 }, (_, index) => start + index * 60);
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
    const trackId = this.selectedTrackId();
    return this.teachers().filter(teacher => teacher.track_ids.includes(trackId ?? -1));
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
        this.roomDefaults.set(meta.room_defaults);
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

  slotsForDay(day: number) {
    return (this.schedule()?.slots || [])
      .filter(slot => slot.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  unavailablePeriods(day: number) {
    return this.lessonPeriods().filter(period => this.periodAvailability(day, period) !== 'track');
  }

  addablePeriods(day: number) {
    return this.lessonPeriods().filter(period =>
      this.periodAvailability(day, period) === 'track' &&
      !this.slotsForDay(day).some(slot =>
        slot.start_time < period.end_time && slot.end_time > period.start_time
      )
    );
  }

  timelineHeight() {
    const { start, end } = this.timelineRange();
    return (end - start) * this.pixelsPerMinute;
  }

  timelinePosition(time: string | number) {
    const minute = typeof time === 'number' ? time : this.minutesFromTime(time);
    if (minute === null) return 0;
    return (minute - this.timelineRange().start) * this.pixelsPerMinute;
  }

  timelineDuration(start: string, end: string) {
    const startMinute = this.minutesFromTime(start);
    const endMinute = this.minutesFromTime(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return 0;
    return (endMinute - startMinute) * this.pixelsPerMinute;
  }

  timelineItemPosition(time: string) {
    return this.timelinePosition(time) + 1;
  }

  timelineItemHeight(start: string, end: string) {
    return Math.max(0, this.timelineDuration(start, end) - 2);
  }

  formatTime(minute: number) {
    const hours = Math.floor(minute / 60).toString().padStart(2, '0');
    const minutes = (minute % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private minutesFromTime(time: string) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
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
      room_number: this.defaultRoomNumber(this.selectedTrackId(), this.selectedYear())
    };
    this.formOpen.set(true);
  }

  private defaultRoomNumber(trackId: number | null, studyYear: string) {
    if (trackId === null) return null;
    return this.roomDefaults().find(item => item.track_id === trackId && item.study_year === studyYear)?.room_number || null;
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

import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

interface Room {
  number: string;
  floor: number;
  name: string;
  capacity: number | null;
  projector: number;
  air_conditioner: string;
  computers: number;
  usable: number;
  capacity_needs_confirmation: number;
}

interface RoomEdit {
  name: string;
  capacity: number | null;
  projector: boolean;
  air_conditioner: string;
  computers: boolean;
  usable: boolean;
  capacity_needs_confirmation: boolean;
}

interface Booking {
  id: number;
  room_number: string;
  title: string;
  start_time: string;
  end_time: string;
  kind: 'manual' | 'lesson';
  cancelled?: boolean;
  start_date?: string;
}

interface Lesson {
  id: number;
  subject: string | null;
  class_year: string;
  class_parallel: string;
  teacher_name: string;
  start_time: string;
  end_time: string;
  series_id: string | null;
}

interface BookingResults {
  bookings: Booking[];
  lessons: Lesson[];
  holiday: string | null;
}

@Component({
  selector: 'app-room-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="room-page" dir="rtl">
      <header class="hero">
        <div class="hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16M2 21h20M9 21v-5h6v5M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" stroke-width="2"/></svg>
        </div>
        <div class="hero-copy">
          <span class="eyebrow">סמינר בית יעקב גור ירושלים</span>
          <h1>מפת חדרים ושיבוצים</h1>
          <p>כל החדרים במקום אחד — בדיקת תפוסה ושיבוץ לפי קומה</p>
        </div>
      </header>
      <form class="filters" (ngSubmit)="search()" #filterForm="ngForm">
        <div class="filter-heading">
          <div class="filter-icon" aria-hidden="true">⌕</div>
          <div><h2>בדיקת תפוסה</h2><p>בחרי תאריך וטווח שעות כדי לראות אילו חדרים פנויים</p></div>
        </div>
        <div class="filter-fields">
          <label>תאריך <input name="date" type="date" [(ngModel)]="date" required></label>
          <label>משעה <input name="start" type="time" [(ngModel)]="start" required></label>
          <label>עד שעה <input name="end" type="time" [(ngModel)]="end" required></label>
          <button class="primary search-button" type="submit" [disabled]="filterForm.invalid || bookingLoading">{{ bookingLoading ? 'בודקת...' : 'בדיקת תפוסה' }}</button>
        </div>
      </form>
      <div *ngIf="checkedDate" class="result-notice" role="status">
        <span class="result-icon" aria-hidden="true">✓</span>
        <div><strong>תוצאות לתאריך {{ checkedDate }} · {{ checkedStart }}–{{ checkedEnd }}</strong>
          <p>הזמינות מבוססת על השיבוצים במערכת בלבד. שיעור שבוטל נשאר שמור כדי למנוע חפיפה אם הביטול ישתנה.</p></div>
      </div>
      <p *ngIf="holiday" class="notice">בתאריך זה יש חופשה: {{ holiday }}.</p>
      <p *ngIf="error" class="error" role="alert">{{ error }}</p>
      <p *ngIf="loading">טוענת את מפת החדרים...</p>
      <div class="map-heading">
        <div><h2>החדרים שלנו</h2><p>בחרי חדר כדי לעדכן פרטים או להוסיף שיבוץ</p></div>
        <div class="legend" aria-label="מקרא"><span><i class="legend-dot computer-dot"></i>חדר מחשבים</span><span><i class="legend-dot unusable-dot"></i>אין להשתמש</span></div>
      </div>
      <section *ngFor="let floor of floors" class="floor">
        <div class="floor-header">
          <h2><span class="floor-icon" aria-hidden="true">▦</span> קומה {{ floor === 0 ? '0 (-1)' : floor === 1 ? '1 (כניסה)' : floor }}</h2>
          <span>{{ roomsOnFloor(floor, 0).length + roomsOnFloor(floor, 1).length }} חדרים</span>
        </div>
        <div class="floor-tables">
          <div class="table-wrap" *ngFor="let side of [0, 1]">
            <table>
              <thead><tr><th>מס׳ חדר</th><th>שיבוץ במפה המקורית</th><th>מקומות</th><th>תפוסה</th><th>פעולות</th></tr></thead>
              <tbody>
                <tr *ngFor="let room of roomsOnFloor(floor, side)" [class.computer]="room.computers" [class.unusable]="!room.usable">
                  <td><span class="room-number">{{ room.number }}</span></td>
                  <td class="room-name">{{ room.name }} <span *ngIf="room.computers" class="computer-label">מחשבים</span></td>
                  <td>{{ room.capacity === null ? '—' : room.capacity }}<span *ngIf="room.capacity_needs_confirmation" title="דורש בדיקה"> *</span></td>
                  <td class="occupancy">
                    <span *ngIf="!room.usable" class="status status-unusable">אין להשתמש</span>
                    <span *ngIf="room.usable && !checkedDate" class="status status-unknown">לא נבדק</span>
                    <span *ngIf="room.usable && checkedDate && !roomBookings(room).length" class="status status-free">פנוי לפי השיבוצים</span>
                    <div *ngFor="let booking of roomBookings(room)" class="booking">
                      <span class="status" [class.status-cancelled]="booking.cancelled" [class.status-busy]="!booking.cancelled">{{ booking.cancelled ? 'שמור לשיעור שבוטל' : 'תפוס' }}</span>
                      <span class="booking-title">{{ booking.title }}</span>
                      <span class="booking-time">{{ booking.start_time }}–{{ booking.end_time }}</span>
                      <div class="booking-actions">
                        <button class="text-button" *ngIf="booking.kind === 'manual' && auth.hasPermission('schedule', 'change')" type="button" (click)="editBooking(room, booking)">עריכת שיבוץ</button>
                        <button class="text-button remove-button" *ngIf="auth.hasPermission('schedule', 'change')" type="button" (click)="removeBooking(booking)">הסרה</button>
                      </div>
                    </div>
                  </td>
                  <td class="room-actions">
                    <button class="small-button" *ngIf="auth.hasPermission('schedule', 'change')" type="button" (click)="editRoom(room)">פרטי חדר</button>
                    <button class="small-button assign-button" *ngIf="room.usable && checkedDate && auth.hasPermission('schedule', 'change')" type="button" (click)="openBooking(room)">+ שיבוץ</button>
                  </td>
                </tr>
                <tr *ngIf="!roomsOnFloor(floor, side).length"><td colspan="5" class="empty-side">אין חדרים בצד זה</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <p class="footnote">* מספר המקומות דורש בדיקה מול המפה המעודכנת.</p>
      <div *ngIf="bookingRoom" class="overlay">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title">
          <h2 id="booking-title">{{ editingBooking ? 'עריכת שיבוץ' : 'שיבוץ' }} חדר {{ bookingRoom.number }}</h2>
          <p>תאריך: {{ checkedDate }}</p>
          <form (ngSubmit)="saveBooking()">
            <label>סוג שיבוץ
              <select name="kind" [(ngModel)]="bookingKind" [disabled]="!!editingBooking">
                <option value="manual">שיבוץ ידני שבועי</option>
                <option value="lesson">שיעור ממערכת השעות</option>
              </select>
            </label>
            <ng-container *ngIf="bookingKind === 'manual'">
              <label *ngIf="editingBooking">תאריך התחלת השיבוץ <input name="bookingDate" type="date" [(ngModel)]="bookingDate" required></label>
              <label>תיאור <input name="title" [(ngModel)]="bookingTitle" required maxlength="200"></label>
              <label>משעה <input name="startTime" type="time" [(ngModel)]="bookingStart" required></label>
              <label>עד שעה <input name="endTime" type="time" [(ngModel)]="bookingEnd" required></label>
              <p>השיבוץ יחזור בכל שבוע מתאריך ההתחלה, ללא תאריך סיום. שינויו מעדכן את השיבוץ כולו.</p>
            </ng-container>
            <ng-container *ngIf="bookingKind === 'lesson'">
              <label>בחירת שיעור
                <select name="slot" [(ngModel)]="selectedLesson" required>
                  <option [ngValue]="null">בחרי שיעור</option>
                  <option *ngFor="let lesson of lessons" [ngValue]="lesson.id">
                    {{ lesson.start_time }}–{{ lesson.end_time }} · {{ lesson.subject || 'שיעור' }} · {{ lesson.class_year }}{{ lesson.class_parallel }} · {{ lesson.teacher_name }}
                  </option>
                </select>
              </label>
              <p *ngIf="!lessons.length">אין שיעורים פנויים לשיבוץ ביום הנבחר.</p>
              <label class="check"><input name="series" type="checkbox" [(ngModel)]="bookingSeries"> לשבץ גם את מופעי הסדרה הקיימים בהמשך</label>
            </ng-container>
            <p *ngIf="bookingError" class="error" role="alert">{{ bookingError }}</p>
            <div class="actions">
              <button type="submit" [disabled]="savingBooking">שמירת שיבוץ</button>
              <button type="button" [disabled]="savingBooking" (click)="bookingRoom = null">ביטול</button>
            </div>
          </form>
        </section>
      </div>
      <div *ngIf="editing && draft" class="overlay">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <h2 id="edit-title">עריכת חדר {{ editing.number }}</h2>
          <form (ngSubmit)="save()" #roomForm="ngForm">
            <label>שם החדר <input name="name" [(ngModel)]="draft.name" required maxlength="100"></label>
            <label>מספר מקומות <input name="capacity" type="number" min="0" max="10000" step="1" [(ngModel)]="draft.capacity"></label>
            <label>מספר מזגן <input name="air_conditioner" [(ngModel)]="draft.air_conditioner" maxlength="100"></label>
            <label class="check"><input name="projector" type="checkbox" [(ngModel)]="draft.projector"> יש מקרן</label>
            <label class="check"><input name="computers" type="checkbox" [(ngModel)]="draft.computers"> חדר מחשבים</label>
            <label class="check"><input name="usable" type="checkbox" [(ngModel)]="draft.usable"> מותר להשתמש בחדר</label>
            <label class="check"><input name="capacity_needs_confirmation" type="checkbox" [(ngModel)]="draft.capacity_needs_confirmation"> מספר המקומות דורש בדיקה</label>
            <p *ngIf="editError" class="error" role="alert">{{ editError }}</p>
            <div class="actions">
              <button type="submit" [disabled]="saving || roomForm.invalid">שמירה</button>
              <button type="button" [disabled]="saving" (click)="cancelEdit()">ביטול</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  `,
  styles: [`
    .room-page { max-width: 1550px; margin: auto; padding: 24px; color: var(--text); }
    .hero { display: flex; align-items: center; gap: 20px; padding: 28px 30px; border-radius: 20px; color: #fff; background: linear-gradient(115deg, #39349b, #5b52d4 60%, #8077e9); box-shadow: 0 12px 30px #4c46bd30; }
    .hero-icon, .filter-icon, .floor-icon { display: grid; place-items: center; flex-shrink: 0; }
    .hero-icon { width: 62px; height: 62px; border-radius: 19px; background: #ffffff24; border: 1px solid #ffffff3b; }
    .hero-icon svg { width: 32px; height: 32px; }
    .eyebrow { color: #e4e0ff; font-size: 13px; font-weight: 600; }
    h1 { margin: 3px 0 5px; font-size: clamp(24px, 3vw, 32px); line-height: 1.2; }
    .hero p { color: #eeecff; font-size: 14px; }
    .filters { margin-top: 20px; padding: 22px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-sm); }
    .filter-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .filter-icon { width: 42px; height: 42px; border-radius: 13px; color: #4d45ba; background: #eeedff; font-size: 28px; font-weight: 700; }
    .filter-heading h2, .map-heading h2 { font-size: 18px; margin: 0 0 3px; }
    .filter-heading p, .map-heading p { color: var(--text-muted); font-size: 13px; }
    .filter-fields { display: grid; grid-template-columns: minmax(165px, 1.3fr) repeat(2, minmax(130px, 1fr)) auto; gap: 14px; align-items: end; }
    .filter-fields label { margin: 0; }
    label { display: block; margin: 14px 0; font-size: 13px; font-weight: 600; }
    input:not([type=checkbox]), select { display: block; width: 100%; min-width: 0; min-height: 43px; padding: 9px 12px; margin-top: 6px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text); font: inherit; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #928cf2; outline-offset: 2px; }
    button { cursor: pointer; font: inherit; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 9px; padding: 8px 12px; transition: background .2s, border-color .2s; }
    button:hover:not(:disabled) { border-color: #8880e6; }
    button:disabled { opacity: .55; cursor: default; }
    .primary, .actions button:first-child { color: #fff; background: #5147c6; border-color: #5147c6; }
    .primary:hover:not(:disabled), .actions button:first-child:hover:not(:disabled) { background: #4037a7; }
    .search-button { min-height: 43px; padding-inline: 22px; white-space: nowrap; }
    .notice, .result-notice { margin-top: 14px; padding: 13px 16px; border-radius: 10px; line-height: 1.6; font-size: 13px; }
    .notice { background: var(--warning-soft); color: var(--text); border-right: 3px solid var(--warning); }
    .result-notice { display: flex; gap: 11px; align-items: flex-start; background: var(--primary-light); border: 1px solid var(--border); }
    .result-notice p { color: var(--text-muted); margin-top: 2px; }
    .result-icon { color: var(--primary); font-weight: bold; font-size: 18px; }
    .error { color: var(--danger); margin: 12px 0; }
    .map-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 30px 2px 14px; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; color: var(--text-muted); font-size: 13px; }
    .legend span { display: inline-flex; gap: 7px; align-items: center; }
    .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
    .computer-dot { background: #25a77b; } .unusable-dot { background: #e17883; }
    .floor { margin: 16px 0; border: 1px solid var(--border); border-radius: 15px; overflow: hidden; background: var(--surface); box-shadow: var(--shadow-sm); }
    .floor-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 18px; background: linear-gradient(110deg, #4a43ba, #6e65db); color: white; }
    .floor-header h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 16px; }
    .floor-header > span { font-size: 12px; background: #ffffff25; padding: 4px 10px; border-radius: 20px; }
    .floor-icon { width: 29px; height: 29px; border-radius: 8px; background: #ffffff25; }
    .floor-tables { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--border); }
    .table-wrap { background: var(--surface); overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; min-width: 530px; font-size: 13px; }
    th { background: var(--surface-2); color: var(--text-muted); font-size: 12px; font-weight: 600; white-space: nowrap; }
    th, td { padding: 11px 9px; text-align: center; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tbody tr:last-child td { border-bottom: 0; }
    .room-name, .occupancy { text-align: right; }
    .room-name { font-weight: 600; min-width: 95px; }
    .room-number { display: inline-block; min-width: 43px; padding: 5px 7px; border-radius: 8px; color: #4c43b4; background: #efedff; font-weight: 700; direction: ltr; }
    .computer-label { display: block; color: var(--primary); font-size: 11px; font-weight: 500; margin-top: 3px; }
    .status { display: inline-block; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; line-height: 1.3; }
    .status-free { color: #087449; background: #dcf8e9; }
    .status-busy { color: #a92c3f; background: #ffe6e9; }
    .status-unusable { color: #a92c3f; background: #ffe6e9; }
    .status-cancelled { color: #8a5700; background: #fff0cc; }
    .status-unknown { color: #536176; background: #eef1f5; }
    .booking + .booking { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; }
    .booking-title, .booking-time { display: block; margin-top: 4px; }
    .booking-time { color: var(--text-muted); font-size: 12px; direction: ltr; text-align: right; }
    .booking-actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 4px; }
    .text-button { padding: 1px 0; border: 0; border-radius: 0; color: #5a50c5; background: transparent; font-size: 12px; }
    .remove-button { color: var(--danger); }
    .room-actions { min-width: 95px; }
    .small-button { font-size: 12px; padding: 6px 9px; margin: 2px; white-space: nowrap; }
    .assign-button { color: #5147c6; border-color: #c9c4f4; }
    .empty-side, .footnote { color: var(--text-muted); font-size: 12px; }
    .footnote { margin: 16px 2px; }
    .overlay { position: fixed; inset: 0; background: #10152c99; display: grid; place-items: center; z-index: 1000; padding: 15px; }
    .dialog { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 18px; width: min(490px, 100%); max-height: 90vh; overflow-y: auto; padding: 26px; box-shadow: var(--shadow-lg); }
    .dialog h2 { font-size: 21px; margin: 0 0 8px; }
    .dialog p { color: var(--text-muted); font-size: 13px; line-height: 1.6; }
    .dialog .error { color: var(--danger); }
    .check { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .check input { accent-color: #5147c6; }
    .actions { display: flex; gap: 10px; margin-top: 20px; }
    @media (max-width: 1050px) { .floor-tables { grid-template-columns: 1fr; } }
    @media (max-width: 650px) {
      .room-page { padding: 12px; }
      .hero { padding: 20px; gap: 14px; }
      .hero-icon { width: 48px; height: 48px; border-radius: 14px; }
      .hero-icon svg { width: 26px; height: 26px; }
      .filters { padding: 18px; }
      .filter-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filter-fields label:first-child, .search-button { grid-column: 1 / -1; }
      .map-heading { margin-top: 24px; }
    }
  `],
})
export class RoomMapComponent implements OnInit {
  rooms: Room[] = [];
  loading = false;
  error = '';
  editing: Room | null = null;
  draft: RoomEdit | null = null;
  editError = '';
  saving = false;
  date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  start = '08:00';
  end = '09:00';
  checkedDate = '';
  checkedStart = '';
  checkedEnd = '';
  bookingLoading = false;
  bookings: Booking[] = [];
  lessons: Lesson[] = [];
  holiday: string | null = null;
  bookingRoom: Room | null = null;
  bookingKind: 'manual' | 'lesson' = 'manual';
  bookingTitle = '';
  bookingDate = '';
  editingBooking: Booking | null = null;
  bookingStart = '';
  bookingEnd = '';
  selectedLesson: number | null = null;
  bookingSeries = false;
  bookingError = '';
  savingBooking = false;

  constructor(private http: HttpClient, public auth: AuthService) {}

  get floors(): number[] {
    return [...new Set(this.rooms.map(room => room.floor))];
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http.get<Room[]>('/api/schedule/room-map').subscribe({
      next: rooms => { this.rooms = rooms; this.loading = false; },
      error: () => { this.loading = false; this.error = 'לא ניתן לטעון את מפת החדרים. נסי לרענן את הדף.'; },
    });
  }

  roomsOnFloor(floor: number, side: number): Room[] {
    return this.rooms.filter(room => room.floor === floor && Number(room.number) % 2 === side);
  }

  roomBookings(room: Room): Booking[] {
    return this.bookings.filter(booking => booking.room_number === room.number);
  }

  search(): void {
    this.error = '';
    this.checkedDate = '';
    this.bookings = [];
    this.lessons = [];
    this.holiday = null;
    if (!this.date || !this.start || !this.end || this.start >= this.end) {
      this.error = 'יש לבחור תאריך ושעות תקינים, כך ששעת הסיום מאוחרת משעת ההתחלה.';
      return;
    }
    const date = this.date, start = this.start, end = this.end;
    this.bookingLoading = true;
    this.http.get<BookingResults>('/api/schedule/room-bookings', { params: { date, start, end } }).subscribe({
      next: result => {
        this.bookings = result.bookings;
        this.lessons = result.lessons;
        this.holiday = result.holiday;
        this.checkedDate = date;
        this.checkedStart = start;
        this.checkedEnd = end;
        this.bookingLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.bookingLoading = false;
        this.error = error.error?.error || 'בדיקת תפוסת החדרים נכשלה.';
      },
    });
  }

  openBooking(room: Room): void {
    this.bookingRoom = room;
    this.editingBooking = null;
    this.bookingKind = 'manual';
    this.bookingTitle = '';
    this.bookingDate = this.checkedDate;
    this.bookingStart = this.checkedStart;
    this.bookingEnd = this.checkedEnd;
    this.selectedLesson = null;
    this.bookingSeries = false;
    this.bookingError = '';
  }

  editBooking(room: Room, booking: Booking): void {
    this.openBooking(room);
    this.editingBooking = booking;
    this.bookingTitle = booking.title;
    this.bookingDate = booking.start_date || this.checkedDate;
    this.bookingStart = booking.start_time;
    this.bookingEnd = booking.end_time;
  }

  saveBooking(): void {
    if (!this.bookingRoom || this.savingBooking) return;
    this.savingBooking = true;
    this.bookingError = '';
    const body = {
      room_number: this.bookingRoom.number, kind: this.bookingKind, date: this.bookingDate,
      title: this.bookingTitle, start_time: this.bookingStart, end_time: this.bookingEnd,
      slot_id: this.selectedLesson, series: this.bookingSeries,
    };
    const request = this.editingBooking
      ? this.http.put(`/api/schedule/room-bookings/manual/${this.editingBooking.id}`, body)
      : this.http.post('/api/schedule/room-bookings', body);
    request.subscribe({
      next: () => { this.savingBooking = false; this.bookingRoom = null; this.search(); },
      error: (error: HttpErrorResponse) => {
        this.savingBooking = false;
        this.bookingError = error.error?.error || 'שמירת השיבוץ נכשלה.';
      },
    });
  }

  removeBooking(booking: Booking): void {
    const description = booking.kind === 'manual' ? 'השיבוץ השבועי וכל המופעים העתידיים שלו' : 'שיבוץ החדר לשיעור זה';
    if (!window.confirm(`להסיר את ${description}?`)) return;
    this.http.delete(`/api/schedule/room-bookings/${booking.kind}/${booking.id}`).subscribe({
      next: () => this.search(),
      error: (error: HttpErrorResponse) => { this.error = error.error?.error || 'הסרת השיבוץ נכשלה.'; },
    });
  }

  editRoom(room: Room): void {
    this.editing = room;
    this.editError = '';
    this.draft = {
      name: room.name, capacity: room.capacity, projector: !!room.projector,
      air_conditioner: room.air_conditioner, computers: !!room.computers,
      usable: !!room.usable, capacity_needs_confirmation: !!room.capacity_needs_confirmation,
    };
  }

  cancelEdit(): void {
    this.editing = null;
    this.draft = null;
  }

  save(): void {
    if (!this.editing || !this.draft || this.saving) return;
    this.saving = true;
    this.editError = '';
    this.http.put('/api/schedule/room-map/' + encodeURIComponent(this.editing.number), this.draft).subscribe({
      next: () => { this.saving = false; this.cancelEdit(); this.load(); },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.editError = error.error?.error || 'שמירת החדר נכשלה. נסי שוב.';
      },
    });
  }
}

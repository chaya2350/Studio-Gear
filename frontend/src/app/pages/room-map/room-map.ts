import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { BrowserMultiFormatReader } from '@zxing/browser';

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
  kind: 'manual' | 'lesson' | 'track';
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
          <label>תאריך <span class="date-input-row"><input name="date" type="date" [(ngModel)]="date" required><button class="today-button" type="button" (click)="searchToday()" [disabled]="bookingLoading">היום</button></span></label>
          <label>משעה <input name="start" type="time" [(ngModel)]="start" required></label>
          <label>עד שעה <input name="end" type="time" [(ngModel)]="end" required></label>
          <button class="primary search-button" type="submit" [disabled]="filterForm.invalid || bookingLoading"
                  [attr.aria-label]="bookingLoading ? 'בודקת תפוסה' : 'בדיקת תפוסה'">
            <span *ngIf="bookingLoading" class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <ng-container *ngIf="!bookingLoading">בדיקת תפוסה</ng-container>
          </button>
        </div>
      </form>
      <div *ngIf="checkedDate" class="result-notice" role="status">
        <span class="result-icon" aria-hidden="true">✓</span>
        <div><strong>תוצאות לתאריך {{ checkedDate }} · {{ checkedStart }}–{{ checkedEnd }}</strong>
          <p>הזמינות מבוססת על השיבוצים במערכת בלבד. שיעור שבוטל נשאר שמור כדי למנוע חפיפה אם הביטול ישתנה.</p></div>
      </div>
      <p *ngIf="holiday" class="notice">בתאריך זה יש חופשה: {{ holiday }}.</p>
      <p *ngIf="error" class="error" role="alert">{{ error }}</p>
      <p *ngIf="loading" role="status" aria-label="טעינת מפת החדרים">
        <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </p>
      <div class="map-heading">
        <div><h2>החדרים שלנו</h2><p>בחרי חדר כדי לעדכן פרטים או להוסיף שיבוץ</p></div>
        <div class="legend" aria-label="מקרא"><span><i class="legend-dot computer-dot"></i>חדר מחשבים</span><span><i class="legend-dot unusable-dot"></i>אין להשתמש</span></div>
      </div>
      <div *ngIf="contextMenu" class="ctx-overlay" (click)="contextMenu = null"></div>
      <div *ngIf="contextMenu" class="ctx-menu" [style.top.px]="contextMenu.y" [style.left.px]="contextMenu.x">
        <button (click)="openLaptopLoan(contextMenu.room); contextMenu = null">קחי מחשב לכיתה זו</button>
      </div>
      <section *ngFor="let floor of floorList" class="floor">
        <div class="floor-header">
          <h2><span class="floor-icon" aria-hidden="true">▦</span> קומה {{ floor === 0 ? '0 (-1)' : floor === 1 ? '1 (כניסה)' : floor }}</h2>
          <span>{{ roomsOnFloor(floor, 0).length + roomsOnFloor(floor, 1).length }} חדרים</span>
        </div>
        <div class="floor-tables">
          <div class="table-wrap" *ngFor="let side of sides">
            <table>
              <thead><tr><th>מס׳ חדר</th><th>שיבוץ במפה המקורית</th><th>מקומות</th><th>תפוסה</th><th>פעולות</th></tr></thead>
              <tbody>
                <tr *ngFor="let room of roomsOnFloor(floor, side)" [class.computer]="room.computers" [class.unusable]="!room.usable" [class.room-free]="room.usable && checkedDate && !roomBookings(room).length"
                    (contextmenu)="room.computers ? onRoomContextMenu($event, room) : null">
                  <td><span class="room-number">{{ room.number }}</span></td>
                  <td class="room-name">{{ room.name }} <span *ngIf="room.computers" class="computer-label">מחשבים</span><span *ngIf="room.projector" class="projector-label" title="יש מקרן בחדר">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-label="מקרן"><rect x="2.5" y="8" width="15" height="9" rx="2"/><circle cx="8" cy="12.5" r="2.6"/><path d="M17.5 10.5h4M17.5 14.5h4M21.5 10.5v4"/></svg>
                  </span></td>
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
                        <button class="text-button" *ngIf="booking.kind === 'manual' && auth.hasPermission('schedule', 'edit')" type="button" (click)="editBooking(room, booking)">עריכת שיבוץ</button>
                        <button class="text-button remove-button" *ngIf="auth.hasPermission('schedule', 'delete')" type="button" (click)="removeBooking(booking)">הסרה</button>
                      </div>
                    </div>
                  </td>
                  <td class="room-actions">
                    <button class="small-button" *ngIf="auth.hasPermission('schedule', 'edit')" type="button" (click)="editRoom(room)">פרטי חדר</button>
                    <button class="small-button assign-button" *ngIf="room.usable && checkedDate && auth.hasPermission('schedule', 'create')" type="button" (click)="openBooking(room)">+ שיבוץ</button>
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
      <div *ngIf="laptopRoom" class="overlay">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="laptop-loan-title">
          <h2 id="laptop-loan-title">קחי מחשב — חדר {{ laptopRoom.number }}</h2>
          <p>תאריך: {{ date }}</p>
          <form (ngSubmit)="saveLaptopLoan()">
            <label>סריקת ברקוד מחשב
              <div class="return-confirm-row">
                <input class="return-barcode-input" [(ngModel)]="laptopBarcodeInput" name="barcode"
                  placeholder="הקלד או סרוק ברקוד" (keyup.enter)="onLaptopBarcodeEnter()" autocomplete="off"
                  [class.input-error]="laptopBarcodeError">
                <button class="btn-scan" type="button" (click)="toggleLaptopScan()" [class.active]="laptopScanning">📷</button>
                <button type="button" (click)="onLaptopBarcodeEnter()">בדוק</button>
              </div>
              <div *ngIf="laptopBarcodeError" style="color:var(--danger); font-size:12px; margin-top:4px;">ברקוד לא נמצא או אינו מחשב נייד</div>
            </label>
            <div *ngIf="laptopScanning" class="return-video-wrap">
              <video #laptopVideoEl autoplay playsinline></video>
              <div class="return-scan-overlay"><div class="return-scan-frame"></div></div>
            </div>
            <div *ngIf="laptopScannedItem" class="scanned-laptop-badge">✓ {{ laptopScannedItem.name }}</div>
            <label>מז / שם תלמידה
              <div style="position:relative;">
                <input [(ngModel)]="laptopStudentQuery" name="studentQ" placeholder="הקלד מז או שם..." (input)="onLaptopStudentSearch()" autocomplete="off">
                <div *ngIf="laptopStudentSuggestions.length" class="suggestions">
                  <div *ngFor="let s of laptopStudentSuggestions" class="suggestion-item" (click)="selectLaptopStudent(s)">
                    <strong>{{ s.name }}</strong>
                    <span>{{ s.id_number }} · {{ s.track }}{{ s.year ? ' ' + s.year : '' }}</span>
                  </div>
                </div>
              </div>
              <div *ngIf="laptopSelectedStudent" style="margin-top:6px; font-size:13px; color:var(--primary);">{{ laptopSelectedStudent.name }} · {{ laptopSelectedStudent.id_number }}</div>
            </label>
            <label>מסלול
              <select [(ngModel)]="laptopTrackName" name="trackName" required>
                <option value="">בחר מסלול</option>
                <option>אדריכלות</option>
                <option>הנדסאים</option>
                <option>הנדסת אנרגיה</option>
                <option>הוראה מתקנת</option>
                <option>תקשורת</option>
                <option>גרפיקה</option>
                <option>בימוי</option>
                <option>ייעוץ מס</option>
                <option value="אחר">אחר</option>
              </select>
            </label>
            <label *ngIf="laptopTrackName && laptopTrackName !== 'אחר'">שנה
              <select [(ngModel)]="laptopTrackYear" name="trackYear" required>
                <option value="" disabled>שנה</option>
                <option value="א">א</option>
                <option value="ב">ב</option>
              </select>
            </label>
            <label>כיתה / מיקום
              <input [(ngModel)]="laptopLocation" name="location" readonly style="background:var(--surface-2);">
            </label>
            <p *ngIf="laptopLoanError" class="error" role="alert">{{ laptopLoanError }}</p>
            <p *ngIf="laptopLoanSuccess" style="color:var(--primary); font-weight:700;">המחשב נלקח בהצלחה!</p>
            <div class="actions">
              <button type="submit" [disabled]="laptopLoanSaving || laptopLoanSuccess || !laptopScannedItem">{{ laptopLoanSaving ? 'שומר...' : 'תפסי מחשב' }}</button>
              <button type="button" (click)="laptopRoom = null; laptopScanning = false">ביטול</button>
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
    .hero { display: flex; align-items: center; gap: 20px; padding: 28px 30px; border-radius: 20px; color: #fff; background: var(--grad-primary); box-shadow: var(--shadow-primary); }
    .hero-icon, .filter-icon, .floor-icon { display: grid; place-items: center; flex-shrink: 0; }
    .hero-icon { width: 62px; height: 62px; border-radius: 19px; background: #ffffff24; border: 1px solid #ffffff3b; }
    .hero-icon svg { width: 32px; height: 32px; }
    .eyebrow { color: #e0fffa; font-size: 13px; font-weight: 600; }
    h1 { margin: 3px 0 5px; font-size: clamp(24px, 3vw, 32px); line-height: 1.2; }
    .hero p { color: #e5fffc; font-size: 14px; }
    .filters { margin-top: 20px; padding: 22px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-sm); }
    .filter-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .filter-icon { width: 42px; height: 42px; border-radius: 13px; color: var(--primary); background: var(--primary-light); font-size: 28px; font-weight: 700; }
    .filter-heading h2, .map-heading h2 { font-size: 18px; margin: 0 0 3px; }
    .filter-heading p, .map-heading p { color: var(--text-muted); font-size: 13px; }
    .filter-fields { display: grid; grid-template-columns: minmax(165px, 1.3fr) repeat(2, minmax(130px, 1fr)) auto; gap: 14px; align-items: end; }
    .filter-fields label { margin: 0; }
    .date-input-row { display: flex; align-items: end; gap: 7px; }
    .date-input-row input { flex: 1; }
    .today-button { min-height: 43px; margin-top: 6px; padding-inline: 12px; color: var(--primary); white-space: nowrap; }
    label { display: block; margin: 14px 0; font-size: 13px; font-weight: 600; }
    input:not([type=checkbox]), select { display: block; width: 100%; min-width: 0; min-height: 43px; padding: 9px 12px; margin-top: 6px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text); font: inherit; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid var(--border-focus); outline-offset: 2px; }
    button { cursor: pointer; font: inherit; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 9px; padding: 8px 12px; transition: background .2s, border-color .2s; }
    button:hover:not(:disabled) { border-color: var(--primary); }
    button:disabled { opacity: .55; cursor: default; }
    .primary, .actions button:first-child { color: #fff; background: var(--grad-primary); border-color: transparent; }
    .primary:hover:not(:disabled), .actions button:first-child:hover:not(:disabled) { background: var(--primary-dark); }
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
    .floor-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 18px; background: var(--grad-primary); color: white; }
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
    .room-number { display: inline-block; min-width: 43px; padding: 5px 7px; border-radius: 8px; color: var(--primary); background: var(--primary-light); font-weight: 700; direction: ltr; }
    .computer-label { display: block; color: var(--primary); font-size: 11px; font-weight: 500; margin-top: 3px; }
    .projector-label { display: inline-flex; align-items: center; color: var(--primary); opacity: .85; margin-inline-start: 5px; vertical-align: middle; }
    .projector-label svg { width: 13px; height: 13px; }

    /* נצנוץ עדין על חדר פנוי — נשימה בלבד, בלי הבהוב חד */
    tr.room-free td { animation: room-free-breathe 2.6s ease-in-out infinite; }
    @keyframes room-free-breathe {
      0%, 100% { background: transparent; }
      50%      { background: var(--success-soft, rgba(34,197,94,0.08)); }
    }
    @media (prefers-reduced-motion: reduce) {
      tr.room-free td { animation: none; background: var(--success-soft, rgba(34,197,94,0.08)); }
    }
    .status { display: inline-block; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; line-height: 1.3; }
    .status-free { color: var(--text); background: var(--success-soft); }
    .status-busy, .status-unusable { color: var(--text); background: var(--danger-soft); }
    .status-cancelled { color: var(--text); background: var(--warning-soft); }
    .status-unknown { color: var(--text-muted); background: var(--surface-2); }
    .booking + .booking { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; }
    .booking-title, .booking-time { display: block; margin-top: 4px; }
    .booking-time { color: var(--text-muted); font-size: 12px; direction: ltr; text-align: right; }
    .booking-actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 4px; }
    .text-button { padding: 1px 0; border: 0; border-radius: 0; color: var(--primary); background: transparent; font-size: 12px; }
    .remove-button { color: var(--danger); }
    .room-actions { min-width: 95px; }
    .small-button { font-size: 12px; padding: 6px 9px; margin: 2px; white-space: nowrap; }
    .assign-button { color: var(--primary); border-color: var(--border-focus); }
    .empty-side, .footnote { color: var(--text-muted); font-size: 12px; }
    .footnote { margin: 16px 2px; }
    .ctx-overlay { position: fixed; inset: 0; z-index: 999; }
    .ctx-menu { position: fixed; z-index: 1000; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg); overflow: hidden; min-width: 180px; }
    .ctx-menu button { display: block; width: 100%; padding: 11px 16px; text-align: right; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; }
    .ctx-menu button:hover { background: var(--primary-light); color: var(--primary); }
    .suggestions { position: absolute; top: 100%; right: 0; left: 0; z-index: 100; background: var(--surface); border: 1.5px solid var(--border-focus); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); overflow: hidden; margin-top: 4px; }
    .suggestion-item { padding: 10px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 13px; border-bottom: 1px solid var(--border); }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item:hover { background: var(--primary-light); }
    .suggestion-item strong { color: var(--text); }
    .suggestion-item span { color: var(--text-muted); font-size: 12px; }
    .return-confirm-row { display: flex; gap: 8px; }
    .return-barcode-input { flex: 1; height: 42px; padding: 0 12px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--surface); font-size: 0.95rem; font-family: monospace; outline: none; direction: ltr; }
    .return-barcode-input:focus { border-color: var(--primary); }
    .return-barcode-input.input-error { border-color: var(--danger); }
    .return-video-wrap { position: relative; margin-top: 10px; border-radius: var(--radius-sm); overflow: hidden; background: #0a0a1a; aspect-ratio: 4/3; }
    .return-video-wrap video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .return-scan-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); }
    .return-scan-frame { width: 180px; height: 100px; border: 2.5px solid white; border-radius: var(--radius-sm); box-shadow: 0 0 0 2000px rgba(0,0,0,0.35); }
    .btn-scan { height: 42px; padding: 0 12px; font-size: 1.1rem; }
    .btn-scan.active { background: var(--primary-light); border-color: var(--primary); }
    .scanned-laptop-badge { margin-top: 8px; padding: 8px 12px; background: var(--success-soft); border-radius: var(--radius-sm); font-size: 13px; font-weight: 700; color: #166534; }
    .overlay { position: fixed; inset: 0; background: #10152c99; display: grid; place-items: center; z-index: 1000; padding: 15px; }
    .dialog { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 18px; width: min(490px, 100%); max-height: 90vh; overflow-y: auto; padding: 26px; box-shadow: var(--shadow-lg); }
    .dialog h2 { font-size: 21px; margin: 0 0 8px; }
    .dialog p { color: var(--text-muted); font-size: 13px; line-height: 1.6; }
    .dialog .error { color: var(--danger); }
    .check { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .check input { accent-color: var(--primary); }
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
export class RoomMapComponent implements OnInit, OnDestroy {
  @ViewChild('laptopVideoEl') laptopVideoEl?: ElementRef<HTMLVideoElement>;
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

  // Laptop loan from room map
  laptopRoom: Room | null = null;
  laptopLoanError = '';
  laptopLoanSaving = false;
  laptopLoanSuccess = false;
  laptopBarcodeInput = '';
  laptopBarcodeError = false;
  laptopScanning = false;
  laptopScannedItem: any = null;
  private laptopReader = new BrowserMultiFormatReader();
  laptopStudentQuery = '';
  laptopStudentSuggestions: any[] = [];
  laptopSelectedStudent: any = null;
  laptopTrackName = '';
  laptopTrackYear = '';
  laptopLocation = '';
  contextMenu: { x: number; y: number; room: Room } | null = null;

  constructor(private http: HttpClient, private route: ActivatedRoute, public auth: AuthService, private api: ApiService) {}

  readonly sides = [0, 1];
  floorList: number[] = [];
  roomsByFloorSide: Map<string, Room[]> = new Map();
  bookingsByRoom: Map<string, Booking[]> = new Map();

  private buildRoomIndex(): void {
    this.floorList = [...new Set(this.rooms.map(r => r.floor))];
    this.roomsByFloorSide.clear();
    for (const floor of this.floorList) {
      for (const side of this.sides) {
        this.roomsByFloorSide.set(`${floor}_${side}`, this.rooms.filter(r =>
          r.floor === floor && (Number.isFinite(Number(r.number)) ? Number(r.number) % 2 === side : side === 0)
        ));
      }
    }
  }

  private buildBookingIndex(): void {
    this.bookingsByRoom.clear();
    for (const b of this.bookings) {
      const list = this.bookingsByRoom.get(b.room_number) ?? [];
      list.push(b);
      this.bookingsByRoom.set(b.room_number, list);
    }
  }

  ngOnInit(): void {
    this.load();
    this.route.queryParamMap.subscribe(params => {
      const date = params.get('date') || '';
      const start = params.get('start') || '';
      const end = params.get('end') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) return;
      this.date = date;
      this.start = start;
      this.end = end;
      setTimeout(() => this.search(), 0);
    });
  }

  searchToday(): void {
    this.date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    this.search();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http.get<Room[]>('/api/schedule/room-map').subscribe({
      next: rooms => { this.rooms = rooms; this.loading = false; this.buildRoomIndex(); },
      error: () => { this.loading = false; this.error = 'לא ניתן לטעון את מפת החדרים. נסי לרענן את הדף.'; },
    });
  }

  roomsOnFloor(floor: number, side: number): Room[] {
    return this.roomsByFloorSide.get(`${floor}_${side}`) ?? [];
  }

  roomBookings(room: Room): Booking[] {
    return this.bookingsByRoom.get(room.number) ?? [];
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
        this.buildBookingIndex();
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
    const description = booking.kind === 'manual'
      ? 'השיבוץ השבועי וכל המופעים העתידיים שלו'
      : booking.kind === 'track' ? 'שיוך החדר הקבוע לשיעור המסלול' : 'שיבוץ החדר לשיעור זה';
    if (!window.confirm(`להסיר את ${description}?`)) return;
    this.http.delete(`/api/schedule/room-bookings/${booking.kind}/${booking.id}`).subscribe({
      next: () => this.search(),
      error: (error: HttpErrorResponse) => { this.error = error.error?.error || 'הסרת השיבוץ נכשלה.'; },
    });
  }

  onRoomContextMenu(event: MouseEvent, room: Room): void {
    event.preventDefault();
    this.contextMenu = { x: event.clientX, y: event.clientY, room };
  }

  openLaptopLoan(room: Room): void {
    this.laptopRoom = room;
    this.laptopLoanError = '';
    this.laptopLoanSuccess = false;
    this.laptopLoanSaving = false;
    this.laptopBarcodeInput = '';
    this.laptopBarcodeError = false;
    this.laptopScanning = false;
    this.laptopScannedItem = null;
    this.laptopStudentQuery = '';
    this.laptopStudentSuggestions = [];
    this.laptopSelectedStudent = null;
    this.laptopTrackName = '';
    this.laptopTrackYear = '';
    this.laptopLocation = room.number + ' — ' + room.name;
    BrowserMultiFormatReader.releaseAllStreams();
  }

  onLaptopBarcodeEnter(): void {
    const barcode = this.laptopBarcodeInput.trim();
    if (!barcode) return;
    this.laptopBarcodeError = false;
    this.laptopScannedItem = null;
    this.api.getEquipmentByBarcode(barcode).subscribe({
      next: item => {
        if (item.category !== 'מחשב נייד') {
          this.laptopBarcodeError = true; return;
        }
        if (item.is_loaned) {
          this.laptopLoanError = 'המחשב כבר מושאל'; return;
        }
        this.laptopScannedItem = item;
        this.laptopLoanError = '';
      },
      error: () => { this.laptopBarcodeError = true; }
    });
  }

  toggleLaptopScan(): void {
    if (this.laptopScanning) {
      this.laptopScanning = false;
      BrowserMultiFormatReader.releaseAllStreams();
    } else {
      this.laptopScanning = true;
      setTimeout(() => {
        if (!this.laptopVideoEl) return;
        this.laptopReader.decodeFromVideoDevice(undefined, this.laptopVideoEl.nativeElement, result => {
          if (result) {
            this.laptopBarcodeInput = result.getText();
            this.laptopScanning = false;
            BrowserMultiFormatReader.releaseAllStreams();
            this.onLaptopBarcodeEnter();
          }
        });
      }, 150);
    }
  }

  onLaptopStudentSearch(): void {
    this.laptopSelectedStudent = null;
    const q = this.laptopStudentQuery.trim();
    if (!q) { this.laptopStudentSuggestions = []; return; }
    this.api.getStudents(q).subscribe(s => this.laptopStudentSuggestions = s.slice(0, 5));
  }

  selectLaptopStudent(s: any): void {
    this.laptopSelectedStudent = s;
    this.laptopStudentQuery = s.id_number;
    this.laptopStudentSuggestions = [];
    this.laptopTrackName = s.track || '';
    this.laptopTrackYear = s.year || '';
  }

  saveLaptopLoan(): void {
    if (!this.laptopRoom || !this.laptopScannedItem || this.laptopLoanSaving) return;
    if (!this.laptopSelectedStudent && !this.laptopStudentQuery.trim()) {
      this.laptopLoanError = 'נא לבחור תלמידה'; return;
    }
    if (!this.laptopTrackName) { this.laptopLoanError = 'נא לבחור מסלול'; return; }
    if (this.laptopTrackName !== 'אחר' && !this.laptopTrackYear) { this.laptopLoanError = 'נא לבחור שנה'; return; }
    const loanDate = this.date;
    const track = this.laptopTrackName !== 'אחר' ? `${this.laptopTrackName} ${this.laptopTrackYear}` : this.laptopTrackName;
    const borrower = this.laptopSelectedStudent
      ? { borrower_name: this.laptopSelectedStudent.name, borrower_id_number: this.laptopSelectedStudent.id_number, borrower_phone: this.laptopSelectedStudent.phone || '' }
      : { borrower_name: this.laptopStudentQuery.trim(), borrower_id_number: null, borrower_phone: '' };
    this.laptopLoanSaving = true;
    this.laptopLoanError = '';
    this.api.createLoan({
      equipment_id: this.laptopScannedItem.id,
      ...borrower,
      loan_date: loanDate,
      expected_return: loanDate,
      loan_type: 'loan',
      payment_status: 'none',
      track,
      location: this.laptopLocation,
    } as any).subscribe({
      next: () => {
        this.laptopLoanSaving = false;
        this.laptopLoanSuccess = true;
        setTimeout(() => { this.laptopRoom = null; BrowserMultiFormatReader.releaseAllStreams(); }, 1500);
      },
      error: (e: HttpErrorResponse) => {
        this.laptopLoanSaving = false;
        this.laptopLoanError = e.error?.error || 'שגיאה בשמירה';
      }
    });
  }

  ngOnDestroy(): void {
    BrowserMultiFormatReader.releaseAllStreams();
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

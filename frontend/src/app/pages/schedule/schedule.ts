import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

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

<!-- GRID VIEW -->
<div *ngIf="activeTab() === 'grid'" class="grid-view">
  <div *ngIf="loading()" class="loading-state">טוען...</div>

  <div *ngIf="!loading() && !slots().length" class="empty-state">
    <div class="empty-icon">📅</div>
    <p>אין שיעורים לשבוע זה</p>
    <button class="btn btn-primary" (click)="activeTab.set('manage')">הוסף שיעורים</button>
    <button class="btn btn-secondary" (click)="showCopyWeek=true" style="margin-top:8px;">העתק משבוע קודם</button>
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

  <div *ngIf="!loading() && slots().length" class="schedule-grid">
    <div class="grid-header">
      <div class="cell corner"></div>
      <div class="cell day-header" *ngFor="let d of DAYS; let i = index">
        <span class="day-name">יום {{ d }}</span>
        <span class="day-date">{{ formatHebDate(addDays(weekStart(), i)) }}</span>
      </div>
    </div>
    <div class="grid-body">
      <div *ngFor="let row of gridRows()" class="grid-row">
        <div class="cell class-label">{{ row.className }}</div>
        <div class="cell day-cell" *ngFor="let day of [0,1,2,3,4]">
          <div *ngFor="let slot of row.byDay[day]" class="slot-chip"
               [style.background]="teacherColor(slot.teacher_id)">
            <span class="slot-teacher">{{ slot.teacher_name }}</span>
            <span class="slot-time">{{ slot.start_time }}</span>
            <span *ngIf="slot.subject" class="slot-subject">{{ slot.subject }}</span>
            <button class="slot-del" (click)="deleteSlot(slot.id)" title="מחיקה">✕</button>
          </div>
          <button class="add-slot-btn" (click)="openAddSlot(day, row.classYear, row.classParallel)" title="הוסף שיעור">+</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- TEACHERS TAB -->
<div *ngIf="activeTab() === 'teachers'" class="teachers-view">
  <div class="section-header">
    <h3>רשימת מורות</h3>
    <button class="btn btn-primary" (click)="showAddTeacher=true">+ הוסף מורה</button>
  </div>

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
    <div *ngFor="let t of teachers()" class="teacher-row card">
      <div class="teacher-info" *ngIf="editingTeacherId() !== t.id">
        <div class="teacher-color" [style.background]="teacherColor(t.id)"></div>
        <div>
          <strong>{{ t.name }}</strong>
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
        <span>שנה</span>
        <select [(ngModel)]="newSlot.class_year">
          <option value="">שנה</option>
          <option *ngFor="let y of YEARS" [value]="y">{{ y }}</option>
        </select>
      </label>
      <label class="field">
        <span>מקבילה</span>
        <select [(ngModel)]="newSlot.class_parallel">
          <option value="">מס׳</option>
          <option *ngFor="let p of PARALLELS" [value]="p">{{ p }}</option>
        </select>
      </label>
      <label class="field">
        <span>יום</span>
        <select [(ngModel)]="newSlot.day_of_week">
          <option value="">יום</option>
          <option *ngFor="let d of DAYS; let i=index" [value]="i">יום {{ d }} – {{ formatHebDate(addDays(weekStart(), i)) }}</option>
        </select>
      </label>
      <label class="field">
        <span>שעת התחלה</span>
        <input type="time" [(ngModel)]="newSlot.start_time">
      </label>
      <label class="field">
        <span>שעת סיום</span>
        <input type="time" [(ngModel)]="newSlot.end_time">
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
    <h3>הוספת שיעור – יום {{ DAYS[quickAddSlot.day] }}, כיתה {{ quickAddSlot.year }}{{ quickAddSlot.parallel }}</h3>
    <label>מורה:
      <select [(ngModel)]="quickAddSlot.teacher_id">
        <option value="">בחר מורה</option>
        <option *ngFor="let t of kodeshTeachers()" [value]="t.id">{{ t.name }}</option>
      </select>
    </label>
    <label>שעת התחלה: <input type="time" [(ngModel)]="quickAddSlot.start_time"></label>
    <label>שעת סיום: <input type="time" [(ngModel)]="quickAddSlot.end_time"></label>
    <label>מקצוע: <input [(ngModel)]="quickAddSlot.subject" placeholder="מקצוע"></label>
    <div class="form-actions">
      <button class="btn btn-primary" (click)="saveQuickSlot()">הוסף</button>
      <button class="btn btn-secondary" (click)="quickAddSlot=null">ביטול</button>
    </div>
    <p *ngIf="quickSlotError()" class="error-msg">{{ quickSlotError() }}</p>
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

/* Grid */
.schedule-grid { overflow-x: auto; }
.grid-header { display: grid; grid-template-columns: 80px repeat(5, 1fr); gap: 4px; margin-bottom: 4px; }
.grid-body { display: flex; flex-direction: column; gap: 4px; }
.grid-row { display: grid; grid-template-columns: 80px repeat(5, 1fr); gap: 4px; }
.cell { padding: 6px; }
.day-header { text-align: center; background: var(--surface-2); border-radius: var(--radius-sm);
  border: 1px solid var(--border); }
.day-name { display: block; font-weight: 700; font-size: 0.85rem; }
.day-date { display: block; font-size: 0.75rem; color: var(--text-muted); }
.class-label { font-weight: 700; font-size: 0.9rem; display: flex; align-items: center;
  justify-content: center; background: var(--surface-2); border-radius: var(--radius-sm);
  border: 1px solid var(--border); }
.day-cell { background: var(--bg); border: 1px dashed var(--border); border-radius: var(--radius-sm);
  min-height: 60px; padding: 4px; display: flex; flex-direction: column; gap: 4px; position: relative; }
.slot-chip { background: #e0edff; border-radius: 6px; padding: 5px 8px; font-size: 0.78rem;
  display: flex; flex-direction: column; gap: 2px; position: relative;
  border: 1px solid rgba(0,0,0,0.08); }
.slot-teacher { font-weight: 700; font-size: 0.78rem; }
.slot-time { color: rgba(0,0,0,0.5); font-size: 0.72rem; }
.slot-subject { color: rgba(0,0,0,0.6); font-size: 0.72rem; }
.slot-del { position: absolute; top: 2px; left: 2px; background: rgba(255,0,0,0.15);
  border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 0.6rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.add-slot-btn { align-self: flex-end; margin-top: auto; background: none; border: 1px dashed var(--primary);
  color: var(--primary); border-radius: 50%; width: 22px; height: 22px; cursor: pointer;
  font-size: 1rem; display: flex; align-items: center; justify-content: center; padding: 0;
  opacity: 0.5; &:hover { opacity: 1; } }

/* Teachers */
.teachers-list { display: flex; flex-direction: column; gap: 8px; }
.teacher-row { padding: 12px 16px; }
.teacher-info { display: flex; align-items: center; gap: 12px; }
.teacher-color { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
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
  slots = signal<any[]>([]);
  activeTab = signal<'grid' | 'teachers' | 'manage'>('grid');

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
  newSlot: any = { teacher_id: '', class_year: '', class_parallel: '', day_of_week: '', start_time: '', end_time: '', subject: '' };
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

  // Teacher colors
  private colors = ['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#ffedd5','#e0f2fe','#f0fdf4'];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadTeachers();
    this.loadSchedule();
  }

  loadTeachers() {
    this.api.getTeachers().subscribe({ next: t => this.teachers.set(t), error: () => {} });
  }

  // Teachers with specialization = 'קודש' (for שיעור לכיתה)
  kodeshTeachers = computed(() => this.teachers().filter(t => t.specialization === 'קודש'));

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
    for (const s of this.slots()) {
      const key = `${s.class_year}${s.class_parallel}`;
      if (!classMap.has(key)) {
        classMap.set(key, { className: key, classYear: s.class_year, classParallel: s.class_parallel, byDay: { 0: [], 1: [], 2: [], 3: [], 4: [] } });
      }
      classMap.get(key)!.byDay[s.day_of_week].push(s);
    }
    return Array.from(classMap.values()).sort((a, b) => a.className.localeCompare(b.className, 'he'));
  }

  openAddSlot(day: number, year: string, parallel: string) {
    this.quickAddSlot = { day, year, parallel, teacher_id: '', start_time: '', end_time: '', subject: '' };
    this.quickSlotError.set('');
  }

  saveQuickSlot() {
    const q = this.quickAddSlot;
    if (!q.teacher_id || !q.start_time) { this.quickSlotError.set('בחרי מורה ושעה'); return; }
    this.api.createScheduleSlot({
      teacher_id: Number(q.teacher_id), class_year: q.year, class_parallel: q.parallel,
      day_of_week: q.day, start_time: q.start_time, end_time: q.end_time || null,
      subject: q.subject || null, week_start: this._weekStart()
    }).subscribe({
      next: () => { this.quickAddSlot = null; this.loadSchedule(); },
      error: e => this.quickSlotError.set(e.error?.error || 'שגיאה')
    });
  }

  createSlot() {
    const s = this.newSlot;
    if (!s.teacher_id || !s.class_year || !s.class_parallel || s.day_of_week === '' || !s.start_time) {
      this.slotError.set('יש למלא: מורה, כיתה, יום, שעת התחלה'); return;
    }
    this.savingSlot.set(true); this.slotError.set(''); this.slotSuccess.set('');
    this.api.createScheduleSlot({ ...s, teacher_id: Number(s.teacher_id), day_of_week: Number(s.day_of_week), week_start: this._weekStart() }).subscribe({
      next: () => {
        this.savingSlot.set(false);
        this.slotSuccess.set('שיעור נוסף בהצלחה');
        this.newSlot = { teacher_id: '', class_year: '', class_parallel: '', day_of_week: '', start_time: '', end_time: '', subject: '' };
        this.loadSchedule();
      },
      error: e => { this.savingSlot.set(false); this.slotError.set(e.error?.error || 'שגיאה'); }
    });
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
      next: r => { this.copyLoading.set(false); this.copySuccess.set(`הועתקו ${r.copied} שיעורים`); this.showCopyWeek = false; this.loadSchedule(); },
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

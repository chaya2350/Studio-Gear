import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-teacher-profile',
  imports: [CommonModule],
  template: `
    <div *ngIf="loading()" class="loading-state">טוען...</div>

    <div *ngIf="!loading() && !teacher()" class="empty-state">
      <p>מורה לא נמצאה</p>
    </div>

    <div *ngIf="teacher() as t">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <a href="#" (click)="goBack($event)" class="back-btn">→</a>
          <div>
            <h1>{{ t.name }}</h1>
            <p class="subtitle">
              {{ t.subject || 'מורה' }}
              <span *ngIf="t.specialization"> · {{ t.specialization }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Profile Card -->
      <div class="profile-card">
        <div class="identity">
          <div class="avatar" [style.background]="avatarColor(t.name)">{{ initials(t.name) }}</div>
          <div class="identity-text">
            <h2>{{ t.name }}</h2>
            <p *ngIf="t.subject">{{ t.subject }}</p>
            <div class="badges-row">
              <span *ngIf="t.specialization" class="spec-badge">{{ t.specialization }}</span>
              <span *ngIf="!t.active" class="inactive-badge">לא פעילה</span>
            </div>
            <p *ngIf="t.email">
              <a [href]="'mailto:' + t.email" class="contact-link">{{ t.email }}</a>
            </p>
            <p *ngIf="t.phone">
              <a [href]="'tel:' + t.phone" class="contact-link">{{ t.phone }}</a>
            </p>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat">
            <span class="stat-val">{{ lessons().length }}</span>
            <span class="stat-lbl">שיעורים השבוע</span>
          </div>
          <div class="stat">
            <span class="stat-val">{{ uniqueClasses().length }}</span>
            <span class="stat-lbl">כיתות</span>
          </div>
          <div class="stat">
            <span class="stat-val">{{ daysWithLessons().length }}</span>
            <span class="stat-lbl">ימים</span>
          </div>
          <div class="stat" *ngIf="t.specialization">
            <span class="stat-val">{{ t.specialization }}</span>
            <span class="stat-lbl">התמחות</span>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <!-- Personal Details -->
        <div class="card">
          <div class="section-title">פרטים אישיים</div>
          <div class="info-grid">
            <div class="info-row highlight">
              <span class="info-label">שם</span>
              <span class="info-value">{{ t.name }}</span>
            </div>
            <div class="info-row" *ngIf="t.subject">
              <span class="info-label">מקצוע</span>
              <span class="info-value">{{ t.subject }}</span>
            </div>
            <div class="info-row" *ngIf="t.specialization">
              <span class="info-label">התמחות</span>
              <span class="info-value">{{ t.specialization }}</span>
            </div>
            <div class="info-row" *ngIf="t.phone">
              <span class="info-label">טלפון</span>
              <span class="info-value">{{ t.phone }}</span>
            </div>
            <div class="info-row" *ngIf="t.email">
              <span class="info-label">מייל</span>
              <span class="info-value">{{ t.email }}</span>
            </div>
          </div>
        </div>

        <!-- Lessons by Day -->
        <div class="card">
          <div class="section-title">
            השיעורים בשבוע הקרוב
            <span class="week-label" *ngIf="weekStart()"> · {{ weekStart() }}</span>
          </div>

          <div *ngIf="lessons().length; else noLessons" class="lessons-by-day">
            <div *ngFor="let day of lessonsByDay()" class="day-group">
              <div class="day-header">
                <span class="day-name">{{ day.dayName }}</span>
                <span class="day-date">{{ day.date }}</span>
                <span class="day-count">{{ day.lessons.length }} שיעורים</span>
              </div>
              <div class="day-lessons">
                <div *ngFor="let lesson of day.lessons" class="lesson-row">
                  <div class="lesson-time">
                    <span class="time-start">{{ lesson.start_time }}</span>
                    <span *ngIf="lesson.end_time" class="time-end">{{ lesson.end_time }}</span>
                  </div>
                  <div class="lesson-class">
                    <strong>{{ lesson.class_name }}</strong>
                    <span class="lesson-subject" *ngIf="lesson.subject">{{ lesson.subject }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ng-template #noLessons>
            <p class="empty-state">אין שיעורים מתוכננים בשבוע הקרוב.</p>
          </ng-template>
        </div>
      </div>

      <!-- Classes Summary -->
      <div *ngIf="uniqueClasses().length" class="card" style="margin-top:20px">
        <div class="section-title">הכיתות שלי</div>
        <div class="classes-grid">
          <div *ngFor="let cls of uniqueClasses()" class="class-chip">
            <span class="class-name">{{ cls.name }}</span>
            <span class="class-count">{{ cls.count }} שיעורים</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .back-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 42px; height: 42px; border-radius: 50%;
      background: var(--surface); border: 1.5px solid var(--border);
      color: var(--text); text-decoration: none; font-size: 1.4rem;
    }
    .subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 4px 0 0; }

    .profile-card {
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow);
      padding: 24px; margin-bottom: 20px;
    }
    .identity { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .avatar {
      width: 72px; height: 72px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 900; font-size: 1.8rem;
      box-shadow: 0 6px 18px rgba(0,0,0,0.12); flex-shrink: 0;
    }
    .identity-text { display: grid; gap: 4px; }
    .identity-text h2 { margin: 0; font-size: 1.7rem; }
    .identity-text p { margin: 0; color: var(--text-muted); }
    .badges-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .spec-badge {
      background: var(--primary-light); color: var(--primary);
      border-radius: 12px; padding: 2px 12px; font-size: 0.78rem; font-weight: 700;
    }
    .inactive-badge {
      background: #fef2f2; color: #b91c1c;
      border-radius: 12px; padding: 2px 12px; font-size: 0.78rem; font-weight: 700;
    }
    .contact-link { color: var(--primary); text-decoration: none; font-weight: 600; }

    .stats-row {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px; margin-top: 12px;
    }
    .stat {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px 16px;
      display: flex; flex-direction: column; gap: 4px; text-align: center;
    }
    .stat-val { font-size: 1.1rem; font-weight: 800; color: var(--text); }
    .stat-lbl { font-size: 0.72rem; letter-spacing: 0.03em; color: var(--text-muted); }

    .detail-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;
    }
    .card {
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 20px;
    }
    .section-title {
      font-size: 1.05rem; font-weight: 800; color: var(--text); margin-bottom: 16px;
    }
    .week-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }

    .info-grid { display: grid; gap: 10px; }
    .info-row {
      display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 10px 12px; border-radius: var(--radius-sm);
      background: var(--surface-2); border: 1px solid var(--border);
    }
    .info-row.highlight { background: linear-gradient(135deg, var(--primary-light), var(--surface-2)); }
    .info-label { font-weight: 700; color: var(--text-muted); }
    .info-value { font-weight: 700; text-align: left; color: var(--text); word-break: break-word; }

    /* Lessons by day */
    .lessons-by-day { display: grid; gap: 14px; }
    .day-group {
      border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden;
    }
    .day-header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    .day-name { font-weight: 800; color: var(--primary); font-size: 0.95rem; }
    .day-date { font-size: 0.8rem; color: var(--text-muted); }
    .day-count {
      margin-inline-start: auto; font-size: 0.75rem; color: var(--text-muted);
      background: var(--bg); border-radius: 10px; padding: 2px 10px;
    }
    .day-lessons { display: grid; gap: 0; }
    .lesson-row {
      display: grid; grid-template-columns: 100px 1fr; gap: 12px; align-items: center;
      padding: 10px 14px; border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .lesson-time { display: flex; flex-direction: column; gap: 2px; }
    .time-start { font-weight: 700; font-size: 0.88rem; color: var(--text); }
    .time-end { font-size: 0.75rem; color: var(--text-muted); }
    .lesson-class { display: flex; flex-direction: column; gap: 2px; }
    .lesson-class strong { font-size: 0.92rem; }
    .lesson-subject { font-size: 0.78rem; color: var(--text-muted); }

    /* Classes summary */
    .classes-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .class-chip {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 10px 18px;
    }
    .class-name { font-weight: 800; font-size: 1.1rem; color: var(--primary); }
    .class-count { font-size: 0.72rem; color: var(--text-muted); }

    .empty-state { margin: 0; color: var(--text-muted); text-align: center; padding: 24px; }
    .loading-state { text-align: center; padding: 40px; color: var(--text-muted); }

    @media (max-width: 640px) {
      .lesson-row { grid-template-columns: 1fr; }
    }
  `,
})
export class TeacherProfileComponent implements OnInit {
  readonly teacher = signal<any | null>(null);
  readonly lessons = signal<any[]>([]);
  readonly weekStart = signal<string>('');
  readonly loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      const request$ = Number.isFinite(id) && id > 0
        ? this.api.getTeacherProfile(id)
        : this.api.getMyTeacherProfile();

      request$.subscribe({
        next: (res) => {
          this.teacher.set(res.teacher);
          this.lessons.set(res.lessons || []);
          this.weekStart.set(res.week_start || '');
          this.loading.set(false);
        },
        error: () => {
          this.teacher.set(null);
          this.loading.set(false);
        },
      });
    });
  }

  goBack(event: Event) {
    event.preventDefault();
    this.location.back();
  }

  // Group lessons by day
  lessonsByDay = computed(() => {
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
    const groups = new Map<number, { dayName: string; date: string; lessons: any[] }>();

    for (const lesson of this.lessons()) {
      if (!groups.has(lesson.day_of_week)) {
        groups.set(lesson.day_of_week, {
          dayName: `יום ${days[lesson.day_of_week] || ''}`,
          date: lesson.lesson_date,
          lessons: [],
        });
      }
      groups.get(lesson.day_of_week)!.lessons.push(lesson);
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, g]) => ({
        ...g,
        lessons: g.lessons.sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  });

  // Unique days with lessons
  daysWithLessons = computed(() => {
    const daySet = new Set(this.lessons().map(l => l.day_of_week));
    return Array.from(daySet);
  });

  // Unique classes with lesson count
  uniqueClasses = computed(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const l of this.lessons()) {
      if (!map.has(l.class_name)) {
        map.set(l.class_name, { name: l.class_name, count: 0 });
      }
      map.get(l.class_name)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  });

  initials(name: string) {
    return (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'מ';
  }

  avatarColor(name: string) {
    const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (hash * 31 + (name || '').charCodeAt(i)) >>> 0;
    }
    return colors[hash % colors.length];
  }
}

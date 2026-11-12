import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, ScopedStudentReport } from '../services/api.service';
import { AuthService } from '../services/auth.service';

interface ClassOption {
  parallel: string;
  class_name: string;
  label: string;
  count: number;
}

interface TrackOption {
  name: string;
  count: number;
}

@Component({
  selector: 'app-reports',
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-header">
      <div><h1>דוחות ותמונת מצב</h1><p class="subtitle">רשימת תלמידות, תמונת מצב ומגמות ציונים</p></div>
    </div>

    <section class="card report-selector">
      <label for="report-scope">סוג דוח</label>
      <select id="report-scope" [ngModel]="scope()" (ngModelChange)="selectScope($event)">
        <option value="class">כיתה</option>
        <option value="school">כל בית הספר</option>
        <option value="track">מסלול</option>
      </select>
      <ng-container *ngIf="scope() === 'class'">
        <label for="report-class">בחירת כיתה</label>
        <select id="report-class" [ngModel]="selectedClass()" (ngModelChange)="selectClass($event)">
          <option value="">בחרי כיתה להצגת הדוח</option>
          <option *ngFor="let group of classes()" [value]="group.class_name">{{ group.label }} · {{ group.count }} תלמידות</option>
        </select>
      </ng-container>
      <ng-container *ngIf="scope() === 'track'">
        <label for="report-track">בחירת מסלול</label>
        <select id="report-track" [ngModel]="selectedTrack()" (ngModelChange)="selectTrack($event)">
          <option value="">בחרי מסלול להצגת הדוח</option>
          <option *ngFor="let track of tracks()" [value]="track.name">{{ track.name }} · {{ track.count }} תלמידות</option>
        </select>
      </ng-container>
      <p *ngIf="error()" class="alert alert-error" role="alert">{{ error() }}</p>
      <p *ngIf="!canViewStudentProfiles()" class="report-permission-note">
        לפתיחת תיק תלמידה נדרשת הרשאת צפייה בתלמידות.
      </p>
    </section>

    <div *ngIf="loading()" class="report-loading" role="status" aria-label="טעינת הדוח">
      <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    </div>

    <ng-container *ngIf="report() as current">
      <section class="report-summary">
        <article class="card summary-card"><span>{{ reportHeading() }}</span><strong>{{ current.scope === 'class' ? current.class_name : current.scope === 'track' ? current.track : 'כל בית הספר' }}</strong></article>
        <article class="card summary-card"><span>תלמידות</span><strong>{{ current.count }}</strong></article>
        <article class="card summary-card"><span>ממוצע ציונים</span><strong>{{ overallAverage() ?? '—' }}<small *ngIf="overallAverage() !== null">%</small></strong></article>
      </section>

      <section class="card report-chart-card">
        <header class="report-section-heading">
          <div><span class="report-eyebrow">הישגים</span><h2>ממוצע לפי מבחן</h2></div>
          <span class="report-count">{{ current.exams.length }} מבחנים</span>
        </header>
        <div *ngIf="!current.exams.length" class="report-empty">אין מבחנים להצגה עבור הבחירה הזו.</div>
        <div *ngIf="current.exams.length" class="exam-chart">
          <article *ngFor="let exam of current.exams" class="exam-chart-row">
            <div class="exam-chart-label"><strong>{{ exam.name }}</strong><span>{{ gradeCount(exam.id) }} ציונים</span></div>
            <div class="exam-chart-track" role="img" [attr.aria-label]="'ממוצע ' + exam.name + ': ' + (examAverage(exam.id) ?? 'אין ציונים')">
              <span [style.width.%]="examAverage(exam.id) ?? 0"></span>
            </div>
            <strong class="exam-chart-value">{{ examAverage(exam.id) === null ? '—' : examAverage(exam.id) }}</strong>
          </article>
        </div>
      </section>

      <section class="card report-table-card">
        <h2>רשימת תלמידות וציונים</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>תלמידה</th>
                <th *ngIf="canViewStudentProfiles()">ת.ז.</th>
                <th *ngIf="canViewStudentProfiles()">תאריך לידה</th>
                <th *ngIf="current.scope !== 'class'">כיתה</th>
                <th *ngIf="current.scope !== 'track'">מסלול</th>
                <th *ngFor="let exam of current.exams">{{ exam.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of current.rows">
                <td>
                  <a *ngIf="canOpenStudent(row); else unlinkedStudent" class="student-report-person"
                     [routerLink]="['/students', studentId(row)]">
                    <img *ngIf="studentPhoto(row)" [src]="studentPhoto(row)" [alt]="'תמונת ' + row['name']">
                    <span *ngIf="!studentPhoto(row)" class="student-report-avatar" aria-hidden="true">{{ studentInitials(row['name']) }}</span>
                    <span>{{ row['name'] || '—' }}</span>
                  </a>
                  <ng-template #unlinkedStudent>
                    <div class="student-report-person">
                      <img *ngIf="studentPhoto(row)" [src]="studentPhoto(row)" [alt]="'תמונת ' + row['name']">
                      <span *ngIf="!studentPhoto(row)" class="student-report-avatar" aria-hidden="true">{{ studentInitials(row['name']) }}</span>
                      <span>{{ row['name'] || '—' }}</span>
                    </div>
                  </ng-template>
                </td>
                <td *ngIf="canViewStudentProfiles()">{{ row['id_number'] || '—' }}</td>
                <td *ngIf="canViewStudentProfiles()">{{ formatBirthDate(row['birth_date']) }}</td>
                <td *ngIf="current.scope !== 'class'">{{ row['class_name'] || '—' }}</td>
                <td *ngIf="current.scope !== 'track'">{{ row['track'] || '—' }}</td>
                <td *ngFor="let exam of current.exams">
                  {{ row['exam_' + exam.id] === '' ? '—' : row['exam_' + exam.id] }}
                </td>
              </tr>
              <tr *ngIf="!current.rows.length">
                <td [attr.colspan]="1 + (canViewStudentProfiles() ? 2 : 0) + (current.scope !== 'class' ? 1 : 0) + (current.scope !== 'track' ? 1 : 0) + current.exams.length"
                    class="report-empty">לא נמצאו תלמידות להצגה.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </ng-container>
  `,
  styles: [`
    .report-selector { display:flex; align-items:center; gap:14px; padding:16px 20px; margin-bottom:18px; }
    .report-selector label { font-weight:800; white-space:nowrap; }
    .report-selector select { min-width:min(360px,100%); padding:9px 12px; border:1px solid var(--border); border-radius:10px; background:var(--surface); color:var(--text); font:inherit; }
    .report-selector .alert { margin:0; }
    .report-loading { display:flex; justify-content:center; padding:40px; }
    .report-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:18px; }
    .summary-card { padding:18px 20px; display:flex; flex-direction:column; gap:8px; }
    .summary-card span { color:var(--text-muted); font-size:.8rem; }
    .summary-card strong { color:var(--primary); font-size:1.55rem; font-variant-numeric:tabular-nums; }
    .summary-card small { margin-inline-start:3px; font-size:.8rem; }
    .report-chart-card,.report-table-card { padding:20px; margin-bottom:18px; }
    .report-section-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; }
    .report-section-heading h2,.report-table-card h2 { margin:2px 0 0; font-size:1.05rem; }
    .report-eyebrow { color:var(--primary); font-size:.72rem; font-weight:800; }
    .report-count { color:var(--text-muted); font-size:.8rem; }
    .exam-chart { display:flex; flex-direction:column; gap:15px; }
    .exam-chart-row { display:grid; grid-template-columns:minmax(120px,1fr) minmax(100px,2fr) 42px; align-items:center; gap:14px; }
    .exam-chart-label strong,.exam-chart-label span { display:block; }
    .exam-chart-label strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .exam-chart-label span { margin-top:3px; color:var(--text-muted); font-size:.72rem; }
    .exam-chart-track { height:13px; overflow:hidden; border-radius:10px; background:var(--surface-3); }
    .exam-chart-track span { display:block; height:100%; border-radius:inherit; background:var(--grad-primary); transition:width .4s ease; }
    .exam-chart-value { color:var(--primary); font-variant-numeric:tabular-nums; text-align:left; }
    .report-empty { padding:24px; color:var(--text-muted); text-align:center; }
    .report-permission-note { margin:12px 0 0; color:var(--text-muted); font-size:.8rem; }
    .student-report-person { display:flex; align-items:center; gap:10px; min-width:160px; color:var(--text); text-decoration:none; font-weight:700; }
    a.student-report-person:hover { color:var(--primary); text-decoration:underline; }
    .student-report-person img,.student-report-avatar { width:42px; height:42px; flex:0 0 42px; border-radius:50%; }
    .student-report-person img { object-fit:cover; }
    .student-report-avatar { display:grid; place-items:center; background:var(--primary-light); color:var(--primary); font-size:.85rem; }
    .report-table-card h2 { margin-bottom:14px; }
    @media(max-width:700px) {
      .report-selector { align-items:stretch; flex-direction:column; }
      .report-summary { grid-template-columns:1fr; }
      .exam-chart-row { grid-template-columns:minmax(95px,1fr) minmax(70px,1.3fr) 36px; gap:8px; }
    }
  `]
})
export class ReportsComponent implements OnInit {
  readonly classes = signal<ClassOption[]>([]);
  readonly tracks = signal<TrackOption[]>([]);
  readonly scope = signal<'class' | 'school' | 'track'>('class');
  readonly selectedClass = signal('');
  readonly selectedTrack = signal('');
  readonly report = signal<ScopedStudentReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private reportRequest = 0;
  readonly reportHeading = computed(() => {
    const scope = this.scope();
    return scope === 'class' ? 'דוח כיתה' : scope === 'track' ? 'דוח מסלול' : 'דוח כולל';
  });
  readonly overallAverage = computed(() => {
    const report = this.report();
    if (!report) return null;
    const grades = report.exams.flatMap(exam => report.rows
      .map(row => this.numericGrade(row[`exam_${exam.id}`]))
      .filter((grade): grade is number => grade !== null));
    return grades.length ? Math.round(grades.reduce((sum, grade) => sum + grade, 0) / grades.length) : null;
  });

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit(): void {
    this.api.getReportClasses().subscribe({
      next: rows => {
        this.classes.set(rows);
        const firstClass = rows[0]?.class_name || '';
        this.selectedClass.set(firstClass);
        if (firstClass && this.scope() === 'class') this.loadReport({ scope: 'class', class_name: firstClass });
      },
      error: () => this.error.set('לא ניתן לטעון את רשימת הכיתות'),
    });
    this.api.getReportTracks().subscribe({
      next: rows => {
        this.tracks.set(rows);
        const firstTrack = rows[0]?.name || '';
        this.selectedTrack.set(firstTrack);
        if (firstTrack && this.scope() === 'track') this.loadReport({ scope: 'track', track: firstTrack });
      },
      error: () => this.error.set('לא ניתן לטעון את רשימת המסלולים'),
    });
  }

  selectScope(scope: 'class' | 'school' | 'track'): void {
    this.reportRequest++;
    this.scope.set(scope);
    this.report.set(null);
    this.error.set('');
    if (scope === 'school') {
      this.loadReport({ scope });
    } else if (scope === 'class') {
      const className = this.selectedClass() || this.classes()[0]?.class_name || '';
      this.selectedClass.set(className);
      if (className) this.loadReport({ scope, class_name: className });
    } else {
      const track = this.selectedTrack() || this.tracks()[0]?.name || '';
      this.selectedTrack.set(track);
      if (track) this.loadReport({ scope, track });
    }
  }

  selectClass(className: string): void {
    this.selectedClass.set(className);
    if (className) this.loadReport({ scope: 'class', class_name: className });
    else { this.reportRequest++; this.report.set(null); this.error.set(''); }
  }

  selectTrack(track: string): void {
    this.selectedTrack.set(track);
    if (track) this.loadReport({ scope: 'track', track });
    else { this.reportRequest++; this.report.set(null); this.error.set(''); }
  }

  canViewStudentProfiles(): boolean {
    return this.auth.hasPermission('students', 'view');
  }

  canOpenStudent(row: Record<string, string | number>): boolean {
    return this.canViewStudentProfiles() && !!row['id_number'];
  }

  studentId(row: Record<string, string | number>): string {
    return String(row['id_number'] || '');
  }

  studentPhoto(row: Record<string, string | number>): string {
    const photo = row['photo_url'];
    return typeof photo === 'string' ? photo : '';
  }

  studentInitials(name: string | number | undefined): string {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]).join('') || 'ת';
  }

  formatBirthDate(value: string | number | undefined): string {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : raw || 'לא הוזן';
  }

  private loadReport(params: { scope: 'class' | 'school' | 'track'; class_name?: string; track?: string }): void {
    const request = ++this.reportRequest;
    this.report.set(null);
    this.error.set('');
    this.loading.set(true);
    this.api.getScopedStudentReport(params).subscribe({
      next: report => {
        if (request !== this.reportRequest) return;
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => {
        if (request !== this.reportRequest) return;
        this.error.set('לא ניתן לטעון את הדוח עבור הבחירה הזו');
        this.loading.set(false);
      },
    });
  }

  examAverage(examId: number): number | null {
    const report = this.report();
    if (!report) return null;
    const grades = report.rows.map(row => this.numericGrade(row[`exam_${examId}`]))
      .filter((grade): grade is number => grade !== null);
    return grades.length ? Math.round(grades.reduce((sum, grade) => sum + grade, 0) / grades.length) : null;
  }

  gradeCount(examId: number): number {
    return this.report()?.rows.filter(row => this.numericGrade(row[`exam_${examId}`]) !== null).length ?? 0;
  }

  private numericGrade(value: string | number | undefined): number | null {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const grade = Number(value);
    return Number.isFinite(grade) ? Math.max(0, Math.min(100, grade)) : null;
  }
}

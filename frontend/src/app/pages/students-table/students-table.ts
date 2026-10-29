import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { toStudyYear } from '../approvals/study-year';
import { collectTrackNames } from '../../utils/track-names';

interface TableStudent {
  id_number: string;
  name: string;
  photo_url?: string;
  track?: string;
  year?: string;
  class_name?: string;
  parallel?: string;
  phone?: string;
  birth_date?: string;
  address?: string;
  extra_data?: Record<string, any>;
  // computed
  totalReqs: number;
  completedReqs: number;
  missingRequired: number;
  examAvg: number | null;
}

@Component({
  selector: 'app-students-table',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<!-- Photo popup -->
<div *ngIf="popupPhoto()" class="popup-backdrop" (click)="popupPhoto.set(null)">
  <div class="popup-card" (click)="$event.stopPropagation()">
    <img [src]="popupPhoto()!.url" [alt]="popupPhoto()!.name" class="popup-img">
    <div class="popup-name">{{ popupPhoto()!.name }}</div>
    <button class="popup-close" (click)="popupPhoto.set(null)">✕</button>
  </div>
</div>

<div class="page-header">
  <div>
    <h1>📋 טבלת תלמידות</h1>
    <p class="subtitle">תצוגת Excel — כל הפרטים במקום אחד</p>
  </div>
  <div class="header-actions">
    <button class="btn btn-secondary" (click)="exportExcel()" [disabled]="!filtered().length">⬇ ייצוא Excel</button>
    <button class="btn btn-secondary" (click)="printTable()" [disabled]="!filtered().length">🖨 הדפסה</button>
  </div>
</div>

<!-- פילטרים -->
<div class="card filters-card">
  <div class="filter-mode">
    <button [class.active]="filterMode()==='track'" (click)="filterMode.set('track')">לפי מסלול ושנה</button>
    <button [class.active]="filterMode()==='class'" (click)="filterMode.set('class')">לפי כיתה</button>
    <button [class.active]="filterMode()==='all'" (click)="filterMode.set('all')">כולן</button>
  </div>

  <div class="filter-row" *ngIf="filterMode()==='track'">
    <div class="form-group">
      <label>מסלול</label>
      <select [(ngModel)]="selTrack">
        <option value="">כל המסלולים</option>
        <option *ngFor="let t of trackOptions()" [value]="t">{{ t }}</option>
      </select>
    </div>
    <div class="form-group">
      <label>שנה</label>
      <select [(ngModel)]="selYear">
        <option value="">כל השנים</option>
        <option *ngFor="let y of yearOptions()" [value]="y">{{ toStudyYear(y) }}</option>
      </select>
    </div>
  </div>

  <div class="filter-row" *ngIf="filterMode()==='class'">
    <div class="form-group">
      <label>כיתה</label>
      <select [(ngModel)]="selClass">
        <option value="">בחרי כיתה</option>
        <option *ngFor="let c of classOptions()" [value]="c.parallel">{{ c.label }} ({{ c.count }})</option>
      </select>
    </div>
  </div>

  <div class="filter-row">
    <div class="form-group" style="flex:2">
      <label>חיפוש חופשי</label>
      <input [(ngModel)]="searchQ" placeholder="שם, ת.ז, טלפון...">
    </div>
    <div class="form-group">
      <label>מיון</label>
      <select [(ngModel)]="sortBy">
        <option value="family">לפי שם משפחה</option>
        <option value="name">לפי שם פרטי</option>
        <option value="class">לפי כיתה</option>
        <option value="missing">לפי חסרות</option>
        <option value="avg">לפי ממוצע</option>
      </select>
    </div>
  </div>

  <div class="filter-info">
    <span>{{ filtered().length }} תלמידות</span>
    <label class="toggle-label">
      <input type="checkbox" [(ngModel)]="showPhoto"> הצג תמונות
    </label>
    <label class="toggle-label">
      <input type="checkbox" [(ngModel)]="showExtra"> הצג שדות נוספים
    </label>
  </div>
</div>

<!-- טבלה -->
<div class="table-wrap card" *ngIf="filtered().length">
  <div class="table-scroll" id="print-area">
    <table class="excel-table">
      <thead>
        <tr>
          <th *ngIf="showPhoto" class="col-photo">תמונה</th>
          <th class="col-num">#</th>
          <th class="col-name">שם</th>
          <th class="col-id">ת.ז</th>
          <th class="col-class">כיתה</th>
          <th class="col-track">מסלול</th>
          <th class="col-year">שנה</th>
          <th class="col-phone">טלפון</th>
          <th class="col-birth">ת.לידה</th>
          <th class="col-reqs">דרישות</th>
          <th class="col-missing">חסרות חובה</th>
          <th class="col-avg">ממוצע</th>
          <ng-container *ngIf="showExtra">
            <th *ngFor="let k of extraKeys()" class="col-extra">{{ k }}</th>
          </ng-container>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let s of filtered(); let i = index" [class.row-missing]="s.missingRequired > 0">
          <td *ngIf="showPhoto" class="col-photo">
            <div class="photo-cell" (click)="s.photo_url && popupPhoto.set({url: s.photo_url, name: s.name})">
              <img *ngIf="s.photo_url" [src]="s.photo_url" [alt]="s.name" class="table-photo">
              <div *ngIf="!s.photo_url" class="table-initials" [style.background]="avatarColor(s.id_number)">
                {{ s.name.charAt(0) }}
              </div>
            </div>
          </td>
          <td class="col-num">{{ i + 1 }}</td>
          <td class="col-name">
            <a [routerLink]="['/students', s.id_number]" class="name-link">{{ s.name }}</a>
          </td>
          <td class="col-id mono">{{ s.id_number }}</td>
          <td class="col-class">{{ s.class_name || '' }}{{ s.parallel && s.parallel !== '0' ? s.parallel : '' }}</td>
          <td class="col-track">{{ s.track || '' }}</td>
          <td class="col-year">{{ toStudyYear(s.year) }}</td>
          <td class="col-phone mono">{{ s.phone || '' }}</td>
          <td class="col-birth">{{ s.birth_date || '' }}</td>
          <td class="col-reqs">
            <span class="reqs-bar">
              <span class="reqs-fill" [style.width.%]="s.totalReqs ? (s.completedReqs/s.totalReqs*100) : 100"></span>
            </span>
            {{ s.completedReqs }}/{{ s.totalReqs }}
          </td>
          <td class="col-missing" [class.cell-danger]="s.missingRequired > 0">
            {{ s.missingRequired > 0 ? s.missingRequired : '✓' }}
          </td>
          <td class="col-avg" [class.cell-good]="s.examAvg !== null && s.examAvg >= 80"
                              [class.cell-warn]="s.examAvg !== null && s.examAvg < 60">
            {{ s.examAvg !== null ? (s.examAvg | number:'1.1-1') : '—' }}
          </td>
          <ng-container *ngIf="showExtra">
            <td *ngFor="let k of extraKeys()" class="col-extra">{{ s.extra_data?.[k] ?? '' }}</td>
          </ng-container>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<div *ngIf="loading()" class="loading-center">טוענת נתונים...</div>
<div *ngIf="!loading() && !filtered().length && (filterMode()==='all' || selTrack || selYear || selClass || searchQ)"
     class="empty-state card">אין תלמידות לבחירה הנוכחית</div>
`,
  styles: [`
    .page-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
    .header-actions { display:flex; gap:8px; }
    .filters-card { padding:16px; margin-bottom:14px; display:flex; flex-direction:column; gap:10px; }
    .filter-mode { display:flex; gap:6px;
      button { padding:7px 16px; border:1.5px solid var(--border); border-radius:999px; background:var(--surface); font:inherit; font-size:.83rem; font-weight:700; cursor:pointer;
        &.active { border-color:var(--primary); color:var(--primary); background:var(--primary-light); } } }
    .filter-row { display:flex; gap:12px; flex-wrap:wrap; }
    .form-group { display:flex; flex-direction:column; gap:3px; flex:1; min-width:140px;
      label { font-size:.75rem; font-weight:700; color:var(--text-muted); }
      input, select { height:36px; padding:0 10px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font:inherit; font-size:.85rem; background:var(--surface); } }
    .filter-info { display:flex; align-items:center; gap:16px; font-size:.82rem; color:var(--text-muted); }
    .toggle-label { display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none;
      input { cursor:pointer; } }

    .table-wrap { padding:0; overflow:hidden; }
    .table-scroll { overflow-x:auto; max-height:70vh; overflow-y:auto; }
    .excel-table {
      width:100%; border-collapse:collapse; font-size:.82rem;
      th { position:sticky; top:0; background:#f1f5f9; padding:8px 10px; text-align:right; font-size:.75rem; font-weight:700; color:var(--text-muted); border-bottom:2px solid var(--border); white-space:nowrap; z-index:1; }
      td { padding:6px 10px; border-bottom:1px solid var(--border); vertical-align:middle; white-space:nowrap; }
      tr:hover td { background:var(--primary-light); }
      tr.row-missing td { background:#fff7ed; }
    }

    .col-photo { width:52px; text-align:center; }
    .col-num { width:36px; text-align:center; color:var(--text-muted); font-size:.75rem; }
    .col-name { min-width:140px; }
    .col-id, .col-phone { font-family:monospace; font-size:.78rem; }
    .col-class { width:60px; text-align:center; font-weight:700; }
    .col-reqs { width:80px; }
    .col-missing { width:80px; text-align:center; font-weight:700; }
    .col-avg { width:70px; text-align:center; font-weight:700; }

    .photo-cell { display:flex; align-items:center; justify-content:center; cursor:pointer; }
    .table-photo { width:38px; height:38px; border-radius:50%; object-fit:cover; border:2px solid var(--border); transition:transform .15s; &:hover { transform:scale(1.5); z-index:10; position:relative; } }
    .table-initials { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:.9rem; border:2px solid var(--border); }

    .name-link { color:var(--primary); text-decoration:none; font-weight:700; &:hover { text-decoration:underline; } }
    .mono { font-family:monospace; }

    .reqs-bar { display:inline-block; width:40px; height:6px; background:var(--border); border-radius:3px; overflow:hidden; vertical-align:middle; margin-left:4px;
      .reqs-fill { display:block; height:100%; background:var(--primary); border-radius:3px; } }
    .cell-danger { color:var(--danger); }
    .cell-good { color:#059669; }
    .cell-warn { color:#d97706; }

    /* Popup */
    .popup-backdrop { position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; animation:fadeIn .15s ease; }
    .popup-card { position:relative; background:var(--surface); border-radius:var(--radius); padding:14px; box-shadow:0 24px 60px rgba(0,0,0,.4); display:flex; flex-direction:column; align-items:center; gap:10px; max-width:90vw; }
    .popup-img { width:min(320px,80vw); height:min(320px,80vw); object-fit:cover; border-radius:var(--radius-sm); }
    .popup-name { font-size:1rem; font-weight:800; }
    .popup-close { position:absolute; top:8px; left:8px; width:28px; height:28px; border:none; background:var(--surface-2); border-radius:50%; cursor:pointer; font-size:.9rem; display:flex; align-items:center; justify-content:center; &:hover { background:#fee2e2; color:var(--danger); } }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }

    .loading-center { text-align:center; padding:60px; color:var(--text-muted); }
    .empty-state { padding:40px; text-align:center; color:var(--text-muted); }

    @media print {
      .filters-card, .header-actions, .popup-backdrop { display:none !important; }
      .table-scroll { max-height:none; overflow:visible; }
      .excel-table th { background:#e2e8f0 !important; -webkit-print-color-adjust:exact; }
      tr.row-missing td { background:#fff7ed !important; -webkit-print-color-adjust:exact; }
    }
  `]
})
export class StudentsTableComponent implements OnInit {
  loading = signal(true);
  filterMode = signal<'track' | 'class' | 'all'>('all');
  selTrack = '';
  selYear = '';
  selClass = '';
  searchQ = '';
  sortBy = 'family';
  showPhoto = true;
  showExtra = false;

  popupPhoto = signal<{ url: string; name: string } | null>(null);

  private allStudents = signal<TableStudent[]>([]);
  private allClasses = signal<{ parallel: string; label: string; count: number }[]>([]);

  toStudyYear = toStudyYear;

  private readonly PALETTE = ['#0d9488','#0891b2','#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#f59e0b'];
  avatarColor(id: string): string {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
    return this.PALETTE[hash % this.PALETTE.length];
  }

  trackOptions = computed(() =>
    collectTrackNames(this.allStudents().map(s => s.track)).filter(t => !/התמחות/i.test(t))
  );

  yearOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const y of this.allStudents().map(s => s.year).filter(Boolean) as string[]) {
      const lbl = toStudyYear(y);
      if (!seen.has(lbl)) seen.set(lbl, y);
    }
    return [...seen.values()];
  });

  classOptions = computed(() => this.allClasses());

  extraKeys = computed(() => {
    if (!this.showExtra) return [];
    const keys = new Set<string>();
    for (const s of this.allStudents().slice(0, 50)) {
      for (const k of Object.keys(s.extra_data || {})) {
        if (!['מקבילה','מספר','סיסמא','סיסמת הדפסה','שלוחה לטלפון','עודכן במדפסת'].includes(k)) keys.add(k);
      }
    }
    return [...keys].slice(0, 20);
  });

  filtered = computed(() => {
    let list = this.allStudents();

    // סינון לפי מחזור/שנה
    if (this.filterMode() === 'track') {
      if (this.selYear) list = list.filter(s => s.year === this.selYear);
    }

    // סינון לפי כיתה — עובד תמיד
    if (this.selClass) {
      const [cn, pn] = this.selClass.split('_');
      list = list.filter(s =>
        String(s.class_name || '').trim() === cn &&
        String(s.parallel  || '').trim() === pn
      );
    }

    // סינון לפי מסלול — עובד תמיד
    if (this.selTrack) {
      list = list.filter(s => (s.track || '').includes(this.selTrack));
    }

    // חיפוש חופשי
    if (this.searchQ.trim()) {
      const q = this.searchQ.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.id_number.includes(q) ||
        (s.phone || '').includes(q) ||
        (s.address || '').includes(q)
      );
    }

    // מיון
    const familyName = (n: string) => n.trim().split(/\s+/).pop() || n;
    return [...list].sort((a, b) => {
      if (this.sortBy === 'family')  return familyName(a.name).localeCompare(familyName(b.name), 'he');
      if (this.sortBy === 'name')    return a.name.localeCompare(b.name, 'he');
      if (this.sortBy === 'class')   return `${a.class_name}${a.parallel}`.localeCompare(`${b.class_name}${b.parallel}`, 'he');
      if (this.sortBy === 'missing') return b.missingRequired - a.missingRequired;
      if (this.sortBy === 'avg')     return (b.examAvg ?? -1) - (a.examAvg ?? -1);
      return 0;
    });
  });

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getStudentClasses().subscribe(c => this.allClasses.set(c));

    // טוען תלמידות + דרישות + ממוצעים במקביל
    Promise.all([
      new Promise<any>(res => this.api.getStudents().subscribe(res)),
      new Promise<any>(res => this.api.getStudentRequirementsSummary().subscribe(res)),
      new Promise<any>(res => this.api.getExamStats().subscribe(res))
    ]).then(([students, reqSummary, examStats]) => {
      const avgMap = new Map<string, number>();
      for (const s of (examStats as any).byStudent) {
        if (s.avg_grade != null) avgMap.set(s.id_number, s.avg_grade);
      }

      const rows: TableStudent[] = (students as any[]).map(s => {
        const reqs = (reqSummary as any)[s.id_number] || { total: 0, completed: 0, missing: 0 };
        return {
          ...s,
          extra_data: typeof s.extra_data === 'object' ? s.extra_data as Record<string, any> : {},
          totalReqs: reqs.total,
          completedReqs: reqs.completed,
          missingRequired: reqs.missing,
          examAvg: avgMap.get(s.id_number) ?? null
        };
      });
      this.allStudents.set(rows);
      this.loading.set(false);
    });
  }

  exportExcel() {
    const rows = this.filtered();
    const headers = ['שם', 'ת.ז', 'כיתה', 'מסלול', 'שנה', 'טלפון', 'תאריך לידה', 'דרישות הושלמו', 'חסרות חובה', 'ממוצע מבחנים'];
    if (this.showExtra) headers.push(...this.extraKeys());

    const data = rows.map(s => {
      const row: string[] = [
        s.name, s.id_number,
        `${s.class_name || ''}${s.parallel && s.parallel !== '0' ? s.parallel : ''}`,
        s.track || '', toStudyYear(s.year), s.phone || '',
        s.birth_date || '',
        `${s.completedReqs}/${s.totalReqs}`,
        String(s.missingRequired),
        s.examAvg != null ? String(s.examAvg.toFixed(1)) : ''
      ];
      if (this.showExtra) this.extraKeys().forEach(k => row.push(s.extra_data?.[k] ?? ''));
      return row;
    });

    const csv = '\uFEFF' + [headers, ...data].map(r =>
      r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `תלמידות_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printTable() {
    window.print();
  }
}

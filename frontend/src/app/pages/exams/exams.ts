import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { toStudyYear } from '../approvals/study-year';
import { collectTrackNames } from '../../utils/track-names';

@Component({
selector: 'app-exams',
imports: [CommonModule, FormsModule],
template: `
<div class="page-header">
<div>
<h1> מבחנים</h1>
<p class="subtitle">הפקת ברקודים למבחנים, סריקה ורישום ציונים</p>
</div>
<button class="btn btn-primary" (click)="openNewExam()">＋ מבחן חדש</button>
</div>

<div class="exams-grid">
<!-- רשימת מבחנים -->
<div class="card">
<div class="section-title"> רשימת מבחנים</div>
<div class="exam-list">
<div *ngFor="let e of exams()" class="exam-row" [class.selected]="selectedExam()?.id === e.id" (click)="selectExam(e)">
<div class="exam-row-info">
<strong>{{ e.name }}</strong>
<span>{{ e.track || 'כל המסלולים' }}{{ e.year ? ' · ' + e.year : '' }} · {{ e.codes_count }} ברקודים</span>
</div>
<div class="exam-row-stats">
<span class="stat graded"> {{ e.graded_count }}</span>
<span class="stat avg" *ngIf="e.avg_grade != null">ממוצע {{ e.avg_grade }}</span>
<button class="del-btn" (click)="deleteExam(e, $event)" title="מחיקה"></button>
</div>
</div>
<div *ngIf="!exams().length" class="empty-state">
<div class="empty-icon"></div>
<p>עדיין אין מבחנים. לחצי על "מבחן חדש"</p>
</div>
</div>

<!-- יצירת מבחן -->
<div *ngIf="creating()" class="new-exam card" style="margin-top:14px; background:var(--surface-2);">
<div class="section-title"> מבחן חדש</div>
<div class="form-group">
<label>שם המבחן *</label>
<input [(ngModel)]="newExam.name" placeholder="לדוגמה: מבחן עברית מחצית א'">
</div>
<div class="form-row">
<div class="form-group">
<label>מסלול (אופציונלי)</label>
<select [(ngModel)]="newExam.track">
<option value="">כל המסלולים</option>
<option *ngFor="let t of trackOptions()" [value]="t">{{ t }}</option>
</select>
</div>
<div class="form-group">
<label>שנה (אופציונלי)</label>
<select [(ngModel)]="newExam.year">
<option value="">כל השנים</option>
<option *ngFor="let y of yearOptions()" [value]="y">{{ toStudyYear(y) }}</option>
</select>
</div>
</div>
<div class="form-group">
<label>תאריך (אופציונלי)</label>
<input type="date" [(ngModel)]="newExam.exam_date">
</div>
<div style="display:flex; gap:8px; margin-top:12px;">
<button class="btn btn-primary" style="flex:1;" (click)="saveExam()">שמור מבחן</button>
<button class="btn btn-secondary" (click)="creating.set(false)">ביטול</button>
</div>
</div>
</div>

<!-- הפקת ברקודים למבחן שנבחר -->
<div class="card" *ngIf="selectedExam()">
<div class="section-title"> הפקת ברקודים — {{ selectedExam()?.name }}
<button class="btn btn-ghost" (click)="exportGradesCsv()" style="margin-right:auto; font-size:0.78rem; padding:4px 12px;">ייצוא ציונים</button>
</div>

<div class="mode-toggle" style="margin-bottom:14px;">
<button [class.active]="printMode()==='class'" (click)="printMode.set('class')"> לכיתה / מסלול</button>
<button [class.active]="printMode()==='personal'" (click)="printMode.set('personal')">‍ ברקוד אישי לתלמידה</button>
</div>

<!-- הפקה לכיתה -->
<div *ngIf="printMode()==='class'">
<p class="mode-desc">הפקת ברקוד אישי לכל תלמידה במסלול/שנה שתבחרי, עבור המבחן הזה.</p>
<div class="form-row">
<div class="form-group">
<label>מסלול</label>
<select [(ngModel)]="classForm.track">
<option [ngValue]="null">כל המסלולים</option>
<option *ngFor="let t of trackOptions()" [ngValue]="t">{{ t }}</option>
</select>
</div>
<div class="form-group">
<label>שנה</label>
<select [(ngModel)]="classForm.year">
<option [ngValue]="null">כל השנים</option>
<option *ngFor="let y of yearOptions()" [ngValue]="y">{{ toStudyYear(y) }}</option>
</select>
</div>
</div>
<button class="btn btn-primary" style="width:100%;" (click)="generateClass()"> הפקה והדפסה לכיתה</button>
</div>

<!-- הפקה אישית -->
<div *ngIf="printMode()==='personal'">
<p class="mode-desc">התלמידה מקבלת בתחילת התקופה דף ובו ברקוד לכל אחד מהמבחנים, ומדביקה ברקוד על כל מבחן.</p>
<div class="form-group">
<label>חיפוש תלמידה</label>
<input [(ngModel)]="studentQuery" (input)="searchStudents()" placeholder="שם או ת.ז...">
</div>
<div class="student-results" *ngIf="studentResults().length">
<div *ngFor="let s of studentResults()" class="student-result-row" (click)="generatePersonal(s)">
<strong>{{ s.name }}</strong>
<span>{{ s.id_number }} · {{ s.track }}{{ s.year ? ' ' + toStudyYear(s.year) : '' }}</span>
</div>
</div>
<p class="hint">לחצי על תלמידה כדי להפיק לה דף ברקודים לכל המבחנים הפעילים.</p>
</div>

<p *ngIf="message()" class="hint" style="color:var(--primary); font-weight:600;">{{ message() }}</p>
<p *ngIf="error()" class="hint" style="color:var(--danger); font-weight:600;">{{ error() }}</p>
</div>

<div class="card" *ngIf="!selectedExam()">
<div class="empty-state">
<div class="empty-icon"></div>
<p>בחרי מבחן מהרשימה כדי להפיק ברקודים</p>
</div>
</div>
</div>

<!-- דשבורד ממוצעים -->
<div class="card" style="margin-top:20px;">
<div class="section-title"> סיכום ציונים</div>
<div class="stats-grid">
<div class="stats-col">
<h4>לפי מבחן</h4>
<table class="stats-table">
<thead><tr><th>מבחן</th><th>נבחנו</th><th>ממוצע</th></tr></thead>
<tbody>
<tr *ngFor="let e of stats()?.byExam || []">
<td>{{ e.name }}</td>
<td>{{ e.graded_count }} / {{ e.codes_count }}</td>
<td [class.missing]="e.avg_grade == null">—</td>
<td *ngIf="e.avg_grade != null">{{ e.avg_grade }}</td>
</tr>
</tbody>
</table>
<p *ngIf="!stats()?.byExam?.length" class="hint">אין נתונים עדיין</p>
</div>
<div class="stats-col">
<h4>תלמידות שטרם נבחנו בכל המבחנים</h4>
<div class="missing-list">
<div *ngFor="let s of missingStudents()" class="missing-row">
<strong>{{ s.name }}</strong>
<span>{{ s.track }}{{ s.year ? ' ' + toStudyYear(s.year) : '' }} · חסרות {{ s.missing }} בדיקות</span>
</div>
</div>
<p *ngIf="!missingStudents().length" class="hint"> כולן נבחנו!</p>
</div>
</div>
</div>
`,
styles: [`
.exams-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 700px) { .exams-grid { grid-template-columns: 1fr; } }

.exam-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.exam-row {
display: flex; align-items: center; justify-content: space-between; gap: 10px;
padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
cursor: pointer; transition: all var(--transition);
&:hover { border-color: var(--primary); background: var(--primary-light); }
}
.exam-row.selected { border-color: var(--primary); background: var(--primary-light); }
.exam-row-info { flex: 1; strong { display: block; font-size: 0.9rem; } span { font-size: 0.75rem; color: var(--text-muted); } }
.exam-row-stats { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; }
.stat { background: var(--surface-2); border-radius: 20px; padding: 3px 10px; font-weight: 700; }
.stat.graded { color: var(--primary); }
.del-btn { border: none; background: transparent; cursor: pointer; opacity: 0.5; &:hover { opacity: 1; } }

.new-exam { border-radius: var(--radius-sm); padding: 14px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;
label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
input, select { height: 38px; padding: 0 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font: inherit; background: var(--surface); }
}

.mode-toggle { display: flex; gap: 6px;
button { flex: 1; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); font: inherit; font-weight: 600; cursor: pointer; font-size: 0.83rem;
&.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } }
}
.mode-desc { font-size: 0.83rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px; }

.student-results { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.student-result-row { padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
strong { display: block; font-size: 0.88rem; } span { font-size: 0.75rem; color: var(--text-muted); }
&:hover { border-color: var(--primary); background: var(--primary-light); } }

.hint { font-size: 0.8rem; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 700px) { .stats-grid { grid-template-columns: 1fr; } }
.stats-col h4 { font-size: 0.9rem; margin-bottom: 10px; color: var(--text); }
.stats-table { width: 100%; font-size: 0.83rem; border-collapse: collapse;
th { text-align: right; color: var(--text-muted); font-size: 0.75rem; padding: 6px 8px; border-bottom: 1.5px solid var(--border); }
td { padding: 7px 8px; border-bottom: 1px solid var(--border); }
td.missing { color: var(--text-light); } }
.missing-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.missing-row { padding: 8px 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 0.83rem;
strong { display: block; } span { font-size: 0.75rem; color: var(--text-muted); } }
`]
})
export class ExamsComponent implements OnInit {
exams = signal<any[]>([]);
selectedExam = signal<any | null>(null);
stats = signal<{ byStudent: any[]; byExam: any[] } | null>(null);
creating = signal(false);
printMode = signal<'class' | 'personal'>('class');
message = signal('');
error = signal('');

newExam = { name: '', track: '', year: '', exam_date: '' };
classForm: { track: string | null; year: string | null } = { track: null, year: null };
studentQuery = '';
studentResults = signal<any[]>([]);
private allStudents = signal<any[]>([]);

toStudyYear = toStudyYear;

constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) { }

ngOnInit() {
this.api.getStudents().subscribe(s => {
this.allStudents.set(s);
this.handleDeepLink();
});
this.loadExams();
}

// נחיתה מהלוח השנתי (?exam=ID&print=1): פותח את המבחן עם המסלול והשנה ממולאים ומדפיס
private handleDeepLink() {
const examId = Number(this.route.snapshot.queryParamMap.get('exam'));
if (!examId) return;
const print = this.route.snapshot.queryParamMap.get('print') === '1';
this.api.getExams().subscribe(exams => {
const exam = exams.find(e => e.id === examId);
if (!exam) return;
this.exams.set(exams);
this.selectedExam.set(exam);
this.classForm = { track: exam.track || null, year: exam.year || null };
if (print) {
this.generateClass();
this.router.navigate([], { queryParams: { exam: null, print: null }, queryParamsHandling: 'merge' });
}
});
}

loadExams() {
this.api.getExams().subscribe(exams => {
this.exams.set(exams);
const sel = this.selectedExam();
if (sel) {
const updated = exams.find(e => e.id === sel.id);
if (updated) this.selectedExam.set(updated);
}
});
this.loadStats();
}

loadStats() {
this.api.getExamStats().subscribe(stats => this.stats.set(stats));
}

trackOptions(): string[] {
  // מסלולים מהתלמידות בפועל (טבלת tracks יכולה להיות ריקה), מסונן מערכי התמחות
  return collectTrackNames(this.allStudents().map(s => s.track))
    .filter(t => !/התמחות/i.test(t));
}

yearOptions(): string[] {
// דה-דופליקציה לפי שם השנה המוצג (למשל 'א' שמופיעה בשני פורמטים בDB)
const seen = new Map<string, string>();
for (const y of this.allStudents().map(s => s.year).filter(Boolean)) {
const label = toStudyYear(y);
if (!seen.has(label)) seen.set(label, y);
}
return [...seen.values()];
}

openNewExam() {
this.newExam = { name: '', track: '', year: '', exam_date: '' };
this.creating.set(true);
}

saveExam() {
if (!this.newExam.name.trim()) return;
this.api.createExam({
name: this.newExam.name.trim(),
track: this.newExam.track.trim() || undefined,
year: this.newExam.year.trim() || undefined,
exam_date: this.newExam.exam_date || undefined
}).subscribe({
next: () => { this.creating.set(false); this.loadExams(); },
error: (e) => this.error.set(e.error?.error || 'שמירה נכשלה')
});
}

deleteExam(e: any, ev: Event) {
ev.stopPropagation();
if (!confirm(`למחוק את המבחן "${e.name}" ואת כל הברקודים והציונים שלו?`)) return;
this.api.deleteExam(e.id).subscribe(() => {
if (this.selectedExam()?.id === e.id) this.selectedExam.set(null);
this.loadExams();
});
}

selectExam(e: any) {
this.selectedExam.set(e);
this.message.set('');
this.error.set('');
}

missingStudents() {
  return (this.stats()?.byStudent || []).filter(s => s.missing > 0);
}

exportGradesCsv() {
  const exam = this.selectedExam();
  if (!exam) return;
  this.api.getExam(exam.id).subscribe((data: any) => {
    const rows = [['תעודת זהות', 'שם', 'ציון', 'תאריך רישום']];
    for (const s of data.students || []) {
      rows.push([s.id_number, s.name, s.grade != null ? String(s.grade) : '', s.graded_at || '']);
    }
    // BOM כדי שהאקסל יזה UTF-8 ויציג עברית תקין
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ציונים - ${exam.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

searchStudents() {
const q = this.studentQuery.trim();
if (q.length < 1) { this.studentResults.set([]); return; }
this.api.getStudents(q).subscribe(list => this.studentResults.set(list.slice(0, 8)));
}

generateClass() {
this.error.set('');
this.message.set('');
this.api.generateExamCodes(this.selectedExam()!.id, {
track: this.classForm.track || undefined,
year: this.classForm.year || undefined
}).subscribe({
next: (r) => {
this.message.set(`הופקו ברקודים ל-${r.created} תלמידות. פותח חלון הדפסה...`);
this.printClassCodes(this.selectedExam()!.name);
this.loadExams();
},
error: (e) => this.error.set(e.error?.error || 'הפקה נכשלה')
});
}

generatePersonal(s: any) {
this.error.set('');
this.message.set('');
this.api.generateExamCodes(this.selectedExam()!.id, { id_number: s.id_number }).subscribe({
next: () => {
// מדפיסים דף עם ברקוד לכל מבחן של התלמידה
this.api.getStudentExams(s.id_number).subscribe(all => {
this.printPersonalSheet(s, all.filter(x => x.exam_id === this.selectedExam()!.id || true));
});
this.loadExams();
},
error: (e) => this.error.set(e.error?.error || 'הפקה נכשלה')
});
}

// הדפסה רק אחרי שכל תמונות הברקוד נטענו — כדי שאף כרטיס לא יצא ריק
private printWhenImagesLoaded(win: Window) {
const imgs = Array.from(win.document.images);
Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
img.onload = img.onerror = () => res(null);
}))).then(() => setTimeout(() => win.print(), 150));
}

printClassCodes(examName: string) {
this.api.getExam(this.selectedExam()!.id).subscribe(exam => {
const base = window.location.origin;
const cards = exam.students.map((s: any) => `
<div class="bc-card">
<div class="bc-name">${s.name}</div>
<div class="bc-exam">${examName}</div>
<img src="${base}/api/exam-codes/${encodeURIComponent(s.code)}/barcode">
<div class="bc-code">${s.code}</div>
</div>`).join('');
const win = window.open('', '_blank', 'width=800,height=900');
win!.document.write(`<html dir="rtl"><head><title>ברקודים — ${examName}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:0;padding:16px;background:white;}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.bc-card{border:1.5px dashed #999;border-radius:10px;padding:12px 8px;text-align:center;page-break-inside:avoid;}
.bc-name{font-weight:800;font-size:15px;}.bc-exam{font-size:11px;color:#555;margin-bottom:6px;}
img{width:82%;min-height:36px;display:block;margin:0 auto;} .bc-code{font-family:monospace;font-size:10px;color:#666;}
@media print{.grid{grid-template-columns:repeat(2,1fr);}}</style></head>
<body><div class="grid">${cards}</div></body></html>`);
win!.document.close();
this.printWhenImagesLoaded(win!);
});
}

printPersonalSheet(s: any, exams: any[]) {
const base = window.location.origin;
const cards = exams.map((x: any) => `
<div class="bc-card">
<div class="bc-name">${x.exam_name}</div>
<img src="${base}/api/exam-codes/${encodeURIComponent(x.code)}/barcode">
<div class="bc-code">${x.code}</div>
</div>`).join('');
const win = window.open('', '_blank', 'width=800,height=900');
win!.document.write(`<html dir="rtl"><head><title>ברקודים — ${s.name}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:0;padding:16px;background:white;}
.header{text-align:center;font-weight:800;font-size:17px;margin-bottom:4px;}
.sub{text-align:center;font-size:12px;color:#555;margin-bottom:14px;}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.bc-card{border:1.5px dashed #999;border-radius:10px;padding:12px 8px;text-align:center;page-break-inside:avoid;}
.bc-name{font-weight:700;font-size:13px;margin-bottom:4px;}
img{width:82%;} .bc-code{font-family:monospace;font-size:10px;color:#666;}
.cut{margin-top:10px;font-size:9px;color:#aaa;text-align:center;}
@media print{.grid{grid-template-columns:repeat(2,1fr);}}</style></head>
<body>
<div class="header">${s.name}</div>
<div class="sub">ברקודים למבחנים — הדביקי כל ברקוד על המבחן המתאים</div>
<div class="grid">${cards}</div>
</body></html>`);
win!.document.close();
this.printWhenImagesLoaded(win!);
}
}

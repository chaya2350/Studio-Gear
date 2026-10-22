import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { formatHebrewDate } from './hebrew-date';
import { toStudyYear } from './study-year';

@Component({
selector: 'app-approvals',
imports: [CommonModule, FormsModule],
template: `
<div class="page-header">
<div>
<h1>אישורים לתלמידות</h1>
<p class="subtitle">הפקת אישורים מותאמים אישית</p>
</div>
</div>

<div class="approvals-grid">
<!-- עמודה שמאל: בחירת תלמידות -->
<div class="card">
<div class="section-title">‍ בחירת תלמידות</div>
<div class="search-bar" style="margin-bottom:14px;">
<span class="search-icon"></span>
<input [(ngModel)]="searchQ" (input)="onSearch()" placeholder="חיפוש לפי שם או ת.ז...">
</div>

<div class="select-actions">
<button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="selectAll()"> בחר הכל ({{ filtered().length }})</button>
<button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="clearAll()"> נקה בחירה</button>
<span class="selected-count" *ngIf="selected().size">{{ selected().size }} נבחרו</span>
</div>

<div class="students-list">
<div *ngFor="let s of filtered()" class="student-row" [class.selected]="selected().has(s.id_number)" (click)="toggle(s.id_number)">
<input type="checkbox" [checked]="selected().has(s.id_number)" (click)="$event.stopPropagation()" (change)="toggle(s.id_number)">
<div class="student-row-info">
<strong>{{ s.name }}</strong>
<span>{{ s.id_number }} · {{ s.track }}{{ toStudyYear(s.year) ? ' ' + toStudyYear(s.year) : '' }}</span>
</div>
</div>
<div *ngIf="!filtered().length" class="empty-state" style="padding:20px 0;">
<div class="empty-icon">‍</div>
<p>לא נמצאו תלמידות</p>
</div>
</div>

<div class="year-row">
<label>שנת לימודים:</label>
<input [(ngModel)]="academicYear" placeholder='תשפ"ז' style="width:120px;">
</div>

<div class="form-group" style="margin-top:16px;">
<label>נוסח האישור — ניתן לעריכה לפני ההדפסה</label>
<textarea [(ngModel)]="approvalText" rows="8"></textarea>
<small class="template-hint">המשתנים שבנוסח יוחלפו אוטומטית בפרטים של כל תלמידה.</small>
</div>
<label class="background-option">
<input type="checkbox" [(ngModel)]="useBlankBackground">
הדפסה על נייר המכתבים (blank)
</label>

<button class="btn btn-primary" style="width:100%; margin-top:16px; padding:14px;"
[disabled]="!selected().size || !selectedType()"
(click)="printApprovals()">
הדפס {{ selected().size }} אישורים
</button>
<p *ngIf="!selected().size || !selectedType()" style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:8px;">
{{ !selected().size ? 'בחרי תלמידות' : 'בחרי סוג אישור מהתפריט למעלה' }}
</p>
</div>

<!-- עמודה ימין: תצוגה מקדימה -->
<div class="card">
<div class="section-title"> תצוגה מקדימה — {{ selectedType()?.name }}</div>
<div class="doc-preview">
<div class="doc-watermark"></div>
<div class="doc-top">
<div class="doc-top-left">
<div class="doc-bsd">בס"ד</div>
<div class="doc-date">{{ todayStr }}</div>
</div>
<img src="/logo.png" class="doc-logo">
</div>
<div class="doc-title">{{ selectedType()?.name || 'סוג אישור' }}</div>
<div class="doc-body" [innerHTML]="previewText()"></div>
<div class="doc-footer">
<div class="doc-sig-block">
<img [src]="selectedType()?.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png'" class="doc-sig-img">
<div class="doc-sig-name">{{ selectedType()?.signature === 'principal' ? 'המנהלת' : 'המזכירות' }}</div>
</div>
<img src="/logo.png" class="doc-footer-logo">
</div>
</div>
</div>
</div>
`,
styles: [`
.approvals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 700px) { .approvals-grid { grid-template-columns: 1fr; } }

.select-actions { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.selected-count { font-size: 0.8rem; font-weight: 700; color: var(--primary); background: var(--primary-light); padding: 3px 10px; border-radius: 20px; }

.students-list { max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.student-row {
display: flex; align-items: center; gap: 10px; padding: 10px 12px;
border-radius: var(--radius-sm); border: 1.5px solid var(--border);
cursor: pointer; transition: all var(--transition);
&:hover { border-color: var(--primary); background: var(--primary-light); }
}
.student-row.selected { border-color: var(--primary); background: var(--primary-light); }
.student-row-info { flex: 1; strong { display: block; font-size: 0.9rem; } span { font-size: 0.75rem; color: var(--text-muted); } }

.doc-preview {
position: relative; background: white; border: 1px solid var(--border);
border-radius: var(--radius-sm); padding: 18px 20px 14px 20px;
overflow: hidden; min-height: 380px; display: flex; flex-direction: column;
box-shadow: var(--shadow-sm);
}
.doc-watermark {
position: absolute; left: 0; top: 0; bottom: 0; width: 14px;
background: linear-gradient(180deg, #f0ece8 0%, #d4c8bc 30%, #b8a898 60%, #d4c8bc 80%, #f0ece8 100%);
opacity: 0.7;
}
.doc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.doc-top-left { display: flex; flex-direction: column; gap: 2px; }
.doc-bsd { font-size: 0.72rem; font-weight: 700; color: #333; }
.doc-date { font-size: 0.7rem; color: #555; }
.doc-logo { height: 48px; width: auto; }
.doc-title { font-size: 1.2rem; font-weight: 900; text-align: center; margin-bottom: 12px; color: #1a1a1a; }
.doc-body { font-size: 0.88rem; line-height: 1.65; text-align: right; color: #1a1a1a; flex: 1; }
.doc-body p { margin: 0; }
.doc-body p.ap-spacer { height: 2mm; font-size: 0; line-height: 0; }
.doc-footer { margin-top: 14px; display: flex; justify-content: flex-start; align-items: flex-end; gap: 12px; }
.doc-sig-block { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.doc-sig-img { height: 40px; width: auto; }
.doc-sig-name { font-size: 0.68rem; color: #555; }
.doc-footer-logo { height: 28px; width: auto; opacity: 0.6; margin-right: auto; }

.year-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 0.875rem; font-weight: 600; }
.form-group textarea {
width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm);
background: var(--surface-2); padding: 10px 12px; font: inherit; line-height: 1.7; resize: vertical;
}
.template-hint { display: block; margin-top: 5px; color: var(--text-muted); line-height: 1.5; }
.background-option { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.85rem; }
`]
})
export class ApprovalsComponent implements OnInit {
all = signal<any[]>([]);
filtered = signal<any[]>([]);
types = signal<any[]>([]);
selected = signal<Set<string>>(new Set());
selectedType = signal<any | null>(null);
searchQ = '';
academicYear = 'תשפ"ז';
todayStr = new Date().toLocaleDateString('he-IL');
approvalText = '';
useBlankBackground = true;
toStudyYear = toStudyYear;

constructor(private api: ApiService, private route: ActivatedRoute) {}

ngOnInit() {
this.api.getStudents().subscribe(s => { this.all.set(s); this.filtered.set(s); });
combineLatest([
this.api.getApprovalTypes(),
this.route.queryParams
]).subscribe(([types, p]) => {
this.types.set(types);
const id = p['type'] ? +p['type'] : null;
const regularTypes = types.filter((t: any) => t.type !== 'single');
const found = id ? types.find((t: any) => t.id === id) : regularTypes[0];
if (found) {
if (found.id !== this.selectedType()?.id) this.approvalText = found.template || '';
this.selectedType.set(found);
}
});
}

onSearch() {
const q = this.searchQ.trim().toLowerCase();
this.filtered.set(q ? this.all().filter(s => s.name.includes(q) || s.id_number.includes(q)) : this.all());
}

toggle(id: string) {
const s = new Set(this.selected());
s.has(id) ? s.delete(id) : s.add(id);
this.selected.set(s);
}

selectAll() { this.selected.set(new Set(this.filtered().map(s => s.id_number))); }
clearAll() { this.selected.set(new Set()); }

previewText(): string {
const t = this.selectedType();
if (!t) return '';
const first = this.all().find(s => this.selected().has(s.id_number));
return this.fillTemplate(this.approvalText, first)
.split('\n')
.map((line: string) => line.trim()
? `<p>${line.trim()}</p>`
: '<p class="ap-spacer"></p>')
.join('');
}

fillTemplate(template: string, student: any): string {
// מצפין את הנוסח (כולל טקסט חופשי) ואז מחליף את המשתנים בערכים מוצפנים מהמסד.
// השם והת"ז עטופים ב-<strong> — התגים מוחדרים אחרי ההצפנה, כך שהם נשמרים.
// חשוב: לקרוא לפונקציה פעם אחת בלבד לכל נוסח — קריאה כפולה תהפוך את התגים לטקסט גלוי.
const esc = (v: unknown) => this.escapeHtml(String(v ?? ''));
const studyYear = toStudyYear(student?.year);
const track = student ? `${student.track || ''}${studyYear ? ' ' + studyYear : ''}` : '';
return esc(template)
.replace(/{{שם}}/g, `<strong>${esc(student?.name) || 'שם התלמידה'}</strong>`)
.replace(/{{תז}}/g, `<strong>${esc(student?.id_number) || '000000000'}</strong>`)
.replace(/{{שנה}}/g, esc(this.academicYear))
.replace(/{{מסלול}}/g, esc(track) || 'מסלול לימודים')
.replace(/{{תאריך לידה}}/g, esc(student?.birth_date) || '___')
.replace(/{{כתובת}}/g, esc(student?.address) || '___');
}

printApprovals() {
const type = this.selectedType();
if (!type || !this.selected().size) return;

const students = this.all().filter(s => this.selected().has(s.id_number));
if (!students.length) return;
const today = new Date();
const dateHe = today.toLocaleDateString('he-IL');
const hebrewDate = this.getHebrewDate();

const assetUrl = (path: string) => new URL(path, window.location.origin).href;
const pages = students.map(s => {
const text = this.fillTemplate(this.approvalText, s)
.split('\n')
.map((line: string) => line.trim()
? `<p>${line.trim()}</p>`
: '<p class="ap-spacer"></p>')
.join('');

const sig = type.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png';
const sigName = type.signature === 'principal' ? 'המנהלת' : 'המזכירות';

return `
<div class="approval-page">
${this.useBlankBackground ? `<img src="${assetUrl('/blank-background.png')}" class="ap-background" alt="">` : ''}
<div class="ap-content">
<div class="ap-top">
<div class="ap-top-left">
<div class="ap-bsd">בס"ד</div>
<div class="ap-date-he">${hebrewDate}</div>
<div class="ap-date">${dateHe}</div>
</div>
</div>
<div class="ap-title">${this.escapeHtml(type.name)}</div>
<div class="ap-body">${text}</div>
<div class="ap-footer">
<div class="ap-sig-block">
<img src="${assetUrl(sig)}" class="ap-sig-img">
<div class="ap-sig-name">${sigName}</div>
</div>
</div>
</div>
</div>
`;
}).join('<div class="page-break"></div>');
const firstStudentName = students[0].name;
const additionalStudents = students.length - 1;
const documentTitle = `${type.name} - ${firstStudentName}${additionalStudents ? ` ועוד ${additionalStudents}` : ''}`;

const win = window.open('', '_blank', 'width=800,height=900');
if (!win) return;
win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
<title>${this.escapeHtml(documentTitle)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; background: white; direction: rtl; }
html, body { margin: 0; }
.approval-page {
width: 148mm; height: 210mm; padding: 10mm 12mm;
display: flex; flex-direction: column; position: relative; overflow: hidden;
break-inside: avoid; page-break-inside: avoid; isolation: isolate;
}
.ap-background { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: fill; }
.ap-content { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ap-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; padding-bottom: 4mm; }
.ap-top-left { display: flex; flex-direction: column; gap: 3px; text-align: right; }
.ap-bsd { font-size: 0.8rem; color: #333; font-weight: 700; }
.ap-date { font-size: 0.78rem; color: #444; }
.ap-date-he { direction: rtl; unicode-bidi: isolate; text-align: right; font-size: 0.75rem; color: #555; }
.ap-title { font-size: 1.45rem; font-weight: 900; text-align: center; margin-bottom: 5mm; color: #1a1a1a; letter-spacing: -0.5px; }
.ap-body { font-size: 0.92rem; line-height: 1.65; text-align: right; color: #1a1a1a; flex: 1; padding-right: 3mm; }
.ap-body p { margin: 0; }
.ap-body p.ap-spacer { height: 2mm; font-size: 0; line-height: 0; }
.ap-footer { margin-top: 0; display: flex; justify-content: flex-start; align-items: flex-end; gap: 8mm; }
.ap-sig-block { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.ap-sig-img { height: 46px; width: auto; }
.ap-sig-name { font-size: 0.68rem; color: #444; }
.page-break { page-break-after: always; }
@media print {
@page { size: A5 portrait; margin: 0; }
html, body { width: 148mm; margin: 0; }
.approval-page { width: 148mm; height: 210mm; margin: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page-break { page-break-after: always; break-after: page; }
}
</style></head><body>
${pages}
</body></html>`);
win.document.close();
Promise.all(Array.from(win.document.images).map(image => image.decode()))
.then(() => win.print())
.catch(error => {
console.error('Could not load approval print images', error);
win.alert('לא ניתן לטעון את תמונת הרקע או החתימה. בדקי שהקבצים קיימים בתיקיית public והדפיסי שוב.');
});
}

escapeHtml(value: string): string {
return value.replace(/[&<>"']/g, char => ({
'&': '&amp;',
'<': '&lt;',
'>': '&gt;',
'"': '&quot;',
"'": '&#39;'
})[char]!);
}

getHebrewDate(): string {
return formatHebrewDate(new Date());
}
}

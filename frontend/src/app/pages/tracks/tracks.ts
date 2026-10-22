import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Track, TrackRequirement, TracksOverview, TrackStats } from '../../services/api.service';

@Component({
selector: 'app-tracks',
imports: [CommonModule, FormsModule, RouterLink],
template: `
<div class="tracks-header">
<p class="help">
הגדרת הדרישות של כל מסלול. הדרישות מופיעות אוטומטית בדף של כל תלמידה במסלול.
לחצי על מסלול כדי לפתוח או לסגור אותו.
</p>
</div>

<div *ngIf="error()" class="alert alert-error" role="alert"> {{ error() }}</div>
<div *ngIf="notice()" class="alert alert-success" role="status"> {{ notice() }}</div>

<div class="card new-track">
<div class="section-title"> מסלול חדש</div>
<form class="inline-form" (ngSubmit)="addTrack()">
<input
name="newTrack"
[(ngModel)]="newTrackName"
placeholder="שם המסלול, בדיוק כפי שמופיע אצל התלמידות"
aria-label="שם מסלול חדש"
/>
<button class="btn btn-primary" type="submit">הוספה</button>
</form>
</div>

<div *ngIf="overview()?.tracks?.length" class="card bulk-card">
<div class="section-title"> הוספת דרישה לכמה מסלולים</div>
<p class="help">כתבי דרישה פעם אחת ובחרי לאילו מסלולים להוסיף אותה.</p>
<form (ngSubmit)="addBulkRequirement()">
<div class="inline-form">
<input
name="bulkTitle"
[(ngModel)]="bulkTitle"
placeholder="למשל: 12 שנות לימוד"
aria-label="שם הדרישה"
/>
<label class="check">
<input type="checkbox" name="bulkRequired" [(ngModel)]="bulkRequired" /> חובה
</label>
<label class="check">
<input type="checkbox" name="bulkFile" [(ngModel)]="bulkFile" /> דורש קובץ
</label>
<span class="check years">
שנה:
<label *ngFor="let y of yearOptions" class="check">
<input type="checkbox" [name]="'bulkYear' + y" [checked]="bulkYears.includes(y)" (change)="toggleYear(bulkYears, y, $any($event.target).checked)" /> {{ y }}
</label>
</span>
</div>
<div class="bulk-tracks">
<label class="check select-all">
<input
type="checkbox"
name="bulkAll"
[checked]="allBulkSelected()"
(change)="toggleAllBulk($any($event.target).checked)"
/>
כל המסלולים
</label>
<label *ngFor="let t of overview()!.tracks" class="check bulk-track">
<input
type="checkbox"
[name]="'bulk' + t.id"
[checked]="bulkSelected().has(t.id)"
(change)="toggleBulk(t.id, $any($event.target).checked)"
/>
{{ t.name }}
</label>
</div>
<button class="btn btn-primary" type="submit" [disabled]="!bulkSelected().size">
הוספה ל-{{ bulkSelected().size }} מסלולים
</button>
</form>
</div>

<div *ngIf="overview()?.undefined_tracks?.length" class="card undefined-tracks">
<div class="section-title"> מסלולים של תלמידות שעדיין לא הוגדרו</div>
<p class="help">לחצי על מסלול כדי להגדיר אותו ולהוסיף לו דרישות.</p>
<div class="chips">
<button
*ngFor="let t of overview()!.undefined_tracks"
class="chip"
type="button"
(click)="defineTrack(t.name)"
>
{{ t.name }} <span>{{ t.student_count }}</span>
</button>
</div>
</div>

<div *ngIf="overview() && !overview()!.tracks.length" class="empty-state">
<div class="empty-icon"></div>
<p>עדיין לא הוגדרו מסלולים</p>
</div>

<div class="tracks-grid">
<div *ngFor="let track of overview()?.tracks" class="card track-card" [class.open]="isOpen(track.id)">
<button
class="track-toggle"
type="button"
(click)="toggleOpen(track.id)"
[attr.aria-expanded]="isOpen(track.id)"
>
<span class="chevron">{{ isOpen(track.id) ? '▾' : '◂' }}</span>
<span class="track-name">{{ track.name }}</span>
<span class="count">
<ng-container *ngIf="track.merged_into"> מאוחד ל{{ track.merged_into_name }} · {{ track.own_student_count }} תלמידות</ng-container>
<ng-container *ngIf="!track.merged_into">{{ track.student_count }} תלמידות · {{ track.requirements.length }} דרישות</ng-container>
</span>
</button>

<div *ngIf="isOpen(track.id)" class="track-body">
<div class="track-head">
<form *ngIf="renamingId() === track.id" class="inline-form" (ngSubmit)="saveRename(track)">
<input name="rename" [(ngModel)]="renameDraft" aria-label="שם המסלול" />
<button class="btn btn-primary" type="submit">שמירה</button>
<button class="btn btn-secondary" type="button" (click)="renamingId.set(null)">ביטול</button>
</form>
<div *ngIf="renamingId() !== track.id" class="actions">
<button *ngIf="!track.merged_into" class="btn btn-secondary" type="button" (click)="toggleStats(track)">
סטטיסטיקה
</button>
<button class="btn btn-secondary" type="button" (click)="startMerge(track)"> איחוד</button>
<button class="btn btn-secondary" type="button" (click)="startRename(track)"> שינוי שם</button>
<button class="btn btn-danger" type="button" (click)="removeTrack(track)"> מחיקה</button>
</div>
</div>

<div *ngIf="track.merged_from.length" class="merge-note">
כולל גם את המסלולים: {{ mergedNames(track) }}
</div>
<div *ngIf="track.merged_into" class="merge-note">
מסלול זה מאוחד ל<b>{{ track.merged_into_name }}</b>: התלמידות שלו מקבלות את הדרישות של המסלול הראשי
ומופיעות יחד איתו. השם במערכת נשאר "{{ track.name }}".
<button class="btn btn-secondary" type="button" (click)="unmerge(track)">ביטול איחוד</button>
</div>
<form *ngIf="mergingId() === track.id" class="inline-form merge-form" (ngSubmit)="saveMerge(track)">
<label for="mergeTarget">לאחד עם:</label>
<select id="mergeTarget" name="mergeTarget" [(ngModel)]="mergeTargetId">
<option [ngValue]="null" disabled>בחרי מסלול ראשי...</option>
<option *ngFor="let t of mergeOptions(track)" [ngValue]="t.id">{{ t.name }}</option>
</select>
<button class="btn btn-primary" type="submit" [disabled]="mergeTargetId === null">שמירה</button>
<button class="btn btn-secondary" type="button" (click)="mergingId.set(null)">ביטול</button>
<span *ngIf="!mergeOptions(track).length" class="help">אין מסלול זמין לאיחוד</span>
</form>

<ng-container *ngIf="!track.merged_into">
<div *ngIf="stats()?.id === track.id && stats()!.data as s" class="stats">
<div class="stats-title"> {{ s.total_students }} תלמידות במסלול</div>
<div *ngFor="let r of s.requirements" class="stat-row">
<div class="stat-label">
{{ r.title }} <span *ngIf="r.requires_file"></span>
<span *ngIf="r.years" class="badge badge-optional">שנה {{ yearsLabel(r.years) }}</span>
<span class="stat-num">{{ r.completed_count }} / {{ r.applicable_count }}</span>
</div>
<div class="bar"><div class="bar-fill" [style.width.%]="percent(r.completed_count, r.applicable_count)"></div></div>
</div>
<div *ngIf="!s.requirements.length" class="no-reqs">אין דרישות להצגה</div>
<div *ngIf="s.students.length && s.requirements.length" class="table-wrap">
<table class="stats-table">
<thead>
<tr>
<th>תלמידה</th>
<th *ngFor="let r of s.requirements" [title]="r.title">{{ r.title }}</th>
<th>חסר חובה</th>
</tr>
</thead>
<tbody>
<tr *ngFor="let st of s.students">
<td><a [routerLink]="['/students', st.id_number]">{{ st.name }}</a></td>
<td *ngFor="let r of s.requirements" class="mark">{{ !st.applicable.includes(r.id) ? '·' : st.completed.includes(r.id) ? '' : '—' }}</td>
<td [class.missing]="st.missing_required">{{ st.missing_required }}</td>
</tr>
</tbody>
</table>
</div>
</div>

<div *ngIf="!track.requirements.length" class="no-reqs">עדיין לא הוגדרו דרישות למסלול הזה</div>

<div *ngFor="let req of track.requirements" class="req-row">
<form *ngIf="editingReqId() === req.id" class="inline-form" (ngSubmit)="saveRequirement(req)">
<input name="reqTitle" [(ngModel)]="reqDraft.title" aria-label="שם הדרישה" />
<label class="check">
<input type="checkbox" name="reqRequired" [(ngModel)]="reqDraft.required" /> חובה
</label>
<label class="check">
<input type="checkbox" name="reqFile" [(ngModel)]="reqDraft.requires_file" /> קובץ
</label>
<span class="check years">
שנה:
<label *ngFor="let y of yearOptions" class="check">
<input type="checkbox" [name]="'editYear' + y" [checked]="reqDraft.years.includes(y)" (change)="toggleYear(reqDraft.years, y, $any($event.target).checked)" /> {{ y }}
</label>
</span>
<button class="btn btn-primary" type="submit">שמירה</button>
<button class="btn btn-secondary" type="button" (click)="editingReqId.set(null)">ביטול</button>
</form>
<ng-container *ngIf="editingReqId() !== req.id">
<span class="req-title">{{ req.title }}</span>
<span class="badge" [class.badge-optional]="!req.required">
{{ req.required ? 'חובה' : 'רשות' }}
</span>
<span *ngIf="req.requires_file" class="badge badge-optional"> קובץ</span>
<span *ngIf="req.years" class="badge badge-optional">שנה {{ yearsLabel(req.years) }}</span>
<button class="icon-btn" type="button" (click)="startEditRequirement(req)" aria-label="עריכת דרישה"> </button>
<button class="icon-btn" type="button" (click)="removeRequirement(req)" aria-label="מחיקת דרישה"></button>
</ng-container>
</div>

<form class="inline-form add-req" (ngSubmit)="addRequirement(track)">
<input
[name]="'newReq' + track.id"
[(ngModel)]="newReqTitles[track.id]"
placeholder="דרישה חדשה, למשל: 12 שנות לימוד"
aria-label="דרישה חדשה"
/>
<label class="check">
<input type="checkbox" [name]="'newFile' + track.id" [(ngModel)]="newReqFile[track.id]" /> קובץ
</label>
<span class="check years">
שנה:
<label *ngFor="let y of yearOptions" class="check">
<input type="checkbox" [name]="'newYear' + track.id + y" [checked]="newYears(track.id).includes(y)" (change)="toggleYear(newYears(track.id), y, $any($event.target).checked)" /> {{ y }}
</label>
</span>
<button class="btn btn-secondary" type="submit"> הוספת דרישה</button>
</form>
</ng-container>
</div>
</div>
</div>
`,
styles: [
`
.card { margin-bottom: 20px; }
:host { display: block; }
.tracks-header { margin-bottom: 16px; }
.bulk-card { max-width: 700px; }
.bulk-tracks { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 14px 0; }
.select-all { font-weight: 700; width: 100%; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.bulk-track { cursor: pointer; }
.new-track, .undefined-tracks { max-width: 700px; }
.help { color: var(--text-muted); font-size: 0.85rem; margin: -4px 0 12px; }
.inline-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: 1; }
input:not([type='checkbox']) {
flex: 1; min-width: 180px; padding: 10px 14px; border: 1.5px solid var(--border);
border-radius: var(--radius-sm); font-size: 0.93rem; font-family: inherit; direction: rtl;
background: var(--surface); color: var(--text);
transition: border-color var(--transition), box-shadow var(--transition);
}
input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.merge-note {
background: var(--primary-light); color: var(--text); border-radius: var(--radius-sm);
padding: 10px 14px; margin-bottom: 12px; font-size: 0.88rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
}
.merge-form { margin-bottom: 14px; }
select {
padding: 10px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
font: inherit; background: var(--surface); color: var(--text); min-width: 180px;
}
.chip {
border: 1.5px solid var(--border-focus); background: var(--primary-light); color: var(--primary);
border-radius: 20px; padding: 6px 14px; font: inherit; font-weight: 700; cursor: pointer;
}
.chip span { background: var(--surface); border-radius: 10px; padding: 1px 8px; margin-inline-start: 4px; font-size: 0.78rem; }
.tracks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; align-items: start; }
@media (max-width: 480px) { .tracks-grid { grid-template-columns: 1fr; } }
.track-card { margin-bottom: 0; padding: 0; overflow: hidden; }
.track-card.open { border-color: var(--border-focus); box-shadow: var(--shadow); }
.track-toggle {
display: flex; align-items: center; gap: 10px; width: 100%; padding: 16px 20px;
background: none; border: none; cursor: pointer; font: inherit; color: var(--text); text-align: start;
transition: background var(--transition);
}
.track-toggle:hover { background: var(--primary-light); }
.chevron { color: var(--primary); font-size: 1.1rem; width: 16px; }
.track-name { flex: 1; font-weight: 800; font-size: 1.05rem; }
.track-body { padding: 4px 20px 20px; border-top: 1px solid var(--border); }
.track-head { display: flex; justify-content: flex-end; margin: 14px 0; }
.count { color: var(--text-muted); font-size: 0.8rem; }
.actions { display: flex; gap: 6px; }
.no-reqs { color: var(--text-muted); font-size: 0.88rem; padding: 10px 0; }
.req-row {
display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin-bottom: 8px;
background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.req-title { flex: 1; font-weight: 600; }
.badge { background: #fee2e2; color: #b91c1c; }
.badge-optional { background: var(--primary-light); color: var(--primary); }
.icon-btn { border: none; background: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 6px; }
.icon-btn:hover { background: var(--border); }
.check { display: flex; align-items: center; gap: 4px; font-size: 0.85rem; white-space: nowrap; }
.add-req { margin-top: 12px; }
.stats { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 14px; }
.stats-title { font-weight: 800; margin-bottom: 10px; }
.stat-row { margin-bottom: 10px; }
.stat-label { display: flex; gap: 6px; font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
.stat-num { margin-inline-start: auto; color: var(--text-muted); }
.bar { height: 10px; background: var(--border); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); border-radius: 6px; }
.table-wrap { overflow-x: auto; margin-top: 12px; }
.stats-table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.stats-table th, .stats-table td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: start; }
.stats-table .mark { text-align: center; }
.missing { color: #b91c1c; font-weight: 700; }
`,
],
})
export class TracksComponent implements OnInit {
overview = signal<TracksOverview | null>(null);
error = signal('');
notice = signal('');
openIds = signal<Set<number>>(new Set());
bulkSelected = signal<Set<number>>(new Set());
bulkTitle = '';
bulkRequired = true;
bulkFile = false;
stats = signal<{ id: number; data: TrackStats | null } | null>(null);
renamingId = signal<number | null>(null);
editingReqId = signal<number | null>(null);
newTrackName = '';
renameDraft = '';
reqDraft: { title: string; required: boolean; requires_file: boolean; years: string[] } = {
title: '', required: true, requires_file: false, years: [],
};
yearOptions = ['ה', 'ו'];
bulkYears: string[] = [];
newReqYears: Record<number, string[]> = {};

newYears(trackId: number) {
return (this.newReqYears[trackId] ||= []);
}

toggleYear(list: string[], year: string, checked: boolean) {
const i = list.indexOf(year);
if (checked && i < 0) list.push(year);
if (!checked && i >= 0) list.splice(i, 1);
}

yearsLabel(years: string) {
return years.split(',').join(' / ');
}
newReqTitles: Record<number, string> = {};
newReqFile: Record<number, boolean> = {};
mergingId = signal<number | null>(null);
mergeTargetId: number | null = null;

mergedNames(track: Track) {
return track.merged_from.map((m) => m.name).join(', ');
}

// Only main tracks can be targets, and a track that others are merged into cannot itself be merged
mergeOptions(track: Track) {
if (track.merged_from.length) return [];
return (this.overview()?.tracks || []).filter((t) => t.id !== track.id && !t.merged_into);
}

startMerge(track: Track) {
this.mergeTargetId = track.merged_into;
this.mergingId.set(track.id);
}

saveMerge(track: Track) {
if (this.mergeTargetId === null) return;
this.run(this.api.mergeTrack(track.id, this.mergeTargetId), () => {
this.mergingId.set(null);
this.stats.set(null);
});
}

unmerge(track: Track) {
this.run(this.api.mergeTrack(track.id, null));
}

percent(done: number, total: number) {
return total ? Math.round((done / total) * 100) : 0;
}

toggleStats(track: Track) {
if (this.stats()?.id === track.id) {
this.stats.set(null);
return;
}
this.error.set('');
this.stats.set({ id: track.id, data: null });
this.api.getTrackStats(track.id).subscribe({
next: (data) => this.stats.set({ id: track.id, data }),
error: (e) => {
this.stats.set(null);
this.error.set(e.error?.error || 'לא ניתן לטעון סטטיסטיקה');
},
});
}

constructor(private api: ApiService) {}

ngOnInit() {
this.load();
}

private load() {
this.api.getTracks().subscribe({
next: (data) => {
this.overview.set(data);
const existing = new Set(data.tracks.map((t) => t.id));
this.bulkSelected.set(new Set([...this.bulkSelected()].filter((id) => existing.has(id))));
},
error: (e) => this.error.set(e.error?.error || 'לא ניתן לטעון את המסלולים'),
});
}

isOpen(id: number) {
return this.openIds().has(id);
}

toggleOpen(id: number) {
const next = new Set(this.openIds());
if (!next.delete(id)) next.add(id);
this.openIds.set(next);
this.renamingId.set(null);
this.editingReqId.set(null);
}

private open(id: number) {
this.openIds.set(new Set(this.openIds()).add(id));
}

private run(
action: { subscribe: (o: { next: (result: any) => void; error: (e: any) => void }) => unknown },
after?: (result: any) => void,
) {
this.error.set('');
this.notice.set('');
action.subscribe({
next: (result) => {
after?.(result);
this.load();
},
error: (e) => this.error.set(e.error?.error || 'הפעולה נכשלה'),
});
}

allBulkSelected() {
const tracks = this.overview()?.tracks || [];
return tracks.length > 0 && tracks.every((t) => this.bulkSelected().has(t.id));
}

toggleBulk(id: number, checked: boolean) {
const next = new Set(this.bulkSelected());
if (checked) next.add(id);
else next.delete(id);
this.bulkSelected.set(next);
}

toggleAllBulk(checked: boolean) {
this.bulkSelected.set(new Set(checked ? (this.overview()?.tracks || []).map((t) => t.id) : []));
}

addBulkRequirement() {
const title = this.bulkTitle.trim();
const ids = [...this.bulkSelected()];
if (!title) {
this.error.set('יש לכתוב את שם הדרישה');
return;
}
if (!ids.length) return;
this.error.set('');
this.notice.set('');
this.api.createRequirementForTracks({ title, required: this.bulkRequired, requires_file: this.bulkFile, years: this.bulkYears, track_ids: ids }).subscribe({
next: (result) => {
this.notice.set(
result.skipped
? `הדרישה נוספה ל-${result.added} מסלולים. ב-${result.skipped} מסלולים היא כבר קיימת.`
: `הדרישה נוספה ל-${result.added} מסלולים.`,
);
this.bulkTitle = '';
this.bulkYears = [];
this.bulkSelected.set(new Set());
this.load();
},
error: (e) => this.error.set(e.error?.error || 'הפעולה נכשלה'),
});
}

addTrack() {
const name = this.newTrackName.trim();
if (!name) return;
this.run(this.api.createTrack(name), (created) => {
this.newTrackName = '';
this.open(created.id);
});
}

defineTrack(name: string) {
this.run(this.api.createTrack(name), (created) => this.open(created.id));
}

startRename(track: Track) {
this.renameDraft = track.name;
this.renamingId.set(track.id);
}

saveRename(track: Track) {
this.run(this.api.renameTrack(track.id, this.renameDraft), () => this.renamingId.set(null));
}

removeTrack(track: Track) {
const note = track.requirements.length ? ' כל הדרישות שלו והסימונים של התלמידות יימחקו.' : '';
if (!confirm(`למחוק את המסלול "${track.name}"?${note} התלמידות עצמן לא יימחקו.`)) return;
this.run(this.api.deleteTrack(track.id));
}

addRequirement(track: Track) {
const title = (this.newReqTitles[track.id] || '').trim();
if (!title) return;
this.run(this.api.createTrackRequirement(track.id, { title, required: true, requires_file: !!this.newReqFile[track.id], years: this.newYears(track.id) }), () => {
this.newReqTitles[track.id] = '';
this.newReqFile[track.id] = false;
this.newReqYears[track.id] = [];
});
}

startEditRequirement(req: TrackRequirement) {
this.reqDraft = { title: req.title, required: !!req.required, requires_file: !!req.requires_file, years: req.years ? req.years.split(',') : [] };
this.editingReqId.set(req.id);
}

saveRequirement(req: TrackRequirement) {
this.run(this.api.updateTrackRequirement(req.id, this.reqDraft), () => this.editingReqId.set(null));
}

removeRequirement(req: TrackRequirement) {
if (!confirm(`למחוק את הדרישה "${req.title}"? הסימונים של התלמידות לדרישה הזו יימחקו.`)) return;
this.run(this.api.deleteTrackRequirement(req.id));
}
}

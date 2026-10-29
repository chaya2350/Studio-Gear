import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Student } from '../../models';

@Component({
selector: 'app-student-search',
imports: [CommonModule, FormsModule, RouterLink],
template: `
<div class="search-page">
<div class="search-hero">
<div class="hero-icon"></div>
<h1>חיפוש תלמידות לפי שם / ת.ז.</h1>
<p class="subtitle">הקלד שם או ת.ז. לחיפוש תלמידה</p>
</div>

<div class="search-card">
<div class="search-input-wrap" [class.focused]="focused" style="position:relative;">
<span class="search-icon"></span>
<input
[(ngModel)]="query"
placeholder="שם או מספר ת.ז..."
(ngModelChange)="onInput()"
(keydown.escape)="suggestions.set([])"
(focus)="focused=true"
(blur)="onBlur()"
autocomplete="off"
autofocus
>
<button class="clear-btn" *ngIf="query" (click)="query=''; suggestions.set([]); selected.set(null)"></button>

<!-- dropdown -->
<div *ngIf="suggestions().length" class="suggestions">
<div *ngFor="let s of suggestions()" class="suggestion-item" (mousedown)="select(s)">
<div class="sug-avatar" [style.background]="sugAvatarColor(s)">
  <img *ngIf="s.photo_url" [src]="s.photo_url" class="sug-avatar-img" [alt]="s.name">
  <span *ngIf="!s.photo_url">{{ s.name.charAt(0) }}</span>
</div>
<div>
  <div class="sug-name">{{ s.name }}</div>
  <div class="sug-meta">{{ s.id_number }}<span *ngIf="s.track"> · {{ s.track }}{{ s.year ? ' ' + s.year : '' }}</span></div>
</div>
</div>
</div>
</div>

<!-- תוצאה נבחרת -->
<div *ngIf="selected()" class="result-card">

<!-- Photo popup -->
<div *ngIf="photoOpen" class="photo-popup-backdrop" (click)="photoOpen=false">
  <div class="photo-popup" (click)="$event.stopPropagation()">
    <img [src]="selected()!.photo_url!" [alt]="selected()!.name" class="photo-popup-img">
    <div class="photo-popup-name">{{ selected()!.name }}</div>
    <button class="photo-popup-close" (click)="photoOpen=false">✕</button>
  </div>
</div>

<div class="result-header">
  <div class="result-avatar" [style.background]="avatarColor()"
       [class.clickable]="!!selected()!.photo_url"
       (click)="selected()!.photo_url && (photoOpen=true)">
    <img *ngIf="selected()!.photo_url" [src]="selected()!.photo_url" class="result-avatar-img" [alt]="selected()!.name">
    <span *ngIf="!selected()!.photo_url">{{ selected()!.name.charAt(0) }}</span>
    <span *ngIf="selected()!.photo_url" class="zoom-hint">🔍</span>
  </div>
<div class="result-info">
<div class="result-name">{{ selected()!.name }}</div>
<div class="result-meta">
<span> {{ selected()!.id_number }}</span>
<span *ngIf="selected()!.track"> {{ selected()!.track }}{{ selected()!.year ? ' ' + selected()!.year : '' }}</span>
<span *ngIf="selected()!.phone"> {{ selected()!.phone }}</span>
</div>
</div>
<div class="result-badges">
<span class="badge" [class]="activeCount() > 0 ? 'badge-loaned' : 'badge-available'">
{{ activeCount() > 0 ? activeCount() + ' פעילות' : 'אין פעילות' }}
</span>
<span *ngIf="overdueCount() > 0" class="badge badge-overdue"> {{ overdueCount() }} איחור</span>
</div>
</div>

<div *ngIf="activeLoans().length" class="active-loans">
<div class="loans-label"> השאלות פעילות</div>
<div *ngFor="let l of activeLoans()" class="loan-chip" [class.overdue]="isOverdue(l)">
<span class="loan-chip-name">{{ l.equipment_name }}</span>
<span class="loan-chip-date" [style.color]="isOverdue(l) ? 'var(--danger)' : 'var(--text-muted)'">עד {{ l.expected_return }}</span>
</div>
</div>

<a [routerLink]="['/students', selected()!.id_number]" class="view-full-btn">צפייה מלאה →</a>
</div>
</div>
</div>
`,
styles: [`
.search-page { max-width: 480px; margin: 60px auto 0; display: flex; flex-direction: column; align-items: center; gap: 32px; }
.search-hero { text-align: center; }
.hero-icon { font-size: 3.5rem; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(13,148,136,0.2)); }
h1 { margin: 0 0 8px; font-size: 1.6rem; }
.subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
.search-card {
width: 100%; background: var(--surface); border: 1.5px solid var(--border);
border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow);
display: flex; flex-direction: column; gap: 14px;
}
.search-input-wrap {
display: flex; align-items: center; gap: 10px;
background: var(--surface-2); border: 1.5px solid var(--border);
border-radius: var(--radius-sm); padding: 0 14px; height: 52px;
transition: all 0.18s;
&.focused { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px var(--primary-glow); }
}
.search-icon { font-size: 1.1rem; flex-shrink: 0; }
input {
flex: 1; border: none; background: transparent; font-size: 1rem;
font-family: inherit; color: var(--text);
&:focus { outline: none; }
&::placeholder { color: var(--text-light); }
}
.clear-btn {
background: none; border: none; cursor: pointer; color: var(--text-muted);
font-size: 0.85rem; padding: 4px 6px; border-radius: 50%;
&:hover { background: var(--surface-2); color: var(--text); }
}
.suggestions {
position: absolute; top: 100%; right: 0; left: 0; z-index: 100;
background: var(--surface); border: 1.5px solid var(--border-focus);
border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); overflow: hidden; margin-top: 4px;
}
.suggestion-item {
padding: 8px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px;
border-bottom: 1px solid var(--border); transition: background var(--transition);
&:last-child { border-bottom: none; }
&:hover { background: var(--primary-light); }
}
.sug-avatar {
width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
display: flex; align-items: center; justify-content: center;
color: white; font-size: 0.85rem; font-weight: 800; overflow: hidden;
}
.sug-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.sug-name { font-weight: 700; font-size: 0.9rem; color: var(--text); }
.sug-meta { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
.result-card {
background: linear-gradient(145deg, #faf9ff, #f0edff);
border: 1.5px solid #c4b5fd; border-radius: var(--radius-sm);
overflow: hidden; animation: slideIn 0.2s ease;
}
@keyframes slideIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
.result-header { display: flex; align-items: center; gap: 14px; padding: 16px; }
.result-avatar {
width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0;
background: linear-gradient(135deg, #0d9488, #0891b2);
color: white; font-size: 1.5rem; font-weight: 800;
display: flex; align-items: center; justify-content: center;
overflow: hidden; position: relative; transition: transform 0.15s;
&.clickable { cursor: pointer; &:hover { transform: scale(1.08); } &:hover .zoom-hint { opacity:1; } }
}
.result-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.zoom-hint {
  position: absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background: rgba(0,0,0,0.35); font-size:1rem; opacity:0; transition:opacity .15s; border-radius:50%;
}
.photo-popup-backdrop {
  position: fixed; inset:0; z-index:2000; background:rgba(0,0,0,.7);
  display:flex; align-items:center; justify-content:center; animation:fadeIn .15s ease;
}
.photo-popup {
  position:relative; background:var(--surface); border-radius:var(--radius);
  padding:14px; box-shadow:0 24px 60px rgba(0,0,0,.4);
  display:flex; flex-direction:column; align-items:center; gap:10px; max-width:90vw;
}
.photo-popup-img { width:min(320px,80vw); height:min(320px,80vw); object-fit:cover; border-radius:var(--radius-sm); display:block; }
.photo-popup-name { font-size:1rem; font-weight:800; color:var(--text); }
.photo-popup-close {
  position:absolute; top:8px; left:8px; width:28px; height:28px;
  border:none; background:var(--surface-2); border-radius:50%; cursor:pointer; font-size:.9rem;
  display:flex; align-items:center; justify-content:center;
  &:hover { background:#fee2e2; color:var(--danger); }
}
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
.result-info { flex: 1; min-width: 0; }
.result-name { font-size: 1.05rem; font-weight: 800; color: var(--text); }
.result-meta { display: flex; gap: 10px; font-size: 0.78rem; color: var(--text-muted); margin-top: 3px; flex-wrap: wrap; }
.result-badges { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.active-loans { border-top: 1px solid #ddd6fe; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.loans-label { font-size: 0.72rem; font-weight: 700; color: #6d28d9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.loan-chip {
display: flex; justify-content: space-between; align-items: center;
background: white; border: 1px solid #ddd6fe; border-radius: 8px; padding: 7px 12px;
&.overdue { border-color: #fca5a5; background: #fff5f5; }
}
.loan-chip-name { font-size: 0.85rem; font-weight: 700; color: var(--text); }
.loan-chip-date { font-size: 0.78rem; font-weight: 600; }
.view-full-btn {
display: block; text-align: center; padding: 12px;
border-top: 1px solid #ddd6fe; color: #0d9488; font-weight: 700;
font-size: 0.875rem; text-decoration: none;
&:hover { background: #ede9ff; }
}
`]
})
export class StudentSearchComponent {
query = '';
focused = false;
photoOpen = false;
suggestions = signal<Student[]>([]);
selected = signal<Student | null>(null);
today = new Date().toISOString().split('T')[0];

constructor(private api: ApiService, private router: Router) {}

onInput() {
this.selected.set(null);
if (this.query.trim().length < 2) { this.suggestions.set([]); return; }
this.api.getStudents(this.query.trim()).subscribe(s => this.suggestions.set(s.slice(0, 8)));
}

select(s: Student) {
this.api.getStudent(s.id_number).subscribe(full => {
this.selected.set(full);
this.query = full.name;
this.suggestions.set([]);
});
}

onBlur() {
this.focused = false;
setTimeout(() => this.suggestions.set([]), 150);
}

activeLoans() { return (this.selected()?.loans || []).filter((l: any) => !l.actual_return); }
activeCount() { return this.activeLoans().length; }
overdueCount() { return this.activeLoans().filter((l: any) => this.isOverdue(l)).length; }
isOverdue(l: any) { return !l.actual_return && l.expected_return < this.today; }

private readonly PALETTE = ['#0d9488','#0891b2','#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#f59e0b'];
avatarColor(): string {
  const id = this.selected()?.id_number || '';
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return this.PALETTE[hash % this.PALETTE.length];
}

sugAvatarColor(s: Student): string {
  let hash = 0;
  for (const ch of s.id_number) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return this.PALETTE[hash % this.PALETTE.length];
}
}

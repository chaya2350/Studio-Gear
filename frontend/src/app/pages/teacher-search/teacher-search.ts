import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-teacher-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="container">
  <div class="page-header">
    <div>
      <h1>רשימת מורות</h1>
      <p class="subtitle">{{ allTeachers().length }} מורות במערכת</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" (click)="exportExcel()" [disabled]="exporting()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="12" x2="12" y2="18"/>
          <polyline points="9 15 12 18 15 15"/>
        </svg>
        {{ exporting() ? 'מוריד...' : 'ייצוא לאקסל' }}
      </button>
    </div>
  </div>

  <!-- Search bar -->
  <div class="search-wrap">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="חיפוש לפי שם או מקצוע..." autocomplete="off">
    <button *ngIf="query()" class="clear-btn" (click)="query.set('')">✕</button>
  </div>

  <!-- Loading -->
  <div *ngIf="loading()" class="empty-state">טוענת...</div>

  <!-- Empty -->
  <div *ngIf="!loading() && !filtered().length" class="empty-state">
    {{ query() ? 'לא נמצאו מורות התואמות לחיפוש' : 'אין מורות במערכת' }}
  </div>

  <!-- List -->
  <div *ngIf="!loading() && filtered().length" class="teachers-grid">
    <a *ngFor="let t of filtered()" [routerLink]="['/teachers', t.id]" class="teacher-card">
      <div class="teacher-avatar" [style.background]="avatarColor(t.name)">
        {{ initials(t.name) }}
      </div>
      <div class="teacher-info">
        <div class="teacher-name">{{ t.name }}</div>
        <div class="teacher-meta">
          <span *ngIf="t.subject" class="meta-chip subject">{{ t.subject }}</span>
          <span *ngIf="t.phone" class="meta-chip">{{ t.phone }}</span>
          <span *ngIf="t.email" class="meta-chip email">{{ t.email }}</span>
        </div>
      </div>
      <div class="teacher-arrow">›</div>
      <span *ngIf="!t.active" class="inactive-badge">לא פעיל</span>
    </a>
  </div>
</div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
    .header-actions { display: flex; gap: 8px; }

    .search-wrap {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      padding: 0 14px; height: 46px; margin-bottom: 20px;
      &:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }
    }
    .search-icon { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
    .search-wrap input {
      flex: 1; border: none; background: transparent; font: inherit; font-size: 0.95rem; color: var(--text);
      &:focus { outline: none; }
    }
    .clear-btn {
      background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.85rem;
      padding: 4px 6px; border-radius: 4px;
      &:hover { color: var(--text); }
    }

    .empty-state { text-align: center; color: var(--text-muted); padding: 48px 0; font-size: 0.9rem; }

    .teachers-grid { display: flex; flex-direction: column; gap: 8px; }

    .teacher-card {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      text-decoration: none; color: inherit; position: relative;
      transition: all var(--transition);
      &:hover {
        border-color: var(--primary); background: var(--primary-light);
        transform: translateX(-2px);
        .teacher-arrow { color: var(--primary); opacity: 1; }
      }
    }

    .teacher-avatar {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 800; font-size: 1rem;
    }

    .teacher-info { flex: 1; min-width: 0; }
    .teacher-name { font-weight: 800; font-size: 0.97rem; margin-bottom: 4px; }
    .teacher-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .meta-chip {
      font-size: 0.72rem; padding: 2px 8px; border-radius: 999px;
      background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--border);
      &.subject { background: var(--primary-light); color: var(--primary); border-color: transparent; }
      &.email { direction: ltr; }
    }

    .teacher-arrow {
      font-size: 1.4rem; color: var(--text-muted); opacity: 0.3;
      transition: all var(--transition); flex-shrink: 0;
    }

    .inactive-badge {
      position: absolute; top: 8px; left: 12px;
      font-size: 0.66rem; padding: 1px 7px; border-radius: 999px;
      background: var(--danger-soft); color: var(--danger); font-weight: 700;
    }
  `]
})
export class TeacherSearchComponent implements OnInit {
  query = signal('');
  allTeachers = signal<any[]>([]);
  loading = signal(true);
  exporting = signal(false);

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.allTeachers();
    return this.allTeachers().filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  });

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.api.getTeachers().subscribe({
      next: teachers => { this.allTeachers.set(teachers); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  exportExcel() {
    this.exporting.set(true);
    this.api.exportTeachersExcel().subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'teachers.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  initials(name: string): string {
    return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(p => p[0]).join('').toUpperCase() || 'מ';
  }

  avatarColor(name: string): string {
    const palette = ['#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#6366f1'];
    let h = 0;
    for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }
}

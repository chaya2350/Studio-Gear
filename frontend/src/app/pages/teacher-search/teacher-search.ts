import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-teacher-search',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="search-page">
      <div class="search-hero">
        <div class="hero-icon"></div>
        <h1>חיפוש מורה לפי שם</h1>
        <p class="subtitle">הקלד שם של מורה כדי לראות תוצאות עם השלמה אוטומטית</p>
      </div>

      <div class="search-card">
        <div class="search-input-wrap" [class.focused]="focused">
          <span class="search-icon">⌕</span>
          <input
            [(ngModel)]="query"
            placeholder="שם מורה..."
            (ngModelChange)="onInput()"
            (focus)="focused = true"
            (blur)="onBlur()"
            autocomplete="off"
            autofocus
          >
          <button class="clear-btn" *ngIf="query" (click)="query=''; suggestions.set([]); selected.set(null)">✕</button>
        </div>

        <div *ngIf="suggestions().length" class="suggestions">
          <div *ngFor="let t of suggestions()" class="suggestion-item" (mousedown)="select(t)">
            <div class="sug-avatar" [style.background]="avatarColor(t.name)">{{ initials(t.name) }}</div>
            <div>
              <div class="sug-name">{{ t.name }}</div>
              <div class="sug-meta">
                {{ t.subject || 'מורה' }}
                <span *ngIf="t.email"> · {{ t.email }}</span>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="selected() as teacher" class="result-card">
          <div class="result-header">
            <div class="result-avatar" [style.background]="avatarColor(teacher.name)">{{ initials(teacher.name) }}</div>
            <div class="result-info">
              <div class="result-name">{{ teacher.name }}</div>
              <div class="result-meta">
                <span>{{ teacher.subject || 'מורה' }}</span>
                <span *ngIf="teacher.email">{{ teacher.email }}</span>
                <span *ngIf="teacher.phone">{{ teacher.phone }}</span>
              </div>
            </div>
          </div>

          <div class="result-actions">
            <a [routerLink]="['/teachers', teacher.id]" class="view-full-btn">צפייה בפרופיל →</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .search-page { max-width: 520px; margin: 60px auto 0; display: flex; flex-direction: column; align-items: center; gap: 28px; }
    .search-hero { text-align: center; }
    .hero-icon { font-size: 3.4rem; margin-bottom: 12px; }
    h1 { margin: 0 0 8px; font-size: 1.65rem; }
    .subtitle { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
    .search-card {
      width: 100%; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius);
      padding: 24px; box-shadow: var(--shadow); position: relative;
    }
    .search-input-wrap {
      display: flex; align-items: center; gap: 10px; background: var(--surface-2); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); padding: 0 14px; height: 52px; transition: all 0.18s;
    }
    .search-input-wrap.focused { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px var(--primary-glow); }
    .search-icon { font-size: 1.2rem; flex-shrink: 0; }
    input {
      flex: 1; border: none; background: transparent; color: var(--text); font: inherit; font-size: 1rem;
    }
    input:focus { outline: none; }
    .clear-btn {
      background: none; border: none; cursor: pointer; color: var(--text-muted); border-radius: 50%; padding: 4px 6px;
    }
    .suggestions {
      position: absolute; right: 24px; left: 24px; top: calc(100% + 8px); z-index: 10; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); overflow: hidden;
    }
    .suggestion-item {
      display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--border);
    }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item:hover { background: var(--primary-light); }
    .sug-avatar, .result-avatar {
      width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 800; flex-shrink: 0;
    }
    .sug-name { font-size: 0.95rem; font-weight: 800; color: var(--text); }
    .sug-meta { font-size: 0.76rem; color: var(--text-muted); margin-top: 2px; }
    .result-card {
      margin-top: 18px; background: linear-gradient(135deg, var(--primary-light), var(--surface)); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); overflow: hidden; 
    }
    .result-header { display: flex; align-items: center; gap: 14px; padding: 18px; }
    .result-avatar { width: 52px; height: 52px; font-size: 1.3rem; }
    .result-info { flex: 1; min-width: 0; }
    .result-name { font-size: 1.05rem; font-weight: 800; }
    .result-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; color: var(--text-muted); font-size: 0.78rem; }
    .result-actions { border-top: 1px solid var(--border); }
    .view-full-btn {
      display: block; text-align: center; padding: 12px 16px; text-decoration: none; font-weight: 800; color: var(--primary);
    }
  `]
})
export class TeacherSearchComponent {
  query = '';
  focused = false;
  suggestions = signal<any[]>([]);
  selected = signal<any | null>(null);

  constructor(private api: ApiService) {}

  onInput() {
    const value = this.query.trim();
    this.selected.set(null);
    if (value.length < 2) { this.suggestions.set([]); return; }
    this.api.getTeachers(value).subscribe((teachers) => {
      const list = Array.isArray(teachers) ? teachers : [];
      this.suggestions.set(list.slice(0, 8));
      if (list.length) {
        this.selected.set(list[0]);
      }
    });
  }

  select(teacher: any) {
    this.query = teacher.name;
    this.selected.set(teacher);
    this.suggestions.set([]);
  }

  onBlur() {
    this.focused = false;
    setTimeout(() => this.suggestions.set([]), 150);
  }

  initials(name: string): string {
    return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'מ';
  }

  avatarColor(name: string): string {
    const palette = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    const normalized = (name || '').trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }
}

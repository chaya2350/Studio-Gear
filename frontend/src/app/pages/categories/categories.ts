import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Category } from '../../models';

const EMOJI_OPTIONS = ['📷','🔭','💡','🎙️','🎬','📦','🎥','🔋','🖥️','🎞️','🔌','🎚️','🎛️','📡','🔦','🧰','🎤','📻'];
const TOP_LEVEL_GROUPS = [
  { name: 'ציוד צילום', icon: '📷' },
  { name: 'מחשבים ניידים', icon: '🖥️' }
];

@Component({
  selector: 'app-categories',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:16px;">
        <a routerLink="/equipment" class="back-btn">→</a>
        <div>
          <h1>ניהול קטגוריות</h1>
          <p class="subtitle">{{ categories().length }} קטגוריות במערכת</p>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start;">

      <!-- Add form -->
      <div class="card">
        <div class="section-title">➕ הוספת קטגוריה חדשה</div>
        <div class="form-group">
          <label>שם הקטגוריה *</label>
          <input [(ngModel)]="newName" placeholder="לדוגמה: ציוד צילום">
        </div>
        <div class="form-group">
          <label>תחום</label>
          <select [(ngModel)]="newParentId">
            <option [ngValue]="null">אין תחום</option>
            <option *ngFor="let cat of parentOptions()" [ngValue]="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>אייקון</label>
          <div class="emoji-grid">
            <button *ngFor="let e of emojis" class="emoji-btn"
              [class.selected]="newIcon === e"
              (click)="newIcon = e">{{ e }}</button>
          </div>
        </div>
        <p *ngIf="error()" class="alert alert-error">{{ error() }}</p>
        <button class="btn btn-primary" style="width:100%;" (click)="add()">
          {{ newIcon }} הוסף תחום
        </button>
      </div>

      <!-- List -->
      <div class="card">
        <div class="section-title">📋 קטגוריות קיימות</div>
        <div *ngIf="categories().length; else empty">
          <div *ngFor="let cat of visibleCategories()" class="cat-row" [class.child-row]="cat.parent_id" [class.group-row]="!cat.parent_id">
            <span class="cat-icon-sm" [class.child-icon]="cat.parent_id">{{ cat.icon }}</span>
            <span class="cat-name-text">
              {{ cat.name }}
              <small *ngIf="!cat.parent_id" class="parent-tag">תחום</small>
              <small *ngIf="cat.parent_id" class="parent-tag">תת-קטגוריה</small>
            </span>
            <button class="delete-btn" (click)="remove(cat)" title="מחק קטגוריה">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              מחק
            </button>
          </div>
        </div>
        <ng-template #empty>
          <div class="empty-state" style="padding:24px 0;">
            <div class="empty-icon">📭</div>
            <p>אין קטגוריות עדיין</p>
          </div>
        </ng-template>
      </div>

    </div>
  `,
  styles: [`
    .back-btn {
      width: 36px; height: 36px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
      text-decoration: none; color: var(--text-muted); font-size: 1rem; font-weight: 700;
      transition: all var(--transition); box-shadow: var(--shadow-xs);
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }
    .emoji-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .emoji-btn {
      width: 38px; height: 38px; font-size: 1.2rem;
      border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface-2); cursor: pointer; transition: all var(--transition);
      &:hover { border-color: var(--primary); background: var(--primary-light); transform: scale(1.1); }
      &.selected { border-color: var(--primary); background: var(--primary-light); box-shadow: 0 0 0 2px var(--primary); }
    }
    .cat-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 0; border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .cat-icon-sm { font-size: 1.3rem; }
    .cat-name-text { flex: 1; font-weight: 700; font-size: 0.9rem; }
    .parent-tag { display:block; color:var(--text-light); font-size:0.7rem; margin-top:2px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
    .group-row { background: var(--surface-2); padding-inline: 10px; border-radius: var(--radius-sm); }
    .child-row { padding-block: 8px; border-bottom: 1px solid var(--border); }
    .child-icon { color: var(--text-muted); font-size: 1rem; }
    .delete-btn {
      display: inline-flex; align-items: center; gap: 5px;
      height: 30px; padding: 0 11px; border-radius: 8px;
      border: 1px solid #fca5a5; background: transparent; color: #dc2626;
      cursor: pointer; font-size: 0.75rem; font-weight: 600; line-height: 1;
      transition: all var(--transition); flex-shrink: 0; opacity: 0.85;
      svg { opacity: 0.8; }
      &:hover {
        background: #fef2f2; border-color: #ef4444; opacity: 1;
        box-shadow: 0 2px 8px rgba(220,38,38,0.12);
        transform: translateY(-1px);
        svg { opacity: 1; }
      }
      &:active { transform: translateY(0); }
    }
  `]
})
export class CategoriesComponent implements OnInit {
  categories = signal<Category[]>([]);
  error = signal('');
  newName = '';
  newIcon = '📦';
  newParentId: number | null = null;
  emojis = EMOJI_OPTIONS;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  topLevelCategories(): Category[] {
    return this.categories().filter(cat => !cat.parent_id);
  }

  private getGroupNameForCategory(cat: Category): string | null {
    if (cat.name === 'מחשב נייד' || cat.name === 'מחשבים ניידים') return 'מחשבים ניידים';
    if (['מצלמות','עדשות','תאורה','שמע','חצובות','אחר','גימבל','נק','ציוד צילום'].includes(cat.name)) return 'ציוד צילום';
    return null;
  }

  childrenOf(parentId: number): Category[] {
    return this.categories().filter(cat => cat.parent_id === parentId);
  }

  standaloneCategories(): Category[] {
    return [] as Category[];
  }

  visibleCategories(): Category[] {
    return this.categories().slice().sort((a, b) => {
      const aTop = a.parent_id == null ? 0 : 1;
      const bTop = b.parent_id == null ? 0 : 1;
      if (aTop !== bTop) return aTop - bTop;
      const aGroup = a.parent_id ?? a.id;
      const bGroup = b.parent_id ?? b.id;
      if (aGroup !== bGroup) return aGroup - bGroup;
      return a.name.localeCompare(b.name, 'he');
    });
  }

  parentOptions(): Category[] {
    return this.topLevelCategories();
  }

  load() {
    this.api.getCategories().subscribe(data => this.categories.set(data));
  }

  add() {
    if (!this.newName.trim()) { this.error.set('נא להזין שם קטגוריה'); return; }
    this.api.createCategory({ name: this.newName.trim(), icon: this.newIcon, parent_id: this.newParentId }).subscribe({
      next: () => { this.newName = ''; this.newIcon = '📦'; this.newParentId = null; this.error.set(''); this.load(); },
      error: (e) => this.error.set(e.error?.error || 'שגיאה')
    });
  }

  remove(cat: Category) {
    if (confirm(`למחוק את הקטגוריה "${cat.name}"?`)) {
      this.api.deleteCategory(cat.id).subscribe(() => this.load());
    }
  }
}

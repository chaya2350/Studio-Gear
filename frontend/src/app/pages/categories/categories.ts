import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Category } from '../../models';

const EMOJI_OPTIONS = ['📷','🔭','💡','🎙️','🎬','📦','🎥','🔋','🖥️','🎞️','🔌','🎚️','🎛️','📡','🔦','🧰','🎤','📻'];

@Component({
  selector: 'app-categories',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:16px;">
        <a routerLink="/equipment" class="back-btn">←</a>
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
          <input [(ngModel)]="newName" placeholder="לדוגמה: דרון">
        </div>
        <div class="form-group">
          <!-- <label>אייקון</label>
          <div class="emoji-grid">
            <button *ngFor="let e of emojis" class="emoji-btn"
              [class.selected]="newIcon === e"
              (click)="newIcon = e">{{ e }}</button>
          </div> -->
        </div>
        <p *ngIf="error()" class="alert alert-error">{{ error() }}</p>
        <button class="btn btn-primary" style="width:100%;" (click)="add()">
          {{ newIcon }} הוסף קטגוריה
        </button>
      </div>

      <!-- List -->
      <div class="card">
        <div class="section-title">📋 קטגוריות קיימות</div>
        <div *ngIf="categories().length; else empty">
          <div *ngFor="let cat of categories()" class="cat-row">
            <!-- <span class="cat-icon-sm">{{ cat.icon }}</span> -->
            <span class="cat-name-text">{{ cat.name }}</span>
            <button class="delete-btn" (click)="remove(cat)" title="מחק">✕</button>
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
      width: 38px; height: 38px;
      background: var(--surface-2); border: 1.5px solid var(--border);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      text-decoration: none; color: var(--text); font-size: 1.1rem; font-weight: 700;
      transition: all 0.18s;
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }
    .emoji-grid {
      display: flex; flex-wrap: wrap; gap: 6px;
    }
    .emoji-btn {
      width: 38px; height: 38px; font-size: 1.2rem;
      border: 1.5px solid var(--border); border-radius: 8px;
      background: var(--surface-2); cursor: pointer; transition: all 0.15s;
      &:hover { border-color: var(--primary); background: var(--primary-light); }
      &.selected { border-color: var(--primary); background: var(--primary-light); box-shadow: 0 0 0 2px var(--primary); }
    }
    .cat-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 0; border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .cat-icon-sm { font-size: 1.4rem; }
    .cat-name-text { flex: 1; font-weight: 600; font-size: 0.95rem; }
    .delete-btn {
      width: 28px; height: 28px; border-radius: 7px;
      border: 1px solid var(--border); background: var(--surface-2);
      color: var(--text-muted); cursor: pointer; font-size: 0.75rem;
      transition: all 0.15s;
      &:hover { background: #fff0f3; border-color: var(--danger); color: var(--danger); }
    }
  `]
})
export class CategoriesComponent implements OnInit {
  categories = signal<Category[]>([]);
  error = signal('');
  newName = '';
  newIcon = '📦';
  emojis = EMOJI_OPTIONS;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getCategories().subscribe(data => this.categories.set(data));
  }

  add() {
    if (!this.newName.trim()) { this.error.set('נא להזין שם קטגוריה'); return; }
    this.api.createCategory({ name: this.newName.trim(), icon: this.newIcon }).subscribe({
      next: () => { this.newName = ''; this.newIcon = '📦'; this.error.set(''); this.load(); },
      error: (e) => this.error.set(e.error?.error || 'שגיאה')
    });
  }

  remove(cat: Category) {
    if (confirm(`למחוק את הקטגוריה "${cat.name}"?`)) {
      this.api.deleteCategory(cat.id).subscribe(() => this.load());
    }
  }
}

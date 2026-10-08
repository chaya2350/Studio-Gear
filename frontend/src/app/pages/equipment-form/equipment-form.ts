import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Category } from '../../models';

@Component({
  selector: 'app-equipment-form',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div style="display:flex; align-items:center; gap:16px;">
        <a routerLink="/equipment" class="back-btn">←</a>
        <div>
          <h1>{{ isEdit ? 'עריכת ציוד' : 'הוספת ציוד חדש' }}</h1>
          <p class="subtitle">{{ isEdit ? 'עדכן את פרטי הפריט' : 'הוסף פריט חדש למלאי' }}</p>
        </div>
      </div>
    </div>

    <div class="card" style="max-width:520px;">
      <div *ngIf="!isEdit" class="form-group">
        <label>ברקוד</label>
        <div class="barcode-display">{{ form.barcode || '...' }}</div>
      </div>

      <div class="form-group">
        <label>שם הציוד *</label>
        <input [(ngModel)]="form.name" placeholder="לדוגמה: Sony A7 III">
      </div>

      <div class="form-group">
        <label>קטגוריה</label>
        <select [(ngModel)]="form.category" (ngModelChange)="onCategoryChange($event)">
          <option value="">בחר קטגוריה</option>
          <option *ngFor="let cat of categories()" [value]="cat.name">{{ cat.name }}</option>
        </select>
        <a routerLink="/categories" style="font-size:0.8rem; color:var(--primary); margin-top:4px;">+ ניהול קטגוריות</a>
      </div>

      <div class="form-group" *ngIf="form.category">
        <label>תת-קטגוריה</label>
        <input [(ngModel)]="form.subcategory" placeholder="לדוגמה: עדשה 55" list="subcat-list">
        <datalist id="subcat-list">
          <option *ngFor="let s of subcategories()" [value]="s">{{ s }}</option>
        </datalist>
        <span class="field-hint">הקלד שם חדש או בחר קיים</span>
      </div>

      <div class="form-group">
        <label>תיאור</label>
        <textarea [(ngModel)]="form.description" rows="3" placeholder="תיאור קצר של הציוד..."></textarea>
      </div>

      <div class="prices-row">
        <div class="form-group">
          <label>💰 מחיר השכרה ליום (₪)</label>
          <input type="number" [(ngModel)]="form.rental_price_per_day" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label>⚠️ קנס איחור ליום (₪)</label>
          <input type="number" [(ngModel)]="form.overdue_price_per_day" placeholder="0" min="0">
        </div>
      </div>

      <div class="form-group">
        <label>תמונה</label>
        <div class="image-upload-area" (click)="fileInput.click()">
          <img *ngIf="form.image_url" [src]="form.image_url" class="image-preview">
          <div *ngIf="!form.image_url && !uploading()" class="image-placeholder">
            <span style="font-size:2rem">📷</span>
            <span>לחץ לבחירת תמונה</span>
          </div>
          <div *ngIf="uploading()" class="image-placeholder">מעלה...</div>
        </div>
        <input #fileInput type="file" accept="image/*" style="display:none" (change)="uploadImage($event)">
      </div>

      <p *ngIf="error()" class="alert alert-error">{{ error() }}</p>
      <div style="display:flex; gap:10px; margin-top:8px;">
        <button class="btn btn-primary" style="flex:1;" (click)="save()">💾 שמור</button>
        <a routerLink="/equipment" class="btn btn-secondary">ביטול</a>
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
    .image-upload-area {
      border: 2px dashed var(--border); border-radius: var(--radius);
      cursor: pointer; overflow: hidden; min-height: 120px;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.2s;
      &:hover { border-color: var(--primary); }
    }
    .image-preview { width: 100%; max-height: 200px; object-fit: contain; display: block; }
    .image-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.9rem; padding: 20px; }
    .barcode-display {
      font-family: monospace; font-size: 1rem; letter-spacing: 1px;
      padding: 10px 14px; background: var(--surface-2); border: 1.5px solid var(--border);
      border-radius: 10px; color: var(--text-muted);
    }
    .field-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: block; }
    .prices-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  `]
})
export class EquipmentFormComponent implements OnInit {
  isEdit = false;
  id = 0;
  error = signal('');
  uploading = signal(false);
  categories = signal<Category[]>([]);
  subcategories = signal<string[]>([]);
  form = { barcode: '', name: '', category: '', subcategory: '', description: '', image_url: '', rental_price_per_day: 0, overdue_price_per_day: 0 };

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {}

  ngOnInit() {
    this.api.getCategories().subscribe(data => this.categories.set(data));
    this.id = +this.route.snapshot.params['id'];
    this.isEdit = !!this.id;
    if (!this.isEdit) {
      this.api.getNewBarcode().subscribe(res => this.form.barcode = res.barcode);
    } else {
      this.api.getEquipmentById(this.id).subscribe(data => {
        this.form = { barcode: data.barcode, name: data.name, category: data.category, subcategory: data.subcategory || '', description: data.description, image_url: data.image_url, rental_price_per_day: data.rental_price_per_day || 0, overdue_price_per_day: data.overdue_price_per_day || 0 };
        if (data.category) this.loadSubcategories(data.category);
      });
    }
  }

  onCategoryChange(cat: string) {
    this.form.subcategory = '';
    if (cat) this.loadSubcategories(cat);
    else this.subcategories.set([]);
  }

  loadSubcategories(cat: string) {
    this.api.getSubcategories(cat).subscribe(data => this.subcategories.set(data));
  }

  uploadImage(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    this.uploading.set(true);
    this.api.uploadImage(fd).subscribe({
      next: (res) => { this.form.image_url = res.url; this.uploading.set(false); },
      error: () => { this.error.set('שגיאה בהעלאת התמונה'); this.uploading.set(false); }
    });
  }

  save() {
    if (!this.form.barcode || !this.form.name) { this.error.set('ברקוד ושם הם שדות חובה'); return; }
    const req = this.isEdit ? this.api.updateEquipment(this.id, this.form) : this.api.createEquipment(this.form);
    req.subscribe({
      next: (res: any) => {
        const newId = this.isEdit ? this.id : res.id;
        this.router.navigate(['/equipment', newId]);
      },
      error: (e) => this.error.set(e.error?.error || 'שגיאה בשמירה')
    });
  }
}

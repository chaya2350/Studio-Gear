import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Equipment, Category } from '../../models';

type View = 'categories' | 'subcategories' | 'items';

@Component({
  selector: 'app-equipment-list',
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <!-- ── Category view ── -->
    <ng-container *ngIf="view() === 'categories'">
      <div class="page-header">
        <div>
          <h1>ציוד הסטודיו</h1>
          <p class="subtitle">{{ all().length }} פריטים במערכת</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" (click)="printAllBarcodes()">🖨️ הדפס ברקודים</button>
          <a routerLink="/categories" class="btn btn-ghost">⚙️ קטגוריות</a>
          <a routerLink="/equipment/new" class="btn btn-primary">＋ הוסף ציוד</a>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card clickable" (click)="goItems('__all__')">
          <div class="stat-icon" style="background:#ede9ff;">📦</div>
          <div class="stat-info">
            <div class="stat-value">{{ all().length }}</div>
            <div class="stat-label">סה"כ ציוד</div>
          </div>
        </div>
        <div class="stat-card clickable" (click)="goItems('__available__')">
          <div class="stat-icon" style="background:#e6faf4;">✅</div>
          <div class="stat-info">
            <div class="stat-value" style="color:var(--success)">{{ available() }}</div>
            <div class="stat-label">פנוי</div>
          </div>
        </div>
        <div class="stat-card clickable" (click)="goItems('__loaned__')">
          <div class="stat-icon" style="background:#fff0f3;">📤</div>
          <div class="stat-info">
            <div class="stat-value" style="color:var(--accent)">{{ loaned() }}</div>
            <div class="stat-label">מושאל</div>
          </div>
        </div>
        <div class="stat-card clickable" (click)="goOverdue()">
          <div class="stat-icon" style="background:#fff8ec;">⚠️</div>
          <div class="stat-info">
            <div class="stat-value" style="color:var(--warning)">{{ overdueCount() }}</div>
            <div class="stat-label">באיחור</div>
          </div>
        </div>
      </div>

      <hr class="section-divider">

      <div class="cat-grid">
        <div *ngFor="let cat of categories()" class="cat-card" (click)="selectCategory(cat)">
          <div class="cat-name">{{ cat.name }}</div>
          <div class="cat-counts">
            <span class="cat-total">{{ countByCategory(cat.name) }} פריטים</span>
            <span *ngIf="loanedByCategory(cat.name)" class="cat-loaned">{{ loanedByCategory(cat.name) }} מושאל</span>
          </div>
          <div class="cat-bar">
            <div class="cat-bar-fill"
              [style.width.%]="countByCategory(cat.name) ? (loanedByCategory(cat.name) / countByCategory(cat.name)) * 100 : 0">
            </div>
          </div>
        </div>
        <div class="cat-card cat-all" (click)="goItems('__all__')">
          <div class="cat-name">כל הציוד</div>
          <div class="cat-counts"><span class="cat-total">{{ all().length }} פריטים</span></div>
        </div>
      </div>
    </ng-container>

    <!-- ── Subcategory view ── -->
    <ng-container *ngIf="view() === 'subcategories'">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <button class="back-btn" (click)="view.set('categories')">→</button>
          <div>
            <h1>{{ selectedCategory() }}</h1>
            <p class="subtitle">{{ countByCategory(selectedCategory()!) }} פריטים</p>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button *ngIf="selectedCategory() === 'מחשב נייד'" class="btn btn-ghost" (click)="printLaptopOverdue()">
            🖨️ הדפס מחשבים שלא חזרו
          </button>
          <a routerLink="/equipment/new" class="btn btn-primary">＋ הוסף ציוד</a>
        </div>
      </div>

      <div class="cat-grid">
        <!-- Subcategory cards -->
        <div *ngFor="let sub of subcategoriesInCat()" class="cat-card" (click)="selectSubcategory(sub)">
          <div class="cat-name">{{ sub }}</div>
          <div class="cat-counts">
            <span class="cat-total">{{ countBySubcategory(sub) }} פריטים</span>
            <span *ngIf="loanedBySubcategory(sub)" class="cat-loaned">{{ loanedBySubcategory(sub) }} מושאל</span>
          </div>
          <div class="cat-bar">
            <div class="cat-bar-fill"
              [style.width.%]="countBySubcategory(sub) ? (loanedBySubcategory(sub) / countBySubcategory(sub)) * 100 : 0">
            </div>
          </div>
        </div>
        <!-- Items without subcategory -->
        <div *ngIf="itemsWithoutSubcat().length" class="cat-card cat-all" (click)="selectSubcategory('__none__')">
          <div class="cat-name">ללא תת-קטגוריה</div>
          <div class="cat-counts"><span class="cat-total">{{ itemsWithoutSubcat().length }} פריטים</span></div>
        </div>
        <!-- All in category -->
        <div class="cat-card" style="border-style:dashed" (click)="goItems('__cat__')">
          <div class="cat-name">כל {{ selectedCategory() }}</div>
          <div class="cat-counts"><span class="cat-total">{{ countByCategory(selectedCategory()!) }} פריטים</span></div>
        </div>
      </div>
    </ng-container>

    <!-- ── Items view ── -->
    <ng-container *ngIf="view() === 'items'">
      <div class="page-header">
        <div style="display:flex; align-items:center; gap:16px;">
          <button class="back-btn" (click)="goBack()">→</button>
          <div>
            <h1>{{ itemsTitle() }}</h1>
            <p class="subtitle">{{ filtered().length }} פריטים</p>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button *ngIf="selectedCategory() === 'מחשב נייד'" class="btn btn-ghost" (click)="printLaptopOverdue()">
            🖨️ הדפס מחשבים שלא חזרו
          </button>
          <a routerLink="/equipment/new" class="btn btn-primary">＋ הוסף ציוד</a>
        </div>
      </div>

      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input [(ngModel)]="search" placeholder="חיפוש לפי שם או ברקוד..." (input)="applySearch()">
      </div>

      <div class="grid">
        <a *ngFor="let item of filtered()" [routerLink]="['/equipment', item.id]" class="equipment-card">
          <div class="eq-top">
            <span class="badge" [class]="getStatusClass(item)">
              {{ item.is_loaned ? (isOverdue(item) ? '⚠ איחור' : 'מושאל') : '✓ פנוי' }}
            </span>
          </div>
          <h3 class="eq-name">{{ item.name }}</h3>
          <p class="eq-category">
            {{ item.category }}<span *ngIf="item.subcategory"> › {{ item.subcategory }}</span>
          </p>
          <div class="eq-barcode">🔖 {{ item.barcode }}</div>
          <div *ngIf="item.is_loaned" class="eq-borrower">
            <span>👤 {{ item.borrower_name }}</span>
            <span class="eq-return" [style.color]="isOverdue(item) ? 'var(--danger)' : 'var(--text-muted)'">
              {{ item.expected_return }}
            </span>
          </div>
        </a>
      </div>

      <div *ngIf="!filtered().length" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>אין ציוד בקטגוריה זו</p>
      </div>
    </ng-container>
  `,
  styles: [`
    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .cat-card {
      background: var(--surface); border-radius: var(--radius); padding: 24px 20px 18px;
      border: 1.5px solid var(--border); box-shadow: var(--shadow-sm); cursor: pointer;
      transition: all 0.2s; display: flex; flex-direction: column; gap: 6px;
      &:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--primary); }
    }
    .cat-all { border-style: dashed; }
    .cat-name { font-size: 1.35rem; font-weight: 700; }
    .cat-counts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .cat-total { font-size: 0.82rem; color: var(--text-muted); }
    .cat-loaned { font-size: 0.78rem; background: #fff0f3; color: var(--accent); padding: 2px 8px; border-radius: 8px; font-weight: 600; }
    .cat-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 6px; overflow: hidden; }
    .cat-bar-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.4s; }

    .stat-card.clickable { cursor: pointer; transition: all 0.2s;
      &:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--primary); }
    }

    .equipment-card {
      text-decoration: none; color: inherit; background: var(--surface); border-radius: var(--radius);
      padding: 20px; border: 1.5px solid var(--border); box-shadow: var(--shadow-sm); cursor: pointer;
      transition: all 0.2s; display: block;
      &:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--primary); }
    }
    .eq-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .eq-icon { font-size: 2rem; line-height: 1; }
    .eq-name { font-size: 1.05rem; font-weight: 700; margin-bottom: 3px; }
    .eq-category { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; }
    .eq-barcode { font-size: 0.8rem; color: var(--text-muted); font-family: monospace; background: var(--surface-2); padding: 4px 8px; border-radius: 6px; display: inline-block; margin-bottom: 10px; }
    .eq-borrower { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding-top: 10px; border-top: 1px solid var(--border); }
    .eq-return { font-size: 0.8rem; font-weight: 600; }

    .back-btn {
      width: 38px; height: 38px; background: var(--surface-2); border: 1.5px solid var(--border);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 1.1rem; font-weight: 700; color: var(--text); transition: all 0.18s;
      &:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    }
  `]
})
export class EquipmentListComponent implements OnInit {
  all = signal<Equipment[]>([]);
  filtered = signal<Equipment[]>([]);
  categories = signal<Category[]>([]);
  view = signal<View>('categories');
  selectedCategory = signal<string | null>(null);
  selectedSubcategory = signal<string | null>(null);
  search = '';
  // tracks what "back" should do from items view
  private itemsSource: 'categories' | 'subcategories' = 'categories';

  readonly today = new Date().toISOString().split('T')[0];

  constructor(private api: ApiService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    this.api.getEquipment().subscribe(data => { this.all.set(data); this.filtered.set(data); });
    this.api.getCategories().subscribe(cats => this.categories.set(cats));
    this.route.queryParams.subscribe(p => {
      if (p['status']) this.goItems(p['status'] === 'available' ? '__available__' : '__loaned__');
    });
  }

  available()    { return this.all().filter(e => !e.is_loaned).length; }
  loaned()       { return this.all().filter(e => e.is_loaned).length; }
  overdueCount() { return this.all().filter(e => e.is_loaned && this.isOverdue(e)).length; }

  countByCategory(name: string)  { return this.all().filter(e => e.category === name).length; }
  loanedByCategory(name: string) { return this.all().filter(e => e.category === name && e.is_loaned).length; }

  subcategoriesInCat() {
    const cat = this.selectedCategory()!;
    const subs = [...new Set(this.all().filter(e => e.category === cat && e.subcategory).map(e => e.subcategory!))];
    return subs.sort();
  }
  countBySubcategory(sub: string)  { return this.all().filter(e => e.category === this.selectedCategory() && e.subcategory === sub).length; }
  loanedBySubcategory(sub: string) { return this.all().filter(e => e.category === this.selectedCategory() && e.subcategory === sub && e.is_loaned).length; }
  itemsWithoutSubcat() { return this.all().filter(e => e.category === this.selectedCategory() && !e.subcategory); }

  selectCategory(cat: Category) {
    this.selectedCategory.set(cat.name);
    const subs = this.subcategoriesInCat();
    if (subs.length > 0) {
      this.view.set('subcategories');
    } else {
      this.goItems('__cat__');
    }
  }

  selectSubcategory(sub: string) {
    this.selectedSubcategory.set(sub);
    this.itemsSource = 'subcategories';
    this.search = '';
    if (sub === '__none__') {
      this.filtered.set(this.itemsWithoutSubcat());
    } else {
      this.filtered.set(this.all().filter(e => e.category === this.selectedCategory() && e.subcategory === sub));
    }
    this.view.set('items');
  }

  goItems(mode: string) {
    this.itemsSource = mode === '__cat__' || this.view() === 'subcategories' ? 'subcategories' : 'categories';
    if (mode === '__all__')       { this.filtered.set(this.all()); }
    else if (mode === '__available__') { this.filtered.set(this.all().filter(e => !e.is_loaned)); }
    else if (mode === '__loaned__')    { this.filtered.set(this.all().filter(e => e.is_loaned)); }
    else if (mode === '__cat__')       { this.filtered.set(this.all().filter(e => e.category === this.selectedCategory())); this.itemsSource = 'subcategories'; }
    this.search = '';
    this.view.set('items');
  }

  goBack() {
    if (this.itemsSource === 'subcategories') {
      this.view.set('subcategories');
    } else {
      this.view.set('categories');
      this.selectedCategory.set(null);
    }
  }

  goOverdue() { this.router.navigate(['/loans'], { queryParams: { filter: 'overdue' } }); }

  printLaptopOverdue() {
    this.api.getLaptopOverdue().subscribe(loans => {
      if (!loans.length) { alert('אין מחשבים שלא חזרו'); return; }
      const date = new Date().toLocaleDateString('he-IL');
      const rows = loans.map(l => `
        <tr>
          <td>${l.equipment_name}</td>
          <td>${l.borrower_name}</td>
          <td>${l.borrower_phone || '—'}</td>
          <td>${l.track || '—'}</td>
          <td>${l.location || '—'}</td>
          <td>${l.loan_date}</td>
        </tr>`).join('');
      const win = window.open('', '_blank', 'width=800,height=600')!;
      win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
        <title>מחשבים שלא חזרו</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h2 { margin-bottom: 6px; } .date { color: #666; margin-bottom: 20px; font-size: 0.9rem; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: right; }
          th { background: #f0eeff; font-weight: 700; }
          tr:nth-child(even) td { background: #fafafa; }
          @media print { @page { margin: 15mm; } }
        </style></head><body>
        <h2>💻 מחשבים שלא הוחזרו</h2>
        <div class="date">הופק ב: ${date} &nbsp;|סה"כ: ${loans.length} מחשבים</div>
        <table>
          <thead><tr><th>מחשב</th><th>שואל</th><th>טלפון</th><th>מסלול</th><th>לאן לקחו</th><th>תאריך השאלה</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => { window.print(); }<\/script>
        </body></html>`);
      win.document.close();
    });
  }

  applySearch() {
    const base = this.filtered();
    // re-filter from current base list stored before search
    const src = this._baseBeforeSearch ?? this.filtered();
    if (!this._baseBeforeSearch) this._baseBeforeSearch = [...this.filtered()];
    this.filtered.set(this.search
      ? src.filter(e => e.name.includes(this.search) || e.barcode.includes(this.search))
      : src);
  }
  private _baseBeforeSearch: Equipment[] | null = null;

  itemsTitle(): string {
    const sub = this.selectedSubcategory();
    const cat = this.selectedCategory();
    if (sub && sub !== '__none__' && this.view() === 'items' && this.itemsSource === 'subcategories') return sub;
    if (sub === '__none__') return 'ללא תת-קטגוריה';
    if (cat && this.itemsSource === 'subcategories') return `כל ${cat}`;
    const f = this.filtered();
    if (f.length && f[0].category && this.itemsSource === 'categories') return f[0].category;
    return 'ציוד';
  }

  isOverdue(item: Equipment) { return item.expected_return && item.expected_return < this.today; }

  getStatusClass(item: Equipment) {
    if (!item.is_loaned) return 'badge-available';
    return this.isOverdue(item) ? 'badge-overdue' : 'badge-loaned';
  }

  getCategoryIcon(cat: string) {
    const found = this.categories().find(c => c.name === cat);
    if (found) return found.icon;
    const map: Record<string, string> = { 'מצלמה':'📷','עדשות':'🔭','תאורה':'💡','שמע':'🎙️','חצובה':'🎬' };
    return map[cat] ?? '📦';
  }

  printAllBarcodes() {
    const items = this.all();
    const base = 'http://localhost:3000/api';
    const sizeMap: Record<string, { w: string; h: string }> = {
      'מצלמות': { w: '50mm',  h: '20mm' },
      'עדשות': { w: '35mm',  h: '15mm' },
      'חצובות': { w: '65mm',  h: '28mm' },
      'תאורה':  { w: '75mm',  h: '32mm' },
      'שמע':   { w: '55mm',  h: '22mm' },
    };
    const getSize = (cat: string) => sizeMap[cat] ?? { w: '50mm', h: '20mm' };
    const rows = items.map(item => {
      const s = getSize(item.category);
      return `
      <div class="bc-item" style="width:${s.w}; height:${s.h}">
        <div class="bc-name">${item.name}</div>
        <img src="${base}/equipment/${item.id}/barcode">
        <div class="bc-code">${item.barcode}</div>
      </div>`;
    }).join('');

    const win = window.open('', '_blank', 'width=900,height=700')!;
    win.document.write(`
      <!DOCTYPE html><html dir="rtl"><head>
      <meta charset="utf-8">
      <title>ברקודים — ציוד הסטודיו</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; padding: 6px; }
        h2 { text-align: center; font-size: 0.85rem; margin-bottom: 8px; color: #333; border-bottom: 1px solid #6c63ff; padding-bottom: 5px; }
        .grid { display: flex; flex-wrap: wrap; gap: 4px; align-items: flex-start; }
        .bc-item {
          border: 0.5px solid #999; display: flex; flex-direction: column;
          align-items: stretch; overflow: hidden; break-inside: avoid; padding: 2px;
        }
        .bc-name { font-size: 6pt; font-weight: 700; color: #222; text-align: center; padding: 1.5px 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
        .bc-code { font-size: 5.5pt; font-family: monospace; color: #444; text-align: center; padding: 1px 2px; flex-shrink: 0; letter-spacing: 0.3px; }
        img { width: 100%; flex: 1; object-fit: fill; display: block; min-height: 0; }
        @media print { body { padding: 4px; } @page { margin: 5mm; size: A4; } }
      </style></head><body>
      <h2>📦 ברקודים — ציוד הסטודיו (${items.length} פריטים)</h2>
      <div class="grid">${rows}</div>
      <script>
        const imgs = document.querySelectorAll('img');
        let loaded = 0;
        if (!imgs.length) { window.print(); window.close(); }
        imgs.forEach(img => {
          const done = () => { if (++loaded === imgs.length) { window.print(); window.close(); } };
          if (img.complete) done(); else { img.onload = done; img.onerror = done; }
        });
      <\/script>
      </body></html>
    `);
    win.document.close();
  }
}

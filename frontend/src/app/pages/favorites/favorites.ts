import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Favorite, WorkspaceService } from '../../services/workspace.service';

@Component({
  selector: 'app-favorites',
  imports: [CommonModule, RouterLink],
  template: `<div class="page-header"><div><h1>מועדפים</h1><p class="subtitle">גישה מהירה לפריטים ולתלמידות שסימנת</p></div></div>
  <p *ngIf="loading">טוענת מועדפים…</p><p *ngIf="error" class="alert alert-error">{{ error }}</p>
  <div class="favorites-grid">
    <article class="card favorite-card" *ngFor="let item of items">
      <ng-container *ngIf="item.item_type === 'equipment' && equipmentById(item.item_id) as equipment">
        <a [routerLink]="['/equipment', equipment.id]"><strong>{{ equipment.name }}</strong><small>{{ equipment.category }} · {{ equipment.barcode }}</small></a>
      </ng-container>
      <ng-container *ngIf="item.item_type === 'student' && studentById(item.item_id) as student">
        <a [routerLink]="['/students', student.id_number]"><strong>{{ student.name }}</strong><small>{{ student.id_number }} · {{ student.track || 'ללא מסלול' }}</small></a>
      </ng-container>
      <button type="button" (click)="remove(item)" aria-label="הסרה מהמועדפים">הסרה</button>
    </article>
  </div><p *ngIf="!loading && !error && !items.length" class="empty">עדיין לא סימנת מועדפים. אפשר להוסיף מדף פריט או תלמידה.</p>`,
  styles: [`.favorites-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.favorite-card{padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.favorite-card a{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:var(--text)}.favorite-card small,.empty{color:var(--text-muted)}.favorite-card button{border:1px solid var(--border);background:var(--surface-2);border-radius:16px;padding:6px 10px;cursor:pointer;color:var(--text-muted)}.empty{text-align:center;padding:40px}`]
})
export class FavoritesComponent implements OnInit {
  items: Favorite[] = [];
  students: any[] = [];
  equipment: any[] = [];
  loading = true;
  error = '';
  constructor(private workspace: WorkspaceService, private api: ApiService) { }
  ngOnInit() {
    this.workspace.loadFavorites().subscribe({
      next: items => {
        this.items = items;
        this.api.getStudents().subscribe(students => { this.students = students; this.finishLoading(); });
        this.api.getEquipment().subscribe(equipment => { this.equipment = equipment; this.finishLoading(); });
      },
      error: () => { this.loading = false; this.error = 'לא ניתן לטעון מועדפים כרגע'; }
    });
  }
  private finishLoading() { this.loading = false; }
  equipmentById(id: string) { return this.equipment.find(item => String(item.id) === id); }
  studentById(id: string) { return this.students.find(item => item.id_number === id); }
  remove(item: Favorite) {
    this.workspace.toggleFavorite(item.item_type, item.item_id).subscribe({
      next: () => this.items = this.items.filter(f => !(f.item_type === item.item_type && f.item_id === item.item_id)),
      error: () => this.error = 'לא ניתן להסיר את המועדף כרגע'
    });
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivityItem, WorkspaceService } from '../services/workspace.service';

@Component({
  selector: 'app-activity', imports: [CommonModule, RouterLink],
  template: `<div class="page-header"><div><h1>פעילות אחרונה</h1><p class="subtitle">עדכונים אחרונים במערכת</p></div><button class="btn btn-secondary" (click)="load()">רענון</button></div>
  <p *ngIf="error" class="alert alert-error">{{ error }}</p><div class="card activity-list"><article *ngFor="let item of items" class="activity-row"><span class="activity-dot"></span><div><strong>{{ item.user_name || 'משתמשת שהוסרה' }} {{ item.action }}</strong><p>{{ item.details }}</p><a *ngIf="item.item_type === 'student'" [routerLink]="['/students', item.item_id]">פתיחת תלמידה</a><a *ngIf="item.item_type === 'equipment'" [routerLink]="['/equipment', item.item_id]">פתיחת ציוד</a><time>{{ item.created_at | date:'dd/MM/yyyy HH:mm' }}</time></div></article><p *ngIf="!items.length && !error" class="empty">אין עדיין פעילות להצגה</p></div>`,
  styles: [`.activity-list{padding:8px 20px}.activity-row{display:flex;gap:12px;padding:16px 0;border-bottom:1px solid var(--border)}.activity-row:last-child{border:0}.activity-dot{width:9px;height:9px;margin-top:7px;border-radius:50%;background:var(--primary);flex:none}.activity-row p{margin:5px 0;color:var(--text-muted)}.activity-row a{color:var(--primary);font-size:.85rem}.activity-row time{display:block;color:var(--text-light);font-size:.75rem;margin-top:5px}.empty{text-align:center;padding:28px;color:var(--text-muted)}`]
})
export class ActivityComponent implements OnInit {
  items: ActivityItem[] = [];
  error = '';
  constructor(private workspace: WorkspaceService) { }
  ngOnInit() { this.load(); }
  load() { this.error = ''; this.workspace.getActivity().subscribe({ next: items => this.items = items, error: () => this.error = 'לא ניתן לטעון פעילות' }); }
}

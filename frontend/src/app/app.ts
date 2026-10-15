import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CartService } from './services/cart.service';
import { ApiService } from './services/api.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <nav class="navbar">
      <a routerLink="/" class="brand">
        <img src="/logo.png" class="brand-logo" alt="לוגו סמינר גור">
        <span>Studio Gear</span>
      </a>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">🏠 בית</a>
        <a routerLink="/equipment" [class.active]="isEquipmentSection()">📦 השאלת ציוד</a>
        <a routerLink="/approvals" [class.active]="isApprovalsSection()">📄 אישורים</a>
        <a routerLink="/admin" routerLinkActive="active">⚙️ ניהול</a>
      </div>
    </nav>

    <nav class="subnav" *ngIf="isApprovalsSection()">
      <ng-container *ngFor="let t of approvalTypes">
        <a *ngIf="t.type !== 'single'"
           [routerLink]="['/approvals']" [queryParams]="{type: t.id}"
           [class.active]="isApprovalTypeActive(t.id)">
          📄 {{ t.name }}
        </a>
        <a *ngIf="t.type === 'single'"
           [routerLink]="['/approvals/single']" [queryParams]="{type: t.id}"
           [class.active]="isSingleApprovalActive(t.id)">
          💍 {{ t.name }}
        </a>
      </ng-container>
    </nav>

    <nav class="subnav" *ngIf="isEquipmentSection()">
      <a routerLink="/equipment" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">📦 ציוד</a>
      <a routerLink="/scan" routerLinkActive="active">📷 סריקה</a>
      <a routerLink="/calendar" routerLinkActive="active">📅 לוח שנה</a>
      <a routerLink="/loans" routerLinkActive="active">📋 השאלות</a>
      <a routerLink="/students" routerLinkActive="active">🪪 תלמידות</a>
      <a routerLink="/checkout" routerLinkActive="active">🛒 הזמנה</a>
    </nav>

    <main class="container">
      <router-outlet />
    </main>
    <footer class="app-footer">
      <span>כל הזכויות שמורות למלי וחיה</span>
    </footer>
    <a *ngIf="cart.count() > 0" routerLink="/checkout" class="cart-fab">
      🛒 הזמנה
      <span class="cart-badge">{{ cart.count() }}</span>
    </a>
  `,
  styles: [`
    .brand { text-decoration: none; }
    .brand-logo { height: 42px; width: auto; object-fit: contain; }
    .app-footer {
      display: flex; justify-content: center; align-items: center;
      padding: 8px 12px 14px; font-size: 0.72rem; color: var(--text-muted); letter-spacing: 0.02em;
    }
    .cart-fab {
      position: fixed; bottom: 28px; left: 28px; z-index: 500;
      background: var(--grad-primary); color: white; text-decoration: none;
      padding: 14px 22px; border-radius: 50px; font-weight: 800; font-size: 0.95rem;
      box-shadow: 0 8px 24px rgba(79,70,229,0.4); display: flex; align-items: center; gap: 10px;
      transition: all var(--transition);
      &:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(79,70,229,0.5); }
    }
    .cart-badge {
      background: white; color: var(--primary); border-radius: 50%;
      width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
      font-size: 0.8rem; font-weight: 900;
    }
  `]
})
export class App implements OnInit {
  currentPath = '';
  currentQuery = '';
  approvalTypes: any[] = [];

  constructor(public cart: CartService, private router: Router, private api: ApiService) {
    this.currentPath = this.router.url.split('?')[0];
    this.currentQuery = this.router.url;
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects.split('?')[0];
      this.currentQuery = e.urlAfterRedirects;
    });
  }

  ngOnInit() {
    this.api.getApprovalTypes().subscribe(t => { this.approvalTypes = t; });
  }

  isApprovalTypeActive(id: number): boolean {
    return this.currentPath === '/approvals' && this.currentQuery.includes(`type=${id}`);
  }

  isSingleApprovalActive(id: number): boolean {
    return this.currentPath === '/approvals/single' && this.currentQuery.includes(`type=${id}`);
  }

  isEquipmentSection(): boolean {
    return ['/equipment', '/scan', '/loans', '/calendar', '/students', '/checkout'].some(p =>
      this.currentPath === p || this.currentPath.startsWith(p + '/') || this.currentPath.startsWith(p + '?')
    );
  }

  isApprovalsSection(): boolean {
    return this.currentPath === '/approvals' || this.currentPath.startsWith('/approvals/');
  }
}

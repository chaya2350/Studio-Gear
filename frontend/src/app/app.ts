import { Component, OnInit, effect, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CartService } from './services/cart.service';
import { ApiService } from './services/api.service';
import { AuthService, UserRole } from './services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <nav *ngIf="currentPath !== '/login'" class="navbar">
      <a routerLink="/" class="brand">
        <img src="/logo.png" class="brand-logo" alt="לוגו סמינר גור" />
        <span>סמינר גור</span>
      </a>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
          >🏠 בית</a
        >
        <a routerLink="/students" [class.active]="currentPath === '/students' || currentPath.startsWith('/students/')">🪪 תלמידות</a>
        <a routerLink="/equipment" [class.active]="isEquipmentSection()">📦 השאלת ציוד</a>
        <a routerLink="/approvals" [class.active]="isApprovalsSection()">📄 אישורים</a>
        <a routerLink="/exams" [class.active]="isExamsSection()">📝 מבחנים</a>
        <a routerLink="/pages" routerLinkActive="active" class="pages-nav-link">
          📚 דפים
          <span class="nav-badge" *ngIf="accessRequests().length">{{ accessRequests().length }}</span>
        </a>
        <a routerLink="/messages" routerLinkActive="active">💬 הודעות</a>
        <a routerLink="/calendar/personal" [class.active]="currentPath.startsWith('/calendar/')">🗓 לוח שנה</a>
        <a routerLink="/admin" routerLinkActive="active">⚙️ ניהול</a>
      </div>
      <div class="account-actions" *ngIf="auth.user() as user">
        <span>{{ user.name }} · {{ roleLabel(user.role) }}</span>
        <button class="logout-btn" (click)="logout()">יציאה</button>
      </div>
      <span *ngIf="logoutError" class="logout-error" role="alert">{{ logoutError }}</span>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && isApprovalsSection()">
      <ng-container *ngFor="let t of approvalTypes">
        <a
          *ngIf="t.type !== 'single'"
          [routerLink]="['/approvals']"
          [queryParams]="{ type: t.id }"
          [class.active]="isApprovalTypeActive(t.id)"
        >
          📄 {{ t.name }}
        </a>
        <a
          *ngIf="t.type === 'single'"
          [routerLink]="['/approvals/single']"
          [queryParams]="{ type: t.id }"
          [class.active]="isSingleApprovalActive(t.id)"
        >
          💍 {{ t.name }}
        </a>
      </ng-container>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && isExamsSection()">
      <a routerLink="/exams" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">📋 ניהול מבחנים וברקודים</a>
      <a routerLink="/exams/scan" routerLinkActive="active">✏️ רישום ציון</a>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && isEquipmentSection()">
      <a
        routerLink="/equipment"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        >📦 ציוד</a
      >
      <a routerLink="/scan" routerLinkActive="active">📷 סריקה</a>
      <a routerLink="/loans" routerLinkActive="active">📋 השאלות</a>
      <a routerLink="/checkout" routerLinkActive="active">🛒 הזמנה</a>
    </nav>

    <main class="container" [class.login-container]="currentPath === '/login'">
      <router-outlet />
    </main>
    <footer *ngIf="currentPath !== '/login'" class="app-footer">
      <span>כל הזכויות שמורות למלי וחיה</span>
    </footer>
    <a *ngIf="currentPath !== '/login' && cart.count() > 0" routerLink="/checkout" class="cart-fab">
      🛒 הזמנה
      <span class="cart-badge">{{ cart.count() }}</span>
    </a>
  `,
  styles: [
    `
      .nav-badge {
        background: var(--danger); color: white; border-radius: 50%;
        min-width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 0.68rem; font-weight: 800; padding: 0 4px; margin-right: 4px;
        animation: badge-pulse 1.5s ease infinite;
      }
      @keyframes badge-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      .brand {
        text-decoration: none;
      }
      .brand-logo {
        height: 42px;
        width: auto;
        object-fit: contain;
      }
      .account-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-right: auto;
        font-size: 0.78rem;
        color: var(--text-muted);
      }
      .logout-btn {
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        padding: 6px 10px;
        cursor: pointer;
        font: inherit;
      }
      .logout-error {
        color: var(--danger);
        font-size: 0.75rem;
      }
      .login-container {
        max-width: none;
        padding: 0;
      }
      .app-footer {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 8px 12px 14px;
        font-size: 0.72rem;
        color: var(--text-muted);
        letter-spacing: 0.02em;
      }
      .cart-fab {
        position: fixed;
        bottom: 28px;
        left: 28px;
        z-index: 500;
        background: var(--grad-primary);
        color: white;
        text-decoration: none;
        padding: 14px 22px;
        border-radius: 50px;
        font-weight: 800;
        font-size: 0.95rem;
        box-shadow: 0 8px 24px rgba(79, 70, 229, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all var(--transition);
        &:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(79, 70, 229, 0.5);
        }
      }
      .cart-badge {
        background: white;
        color: var(--primary);
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        font-weight: 900;
      }
    `,
  ],
})
export class App implements OnInit {
  currentPath = '';
  currentQuery = '';
  approvalTypes: any[] = [];
  logoutError = '';
  accessRequests = signal<any[]>([]);

  constructor(
    public cart: CartService,
    private router: Router,
    private api: ApiService,
    public auth: AuthService,
  ) {
    this.currentPath = this.router.url.split('?')[0];
    this.currentQuery = this.router.url;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects.split('?')[0];
      this.currentQuery = e.urlAfterRedirects;
    });
    // טעינת סוגי האישורים בכל פעם שמשתמשת מתחברת
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.api.getApprovalTypes().subscribe((t) => {
          if (this.auth.user()) this.approvalTypes = t;
        });
        this.refreshAccessRequests();
      } else {
        this.approvalTypes = [];
        this.accessRequests.set([]);
      }
    });
  }

  refreshAccessRequests() {
    this.api.getIncomingPageRequests().subscribe({
      next: (r) => this.accessRequests.set(r),
      error: () => {},
    });
  }

  ngOnInit() {}

  roleLabel(role: UserRole): string {
    return role === 'admin' ? 'מנהלת מערכת' : role === 'secretary' ? 'מזכירות' : 'לבורנטית';
  }

  logout() {
    this.logoutError = '';
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: (error) => (this.logoutError = error.error?.error || 'לא ניתן להתנתק כרגע'),
    });
  }

  isApprovalTypeActive(id: number): boolean {
    return this.currentPath === '/approvals' && this.currentQuery.includes(`type=${id}`);
  }

  isSingleApprovalActive(id: number): boolean {
    return this.currentPath === '/approvals/single' && this.currentQuery.includes(`type=${id}`);
  }

  isExamsSection(): boolean {
    return this.currentPath === '/exams' || this.currentPath.startsWith('/exams/');
  }

  isEquipmentSection(): boolean {
    return ['/equipment', '/scan', '/loans', '/calendar', '/checkout'].some(
      (p) =>
        this.currentPath === p ||
        this.currentPath.startsWith(p + '/') ||
        this.currentPath.startsWith(p + '?'),
    );
  }

  isApprovalsSection(): boolean {
    return this.currentPath === '/approvals' || this.currentPath.startsWith('/approvals/');
  }
}

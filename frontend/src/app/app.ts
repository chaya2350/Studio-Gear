import { Component, OnInit, effect, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from './services/cart.service';
import { ApiService } from './services/api.service';
import { AuthService, UserRole } from './services/auth.service';
import { NotificationsService } from './services/notifications.service';
import { NotificationDrawerComponent } from './components/notifications/notification-drawer';
import { Subject, interval } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, NotificationDrawerComponent],
  template: `
    <nav *ngIf="currentPath !== '/login' && currentPath !== '/kiosk'" class="navbar" (click)="searchResults = null">      <a routerLink="/" class="brand">
        <img src="/logo.png" class="brand-logo" alt="לוגו סמינר גור" />
        <span>סמינר גור</span>
      </a>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">בית</a>
        <a routerLink="/students" [class.active]="currentPath === '/students' || currentPath.startsWith('/students/')">תלמידות</a>
        <a routerLink="/students-table" routerLinkActive="active">📋 טבלה</a>
        <a routerLink="/equipment" [class.active]="isEquipmentSection()">השאלת ציוד</a>
        <a routerLink="/approvals" [class.active]="isApprovalsSection()">אישורים</a>
        <a routerLink="/exams" [class.active]="isExamsSection()">מבחנים</a>
        <a routerLink="/pages" routerLinkActive="active" class="pages-nav-link">
          דפים
          <span class="nav-badge" *ngIf="accessRequests().length + grantedCount > 0">{{ accessRequests().length + grantedCount }}</span>
        </a>
        <a routerLink="/messages" routerLinkActive="active">הודעות</a>
        <a routerLink="/calendar/personal" [class.active]="currentPath.startsWith('/calendar/')">לוח שנה</a>
        <a routerLink="/admin" routerLinkActive="active">ניהול</a>
        <button class="theme-toggle" (click)="toggleDarkMode()" [title]="isDark() ? 'מצב בהיר' : 'מצב כהה'">{{ isDark() ? '☀' : '☾' }}</button>
        <!-- פעמון התראות -->
        <button class="notif-bell" (click)="toggleNotifications(); $event.stopPropagation()" [title]="'התראות (' + notifs.unread() + ')'" [class.notif-bell--active]="notifs.unread() > 0" aria-label="פתח מרכז התראות">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-count" *ngIf="notifs.unread() > 0" aria-live="polite">{{ notifs.unread() > 9 ? '9+' : notifs.unread() }}</span>
        </button>
        <!-- קיוסק -->
        <a routerLink="/kiosk" class="kiosk-nav-btn" title="קיוסק השאלה עצמאית" aria-label="פתח קיוסק">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </a>
      </div>
      <!-- חיפוש גלובלי -->
      <div class="global-search" (click)="$event.stopPropagation()">
        <input [(ngModel)]="searchQuery" (input)="onGlobalSearch()" placeholder="חיפוש תלמידה, ציוד, קוד או ברקוד...">
        <div class="search-results" *ngIf="searchResults">
          <div *ngIf="searchResults.students.length" class="search-group">
            <div class="search-group-title">תלמידות</div>
            <a *ngFor="let s of searchResults.students" [routerLink]="['/students', s.id_number]" (click)="clearSearch()">
              {{ s.name }} — {{ s.id_number }}
            </a>
          </div>
          <div *ngIf="searchResults.equipment.length" class="search-group">
            <div class="search-group-title">ציוד</div>
            <a *ngFor="let e of searchResults.equipment" [routerLink]="['/equipment', e.id]" (click)="clearSearch()">
              {{ e.name }} — {{ e.barcode }}
            </a>
          </div>
          <div *ngIf="searchResults.examCodes.length" class="search-group">
            <div class="search-group-title">קודי מבחן</div>
            <a routerLink="/exams/scan" (click)="clearSearch()">
              {{ searchResults.examCodes[0].code }} — {{ searchResults.examCodes[0].student_name }}
            </a>
          </div>
          <p *ngIf="!searchResults.students.length && !searchResults.equipment.length && !searchResults.examCodes.length" class="search-empty">לא נמצאו תוצאות</p>
        </div>
      </div>
      <div class="account-actions" *ngIf="auth.user() as user">
        <span>{{ user.name }} · {{ roleLabel(user.role) }}</span>
        <button class="logout-btn" (click)="logout()">יציאה</button>
      </div>
      <span *ngIf="logoutError" class="logout-error" role="alert">{{ logoutError }}</span>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && currentPath !== '/kiosk' && isApprovalsSection()">
      <ng-container *ngFor="let t of approvalTypes">
        <a
          *ngIf="t.type !== 'single'"
          [routerLink]="['/approvals']"
          [queryParams]="{ type: t.id }"
          [class.active]="isApprovalTypeActive(t.id)"
          (click)="clearSearch()"
        >
          {{ t.name }}
        </a>
        <a
          *ngIf="t.type === 'single'"
          [routerLink]="['/approvals/single']"
          [queryParams]="{ type: t.id }"
          [class.active]="isSingleApprovalActive(t.id)"
        >
          {{ t.name }}
        </a>
      </ng-container>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && currentPath !== '/kiosk' && isExamsSection()">
      <a routerLink="/exams" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">ניהול מבחנים וברקודים</a>
      <a routerLink="/exams/scan" routerLinkActive="active">רישום ציון</a>
    </nav>

    <nav class="subnav" *ngIf="currentPath !== '/login' && isEquipmentSection()">
      <a
        routerLink="/equipment"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        >ציוד</a
      >
      <a routerLink="/scan" routerLinkActive="active">סריקה</a>
      <a routerLink="/loans" routerLinkActive="active">השאלות</a>
      <a routerLink="/checkout" routerLinkActive="active">הזמנה</a>
    </nav>

    <main class="container" [class.login-container]="currentPath === '/login'">
      <router-outlet />
    </main>
    <footer *ngIf="currentPath !== '/login' && currentPath !== '/attendance/print'" class="app-footer">
      <img src="/MCP.png" alt="MCP" class="footer-logo" />
      <span>כל הזכויות שמורות</span>
    </footer>
    <a *ngIf="currentPath !== '/login' && cart.count() > 0" routerLink="/checkout" class="cart-fab">
      הזמנה
      <span class="cart-badge">{{ cart.count() }}</span>
    </a>

    <!-- מרכז התראות -->
    <app-notification-drawer
      *ngIf="notifOpen"
      (close)="notifOpen = false">
    </app-notification-drawer>
  `,
  styles: [
    `
      .global-search { position: relative; margin-left: 12px;
        input { width: 220px; padding: 8px 14px; border: 1.5px solid var(--border); border-radius: 999px;
          font: inherit; font-size: 0.83rem; background: var(--surface-2); color: var(--text);
          &:focus { outline: none; border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 3px var(--primary-glow); } } }
      .search-results {
        position: absolute; top: calc(100% + 8px); inset-inline-end: 0; width: 320px; max-height: 380px; overflow-y: auto;
        background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg); padding: 8px; z-index: 300; }
      .search-group-title { font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;
        letter-spacing: 0.5px; padding: 6px 10px 4px; }
      .search-results a { display: block; padding: 8px 10px; border-radius: var(--radius-xs); text-decoration: none;
        color: var(--text); font-size: 0.83rem;
        &:hover { background: var(--primary-light); color: var(--primary); } }
      .search-empty { padding: 10px; text-align: center; font-size: 0.8rem; color: var(--text-muted); }
      .theme-toggle {
        margin-inline-start: 8px; padding: 6px 10px; border: 1.5px solid var(--border); border-radius: 999px;
        background: var(--surface-2); color: var(--text); cursor: pointer; font-size: 0.9rem; line-height: 1;
        &:hover { border-color: var(--primary); color: var(--primary); } }
      .nav-badge {
        background: var(--danger); color: white; border-radius: 999px;
        min-width: 17px; height: 17px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 0.62rem; font-weight: 800; padding: 0 4px; margin-right: 4px;
        vertical-align: 2px;
      }
      .brand {
        text-decoration: none;
      }
      .brand-logo {
        height: 42px;
        width: auto;
        object-fit: contain;
        padding: 3px 5px;
        border-radius: 8px;
        background: var(--logo-backdrop);
        filter: var(--logo-filter);
        box-shadow: 0 1px 5px rgba(0,0,0,0.12);
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
      /* ── Notification Bell ── */
      .notif-bell {
        position: relative;
        width: 36px;
        height: 36px;
        border: 1.5px solid var(--border);
        border-radius: 999px;
        background: var(--surface-2);
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.18s;
        padding: 0;
        margin-inline-start: 4px;
        flex-shrink: 0;
        svg { width: 18px; height: 18px; transition: transform 0.2s; }
        &:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-light);
          svg { transform: rotate(-12deg) scale(1.1); }
        }
        &--active {
          border-color: var(--warning);
          color: var(--warning);
          background: rgba(245,158,11,0.08);
          animation: bell-ring 2.5s ease-in-out infinite;
        }
      }
      @keyframes bell-ring {
        0%, 100% { transform: rotate(0); }
        10%       { transform: rotate(-8deg); }
        20%       { transform: rotate(8deg); }
        30%       { transform: rotate(-6deg); }
        40%       { transform: rotate(6deg); }
        50%       { transform: rotate(0); }
      }
      .notif-count {
        position: absolute;
        top: -4px;
        left: -4px;
        min-width: 17px;
        height: 17px;
        background: var(--danger);
        color: #fff;
        border-radius: 999px;
        font-size: 0.6rem;
        font-weight: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 3px;
        border: 2px solid var(--surface);
        line-height: 1;
      }
      /* ── Kiosk nav button ── */
      .kiosk-nav-btn {
        width: 36px;
        height: 36px;
        border: 1.5px solid var(--border);
        border-radius: 999px;
        background: var(--surface-2);
        color: var(--text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: all 0.18s;
        flex-shrink: 0;
        svg { width: 18px; height: 18px; }
        &:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-light);
        }
      }
      .login-container {
        max-width: none;
        padding: 0;
      }
      .app-footer {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 6px;
        padding: 8px 12px 14px;
        font-size: 0.72rem;
        color: var(--text-muted);
        letter-spacing: 0.02em;
      }
      .footer-logo {
        height: 48px;
        width: auto;
        object-fit: contain;
        opacity: 1;
        padding: 4px 8px;
        border-radius: 10px;
        background: var(--logo-backdrop);
        filter: var(--logo-filter);
        box-shadow: 0 2px 8px rgba(0,0,0,0.14);
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
  notifOpen = false;
  accessRequests = signal<any[]>([]);
  grantedCount = 0;
  private destroy$ = new Subject<void>();
  searchQuery = '';
  searchResults: { students: any[]; equipment: any[]; examCodes: any[] } | null = null;
  private searchTimer: any;

  toggleNotifications() {
    this.notifOpen = !this.notifOpen;
    if (this.notifOpen) this.notifs.markAllRead();
  }

  private isAttendanceSessionBarcode(q: string) {
    return /^ATT-T\d+-[^-]+-\d{4}-\d{2}-\d{2}$/.test(q.trim());
  }

  onGlobalSearch() {
    clearTimeout(this.searchTimer);
    const q = this.searchQuery.trim();

    if (this.isAttendanceSessionBarcode(q)) {
      this.searchResults = null;
      this.router.navigate(['/attendance/scan'], { queryParams: { barcode: q } });
      return;
    }

    if (q.length < 2) { this.searchResults = null; return; }
    this.searchTimer = setTimeout(() => {
      this.api.globalSearch(q).subscribe(r => this.searchResults = r);
    }, 250);
  }

  clearSearch() { this.searchQuery = ''; this.searchResults = null; }

  isDark() { return document.documentElement.classList.contains('dark'); }

  toggleDarkMode() {
    const el = document.documentElement;
    el.classList.toggle('dark');
    localStorage.setItem('theme', el.classList.contains('dark') ? 'dark' : 'light');
  }

  constructor(
    public cart: CartService,
    private router: Router,
    private api: ApiService,
    public auth: AuthService,
    public notifs: NotificationsService,
  ) {
    this.currentPath = this.router.url.split('?')[0];
    this.currentQuery = this.router.url;
    // הפעלת מצב כהה אם נשמר בעבר
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects.split('?')[0];
      this.currentQuery = e.urlAfterRedirects;
      this.notifOpen = false;
    });
    // טעינת סוגי האישורים בכל פעם שמשתמשת מתחברת
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.api.getApprovalTypes().subscribe((t) => {
          if (this.auth.user()) this.approvalTypes = t;
        });
        this.refreshAccessRequests();
        // בדיקת בקשות גישה חדשות כל 30 שניות
        interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.auth.user()) this.refreshAccessRequests();
        });
        // טעינת התראות ראשונית + polling כל 60 שניות
        this.notifs.refresh().subscribe();
        interval(60000).pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.auth.user()) this.notifs.refresh().subscribe();
        });
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
    // ספירת אישורי גישה חדשים (למבקשות) — עיגול בתפריט ליד "דפים"
    this.api.getPageTopics().subscribe({
      next: (t) => this.grantedCount = t.reduce((s: number, x: any) => s + (x.granted_requests || 0), 0),
      error: () => {},
    });
  }

  ngOnInit() {}

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

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

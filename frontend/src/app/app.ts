import { Component, HostListener, OnInit, effect, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from './services/cart.service';
import { ApiService } from './services/api.service';
import { AuthService, UserRole } from './services/auth.service';
import { MessagesService } from './services/messages.service';
import { NotificationsService } from './services/notifications.service';
import { LoadingService } from './services/loading.service';
import { NotificationDrawerComponent } from './components/notifications/notification-drawer';
import { Subject, forkJoin, interval } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, NotificationDrawerComponent],
  template: `
    <!-- ───────────── TOPBAR ───────────── -->
    <header
      *ngIf="currentPath !== '/login' && currentPath !== '/kiosk'"
      class="topbar"
      (click)="searchResults = null"
    >
      <!-- Toggle sidebar button -->
      <button class="sidebar-toggle" (click)="toggleSidebar(); $event.stopPropagation()" [title]="sidebarCollapsed ? 'הרחב תפריט' : 'כווץ תפריט'" aria-label="toggle sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <!-- Brand -->
      <a routerLink="/" class="topbar-brand">
        <img src="/logo.png" class="topbar-logo" alt="לוגו סמינר גור" />
        <span class="topbar-title">סמינר גור</span>
      </a>

      <!-- Global search -->
      <div *ngIf="auth.hasPermission('search')" class="global-search" (click)="$event.stopPropagation()">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input [(ngModel)]="searchQuery" (input)="onGlobalSearch()" placeholder="חיפוש או שאלה בעברית…" aria-label="חיפוש גלובלי">
        <button *ngIf="searchQuery" class="search-clear" (click)="clearSearch()" aria-label="נקה חיפוש">✕</button>
        <div class="search-results" *ngIf="searchResults" (click)="$event.stopPropagation()">
          <div *ngIf="searchResults.students.length" class="search-group">
            <div class="search-group-title">תלמידות</div>
            <a *ngFor="let s of searchResults.students" [routerLink]="['/students', s.id_number]" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              {{ s.name }} <span>{{ s.id_number }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.teachers.length" class="search-group">
            <div class="search-group-title">מורות</div>
            <a *ngFor="let t of searchResults.teachers" [routerLink]="['/teachers', t.id]" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              {{ t.name }} <span>{{ t.subject || 'מורה' }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.equipment.length" class="search-group">
            <div class="search-group-title">ציוד</div>
            <a *ngFor="let e of searchResults.equipment" [routerLink]="['/equipment', e.id]" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
              {{ e.name }} <span>{{ e.barcode }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.examCodes.length" class="search-group">
            <div class="search-group-title">קודי מבחן</div>
            <a *ngIf="auth.hasPermission('exams', 'edit')" routerLink="/exams/scan" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              {{ searchResults.examCodes[0].code }} — {{ searchResults.examCodes[0].student_name }}
            </a>
          </div>
          <div *ngIf="searchResults.pages?.length" class="search-group">
            <div class="search-group-title">דפים</div>
            <a *ngFor="let p of searchResults.pages" [routerLink]="['/pages']" [queryParams]="{ page: p.id }" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              {{ p.title }} <span>{{ p.topic_name }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.calendarEvents?.length" class="search-group">
            <div class="search-group-title">ארועי לוח שנה</div>
            <a *ngFor="let ev of searchResults.calendarEvents" [routerLink]="['/calendar/events', ev.id]" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {{ ev.title }} <span>{{ ev.event_date }} · {{ ev.category }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.exams?.length" class="search-group">
            <div class="search-group-title">מבחנים</div>
            <a *ngFor="let ex of searchResults.exams" [routerLink]="['/exams', ex.id, 'edit']" (click)="clearSearch()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
              {{ ex.name }} <span>{{ ex.exam_date }}{{ ex.track ? ' · ' + ex.track : '' }}</span>
            </a>
          </div>
          <div *ngIf="searchResults.naturalType === 'rooms'" class="search-group natural-results">
            <div class="search-group-title">חדרים פנויים · {{ searchResults.naturalDate }} · {{ searchResults.naturalStart }}–{{ searchResults.naturalEnd }}</div>
            <a *ngFor="let room of searchResults.rooms || []" routerLink="/schedule/rooms"
               [queryParams]="{ date: searchResults.naturalDate, start: searchResults.naturalStart, end: searchResults.naturalEnd }"
               (click)="clearSearch()">
              <span class="natural-result-icon">{{ room.number }}</span>
              <span>חדר {{ room.number }} · {{ room.name }} · קומה {{ room.floor }}</span>
            </a>
            <p *ngIf="!searchResults.rooms?.length" class="search-empty">{{ searchResults.naturalMessage || 'לא נמצאו חדרים פנויים בטווח הזה' }}</p>
          </div>
          <div *ngIf="searchResults.naturalType === 'requirements'" class="search-group natural-results">
            <div class="search-group-title">תלמידות עם דרישות חובה חסרות</div>
            <a *ngFor="let student of searchResults.missingRequirements || []" [routerLink]="['/students', student.id_number]" (click)="clearSearch()">
              <span class="natural-result-icon">{{ student.missing_required }}</span>
              <span>{{ student.name }} · {{ student.track }}{{ student.year ? ' ' + student.year : '' }} · דרישות חסרות</span>
            </a>
            <p *ngIf="!searchResults.missingRequirements?.length" class="search-empty">{{ searchResults.naturalMessage || 'לא נמצאו דרישות חסרות' }}</p>
          </div>
          <p *ngIf="!searchResults.naturalType && !searchResults.students.length && !searchResults.teachers?.length && !searchResults.equipment.length && !searchResults.examCodes.length && !searchResults.pages?.length && !searchResults.calendarEvents?.length && !searchResults.exams?.length" class="search-empty">לא נמצאו תוצאות</p>
        </div>
      </div>

      <div class="topbar-actions">
        <!-- Dark mode -->
        <button class="icon-btn" (click)="toggleDarkMode()" [title]="isDark() ? 'מצב בהיר' : 'מצב כהה'">
          <svg *ngIf="!isDark()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg *ngIf="isDark()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1"  x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1"  y1="12" x2="3"  y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
            <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
          </svg>
        </button>

        <!-- Notifications -->
        <button class="icon-btn notif-btn" (click)="toggleNotifications(); $event.stopPropagation()"
          [class.notif-btn--active]="notifs.unread() > 0"
          [title]="'התראות (' + notifs.unread() + ')'"
          aria-label="פתח מרכז התראות">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-count" *ngIf="notifs.unread() > 0" aria-live="polite">{{ notifs.unread() > 9 ? '9+' : notifs.unread() }}</span>
        </button>

        <!-- User info -->
        <div class="user-pill" *ngIf="auth.user() as user">
          <div class="user-avatar">{{ user.name.charAt(0) }}</div>
          <div class="user-info">
            <span class="user-name">{{ user.name }}</span>
            <span class="user-role">{{ roleLabel(user.role) }}</span>
          </div>
          <button class="logout-btn" (click)="logout()" title="יציאה">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
        <span *ngIf="logoutError" class="logout-error" role="alert">{{ logoutError }}</span>
      </div>
    </header>

    <!-- ───────────── LAYOUT SHELL ───────────── -->
    <div class="app-shell" [class.has-nav]="currentPath !== '/login' && currentPath !== '/kiosk'" [class.kiosk-layout]="currentPath === '/kiosk'" [class.sidebar-collapsed]="sidebarCollapsed">

      <!-- ── SIDEBAR ── -->
      <aside
        *ngIf="currentPath !== '/login' && currentPath !== '/kiosk'"
        class="sidebar"
        [class.collapsed]="sidebarCollapsed"
      >
        <!-- Kiosk shortcut at top -->
        <a *ngIf="auth.hasPermission('equipment')" routerLink="/kiosk" class="sidebar-kiosk" [title]="sidebarCollapsed ? 'קיוסק' : ''" (click)="clearSearch()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <span>קיוסק</span>
        </a>

        <nav class="sidebar-nav">
          <!-- בית -->
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="sidebar-item" [title]="sidebarCollapsed ? 'בית' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>בית</span>
          </a>

          <!-- ── תלמידות ── -->
          <div class="sidebar-group-label" *ngIf="!sidebarCollapsed && auth.hasPermission('students')">תלמידות</div>
          <div class="sidebar-divider" *ngIf="sidebarCollapsed && auth.hasPermission('students')"></div>
          <a *ngIf="auth.hasPermission('students')" routerLink="/students" [class.active]="currentPath === '/students' || (currentPath.startsWith('/students/') && !currentPath.startsWith('/students-table'))" class="sidebar-item" [title]="sidebarCollapsed ? 'תלמידות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>תלמידות</span>
          </a>
          <a *ngIf="auth.hasPermission('students')" routerLink="/students-table" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'טבלת תלמידות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
            <span>טבלת תלמידות</span>
          </a>
          <a *ngIf="auth.hasPermission('students')" routerLink="/graduates" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'בוגרות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="m2 9 10-5 10 5-10 5L2 9Z"/>
              <path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6"/>
            </svg>
            <span>בוגרות</span>
          </a>
          <a *ngIf="auth.hasPermission('teachers')" routerLink="/teachers/search" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'מורות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 14c-4 0-6 2-6 4v1h12v-1c0-2-2-4-6-4z"/>
              <circle cx="12" cy="8" r="4"/>
              <path d="M20 8v6"/>
              <path d="M23 11h-6"/>
            </svg>
            <span>מורות</span>
          </a>
          <a *ngIf="auth.hasPermission('schedule')" routerLink="/schedule" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="sidebar-item" [title]="sidebarCollapsed ? 'מערכת שעות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="3" y1="14" x2="21" y2="14"/>
              <line x1="8" y1="10" x2="8" y2="20"/>
              <line x1="16" y1="10" x2="16" y2="20"/>
            </svg>
            <span>מערכת שעות</span>
          </a>
          <a *ngIf="auth.hasPermission('schedule')" routerLink="/schedule/rooms" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'מפת חדרים' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M12 3v18M3 12h18"/>
            </svg>
            <span>מפת חדרים</span>
          </a>

          <!-- ── ציוד ── -->
          <div class="sidebar-group-label" *ngIf="!sidebarCollapsed && auth.hasPermission('equipment')">ציוד</div>
          <div class="sidebar-divider" *ngIf="sidebarCollapsed && auth.hasPermission('equipment')"></div>
          <a *ngIf="auth.hasPermission('equipment')" routerLink="/equipment" [class.active]="isEquipmentSection()" class="sidebar-item" [title]="sidebarCollapsed ? 'השאלת ציוד' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7h16M4 12h16M4 17h7"/>
              <rect x="14" y="13" width="7" height="7" rx="1"/>
            </svg>
            <span>השאלת ציוד</span>
          </a>
          <a *ngIf="auth.hasPermission('equipment')" routerLink="/scan" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'סריקה' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
              <line x1="7" y1="12" x2="17" y2="12"/>
            </svg>
            <span>סריקה</span>
          </a>
          <a *ngIf="auth.hasPermission('loans')" routerLink="/loans" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'השאלות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="12" y2="17"/>
            </svg>
            <span>השאלות</span>
          </a>

          <!-- ── לוחות שנה ── -->
          <div class="sidebar-group-label" *ngIf="!sidebarCollapsed && (auth.hasPermission('calendar') || auth.hasPermission('attendance'))">לוח שנה</div>
          <div class="sidebar-divider" *ngIf="sidebarCollapsed && (auth.hasPermission('calendar') || auth.hasPermission('attendance'))"></div>
          <a *ngIf="auth.hasPermission('calendar')" routerLink="/calendar/personal" [class.active]="currentPath.startsWith('/calendar/')" class="sidebar-item" [title]="sidebarCollapsed ? 'לוח שנה' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>לוח שנה</span>
          </a>
          <a *ngIf="auth.hasPermission('attendance')" routerLink="/attendance/scan" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'סריקת נוכחות' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span>סריקת נוכחות</span>
          </a>

          <!-- ── מנהל ── -->
          <div class="sidebar-group-label" *ngIf="!sidebarCollapsed && (auth.hasPermission('approvals') || auth.hasPermission('exams') || auth.hasPermission('pages') || auth.hasPermission('messages') || auth.hasPermission('reports') || auth.hasPermission('admin_panel'))">ניהול</div>
          <div class="sidebar-divider" *ngIf="sidebarCollapsed && (auth.hasPermission('approvals') || auth.hasPermission('exams') || auth.hasPermission('pages') || auth.hasPermission('messages') || auth.hasPermission('reports') || auth.hasPermission('admin_panel'))"></div>
          <a *ngIf="auth.hasPermission('approvals')" routerLink="/approvals" [class.active]="isApprovalsSection()" class="sidebar-item" [title]="sidebarCollapsed ? 'אישורים' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>אישורים</span>
          </a>
          <a *ngIf="auth.hasPermission('exams')" routerLink="/exams" [class.active]="isExamsSection()" class="sidebar-item" [title]="sidebarCollapsed ? 'מבחנים' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
              <line x1="9" y1="16" x2="12" y2="16"/>
            </svg>
            <span>מבחנים</span>
          </a>
          <a *ngIf="auth.hasPermission('pages')" routerLink="/pages" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'דפים' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <span>
              דפים
              <span class="sidebar-badge" *ngIf="accessRequests().length + grantedCount > 0">{{ accessRequests().length + grantedCount }}</span>
            </span>
          </a>
          <a *ngIf="auth.hasPermission('messages')" routerLink="/messages" routerLinkActive="active" class="sidebar-item"
            [title]="sidebarCollapsed ? (messages.unreadCount() > 0 ? 'הודעה חדשה' : 'הודעות') : ''"
            [attr.aria-label]="messages.unreadCount() > 0 ? 'הודעות, יש הודעה חדשה שלא נקראה' : 'הודעות'"
            (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>הודעות</span>
            <span *ngIf="messages.unreadCount() > 0" class="sidebar-unread-dot" aria-hidden="true"></span>
          </a>
          <a *ngIf="auth.hasPermission('reports')" routerLink="/database" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'מסד נתונים' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <span>מסד נתונים</span>
          </a>
          <a *ngIf="auth.hasPermission('admin_panel')" routerLink="/admin" routerLinkActive="active" class="sidebar-item" [title]="sidebarCollapsed ? 'ניהול מערכת' : ''" (click)="clearSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M19.07 4.93l-1.42 1.42M5.64 18.36l-1.41 1.41M19.07 19.07A10 10 0 0 0 4.93 4.93M19.07 19.07l-1.42-1.42M5.64 5.64 4.23 4.23"/>
            </svg>
            <span>ניהול מערכת</span>
          </a>
        </nav>
      </aside>

      <!-- ── MAIN ── -->
      <div class="main-area">
        <!-- Subnav for approvals -->
        <nav class="subnav" *ngIf="currentPath !== '/login' && currentPath !== '/kiosk' && isApprovalsSection()">
          <ng-container *ngFor="let t of approvalTypes">
            <a *ngIf="t.type !== 'single'" [routerLink]="['/approvals']" [queryParams]="{ type: t.id }" [class.active]="isApprovalTypeActive(t.id)" (click)="clearSearch()">{{ t.name }}</a>
            <a *ngIf="t.type === 'single'" [routerLink]="['/approvals/single']" [queryParams]="{ type: t.id }" [class.active]="isSingleApprovalActive(t.id)">{{ t.name }}</a>
          </ng-container>
        </nav>

        <!-- Subnav for exams -->
        <nav class="subnav" *ngIf="currentPath !== '/login' && currentPath !== '/kiosk' && isExamsSection()">
          <a routerLink="/exams" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">ניהול מבחנים וברקודים</a>
          <a routerLink="/exams/scan" routerLinkActive="active">רישום ציון</a>
        </nav>

        <!-- Subnav for equipment -->
        <nav class="subnav" *ngIf="currentPath !== '/login' && isEquipmentSection()">
          <a routerLink="/equipment" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">ציוד</a>
          <a routerLink="/scan" routerLinkActive="active">סריקה</a>
          <a routerLink="/loans" routerLinkActive="active">השאלות</a>
          <a routerLink="/checkout" routerLinkActive="active">הזמנה</a>
        </nav>

        <main class="container" [class.login-container]="currentPath === '/login'" [class.kiosk-container]="currentPath === '/kiosk'">
          <router-outlet />
        </main>

        <footer *ngIf="currentPath !== '/login' && currentPath !== '/kiosk'" class="app-footer">
          <img src="/MCP.png" alt="MCP" class="footer-logo" />
          <span>כל הזכויות שמורות</span>
        </footer>
      </div>
    </div>

    <!-- Cart FAB -->
    <a *ngIf="currentPath !== '/login' && cart.count() > 0" routerLink="/checkout" class="cart-fab">
      הזמנה
      <span class="cart-badge">{{ cart.count() }}</span>
    </a>

    <!-- Notification drawer -->
    <app-notification-drawer *ngIf="notifOpen" (close)="notifOpen = false"></app-notification-drawer>

    <div *ngIf="loading.visible()" class="global-loading-overlay" role="status" aria-live="polite" aria-label="טעינה">
      <div class="global-loading-dialog">
        <span class="loading-dots global-loading-spinner" aria-hidden="true"><i></i><i></i><i></i></span>
        <span *ngIf="loading.progress() !== null" class="global-loading-progress">{{ loading.progress() }}%</span>
      </div>
    </div>
  `,
  styles: [
    `
    /* ── Topbar ───────────────────────────────────── */
    .topbar {
      position: fixed;
      top: 0;
      right: 0;
      left: 0;
      height: 58px;
      z-index: 200;
      background: var(--surface-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      box-shadow: 0 1px 0 var(--border), 0 2px 12px rgba(15,23,42,0.05);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 20px;
    }

    .sidebar-toggle {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-xs);
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.18s;
      svg { width: 16px; height: 16px; }
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }

    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text);
      font-weight: 800;
      font-size: 1rem;
      flex-shrink: 0;
      .topbar-logo {
        height: 36px;
        width: auto;
        object-fit: contain;
        padding: 2px 4px;
        border-radius: 7px;
        background: var(--logo-backdrop);
        filter: var(--logo-filter);
        box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      }
      .topbar-title { letter-spacing: -0.3px; }
    }

    /* ── Global Search ─────────────────────────── */
    .global-search {
      position: relative;
      flex: 1;
      max-width: 420px;
      margin: 0 auto;
      display: flex;
      align-items: center;

      .search-icon {
        position: absolute;
        right: 12px;
        width: 15px;
        height: 15px;
        color: var(--text-muted);
        pointer-events: none;
      }

      input {
        width: 100%;
        padding: 8px 36px 8px 36px;
        border: 1.5px solid var(--border);
        border-radius: 999px;
        font: inherit;
        font-size: 0.84rem;
        background: var(--surface-2);
        color: var(--text);
        transition: all 0.18s;
        &:focus {
          outline: none;
          border-color: var(--primary);
          background: var(--surface);
          box-shadow: 0 0 0 3px var(--primary-glow);
        }
        &::placeholder { color: var(--text-light); }
      }

      .search-clear {
        position: absolute;
        left: 12px;
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 0.8rem;
        padding: 2px;
        line-height: 1;
        &:hover { color: var(--text); }
      }
    }

    .search-results {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      left: 0;
      max-height: 400px;
      overflow-y: auto;
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-lg);
      padding: 8px;
      z-index: 300;
    }
    .search-group-title {
      font-size: 0.67rem;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 6px 10px 4px;
    }
    .search-results a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-xs);
      text-decoration: none;
      color: var(--text);
      font-size: 0.83rem;
      svg { width: 15px; height: 15px; color: var(--text-muted); flex-shrink: 0; }
      span { color: var(--text-muted); font-size: 0.78rem; }
      &:hover { background: var(--primary-light); color: var(--primary); svg { color: var(--primary); } }
    }
    .search-empty { padding: 12px 10px; text-align: center; font-size: 0.8rem; color: var(--text-muted); }

    /* ── Topbar right actions ──────────────────── */
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-right: auto;
      flex-shrink: 0;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      border: 1.5px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.18s;
      position: relative;
      flex-shrink: 0;
      svg { width: 16px; height: 16px; transition: transform 0.2s; }
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }

    .notif-btn {
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
      min-width: 16px;
      height: 16px;
      background: var(--danger);
      color: #fff;
      border-radius: 999px;
      font-size: 0.58rem;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      border: 2px solid var(--surface);
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px 4px 6px;
      border: 1.5px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      cursor: default;
    }
    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--grad-primary);
      color: white;
      font-size: 0.8rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .user-info {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .user-name { font-size: 0.8rem; font-weight: 700; color: var(--text); }
    .user-role { font-size: 0.68rem; color: var(--text-muted); }
    .logout-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.18s;
      svg { width: 15px; height: 15px; }
      &:hover { background: var(--danger-soft); color: var(--danger); }
    }
    .logout-error { color: var(--danger); font-size: 0.75rem; }

    /* ── App shell layout ──────────────────────── */
    .app-shell {
      min-height: 100vh;

      &.has-nav {
        padding-top: 58px;
      }

      &:not(.has-nav) .main-area {
        width: 100%;
        margin-right: 0;
      }

      &.kiosk-layout .main-area,
      &.kiosk-layout .kiosk-container {
        min-height: 100vh;
      }
    }

    /* ── Sidebar ───────────────────────────────── */
    .sidebar {
      position: fixed;
      top: 58px;
      right: 0;
      bottom: 0;
      width: 220px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      z-index: 100;
      overflow-y: auto;
      overflow-x: hidden;
      transition: width 0.22s cubic-bezier(0.4,0,0.2,1);
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;

      &.collapsed { width: 60px; }

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    }

    .sidebar-kiosk {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      margin: 10px 8px 4px;
      border-radius: var(--radius-xs);
      text-decoration: none;
      background: var(--grad-primary);
      color: white;
      font-size: 0.82rem;
      font-weight: 700;
      transition: all 0.18s;
      white-space: nowrap;
      overflow: hidden;
      svg { width: 17px; height: 17px; flex-shrink: 0; }
      span { overflow: hidden; white-space: nowrap; }
      &:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13,148,136,0.3); }

      .collapsed & { justify-content: center; padding: 10px 0; margin-inline: 8px; }
      .collapsed & span { display: none; }
    }

    .sidebar-nav {
      padding: 4px 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }

    .sidebar-group-label {
      font-size: 0.63rem;
      font-weight: 800;
      color: var(--text-light);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 10px 8px 4px;
      white-space: nowrap;
      overflow: hidden;
    }

    .sidebar-divider {
      height: 1px;
      background: var(--border);
      margin: 8px 6px;
    }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: var(--radius-xs);
      text-decoration: none;
      color: var(--text-muted);
      font-size: 0.845rem;
      font-weight: 600;
      transition: all 0.15s;
      white-space: nowrap;
      overflow: hidden;
      position: relative;

      svg { width: 17px; height: 17px; flex-shrink: 0; transition: color 0.15s; }
      span { overflow: hidden; text-overflow: ellipsis; }

      &:hover {
        background: var(--primary-light);
        color: var(--primary);
        svg { color: var(--primary); }
      }

      &.active {
        background: var(--primary-light);
        color: var(--primary);
        font-weight: 700;
        svg { color: var(--primary); }
        &::before {
          content: '';
          position: absolute;
          right: 0;
          top: 4px;
          bottom: 4px;
          width: 3px;
          border-radius: 3px 0 0 3px;
          background: var(--primary);
        }
      }

      .collapsed & {
        justify-content: center;
        padding: 9px 0;
        span { display: none; }
        &::before { display: none; }
      }
    }

    .sidebar-badge {
      background: var(--danger);
      color: white;
      border-radius: 999px;
      min-width: 17px;
      height: 17px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 800;
      padding: 0 4px;
      margin-right: 4px;
      vertical-align: 1px;
      flex-shrink: 0;
    }

    .sidebar-unread-dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      flex: 0 0 9px;
      margin-inline-start: auto;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--danger);
      box-sizing: content-box;
    }

    .sidebar.collapsed .sidebar-item > .sidebar-badge {
      display: inline-flex;
      position: absolute;
      top: 3px;
      right: calc(50% - 19px);
      margin: 0;
    }

    .sidebar.collapsed .sidebar-item > .sidebar-unread-dot {
      display: block;
      position: absolute;
      top: 4px;
      right: calc(50% - 17px);
      margin: 0;
    }

    /* ── Main content area ─────────────────────── */
    .main-area {
      width: calc(100% - 220px);
      margin-right: 220px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      transition: width 0.22s cubic-bezier(0.4,0,0.2,1), margin-right 0.22s cubic-bezier(0.4,0,0.2,1);

      .sidebar-collapsed & {
        width: calc(100% - 60px);
        margin-right: 60px;
      }
    }

    /* ── Subnav ────────────────────────────────── */
    .subnav {
      background: var(--primary);
      padding: 0 24px;
      display: flex;
      gap: 2px;
      align-items: center;
      height: 42px;
      position: sticky;
      top: 0;
      z-index: 90;

      a {
        color: rgba(255,255,255,0.75);
        text-decoration: none;
        padding: 6px 14px;
        border-radius: var(--radius-xs);
        font-size: 0.82rem;
        font-weight: 600;
        transition: all var(--transition);
        &:hover { background: rgba(255,255,255,0.15); color: white; }
        &.active { background: rgba(255,255,255,0.22); color: white; }
      }
    }

    /* ── Container / page ──────────────────────── */
    .container { width: 100%; padding: 28px 28px; box-sizing: border-box; }
    .login-container { max-width: none; padding: 0; margin: 0; }
    .kiosk-container { max-width: none; padding: 0; margin: 0; }

    /* ── Footer ────────────────────────────────── */
    .app-footer {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 6px;
      padding: 8px 12px 16px;
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: auto;
    }
    .footer-logo {
      height: 44px;
      width: auto;
      object-fit: contain;
      opacity: 1;
      padding: 4px 8px;
      border-radius: 10px;
      background: var(--logo-backdrop);
      filter: var(--logo-filter);
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    /* ── Cart FAB ───────────────────────────────── */
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
      box-shadow: 0 8px 24px rgba(13,148,136,0.38);
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all var(--transition);
      &:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(13,148,136,0.5); }
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
  sidebarCollapsed = false;
  accessRequests = signal<any[]>([]);
  grantedCount = 0;
  private destroy$ = new Subject<void>();
  searchQuery = '';
  searchResults: {
    students: any[]; equipment: any[]; examCodes: any[]; teachers: any[]; pages: any[];
    calendarEvents: any[]; exams: any[]; naturalType?: 'rooms' | 'requirements';
    naturalDate?: string; naturalStart?: string; naturalEnd?: string; naturalMessage?: string;
    rooms?: { number: string; name: string; floor: number }[];
    missingRequirements?: { id_number: string; name: string; track: string; year: string; missing_required: number }[];
  } | null = null;
  private searchTimer: any;
  private barcodeBuffer = '';
  private barcodeStartedAt = 0;
  private barcodeLastKeyAt = 0;

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed ? '1' : '0');
  }

  toggleNotifications() {
    this.notifOpen = !this.notifOpen;
    if (this.notifOpen) this.notifs.markAllRead();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalBarcodeKeydown(event: KeyboardEvent) {
    if (!this.auth.user() || this.currentPath === '/login' || this.currentPath === '/kiosk' ||
        event.ctrlKey || event.altKey || event.metaKey) {
      this.resetBarcodeBuffer();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      this.resetBarcodeBuffer();
      return;
    }

    const now = performance.now();
    if (event.key === 'Enter' || event.key === 'Tab') {
      const barcode = this.barcodeBuffer;
      const isFastScan = barcode.length >= 5 && now - this.barcodeStartedAt <= 1500;
      this.resetBarcodeBuffer();
      if (!isFastScan) return;
      event.preventDefault();
      event.stopPropagation();
      this.routeGlobalBarcode(barcode);
      return;
    }

    if (!/^[a-z0-9-]$/i.test(event.key)) {
      this.resetBarcodeBuffer();
      return;
    }
    if (!this.barcodeBuffer || now - this.barcodeLastKeyAt > 120) {
      this.barcodeBuffer = '';
      this.barcodeStartedAt = now;
    }
    this.barcodeBuffer += event.key;
    this.barcodeLastKeyAt = now;
  }

  private resetBarcodeBuffer() {
    this.barcodeBuffer = '';
    this.barcodeStartedAt = 0;
    this.barcodeLastKeyAt = 0;
  }

  private routeGlobalBarcode(rawBarcode: string) {
    const barcode = rawBarcode.trim();
    const orderMatch = /^ORDER-(\d+)$/i.exec(barcode);
    if (orderMatch) {
      this.router.navigate(['/loans'], { queryParams: { order: Number(orderMatch[1]) } });
      return;
    }
    if (/^ATT-T\d+-[^-]+-\d{4}-\d{2}-\d{2}$/i.test(barcode)) {
      this.router.navigate(['/attendance/scan'], { queryParams: { barcode } });
      return;
    }
    const studentMatch = /^STU-(.+)$/i.exec(barcode);
    if (studentMatch) {
      if (this.currentPath === '/attendance/scan') {
        this.router.navigate(['/attendance/scan'], { queryParams: { barcode } });
      } else {
        this.router.navigate(['/students', studentMatch[1]]);
      }
      return;
    }
    if (/^EX\d+-/i.test(barcode)) {
      this.router.navigate(['/exams/scan'], { queryParams: { code: barcode } });
      return;
    }

    this.api.getEquipmentByBarcode(barcode).subscribe({
      next: item => this.router.navigate(['/equipment', item.id], {
        queryParams: { fromScan: '1', ...(item.is_loaned && item.loan_id ? { pay: '1' } : {}) }
      }),
      error: () => this.router.navigate(['/scan'], { queryParams: { barcode } })
    });
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

    const naturalQuestion = this.parseNaturalQuestion(q);
    if (naturalQuestion) {
      this.runNaturalSearch(naturalQuestion, q);
      return;
    }

    if (q.length < 2) { this.searchResults = null; return; }
    this.searchTimer = setTimeout(() => {
      this.api.globalSearch(q).subscribe((r) => {
        this.searchResults = {
          students: r?.students ?? [],
          equipment: r?.equipment ?? [],
          examCodes: r?.examCodes ?? [],
          teachers: r?.teachers ?? [],
          pages: r?.pages ?? [],
          calendarEvents: r?.calendarEvents ?? [],
          exams: r?.exams ?? [],
        };
      });
    }, 250);
  }

  private parseNaturalQuestion(query: string):
    | { type: 'rooms'; date: string; start: string; end: string }
    | { type: 'requirements' }
    | null {
    const text = query.toLocaleLowerCase('he').replace(/[,،؟?!]/g, ' ');
    if (/(?:מי|למי|תלמידות).*(?:חסרות|חסר).*(?:דרישות|דרישה)|(?:דרישות|דרישה).*(?:חסרות|חסר)/u.test(text)) {
      return { type: 'requirements' };
    }
    if (!(/(?:חדר|חדרים).*(?:פנוי|זמין)|(?:פנוי|זמין).*(?:חדר|חדרים)/u.test(text))) return null;

    const dayMatch = /(היום|מחר|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/u.exec(text);
    if (!dayMatch) return null;
    const timeRange = /(?:בין\s*)?(\d{1,2})(?::([0-5]\d))?\s*(?:עד|ל|[-–])\s*(\d{1,2})(?::([0-5]\d))?/u.exec(text);
    const startTime = timeRange
      ? `${timeRange[1].padStart(2, '0')}:${(timeRange[2] || '00').padStart(2, '0')}`
      : null;
    const endTime = timeRange
      ? `${timeRange[3].padStart(2, '0')}:${(timeRange[4] || '00').padStart(2, '0')}`
      : null;
    const afterTime = !timeRange ? /(?:אחרי|משעה|בשעה)\s*(\d{1,2})(?::([0-5]\d))?/u.exec(text) : null;
    if (!startTime && !afterTime) return null;

    let start = startTime || `${afterTime![1].padStart(2, '0')}:${(afterTime![2] || '00').padStart(2, '0')}`;
    let end = endTime;
    if (!end) {
      const startHour = Number(start.slice(0, 2));
      end = startHour >= 23 ? '23:59' : `${String(startHour + 1).padStart(2, '0')}:${start.slice(3)}`;
    }
    if (start >= end) return null;

    const date = this.dateForNaturalDay(dayMatch[1]);
    return date ? { type: 'rooms', date, start, end } : null;
  }

  private dateForNaturalDay(day: string): string {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const date = new Date(`${today}T12:00:00Z`);
    if (day === 'מחר') date.setUTCDate(date.getUTCDate() + 1);
    else if (day !== 'היום') {
      const weekday: Record<string, number> = {
        ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6
      };
      const target = weekday[day];
      date.setUTCDate(date.getUTCDate() + ((target - date.getUTCDay() + 7) % 7));
    }
    return date.toISOString().slice(0, 10);
  }

  private runNaturalSearch(question: NonNullable<ReturnType<App['parseNaturalQuestion']>>, query: string) {
    clearTimeout(this.searchTimer);
    if (question.type === 'rooms' && !this.auth.hasPermission('schedule')) {
      this.searchResults = { ...this.emptySearchResults(), naturalType: 'rooms', naturalMessage: 'אין הרשאה לצפייה במפת החדרים' };
      return;
    }
    if (question.type === 'requirements' &&
        (!this.auth.hasPermission('students') || !this.auth.hasPermission('tracks'))) {
      this.searchResults = { ...this.emptySearchResults(), naturalType: 'requirements', naturalMessage: 'אין הרשאה לצפייה בדרישות תלמידות' };
      return;
    }

    const empty = this.emptySearchResults();
    if (question.type === 'rooms') {
      this.searchResults = { ...empty, naturalType: 'rooms', naturalDate: question.date,
        naturalStart: question.start, naturalEnd: question.end, rooms: [] };
      forkJoin({
        rooms: this.api.getScheduleRoomMap(),
        availability: this.api.getScheduleRoomBookings(question.date, question.start, question.end)
      }).subscribe({
        next: result => {
          if (this.searchQuery.trim() !== query) return;
          const occupied = new Set(result.availability.bookings
            .filter(booking => !booking.cancelled).map(booking => booking.room_number));
          const rooms = result.rooms.filter(room => room.usable && !occupied.has(room.number))
            .map(({ number, name, floor }) => ({ number, name, floor }));
          this.searchResults = { ...empty, naturalType: 'rooms', naturalDate: question.date,
            naturalStart: question.start, naturalEnd: question.end, rooms };
        },
        error: error => {
          if (this.searchQuery.trim() === query) this.searchResults = {
            ...empty, naturalType: 'rooms', naturalMessage: error.error?.error || 'בדיקת זמינות החדרים נכשלה'
          };
        }
      });
      return;
    }

    this.searchResults = { ...empty, naturalType: 'requirements', missingRequirements: [] };
    this.api.getStudentsMissingRequirements().subscribe({
      next: students => {
        if (this.searchQuery.trim() === query) this.searchResults = {
          ...empty, naturalType: 'requirements', missingRequirements: students
        };
      },
      error: error => {
        if (this.searchQuery.trim() === query) this.searchResults = {
          ...empty, naturalType: 'requirements', naturalMessage: error.error?.error || 'טעינת דרישות חסרות נכשלה'
        };
      }
    });
  }

  private emptySearchResults() {
    return { students: [], equipment: [], examCodes: [], teachers: [], pages: [], calendarEvents: [], exams: [] };
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
    public messages: MessagesService,
    public notifs: NotificationsService,
    public loading: LoadingService,
  ) {
    this.currentPath = this.router.url.split('?')[0];
    this.currentQuery = this.router.url;
    // מצב כהה
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    // מצב sidebar
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === '1';

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects.split('?')[0];
      this.currentQuery = e.urlAfterRedirects;
      this.notifOpen = false;
    });
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.auth.user()) this.refreshUnreadMessages(true);
    });
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.refreshUnreadMessages();
        this.api.getApprovalTypes().subscribe((t) => {
          if (this.auth.user()) this.approvalTypes = t;
        });
        this.refreshAccessRequests();
        interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.auth.user()) this.refreshAccessRequests(true);
        });
        this.notifs.refresh().subscribe();
        interval(60000).pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.auth.user()) this.notifs.refresh(true).subscribe();
        });
      } else {
        this.messages.unreadCount.set(0);
        this.approvalTypes = [];
        this.accessRequests.set([]);
      }
    });
  }

  private refreshUnreadMessages(background = false) {
    this.messages.refreshUnreadCount(background).subscribe({
      error: error => console.error('Could not refresh unread message count', error)
    });
  }

  refreshAccessRequests(background = false) {
    this.api.getIncomingPageRequests(background).subscribe({
      next: (r) => this.accessRequests.set(r),
      error: () => {},
    });
    this.api.getPageTopics(background).subscribe({
      next: (t) => this.grantedCount = t.reduce((s: number, x: any) => s + (x.granted_requests || 0), 0),
      error: () => {},
    });
  }

  ngOnInit() {}
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  roleLabel(role: UserRole): string {
    const user = this.auth.user();
    return user?.role === role ? user.role_name || role : role;
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
    return ['/equipment', '/scan', '/loans', '/checkout'].some(
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

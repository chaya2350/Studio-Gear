import {
  Component, Output, EventEmitter, ChangeDetectionStrategy,
  OnInit, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificationsService, AppNotification } from '../../services/notifications.service';

@Component({
  selector: 'app-notification-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Backdrop -->
    <div class="backdrop" (click)="close.emit()" aria-hidden="true"></div>

    <!-- Drawer panel -->
    <aside class="drawer" role="dialog" aria-labelledby="notif-title">
      <header class="drawer-header">
        <h2 id="notif-title" class="drawer-title">🔔 התראות</h2>
        <div class="header-actions">
          <button *ngIf="svc.visible().length" class="btn-text" (click)="svc.dismissAll()">
            נקה הכל
          </button>
          <button class="close-btn" (click)="close.emit()" aria-label="סגור">
            <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </header>

      <div class="drawer-body">
        @if (svc.visible().length === 0) {
          <div class="empty-state">
            <span class="empty-icon">✅</span>
            <p>אין התראות פעילות</p>
            <span class="empty-sub">המערכת תעדכן אותך כאן</span>
          </div>
        } @else {
          <ul class="notif-list">
            @for (n of svc.visible(); track n.id) {
              <li class="notif-item" [class]="'notif-item--' + n.severity">
                <a class="notif-content" [routerLink]="n.link" (click)="close.emit()">
                  <span class="notif-icon">{{ n.icon }}</span>
                  <div class="notif-text">
                    <p class="notif-title">{{ n.title }}</p>
                    <p class="notif-body">{{ n.body }}</p>
                  </div>
                  <span class="notif-arrow">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M10 8H6m4 0-2.5-2.5M10 8l-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  </span>
                </a>
                <button class="dismiss-btn" (click)="svc.dismiss(n.id)" title="הסר התראה" aria-label="הסר התראה">
                  <svg viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3L3 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <footer class="drawer-footer">
        <span class="footer-hint">עדכון אוטומטי כל דקה</span>
      </footer>
    </aside>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 900;
      display: flex;
      justify-content: flex-end;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.35);
      backdrop-filter: blur(2px);
      animation: fade-in 0.2s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .drawer {
      position: relative;
      width: 380px;
      max-width: 100vw;
      height: 100%;
      background: var(--surface);
      border-inline-start: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
      animation: slide-in 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
    }

    @keyframes slide-in {
      from { transform: translateX(-100%); opacity: 0.6; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    /* ── Header ── */
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }

    .drawer-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.3px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-text {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      transition: color 0.15s, background 0.15s;
      &:hover { color: var(--danger); background: rgba(225,29,72,0.07); }
    }

    .close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: var(--radius-xs);
      background: var(--surface-2);
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s;
      padding: 0;
      svg { width: 16px; height: 16px; }
      &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
    }

    /* ── Body ── */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 0;
    }

    /* empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 24px;
      text-align: center;
      gap: 8px;
    }
    .empty-icon {
      font-size: 2.5rem;
      line-height: 1;
      margin-bottom: 8px;
    }
    .empty-state p {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
    }
    .empty-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* list */
    .notif-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 12px;
    }

    .notif-item {
      display: flex;
      align-items: stretch;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      transition: border-color 0.15s, background 0.15s;
      overflow: hidden;
      position: relative;

      &--danger  { border-color: rgba(225,29,72,0.2);  background: rgba(225,29,72,0.04); }
      &--warning { border-color: rgba(245,158,11,0.2); background: rgba(245,158,11,0.04); }
      &--info    { border-color: var(--border);        background: transparent; }

      &:hover { background: var(--surface-2); }
    }

    .notif-content {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 12px;
      text-decoration: none;
      color: inherit;
      min-width: 0;
    }

    .notif-icon {
      font-size: 1.4rem;
      line-height: 1;
      flex-shrink: 0;
      width: 32px;
      text-align: center;
    }

    .notif-text {
      flex: 1;
      min-width: 0;
    }

    .notif-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 3px;
    }

    .notif-body {
      font-size: 0.77rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .notif-arrow {
      color: var(--text-light);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.15s;
      svg { width: 16px; height: 16px; display: block; }
    }
    .notif-item:hover .notif-arrow { opacity: 1; }

    .dismiss-btn {
      width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--text-light);
      opacity: 0;
      transition: opacity 0.15s, color 0.15s;
      flex-shrink: 0;
      padding: 0;
      svg { width: 12px; height: 12px; }
      &:hover { color: var(--danger); }
    }
    .notif-item:hover .dismiss-btn { opacity: 1; }

    /* ── Footer ── */
    .drawer-footer {
      border-top: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      justify-content: center;
    }

    .footer-hint {
      font-size: 0.68rem;
      color: var(--text-light);
      letter-spacing: 0.3px;
    }

    @media (max-width: 480px) {
      .drawer { width: 100vw; }
    }
  `],
})
export class NotificationDrawerComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  svc = inject(NotificationsService);

  ngOnInit() {
    this.svc.markAllRead();
  }
}

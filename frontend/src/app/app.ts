import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CartService } from './services/cart.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <nav class="navbar">
      <a routerLink="/equipment" class="brand">
        <div class="brand-icon">🎬</div>
        <span>Studio Gear</span>
      </a>
      <div class="nav-links">
        <a routerLink="/equipment" routerLinkActive="active">📦 ציוד</a>
        <a routerLink="/scan" routerLinkActive="active">📷 סריקה</a>
        <a routerLink="/calendar" routerLinkActive="active">📅 לוח שנה</a>
        <a routerLink="/loans" routerLinkActive="active">📋 השאלות</a>
        <a routerLink="/students" routerLinkActive="active">🪪 תלמידות</a>
        <a routerLink="/admin" routerLinkActive="active">⚙️ ניהול</a>
      </div>
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
export class App {
  constructor(public cart: CartService) {}
}


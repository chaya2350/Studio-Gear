import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
        <a routerLink="/categories" routerLinkActive="active">⚙️ קטגוריות</a>
      </div>
    </nav>
    <main class="container">
      <router-outlet />
    </main>
  `,
  styles: [`
    .brand { text-decoration: none; }
  `]
})
export class App {}

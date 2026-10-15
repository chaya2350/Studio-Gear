import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="home-wrap">
      <div class="home-header">
        <img src="/logo.png" class="home-logo-img" alt="לוגו">
        <h1>מערכת ה ו </h1>
        <p class="home-sub">מה תרצי לעשות?  </p>
      </div>

      <div class="modules-grid">
        <a routerLink="/equipment" class="module-card">
          <div class="module-icon">📦</div>
          <div class="module-info">
            <div class="module-title">השאלת ציוד</div>
            <div class="module-desc">ניהול ציוד, השאלות, סריקות וקבלות</div>
          </div>
          <div class="module-arrow">←</div>
        </a>

        <a routerLink="/approvals" class="module-card">
          <div class="module-icon">📄</div>
          <div class="module-info">
            <div class="module-title">אישורים</div>
            <div class="module-desc">הפקת אישורי נוכחות, לימודים ו-12 שנה</div>
          </div>
          <div class="module-arrow">←</div>
        </a>

        <div class="module-card module-soon">
          <div class="module-icon">🔜</div>
          <div class="module-info">
            <div class="module-title">מודול עתידי</div>
            <div class="module-desc">בקרוב...</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .home-wrap {
      min-height: calc(100vh - 130px);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 40px 24px;
    }
    .home-header { text-align: center; margin-bottom: 48px; }
    .home-logo-img { height: 120px; width: auto; object-fit: contain; margin-bottom: 16px; }
    h1 { font-size: 2.2rem; font-weight: 900; letter-spacing: -1px; color: var(--text); margin-bottom: 8px; }
    .home-sub { color: var(--text-muted); font-size: 1rem; font-weight: 500; }

    .modules-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px; width: 100%; max-width: 800px;
    }
    .module-card {
      display: flex; align-items: center; gap: 20px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 28px 24px;
      text-decoration: none; color: inherit;
      box-shadow: var(--shadow-sm); transition: all var(--transition); cursor: pointer;
    }
    .module-card:hover {
      transform: translateY(-4px); box-shadow: var(--shadow-lg);
      border-color: var(--primary); outline: 2px solid var(--primary); outline-offset: -1px;
    }
    .module-card:hover .module-arrow { transform: translateX(-4px); color: var(--primary); }
    .module-soon { opacity: 0.45; cursor: default; pointer-events: none; }
    .module-icon { font-size: 2.4rem; flex-shrink: 0; }
    .module-info { flex: 1; }
    .module-title { font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 4px; }
    .module-desc { font-size: 0.82rem; color: var(--text-muted); font-weight: 500; }
    .module-arrow { font-size: 1.3rem; color: var(--text-light); transition: all var(--transition); flex-shrink: 0; }
  `]
})
export class HomeComponent {}

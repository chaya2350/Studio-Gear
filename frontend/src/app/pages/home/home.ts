import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
selector: 'app-home',
imports: [RouterLink],
template: `
<div class="home-wrap">
<div class="home-header">
<h1>שלום {{ auth.user()?.name || '' }}</h1>
<p class="home-sub">מה תרצי לעשות היום?</p>
</div>

<div class="modules-grid">
<a routerLink="/equipment" class="module-card">
<div class="module-info">
<div class="module-title">השאלת ציוד</div>
<div class="module-desc">ניהול ציוד, השאלות, סריקות וקבלות</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/students" class="module-card">
<div class="module-info">
<div class="module-title">תלמידות</div>
<div class="module-desc">חיפוש תלמידות, פרטים אישיים והיסטוריה</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/approvals" class="module-card">
<div class="module-info">
<div class="module-title">אישורים</div>
<div class="module-desc">הפקת אישורי נוכחות, לימודים ו-12 שנה</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/exams" class="module-card">
<div class="module-info">
<div class="module-title">מבחנים</div>
<div class="module-desc">הפקת ברקודים למבחנים ורישום ציונים</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/pages" class="module-card">
<div class="module-info">
<div class="module-title">דפים</div>
<div class="module-desc">נושאים ודפים — פרטיים או ציבוריים</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/messages" class="module-card">
<div class="module-info">
<div class="module-title">הודעות</div>
<div class="module-desc">שיחות פרטיות בין המשתמשות</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/calendar/personal" class="module-card">
<div class="module-info">
<div class="module-title">לוח שנה</div>
<div class="module-desc">הלוח האישי, לוח הציוד והמערכת</div>
</div>
<div class="module-arrow">←</div>
</a>

<a routerLink="/admin" class="module-card">
<div class="module-info">
<div class="module-title">ניהול</div>
<div class="module-desc">נתוני תלמידות ותבניות אישורים</div>
</div>
<div class="module-arrow">←</div>
</a>
</div>
</div>
`,
styles: [`
.home-wrap {
min-height: calc(100vh - 130px);
display: flex; flex-direction: column; align-items: center; justify-content: center;
padding: 40px 24px;
}
.home-header { text-align: center; margin-bottom: 40px; }
h1 { font-size: 2.2rem; font-weight: 900; letter-spacing: -1px; color: var(--text); margin-bottom: 8px; }
.home-sub { color: var(--text-muted); font-size: 1rem; font-weight: 500; }

.modules-grid {
display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
gap: 14px; width: 100%; max-width: 860px;
}
.module-card {
display: flex; align-items: center; gap: 16px;
background: var(--surface); border: 1.5px solid var(--border);
border-radius: var(--radius); padding: 22px 24px;
text-decoration: none; color: inherit;
box-shadow: var(--shadow-sm); transition: all var(--transition);
position: relative; overflow: hidden;

&::before {
content: '';
position: absolute; top: 0; right: 0; bottom: 0;
width: 3px;
background: var(--grad-primary);
opacity: 0; transition: opacity var(--transition);
}
&:hover {
transform: translateY(-3px); box-shadow: var(--shadow-lg);
border-color: var(--primary);
&::before { opacity: 1; }
}
&:hover .module-title { color: var(--primary); }
&:hover .module-arrow { transform: translateX(-4px); color: var(--primary); }
}
.module-info { flex: 1; }
.module-title { font-size: 1.08rem; font-weight: 800; color: var(--text); margin-bottom: 4px; transition: color var(--transition); }
.module-desc { font-size: 0.82rem; color: var(--text-muted); font-weight: 500; line-height: 1.4; }
.module-arrow { font-size: 1.3rem; color: var(--text-light); transition: all var(--transition); flex-shrink: 0; }
`]
})
export class HomeComponent {
constructor(public auth: AuthService) {}
}

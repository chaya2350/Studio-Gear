import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
selector: 'app-login',
imports: [CommonModule, FormsModule],
template: `
<section class="login-card">
<img src="/logo.png" alt="לוגו סמינר גור" />
<h1>כניסה למערכת</h1>
<p>התחברי עם פרטי החשבון שקיבלת ממנהלת המערכת.</p>
<form (ngSubmit)="submit()">
<div class="form-group">
<label for="email">אימייל</label>
<input
id="email"
name="email"
type="email"
[(ngModel)]="email"
autocomplete="username"
required
/>
</div>
<div class="form-group">
<label for="password">סיסמה</label>
<div class="password-wrap">
<input
id="password"
name="password"
[type]="showPassword ? 'text' : 'password'"
[(ngModel)]="password"
autocomplete="current-password"
required
/>
<button type="button" class="eye-btn" (click)="showPassword=!showPassword" [attr.aria-label]="showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'">
  <svg *ngIf="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
  <svg *ngIf="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.4 15.4 0 0 1-3.1 3.7M6.2 6.7C3.8 8.2 2.5 12 2.5 12s3.4 6 9.5 6c1.2 0 2.3-.3 3.3-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
</button>
</div>
</div>
<div *ngIf="error()" class="alert alert-error" role="alert"> {{ error() }}</div>
<button class="btn btn-primary" type="submit" [disabled]="loading()">
{{ loading() ? 'מתחברת...' : 'התחברות' }}
</button>
</form>
</section>
`,
styles: [
`
:host {
min-height: calc(100vh - 120px);
display: grid;
place-items: center;
padding: 24px;
}
.login-card {
width: min(100%, 420px);
padding: 32px;
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius);
box-shadow: var(--shadow);
}
img {
display: block;
height: 72px;
width: auto;
margin: 0 auto 18px;
}
h1,
p {
text-align: center;
}
p {
color: var(--text-muted);
margin-bottom: 24px;
}
h1 {
font-size: 1.5rem;
font-weight: 800;
margin-bottom: 6px;
}
p {
font-size: 0.9rem;
}
.login-card {
border-top: 4px solid var(--primary);
box-shadow: var(--shadow-lg);
}
.form-group {
margin-bottom: 14px;
}
.password-wrap {
  position: relative; display: flex; align-items: center;
  input { width: 100%; padding-right: 12px; padding-left: 46px; }
}
.eye-btn {
  position: absolute; left: 6px; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; margin: 0;
  background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0;
  display: flex; align-items: center; justify-content: center;
  &:hover { color: var(--primary); }
}
button {
width: 100%;
margin-top: 6px;
justify-content: center;
}
`,
],
})
export class LoginComponent {
email = '';
password = '';
showPassword = false;
loading = signal(false);
error = signal('');

constructor(
private auth: AuthService,
private route: ActivatedRoute,
private router: Router,
) {}

submit() {
if (this.loading()) return;
this.loading.set(true);
this.error.set('');
this.auth.login(this.email.trim(), this.password).subscribe({
next: () => {
const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
const destination =
returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
this.router.navigateByUrl(destination);
},
error: (error) => {
this.error.set(error.error?.error || 'לא ניתן להתחבר כרגע. נסי שוב.');
this.loading.set(false);
},
});
}
}

import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
      renderButton(element: HTMLElement, options: { theme: string; size: string; shape: string; width: number }): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

let googleScriptLoad: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  if (!googleScriptLoad) {
    googleScriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        googleScriptLoad = null;
        reject(new Error('Google sign-in script failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return googleScriptLoad;
}

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
<label class="remember"><input type="checkbox" name="remember" [(ngModel)]="remember"> זכור אותי במכשיר זה</label>
<div *ngIf="error()" class="alert alert-error" role="alert"> {{ error() }}</div>
<button class="btn btn-primary" type="submit" [disabled]="loading()">
{{ loading() ? 'מתחברת...' : 'התחברות' }}
</button>
</form>
<div class="google-login" [hidden]="!googleClientId()">
<div class="login-divider"><span>או</span></div>
<div #googleButton class="google-button"></div>
<div *ngIf="googleError()" class="alert alert-error" role="alert">{{ googleError() }}</div>
</div>
<p *ngIf="googleUnavailable()" class="google-config-note">{{ googleUnavailable() }}</p>
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
.remember { display: flex; align-items: center; gap: 8px; margin: 14px 0; color: var(--text-muted); font-size: .9rem; }
.remember input { width: auto; accent-color: var(--primary); }
button {
width: 100%;
margin-top: 6px;
justify-content: center;
}
.google-login { margin-top: 14px; }
.login-divider { display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-size: .82rem; }
.login-divider::before, .login-divider::after { content: ''; height: 1px; flex: 1; background: var(--border); }
.google-button { display: flex; justify-content: center; margin-top: 14px; min-height: 40px; }
.google-login .alert { margin-top: 10px; }
.google-config-note { margin: 14px 0 0; color: var(--text-muted); font-size: .78rem; }
`,
],
})
export class LoginComponent implements OnInit {
@ViewChild('googleButton', { static: true }) googleButton!: ElementRef<HTMLDivElement>;
email = '';
password = '';
showPassword = false;
remember = false;
loading = signal(false);
error = signal('');
googleError = signal('');
googleClientId = signal('');
googleUnavailable = signal('');

constructor(
private auth: AuthService,
private route: ActivatedRoute,
private router: Router,
) {}

ngOnInit() {
this.auth.getGoogleAuthConfiguration().subscribe({
next: config => {
const clientId = config.clientId;
if (!config.enabled || !clientId) {
this.googleUnavailable.set('כניסה עם Google עדיין לא הוגדרה במערכת.');
return;
}
this.googleClientId.set(clientId);
void loadGoogleIdentityScript().then(() => {
if (!window.google) throw new Error('Google Identity Services is unavailable');
window.google.accounts.id.initialize({
client_id: clientId,
callback: response => this.submitGoogleCredential(response.credential),
});
window.google.accounts.id.renderButton(this.googleButton.nativeElement, {
theme: 'outline',
size: 'large',
shape: 'rectangular',
width: Math.min(this.googleButton.nativeElement.clientWidth || 320, 360),
});
}).catch(error => {
console.error('Could not initialize Google sign-in:', error);
this.googleError.set('לא ניתן לטעון כניסה עם Google כרגע. אפשר להתחבר עם אימייל וסיסמה.');
});
},
error: error => {
console.error('Could not load Google sign-in configuration:', error);
this.googleUnavailable.set('לא ניתן לטעון כרגע את אפשרות הכניסה עם Google.');
},
});
}

submit() {
if (this.loading()) return;
this.loading.set(true);
this.error.set('');
this.auth.login(this.email.trim(), this.password, this.remember).subscribe({
next: () => this.navigateAfterLogin(),
error: (error) => {
this.error.set(error.error?.error || 'לא ניתן להתחבר כרגע. נסי שוב.');
this.loading.set(false);
},
});
}

private submitGoogleCredential(credential: string) {
if (this.loading()) return;
this.loading.set(true);
this.googleError.set('');
this.auth.loginWithGoogle(credential, this.remember).subscribe({
next: () => this.navigateAfterLogin(),
error: error => {
this.googleError.set(error.error?.error || 'לא ניתן להתחבר עם Google כרגע. נסי שוב.');
this.loading.set(false);
},
});
}

private navigateAfterLogin() {
const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
const destination = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
this.router.navigateByUrl(destination);
}
}

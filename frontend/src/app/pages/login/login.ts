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
          <input
            id="password"
            name="password"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
            required
          />
        </div>
        <div *ngIf="error()" class="alert alert-error" role="alert">⚠️ {{ error() }}</div>
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

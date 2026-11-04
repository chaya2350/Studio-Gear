import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-permission-denied',
  imports: [RouterLink],
  template: `
    <section class="empty-state" role="alert">
      <div class="empty-icon" aria-hidden="true">🔒</div>
      <h1>אין לך הרשאה להיכנס לעמוד הזה</h1>
      <p>אם לדעתך דרושה לך גישה, פני למנהלת המערכת.</p>
      <a routerLink="/" class="btn btn-primary">חזרה לדף הבית</a>
    </section>
  `
})
export class PermissionDeniedComponent {}

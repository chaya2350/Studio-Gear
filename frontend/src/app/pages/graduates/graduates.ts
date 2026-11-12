import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Student } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-graduates',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>בוגרות</h1>
        <p class="subtitle">פרטי קשר וכתובת עדכנית</p>
      </div>
    </div>

    <div class="card graduate-profile-list">
      <div *ngIf="loading()" class="import-status importing" role="status" aria-label="טעינת בוגרות">
        <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <div *ngIf="loadError()" class="alert alert-error" role="alert">{{ loadError() }}</div>
      <div *ngIf="!loading() && !graduates().length" class="room-default-empty">עדיין אין בוגרות.</div>
      <article *ngFor="let graduate of graduates()" class="graduate-profile-card">
        <div class="graduate-profile-heading">
          <h2>{{ graduate.name }}</h2>
          <span *ngIf="graduate.married_name">שם לאחר החתונה: {{ graduate.married_name }}</span>
        </div>
        <div class="graduate-profile-details">
          <div><strong>שם לפני החתונה</strong><span>{{ graduate.name }}</span></div>
          <div><strong>שם לאחר החתונה</strong><span>{{ graduate.married_name || 'לא צוין' }}</span></div>
          <div><strong>טלפון אישי</strong><span>{{ graduate.personal_phone || 'לא צוין' }}</span></div>
          <div><strong>טלפון בית / הורים</strong><span>{{ graduate.phone || 'לא צוין' }}</span></div>
          <div><strong>כתובת הורים</strong><span>{{ graduate.address || 'לא צוינה' }}</span></div>
          <div><strong>טלפון האב</strong><span>{{ graduate.extra_data?.['נייד אבא'] || 'לא צוין' }}</span></div>
          <div><strong>טלפון האם</strong><span>{{ graduate.extra_data?.['נייד אמא'] || 'לא צוין' }}</span></div>
        </div>
        <label class="graduate-current-address">
          <span>כתובת הבוגרת כיום</span>
          <input [(ngModel)]="graduate.graduate_address" [disabled]="!auth.hasPermission('students', 'edit')" placeholder="כתובת עדכנית">
        </label>
        <div class="graduate-profile-actions">
          <button class="btn btn-primary btn-sm" type="button"
                  [disabled]="savingAddress() === graduate.id_number || !auth.hasPermission('students', 'edit')"
                  [attr.aria-label]="savingAddress() === graduate.id_number ? 'שומרת כתובת' : 'שמירת כתובת'"
                  (click)="saveAddress(graduate)">
            <span *ngIf="savingAddress() === graduate.id_number" class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <ng-container *ngIf="savingAddress() !== graduate.id_number">שמירת כתובת</ng-container>
          </button>
          <span *ngIf="savedId() === graduate.id_number" class="graduate-profile-saved" role="status">הכתובת נשמרה</span>
          <span *ngIf="saveError()" class="alert alert-error" role="alert">{{ saveError() }}</span>
        </div>
      </article>
    </div>
  `,
})
export class GraduatesComponent {
  graduates = signal<Student[]>([]);
  loading = signal(false);
  loadError = signal('');
  saveError = signal('');
  savedId = signal('');
  savingAddress = signal('');

  constructor(private api: ApiService, public auth: AuthService) {
    this.loadGraduates();
  }

  loadGraduates() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.getStudents().subscribe({
      next: students => {
        this.graduates.set(students.filter(student => student.year === 'בוגרות'));
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.loadError.set(error.error?.error || 'טעינת רשימת הבוגרות נכשלה');
      }
    });
  }

  saveAddress(graduate: Student) {
    this.savingAddress.set(graduate.id_number);
    this.saveError.set('');
    this.savedId.set('');
    this.api.updateStudent(graduate.id_number, {
      name: graduate.name,
      graduate_address: graduate.graduate_address
    }).subscribe({
      next: () => {
        this.savingAddress.set('');
        this.savedId.set(graduate.id_number);
      },
      error: error => {
        this.savingAddress.set('');
        this.saveError.set(error.error?.error || 'שמירת כתובת הבוגרת נכשלה');
      }
    });
  }
}

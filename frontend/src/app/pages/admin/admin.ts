import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { AuthService, PermissionAction, PermissionsConfiguration, RolePermissionSet, SystemRole, UserRole } from '../../services/auth.service';
import { TracksComponent } from '../tracks/tracks';
type AdminSection = 'tracks' | 'students' | 'approvals' | 'users' | 'teachers';

interface UserAccount {
id: number;
name: string;
email: string;
role: UserRole;
role_name?: string;
active: number;
created_at: string;
}

@Component({
selector: 'app-admin',
imports: [CommonModule, FormsModule, TracksComponent],
template: `
<div class="page-header">
<div>
<h1> ניהול מערכת</h1>
<p class="subtitle">בחרי תחום לניהול</p>
</div>
</div>

<div class="section-tabs" role="tablist">
<button
*ngFor="let s of sections()"
type="button"
role="tab"
class="section-tab"
[class.active]="activeSection() === s.id"
[attr.aria-selected]="activeSection() === s.id"
(click)="section.set(s.id)"
>
<span class="tab-icon">{{ s.icon }}</span>
<span>{{ s.label }}</span>
</button>
</div>

<div *ngIf="activeSection() === 'users'" class="card user-management">
<div class="section-title"> ניהול משתמשות והרשאות</div>
<p class="user-help">מנהלת מערכת יכולה לנהל חשבונות. סיסמה חדשה צריכה להכיל לפחות 12 תווים.</p>

<section class="role-permissions" *ngIf="auth.user()?.role === 'admin'">
  <div class="section-title">ניהול תפקידים והרשאות</div>
  <p class="user-help">מנהלת המערכת מקבלת את כל ההרשאות. כל הרשאה חדשה מתחילה כמאושרת וניתן לשנות אותה כאן.</p>
  <div class="permission-key">
    <p><strong>צפייה</strong> — פתיחת האזור וצפייה במידע שבו.</p>
    <p><strong>שינוי</strong> — כל פעולה שמשנה מידע: הוספה, עריכה או מחיקה, לפי מה שקיים באותו אזור.</p>
    <p>במקום שבו מופיע מקף, אין פעולות שינוי באזור הזה. שינוי הרשאה נכנס לתוקף גם בבדיקת השרת.</p>
  </div>
  <div class="role-create-row">
    <input class="admin-input" [value]="newRoleName()" (input)="newRoleName.set($any($event.target).value)"
           placeholder="שם תפקיד חדש" aria-label="שם תפקיד חדש" maxlength="60"
           (keyup.enter)="createRole()">
    <button class="btn btn-primary" type="button" [disabled]="!newRoleName().trim() || savingRole()"
            (click)="createRole()">הוספת תפקיד</button>
  </div>
  <div *ngIf="permissionsError()" class="alert alert-error" role="alert">{{ permissionsError() }}</div>
  <div *ngIf="permissionsMessage()" class="alert alert-success" role="status">{{ permissionsMessage() }}</div>
  <ng-container *ngIf="permissionConfig() as config">
    <label class="role-select-label">
      תפקיד לעריכת הרשאות
      <select [ngModel]="selectedPermissionRole()" (ngModelChange)="selectPermissionRole($event)">
        <option *ngFor="let role of config.roles" [value]="role.role_key">{{ role.name }}</option>
      </select>
    </label>
    <div *ngIf="selectedRolePermissions() as selectedRole" class="permissions-table-wrap">
      <table class="permissions-table">
        <thead>
          <tr>
            <th>אזור במערכת</th>
            <th>מה נמצא באזור?</th>
            <th *ngFor="let action of config.actions">{{ permissionActionLabel(action) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let feature of config.catalog">
            <th scope="row">{{ feature.label }}</th>
            <td class="permission-description">{{ feature.description }}</td>
            <td *ngFor="let action of config.actions">
              <input *ngIf="action === 'view' || feature.supportsChange !== false"
                     type="checkbox" [checked]="selectedRole.permissions[feature.key][action]"
                     [disabled]="selectedRole.role_key === 'admin' || savingRole()"
                     [attr.aria-label]="feature.label + ' — ' + permissionActionLabel(action)"
                     (change)="setRolePermission(feature.key, action, $any($event.target).checked)">
              <span *ngIf="action === 'change' && feature.supportsChange === false" aria-label="אין פעולות שינוי באזור זה">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <button class="btn btn-primary" type="button"
              *ngIf="selectedRole.role_key !== 'admin'"
              [disabled]="savingRole() || !permissionsDirty()"
              (click)="saveRolePermissions()">
        {{ savingRole() ? 'שומר...' : 'שמירת הרשאות' }}
      </button>
      <p *ngIf="selectedRole.role_key === 'admin'" class="user-help">למנהלת המערכת תמיד יש את כל ההרשאות.</p>
    </div>
  </ng-container>
</section>

<!-- modal עריכת פרטים -->
<div *ngIf="editingUser()" class="modal-backdrop" (click)="editingUser.set(null)">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <div class="modal-title">עריכת פרטי משתמשת</div>
    <div class="form-group">
      <label>שם מלא *</label>
      <input [(ngModel)]="editUserDraft.name" placeholder="שם מלא">
    </div>
    <div class="form-group">
      <label>אימייל *</label>
      <input [(ngModel)]="editUserDraft.email" type="email" placeholder="כתובת אימייל" dir="ltr">
    </div>
    <p *ngIf="userError()" class="alert alert-error" style="margin:0 0 8px;">{{ userError() }}</p>
    <div class="modal-actions">
      <button class="btn btn-primary" [disabled]="savingEditUser()" (click)="saveEditUser()">
        {{ savingEditUser() ? 'שומר...' : 'שמור שינויים' }}
      </button>
      <button class="btn btn-secondary" (click)="editingUser.set(null); userError.set('')">ביטול</button>
    </div>
  </div>
</div>

<div *ngIf="typedConfirmation()" class="modal-backdrop confirmation-backdrop"
     (click)="cancelTypedConfirmation()" (keydown.escape)="cancelTypedConfirmation()">
  <section class="modal-card confirmation-card" role="dialog" aria-modal="true"
           aria-labelledby="typed-confirmation-title" (click)="$event.stopPropagation()">
    <div class="confirmation-icon" aria-hidden="true">!</div>
    <h2 id="typed-confirmation-title" class="modal-title">אישור פעולה בלתי הפיכה</h2>
    <p class="confirmation-description">{{ typedConfirmation()!.description }}</p>
    <p class="confirmation-instruction">כדי להמשיך, הקלידי בדיוק:</p>
    <strong class="confirmation-phrase" dir="auto">{{ typedConfirmation()!.expected }}</strong>
    <input class="confirmation-input" type="text" autocomplete="off"
           [ngModel]="typedConfirmationInput()"
           (ngModelChange)="typedConfirmationInput.set($event)"
           [attr.aria-label]="'הקלידי: ' + typedConfirmation()!.expected"
           (keyup.enter)="confirmTypedAction()">
    <div class="modal-actions confirmation-actions">
      <button class="btn btn-danger" type="button"
              [disabled]="typedConfirmationInput() !== typedConfirmation()!.expected"
              (click)="confirmTypedAction()">אישור ומחיקה</button>
      <button class="btn btn-secondary" type="button" (click)="cancelTypedConfirmation()">ביטול</button>
    </div>
  </section>
</div>

<div class="danger-zone" *ngIf="auth.user()?.role === 'admin'">
<div class="danger-title"> איפוס מסד נתונים (תלמידות)</div>
<p>
הפעולה תמחק את כל נתוני התלמידות, המסלולים, הדרישות והמבחנים כדי להתחיל הזנה מהתחלה.
משתמשות מערכת, הודעות, ציוד והשאלות לא נמחקים.
</p>
<button class="btn btn-danger" [disabled]="resettingDb()" (click)="resetDatabase()">
{{ resettingDb() ? 'מאפסת...' : ' איפוס נתוני תלמידות' }}
</button>
<p *ngIf="resetDbMessage()" class="danger-result">{{ resetDbMessage() }}</p>
</div>

<div class="danger-zone" *ngIf="auth.user()?.role === 'admin'">
<div class="danger-title"> מחיקת כל המורות</div>
<p>
הפעולה תמחק את כל המורות מהמערכת, כולל השיעורים והנוכחות שלהן.
השימוש נועד רק כאשר רוצים להתחיל מחדש את ניהול המורות.
</p>
<button class="btn btn-danger" (click)="deleteAllTeachers()">מחיקת כל המורות</button>
</div>

<div class="user-form">
<input [(ngModel)]="newUser.name" placeholder="שם מלא" aria-label="שם מלא">
<input [(ngModel)]="newUser.email" type="email" placeholder="אימייל" aria-label="אימייל">
<div class="password-input-wrap" style="flex:1; min-width:120px;">
  <input [(ngModel)]="newUser.password" [type]="showNewUserPassword() ? 'text' : 'password'" placeholder="סיסמה ראשונית" aria-label="סיסמה ראשונית">
  <button class="password-visibility" type="button" (click)="showNewUserPassword.update(v => !v)">
    <svg *ngIf="!showNewUserPassword()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
    <svg *ngIf="showNewUserPassword()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.4 15.4 0 0 1-3.1 3.7M6.2 6.7C3.8 8.2 2.5 12 2.5 12s3.4 6 9.5 6c1.2 0 2.3-.3 3.3-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
  </button>
</div>
<select [(ngModel)]="newUser.role" aria-label="תפקיד">
<option *ngFor="let role of systemRoles()" [value]="role.role_key">{{ role.name }}</option>
</select>
<button class="btn btn-primary" (click)="createUser()"> יצירת חשבון</button>
</div>
<div *ngIf="userError()" class="alert alert-error user-error" role="alert"> {{ userError() }}</div>
<div *ngIf="passwordMessage()" class="alert alert-success user-error" role="status">{{ passwordMessage() }}</div>
<div *ngIf="passwordTarget() as target" class="set-password">
<div class="set-password-heading">
<div class="password-lock-icon" aria-hidden="true">✦</div>
<div>
<h3>קביעת סיסמה חדשה</h3>
<p>עבור {{ target.name }} · לפחות 12 תווים</p>
</div>
</div>
<label class="password-label" for="new-user-password">סיסמה חדשה</label>
<div class="password-input-wrap">
<input id="new-user-password" [type]="showNewPassword() ? 'text' : 'password'" autocomplete="new-password" minlength="12" maxlength="128" required [value]="newPassword()" placeholder="הקלידי סיסמה חדשה" (input)="newPassword.set($any($event.target).value)" (keyup.enter)="savePassword()">
<button class="password-visibility" type="button" (click)="showNewPassword.update(value => !value)" [attr.aria-label]="showNewPassword() ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'" [attr.aria-pressed]="showNewPassword()" title="{{ showNewPassword() ? 'הסתרת הסיסמה' : 'הצגת הסיסמה' }}">
<svg *ngIf="!showNewPassword()" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
<svg *ngIf="showNewPassword()" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.4 15.4 0 0 1-3.1 3.7M6.2 6.7C3.8 8.2 2.5 12 2.5 12s3.4 6 9.5 6c1.2 0 2.3-.3 3.3-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
</button>
</div>
<div class="password-hint" [class.password-ready]="newPassword().length >= 12">
<span class="password-hint-mark">{{ newPassword().length >= 12 ? '✓' : 'i' }}</span>
{{ newPassword().length >= 12 ? 'אורך הסיסמה תקין' : 'הסיסמה צריכה להכיל לפחות 12 תווים' }}
<span class="password-count">{{ newPassword().length }}/128</span>
</div>
<div class="password-actions">
<button class="btn btn-primary" type="button" [disabled]="newPassword().length < 12 || newPassword().length > 128 || savingPassword()" (click)="savePassword()">{{ savingPassword() ? 'שומרת...' : 'שמירת סיסמה' }}</button>
<button class="btn btn-secondary" type="button" [disabled]="savingPassword()" (click)="passwordTarget.set(null)">ביטול</button>
</div>
</div>
<div *ngIf="resetResult() as r" class="alert alert-success user-error" role="status">
סיסמה זמנית עבור <strong>{{ r.name }}</strong>:
<code class="temp-password">{{ r.password }}</code>
<br>הסיסמה מוצגת פעם אחת בלבד. העבירי אותה למשתמשת, והיא תתחבר איתה (יש לבקש ממנה להחליף).
<button class="btn btn-secondary" type="button" (click)="resetResult.set(null)">הסתרה</button>
</div>
<div class="user-list">
<div *ngFor="let user of users()" class="user-row">
<div class="user-info">
<strong>{{ user.name }}</strong>
<span>{{ user.email }} · {{ user.active ? 'פעילה' : 'מושבתת' }}</span>
</div>
<select [ngModel]="user.role" (ngModelChange)="updateUser(user, $event, !!user.active)"
[disabled]="user.id === auth.user()?.id" aria-label="תפקיד משתמשת">
<option *ngFor="let role of systemRoles()" [value]="role.role_key">{{ role.name }}</option>
</select>
<button class="btn btn-secondary" [disabled]="user.id === auth.user()?.id" (click)="startEditUser(user)" title="עריכת פרטים">✏️</button>
<button class="btn btn-secondary" [disabled]="user.id === auth.user()?.id" (click)="startSetPassword(user)">קביעת סיסמה</button>
<button class="btn btn-secondary" [disabled]="user.id === auth.user()?.id" (click)="resetPassword(user)">איפוס סיסמה</button>
<button class="btn" [class.btn-danger]="user.active" [class.btn-secondary]="!user.active"
[disabled]="user.id === auth.user()?.id"
(click)="updateUser(user, user.role, !user.active)">
{{ user.active ? 'השבתה' : 'הפעלה' }}
</button>
<button class="btn btn-danger" [disabled]="user.id === auth.user()?.id" (click)="deleteUser(user)" title="מחיקה לצמיתות">🗑</button>
</div>
</div>
</div>

<app-tracks *ngIf="activeSection() === 'tracks'"></app-tracks>

<!-- הוספת תלמידה ידנית — admin ומזכירות בלבד -->
<div *ngIf="activeSection() === 'students' && canAddStudent()" class="card" style="max-width:560px; margin-bottom:16px;">
  <div class="section-title">➕ הוספת תלמידה ידנית</div>
  <div class="form-row">
    <div class="form-group">
      <label>ת.ז. *</label>
      <input [(ngModel)]="newStudentDraft.id_number" placeholder="7–9 ספרות" maxlength="9">
    </div>
    <div class="form-group">
      <label>שם מלא *</label>
      <input [(ngModel)]="newStudentDraft.name" placeholder="שם פרטי ומשפחה">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>מסלול</label>
      <input [(ngModel)]="newStudentDraft.track" placeholder="למשל: מוסיקה">
    </div>
    <div class="form-group">
      <label>שנה</label>
      <input [(ngModel)]="newStudentDraft.year" placeholder="א, ב, ג...">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>מקבילה</label>
      <input [(ngModel)]="newStudentDraft.parallel" placeholder="1, 2, 3...">
    </div>
    <div class="form-group">
      <label>טלפון</label>
      <input [(ngModel)]="newStudentDraft.phone" placeholder="050-0000000">
    </div>
  </div>
  <div class="form-group">
    <label>כתובת</label>
    <input [(ngModel)]="newStudentDraft.address" placeholder="רחוב, עיר">
  </div>
  <div class="form-group">
    <label>תאריך לידה</label>
    <input type="date" [(ngModel)]="newStudentDraft.birth_date">
  </div>
  <div *ngIf="addStudentError()" class="alert alert-error" style="margin:0 0 10px;" role="alert">{{ addStudentError() }}</div>
  <button class="btn btn-primary"
    [disabled]="addingStudent() || !newStudentDraft.id_number.trim() || !newStudentDraft.name.trim()"
    (click)="saveNewStudent()">
    {{ addingStudent() ? 'שומר...' : 'הוסף תלמידה' }}
  </button>
</div>

<div *ngIf="activeSection() === 'students'" class="card" style="max-width:560px;">
<div class="section-title"> ייבוא תלמידות מאקסל</div>
<p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
העלה קובץ Excel עם עמודות: <strong>ת.ז, שם, טלפון, מסלול, שנה, ת. לידה לועזי/עברית, כתובת, מספר בית, עיר</strong><br>
ניתן להעלות מספר קבצים (שנה א + שנה ב). המערכת ממזגת לפי ת.ז בלי לדרוס מידע קיים, ומוסיפה פרמטרים חדשים (כמו קוד לטלפון).
</p>

<div class="upload-area"
[class.dragover]="dragging()"
(dragover)="$event.preventDefault(); dragging.set(true)"
(dragleave)="dragging.set(false)"
(drop)="onDrop($event)"
(click)="fileInput.click()">
<div class="upload-icon"></div>
<div class="upload-text">גרור קובץ Excel לכאן או לחץ לבחירה</div>
<div class="upload-hint">.xlsx / .xls</div>
<input #fileInput type="file" accept=".xlsx,.xls" style="display:none" (change)="onFileChange($event)" multiple>
</div>

<div *ngIf="importing()" class="import-status importing">
<div class="spinner-sm"></div> מייבא נתונים...
</div>

<div *ngFor="let r of results()" class="import-status" [class.success]="r.ok" [class.error]="!r.ok">
<span *ngIf="r.ok"> <strong>{{ r.filename }}</strong> — יובאו {{ r.imported }} תלמידות
(תאריך לידה: {{ r.withBirthDate || 0 }}, כתובת: {{ r.withAddress || 0 }}, קוד טלפון: {{ r.withPhoneCode || 0 }})
<span *ngIf="r.mergedExisting"> · מוזגו {{ r.mergedExisting }} תלמידות קיימות</span>
<span *ngIf="r.addedExtraFields"> · נוספו {{ r.addedExtraFields }} פרמטרים נוספים</span>
<span *ngIf="r.skipped">({{ r.skipped }} דולגו)</span>
</span>
<span *ngIf="!r.ok"> <strong>{{ r.filename }}</strong> — {{ r.error }}</span>
</div>

<div *ngIf="totalImported() > 0" class="total-badge">
סה"כ {{ totalImported() }} תלמידות במערכת
</div>
</div>

<!-- ניהול סוגי אישורים -->
<div *ngIf="activeSection() === 'approvals'" class="card" style="max-width:760px;">
<div class="section-title"> ניהול סוגי אישורים</div>

<div class="approval-list">
<div *ngFor="let t of approvalTypes()" class="approval-row">
<div class="approval-row-info">
<strong>{{ t.name }}</strong>
<span class="approval-type-badge" [class.single]="t.type === 'single'">
{{ t.type === 'single' ? ' אישור אישי' : ' אישור קבוצתי' }}
</span>
</div>
<div class="approval-row-actions">
<button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="editApproval(t)"> עריכה</button>
<button class="btn btn-danger" style="font-size:0.78rem; padding:5px 12px;" (click)="deleteApproval(t.id)"></button>
</div>
</div>
</div>

<div class="approval-form" *ngIf="editingApproval()">
<div class="section-title" style="margin-top:20px;">{{ editingApproval()!.id ? ' עריכת אישור' : ' אישור חדש' }}</div>
<div class="form-group"><label>שם האישור</label><input [(ngModel)]="editingApproval()!.name" placeholder="שם האישור"></div>
<div class="form-group">
<label>סוג</label>
<select [(ngModel)]="editingApproval()!.type">
<option value="regular"> אישור קבוצתי (בחירת תלמידות)</option>
<option value="single"> אישור אישי (מילוי ידני)</option>
</select>
</div>
<div class="form-group">
<label>חתימה</label>
<select [(ngModel)]="editingApproval()!.signature">
<option value="principal">מנהלת</option>
<option value="secretary">מזכירות</option>
</select>
</div>
<div class="form-group">
<label>תבנית טקסט</label>
<div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:6px;" [innerHTML]="varsHint(editingApproval()!.type)"></div>
<textarea [(ngModel)]="editingApproval()!.template" rows="8" style="font-family:monospace; font-size:0.82rem;"></textarea>
</div>
<p *ngIf="approvalSaveError()" class="approval-save-error">{{ approvalSaveError() }}</p>
<div style="display:flex; gap:10px;">
<button class="btn btn-primary" [disabled]="savingApproval()" (click)="saveApproval()">
{{ savingApproval() ? 'שומר...' : ' שמור' }}
</button>
<button class="btn btn-secondary" [disabled]="savingApproval()" (click)="editingApproval.set(null)">ביטול</button>
</div>
</div>

<button *ngIf="!editingApproval()" class="btn btn-secondary" style="margin-top:16px;" (click)="newApproval()"> הוסף סוג אישור</button>
</div>

<!-- ── טאב מורות ── -->
<div *ngIf="activeSection() === 'teachers'" class="teachers-admin">

  <!-- הוספה ידנית -->
  <div class="card" style="max-width:640px; margin-bottom:16px;">
    <div class="section-title">הוספת מורה ידנית</div>
    <div class="teacher-add-form">
      <label class="field-label">שם מלא
        <input [(ngModel)]="newTeacherName" placeholder="שם המורה" class="admin-input">
      </label>
      <label class="field-label">מקצוע
        <input [(ngModel)]="newTeacherSubject" placeholder="מקצוע הוראה (אופציונלי)" class="admin-input">
      </label>
      <label class="field-label">תחום / התמחות
        <select [(ngModel)]="newTeacherSpecialization" class="admin-input">
          <option value="">ללא תחום מיוחד</option>
          <option value="קודש">קודש</option>
          <option value="רכזת קודש">רכזת קודש</option>
          <option value="רכזת חינוכית">רכזת חינוכית</option>
        </select>
      </label>
      <label class="field-label">מייל
        <input [(ngModel)]="newTeacherEmail" placeholder="מייל (אופציונלי)" class="admin-input">
      </label>
      <label class="field-label">טלפון
        <input [(ngModel)]="newTeacherPhone" placeholder="טלפון (אופציונלי)" class="admin-input">
      </label>
      <button class="btn btn-primary" [disabled]="savingTeacher()" (click)="createTeacher()">
        {{ savingTeacher() ? 'שומר...' : '+ הוסף מורה' }}
      </button>
    </div>
    <div *ngIf="teacherMsg()" class="import-status" [class.success]="!teacherMsg()!.startsWith('שגיאה')" [class.error]="teacherMsg()!.startsWith('שגיאה')">
      {{ teacherMsg() }}
    </div>
  </div>

  <!-- ייבוא מאקסל -->
  <div class="card" style="max-width:640px; margin-bottom:16px;">
    <div class="section-title">ייבוא מורות מקובץ Excel</div>
    <p class="import-hint">
      הקובץ צריך לכלול עמודות: <strong>שם</strong> (חובה), <strong>מקצוע</strong>, <strong>טלפון</strong>, <strong>מייל</strong><br>
      מורות קיימות לא יימחקו — הנתונים ישוחזרו במידה ושונו.
    </p>
    <div class="upload-area"
      [class.dragover]="draggingTeachers()"
      (dragover)="$event.preventDefault(); draggingTeachers.set(true)"
      (dragleave)="draggingTeachers.set(false)"
      (drop)="onDropTeachers($event)"
      (click)="teacherFileInput.click()">
      <div class="upload-icon"></div>
      <div class="upload-text">גרור קובץ Excel לכאן או לחץ לבחירה</div>
      <div class="upload-hint">.xlsx / .xls</div>
      <input #teacherFileInput type="file" accept=".xlsx,.xls" style="display:none" (change)="onTeacherFileChange($event)">
    </div>
    <div *ngIf="importingTeachers()" class="import-status importing">
      <div class="spinner-sm"></div> מייבא מורות...
    </div>
    <div *ngIf="teacherImportResult()" class="import-status success">
      ✓ יובאו {{ teacherImportResult()!.imported }} מורות חדשות
      <span *ngIf="teacherImportResult()!.skipped">({{ teacherImportResult()!.skipped }} קיימות / דולגו)</span>
    </div>
  </div>

  <div class="card" style="max-width:640px; margin-bottom:16px;">
    <div class="section-title">שנת לימודים ומערכת שעות</div>
    <p class="import-hint">קבעי את היום האחרון ללימודים. שכפול המערכת והשינויים הקבועים יסתיימו בתאריך זה.</p>
    <div class="period-row period-form">
      <label class="field-label">תאריך סיום שנת הלימודים
        <input type="date" class="admin-input" [(ngModel)]="schoolYearEndDate">
      </label>
      <button class="btn btn-primary" [disabled]="savingSchoolYearEnd()" (click)="saveSchoolYearEnd()">
        {{ savingSchoolYearEnd() ? 'שומר...' : 'שמירת תאריך' }}
      </button>
    </div>
    <div *ngIf="schoolYearEndMessage()" class="import-status success">{{ schoolYearEndMessage() }}</div>
    <div *ngIf="schoolYearEndError()" class="import-status error">{{ schoolYearEndError() }}</div>
  </div>

  <!-- ניהול שעות שיעורים -->
  <div class="card" style="max-width:640px; margin-bottom:16px;">
    <div class="section-title">ניהול שעות שיעורים</div>
    <p class="import-hint">הגדרת מבנה היום (שיעורים והפסקות). בלוח המערכת בוחרים שיעור מהרשימה.</p>
    <div class="period-row period-form">
      <input class="admin-input" [(ngModel)]="periodDraft.name" placeholder="שם (למשל שיעור ראשון)">
      <input type="time" class="admin-input" [(ngModel)]="periodDraft.start_time">
      <input type="time" class="admin-input" [(ngModel)]="periodDraft.end_time">
      <label class="period-break"><input type="checkbox" [(ngModel)]="periodDraft.is_break"> הפסקה</label>
      <button class="btn btn-primary" (click)="savePeriod()">{{ editingPeriodId() ? 'עדכון' : 'הוספה' }}</button>
      <button class="btn btn-secondary" *ngIf="editingPeriodId()" (click)="resetPeriodDraft()">ביטול</button>
    </div>
    <p *ngIf="periodError()" class="alert alert-error">{{ periodError() }}</p>
    <div *ngIf="!periods().length" class="empty-hint">עדיין לא הוגדרו שעות</div>
    <div *ngFor="let p of periods()" class="period-row" [class.is-break]="p.is_break">
      <span class="period-time">{{ p.start_time }} – {{ p.end_time }}</span>
      <span class="period-name">{{ p.name }}{{ p.is_break ? ' (הפסקה)' : '' }}</span>
      <button class="btn btn-secondary" style="padding:4px 10px" (click)="editPeriod(p)">עריכה</button>
      <button class="btn btn-danger" style="padding:4px 10px" (click)="deletePeriod(p.id)">מחיקה</button>
    </div>
  </div>

  <!-- ייבוא מערכת שעות מאקסל -->
  <div class="card" style="max-width:640px; margin-bottom:16px;">
    <div class="section-title">ייבוא מערכת שעות מקובץ Excel</div>
    <p class="import-hint">
      הקובץ צריך לכלול עמודות: <strong>מורה</strong>, <strong>שנה</strong>, <strong>מקבילה</strong>, <strong>יום</strong>, <strong>שעה התחלה</strong><br>
      עמודות אופציונליות: שעה סיום, מקצוע<br>
      ערכי יום: ראשון / שני / שלישי / רביעי / חמישי<br>
      <strong>אם קיים שיעור באותה מורה+כיתה+יום+שבוע — הוא יתעדכן (לא יימחק).</strong>
    </p>
    <div class="week-picker-row">
      <label class="field-label">שבוע (ראשון בשבוע):
        <input type="date" [(ngModel)]="scheduleImportWeek" class="admin-input" style="width:auto;">
      </label>
    </div>
    <div class="upload-area"
      [class.dragover]="draggingSchedule()"
      [class.disabled]="!scheduleImportWeek"
      (dragover)="$event.preventDefault(); scheduleImportWeek && draggingSchedule.set(true)"
      (dragleave)="draggingSchedule.set(false)"
      (drop)="onDropSchedule($event)"
      (click)="scheduleImportWeek && scheduleFileInput.click()">
      <div class="upload-icon"></div>
      <div class="upload-text" *ngIf="scheduleImportWeek">גרור קובץ Excel לכאן או לחץ לבחירה</div>
      <div class="upload-text" *ngIf="!scheduleImportWeek" style="color:var(--text-muted)">בחרי תחילה שבוע ↑</div>
      <div class="upload-hint">.xlsx / .xls</div>
      <input #scheduleFileInput type="file" accept=".xlsx,.xls" style="display:none" (change)="onScheduleFileChange($event)" [disabled]="!scheduleImportWeek">
    </div>
    <div *ngIf="importingSchedule()" class="import-status importing">
      <div class="spinner-sm"></div> מייבא מערכת שעות...
    </div>
    <div *ngIf="scheduleImportResult()" class="import-status" [class.success]="!scheduleImportResult()!.error" [class.error]="scheduleImportResult()!.error">
      <ng-container *ngIf="!scheduleImportResult()!.error">
        ✓ יובאו {{ scheduleImportResult()!.imported }} שיעורים לשבוע {{ scheduleImportWeek }}
        <span *ngIf="scheduleImportResult()!.skipped">({{ scheduleImportResult()!.skipped }} דולגו)</span>
        <span *ngIf="scheduleImportResult()!.errors?.length" class="import-warnings">
          {{ scheduleImportResult()!.errors?.length }} אזהרות
        </span>
      </ng-container>
      <span *ngIf="scheduleImportResult()!.error">{{ scheduleImportResult()!.error }}</span>
    </div>
    <ul *ngIf="scheduleImportResult()?.errors?.length" class="import-error-list">
      <li *ngFor="let e of scheduleImportResult()!.errors">{{ e }}</li>
    </ul>
  </div>

  <!-- רשימת מורות -->
  <div class="card" style="max-width:640px;">
    <div class="section-title-row">
      <div class="section-title" style="margin-bottom:0">רשימת מורות ({{ teachers().length }})</div>
      <button class="btn btn-secondary" style="font-size:0.8rem;padding:5px 12px" (click)="loadTeachers()">רענן</button>
    </div>
    <div *ngIf="!teachers().length" class="empty-hint">אין מורות במערכת עדיין</div>
    <div class="teacher-list-table">
      <div *ngFor="let t of teachers()" class="teacher-list-row">
        <ng-container *ngIf="editingTeacherId() !== t.id">
          <div class="teacher-color-dot" [style.background]="teacherColor(t.id)"></div>
          <div class="teacher-list-info">
            <strong>{{ t.name }}</strong>
            <span *ngIf="t.subject" class="teacher-meta">{{ t.subject }}</span>
            <span *ngIf="t.email" class="teacher-meta">{{ t.email }}</span>
            <span *ngIf="t.phone" class="teacher-meta">{{ t.phone }}</span>
          </div>
          <div class="teacher-list-actions">
            <button class="btn btn-secondary btn-xs" (click)="startEditTeacher(t)" title="עריכה">✎</button>
            <button class="btn btn-danger btn-xs" (click)="deleteTeacher(t.id)" title="מחיקה">⌫</button>
          </div>
        </ng-container>
        <ng-container *ngIf="editingTeacherId() === t.id">
          <input [(ngModel)]="editTeacherDraft.name" class="inline-input" placeholder="שם">
          <input [(ngModel)]="editTeacherDraft.subject" class="inline-input" placeholder="מקצוע">
          <input [(ngModel)]="editTeacherDraft.email" class="inline-input" placeholder="מייל">
          <input [(ngModel)]="editTeacherDraft.phone" class="inline-input" placeholder="טלפון">
          <button class="btn btn-primary btn-xs" (click)="saveTeacher(t.id)">שמור</button>
          <button class="btn btn-secondary btn-xs" (click)="editingTeacherId.set(0)">ביטול</button>
        </ng-container>
      </div>
    </div>
  </div>
</div>
`,
styles: [`
.section-tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.section-tab {
display: flex; align-items: center; gap: 8px; padding: 12px 22px; cursor: pointer;
background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-sm);
font: inherit; font-weight: 700; color: var(--text-muted); box-shadow: var(--shadow-xs);
transition: all var(--transition);
}
.section-tab:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
.section-tab.active { background: var(--grad-primary); border-color: transparent; color: #fff; box-shadow: var(--shadow-primary); }
.tab-icon { font-size: 1.15rem; }
.upload-area {
border: 2px dashed var(--border); border-radius: var(--radius); padding: 40px 20px;
text-align: center; cursor: pointer; transition: all var(--transition);
background: var(--surface-2);
&:hover, &.dragover { border-color: var(--primary); background: var(--primary-light); }
}
.upload-icon { font-size: 2.5rem; margin-bottom: 10px; }
.upload-text { font-weight: 700; color: var(--text); margin-bottom: 4px; }
.upload-hint { font-size: 0.78rem; color: var(--text-muted); }

.period-row { display: flex; gap: 8px; align-items: center; padding: 6px 0; flex-wrap: wrap; }
.period-row.is-break { background: #fef9c3; border-radius: 6px; padding: 6px 8px; }
.period-form .admin-input { width: auto; }
.period-time { font-weight: 600; min-width: 110px; direction: ltr; text-align: right; }
.period-name { flex: 1; }
.period-break { display: flex; gap: 4px; align-items: center; }
.import-status {
margin-top: 12px; padding: 12px 16px; border-radius: var(--radius-sm);
font-size: 0.875rem; display: flex; align-items: center; gap: 8px;
&.importing { background: var(--primary-light); color: var(--primary); border: 1px solid var(--border-focus); }
&.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
&.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
}
.spinner-sm {
width: 16px; height: 16px; border: 2px solid var(--primary-light);
border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.total-badge {
margin-top: 16px; padding: 10px 16px; background: var(--primary-light);
border-radius: var(--radius-sm); font-weight: 700; color: var(--primary);
font-size: 0.875rem; text-align: center;
}
.approval-list { display: flex; flex-direction: column; gap: 8px; }
.approval-row {
display: flex; align-items: center; justify-content: space-between;
padding: 12px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
}
.approval-row-info { display: flex; align-items: center; gap: 10px; }
.approval-row-info strong { font-size: 0.9rem; }
.approval-type-badge {
font-size: 0.72rem; padding: 2px 8px; border-radius: 20px;
background: var(--primary-light); color: var(--primary); font-weight: 600;
&.single { background: #fdf4ff; color: #0891b2; }
}
.approval-row-actions { display: flex; gap: 6px; }
.approval-form { margin-top: 4px; }
.approval-save-error { color: #991b1b; margin-bottom: 10px; }
code { background: var(--surface-3); padding: 1px 5px; border-radius: 4px; font-size: 0.78rem; }
.user-management { max-width: 1000px; margin-bottom: 24px; }
.danger-zone {
margin: 0 0 16px;
padding: 14px;
border: 1.5px solid #fecaca;
border-radius: var(--radius-sm);
background: #fff1f2;
display: grid;
gap: 8px;
}
.danger-title { font-weight: 800; color: #9f1239; }
.danger-zone p { margin: 0; color: #881337; font-size: 0.85rem; }
.danger-result { font-weight: 700; color: #9f1239; }
.user-help { color: var(--text-muted); font-size: 0.85rem; margin: -4px 0 14px; }
.user-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: center; }
.user-form input, .user-form select, .user-row select {
padding: 10px 14px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
font-size: 0.93rem; font-family: inherit; direction: rtl; background: var(--surface); color: var(--text);
transition: border-color var(--transition), box-shadow var(--transition);
}
.user-form input:focus, .user-form select:focus, .user-row select:focus {
outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow);
}
.user-form input::placeholder { color: var(--text-light); }
.user-list { display: grid; gap: 10px; margin-top: 20px; }
.user-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.user-info { display: grid; flex: 1; gap: 3px; }
.user-info span { color: var(--text-muted); font-size: 0.78rem; }
.user-row select { max-width: 180px; }
.user-error { margin-top: 12px; margin-bottom: 0; }
.set-password {
max-width: 520px; margin: 16px 0 4px; padding: 22px 24px; background: var(--surface);
border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}
.set-password-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.password-lock-icon {
width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 13px;
background: var(--primary-light); color: var(--primary); font-size: 1.25rem;
}
.set-password-heading h3 { margin: 0 0 4px; color: var(--text); font-size: 1.05rem; }
.set-password-heading p { margin: 0; color: var(--text-muted); font-size: 0.84rem; }
.password-label { display: block; margin-bottom: 7px; color: var(--text); font-size: 0.88rem; font-weight: 700; }
.password-input-wrap { position: relative; }
.password-input-wrap input {
width: 100%; min-height: 48px; padding: 11px 48px 11px 14px; direction: ltr; text-align: left;
border: 1.5px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text);
font: inherit; font-size: 0.98rem; letter-spacing: 0.025em; transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
}
.password-input-wrap input::placeholder { color: var(--text-light); letter-spacing: 0; }
.password-input-wrap input:focus { outline: none; border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px var(--primary-glow); }
.password-visibility {
position: absolute; top: 50%; right: 8px; transform: translateY(-50%); width: 34px; height: 34px;
display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: transparent;
color: var(--text-muted); cursor: pointer; transition: color var(--transition), background var(--transition);
}
.password-visibility:hover { color: var(--primary); background: var(--primary-light); }
.password-visibility:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.password-visibility svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.password-hint { display: flex; align-items: center; gap: 7px; margin-top: 9px; color: var(--text-muted); font-size: 0.79rem; }
.password-hint-mark { width: 17px; height: 17px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-3); font-size: 0.7rem; font-weight: 800; }
.password-hint.password-ready { color: #15803d; }
.password-ready .password-hint-mark { background: #dcfce7; }
.password-count { margin-inline-start: auto; color: var(--text-light); direction: ltr; font-variant-numeric: tabular-nums; }
.password-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 19px; }
.temp-password { direction: ltr; display: inline-block; font-size: 1.1rem; font-weight: 800; letter-spacing: 1px; background: var(--surface); padding: 2px 10px; border-radius: 6px; user-select: all; }
@media (max-width: 640px) {
.user-row { align-items: stretch; flex-direction: column; }
.user-row select { max-width: none; }
.set-password { padding: 18px; }
.password-actions { flex-direction: column; }
.password-actions .btn { width: 100%; }
}

/* Teachers tab */
.teachers-admin { max-width: 640px; }
.import-hint { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 14px; line-height: 1.7; }
.teacher-add-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: flex-end; }
@media (max-width: 700px) { .teacher-add-form { grid-template-columns: 1fr; } }
.field-label { font-size: 0.82rem; font-weight: 700; color: var(--text-muted); display: grid; gap: 5px; }
.admin-input { border: 1.5px solid var(--border); border-radius: 8px; padding: 9px 12px;
  font: inherit; font-size: 0.9rem; background: var(--surface-2);
  &:focus { outline: none; border-color: var(--primary); } }
.week-picker-row { margin-bottom: 12px; }
.upload-area.disabled { opacity: 0.5; cursor: not-allowed; }
.import-warnings { color: #d97706; font-weight: 700; margin-inline-start: 8px; }
.import-error-list { font-size: 0.8rem; color: #b91c1c; margin: 6px 0 0 0; padding-inline-start: 18px;
  li { margin-bottom: 2px; } }
.section-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.empty-hint { color: var(--text-muted); font-size: 0.85rem; padding: 16px 0; text-align: center; }
.teacher-list-table { display: flex; flex-direction: column; gap: 6px; }
.teacher-list-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.teacher-color-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.teacher-list-info { flex: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  strong { font-size: 0.9rem; }
  .teacher-meta { font-size: 0.78rem; color: var(--text-muted); } }
.teacher-list-actions { display: flex; gap: 5px; }
.btn-xs { padding: 4px 9px; font-size: 0.78rem; }
.inline-input { border: 1.5px solid var(--border); border-radius: 6px; padding: 5px 8px;
  font: inherit; font-size: 0.85rem; flex: 1; min-width: 80px;
  &:focus { outline: none; border-color: var(--primary); } }
.modal-backdrop {
  position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
}
.modal-card {
  background: var(--surface); border-radius: var(--radius); padding: 24px;
  width: min(420px, 95vw); box-shadow: 0 16px 40px rgba(0,0,0,.25);
  display: flex; flex-direction: column; gap: 12px;
}
.modal-title { font-size: 1rem; font-weight: 800; color: var(--primary); margin-bottom: 4px; }
.modal-actions { display: flex; gap: 8px; }
.confirmation-backdrop { z-index: 910; padding: 16px; background: rgba(15, 23, 42, .58); }
.confirmation-card { align-items: stretch; text-align: center; border: 1px solid #f1c8c8;
  animation: confirmation-enter 160ms ease-out; }
.confirmation-icon { align-self: center; display: grid; place-items: center; width: 48px; height: 48px;
  border-radius: 50%; background: #fff0f0; color: #b42318; font-size: 1.7rem; font-weight: 900; }
.confirmation-card .modal-title { margin: 0; color: #a32626; font-size: 1.15rem; }
.confirmation-description, .confirmation-instruction { margin: 0; color: var(--text-muted); line-height: 1.5; }
.confirmation-phrase { padding: 10px 12px; border: 1px dashed #d88b8b; border-radius: 8px;
  background: #fff7f7; color: #8f1d1d; font-size: 1rem; }
.confirmation-input { width: 100%; padding: 11px 12px; border: 1.5px solid var(--border);
  border-radius: 8px; background: var(--surface-2); color: var(--text); font: inherit; text-align: center; }
.confirmation-input:focus { outline: none; border-color: #c44747; box-shadow: 0 0 0 3px rgba(196, 71, 71, .12); }
.confirmation-actions { justify-content: center; flex-wrap: wrap; }
.confirmation-actions .btn-danger:disabled { opacity: .5; cursor: not-allowed; }
.role-permissions { margin: 20px 0; padding: 18px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--surface-2); }
.role-create-row { display: flex; gap: 8px; max-width: 520px; margin-bottom: 14px; }
.role-create-row .admin-input { flex: 1; min-width: 0; }
.role-select-label { display: grid; gap: 6px; max-width: 360px; margin: 14px 0; font-weight: 700; }
.role-select-label select { padding: 9px 12px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
.permissions-table-wrap { overflow-x: auto; margin: 14px 0; }
.permission-key { margin: 12px 0 18px; padding: 12px 14px; border-inline-start: 4px solid var(--primary);
  border-radius: 8px; background: var(--surface); color: var(--text); font-size: .88rem; }
.permission-key p { margin: 4px 0; }
.permissions-table { width: 100%; min-width: 760px; border-collapse: collapse; background: var(--surface); }
.permissions-table th, .permissions-table td { padding: 9px 12px; border: 1px solid var(--border); text-align: center; }
.permissions-table thead th { background: var(--surface-2); font-size: .86rem; }
.permissions-table tbody th { text-align: right; white-space: nowrap; }
.permissions-table .permission-description { min-width: 300px; text-align: right; line-height: 1.5; }
.permissions-table input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); }
@keyframes confirmation-enter { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
`]
})
export class AdminComponent {
dragging = signal(false);
importing = signal(false);
results = signal<{
filename: string;
ok: boolean;
imported?: number;
skipped?: number;
withBirthDate?: number;
withAddress?: number;
withPhoneCode?: number;
mergedExisting?: number;
addedExtraFields?: number;
error?: string;
}[]>([]);
totalImported = signal(0);
approvalTypes = signal<any[]>([]);
editingApproval = signal<any | null>(null);
users = signal<UserAccount[]>([]);
permissionConfig = signal<PermissionsConfiguration | null>(null);
selectedPermissionRole = signal('');
newRoleName = signal('');
permissionsError = signal('');
permissionsMessage = signal('');
savingRole = signal(false);
permissionsDirty = signal(false);
userError = signal('');
resetResult = signal<{ name: string; password: string } | null>(null);
passwordMessage = signal('');
savingPassword = signal(false);
newUser: { name: string; email: string; password: string; role: UserRole } = {
name: '', email: '', password: '', role: 'laborant'
};
approvalSaveError = signal('');
savingApproval = signal(false);
section = signal<AdminSection | null>(null);
resettingDb = signal(false);
resetDbMessage = signal('');
typedConfirmation = signal<{ expected: string; description: string; action: () => void } | null>(null);
typedConfirmationInput = signal('');

// ── הוספת תלמידה ידנית ──
addingStudent = signal(false);
addStudentError = signal('');
newStudentDraft = { id_number: '', name: '', phone: '', track: '', year: '', parallel: '', address: '', birth_date: '' };

canAddStudent() {
  return this.auth.hasPermission('students', 'change');
}

saveNewStudent() {
  const d = this.newStudentDraft;
  if (!d.id_number.trim() || !d.name.trim()) return;
  this.addingStudent.set(true);
  this.addStudentError.set('');
  this.api.createStudent({
    id_number: d.id_number.trim(),
    name: d.name.trim(),
    phone: d.phone.trim() || undefined,
    track: d.track.trim() || undefined,
    year: d.year.trim() || undefined,
    parallel: d.parallel.trim() || undefined,
    address: d.address.trim() || undefined,
    birth_date: d.birth_date.trim() || undefined,
  }).subscribe({
    next: () => {
      this.addingStudent.set(false);
      this.newStudentDraft = { id_number: '', name: '', phone: '', track: '', year: '', parallel: '', address: '', birth_date: '' };
      this.loadTotal();
      this.addStudentError.set('✓ התלמידה נוספה בהצלחה');
    },
    error: (e) => {
      this.addingStudent.set(false);
      this.addStudentError.set(e.error?.error || 'לא ניתן להוסיף תלמידה');
    }
  });
}

constructor(private http: HttpClient, private api: ApiService, public auth: AuthService) {
this.loadTotal();
this.loadApprovals();
if (auth.user()?.role === 'admin') {
  this.loadUsers();
  this.loadPermissionConfig();
}
this.loadTeachers();
this.loadPeriods();
this.loadSchoolYearEnd();
}

loadSchoolYearEnd() {
  this.api.getScheduleYearEnd().subscribe({
    next: result => this.schoolYearEndDate = result.through_date,
    error: () => {}
  });
}

saveSchoolYearEnd() {
  if (!this.schoolYearEndDate || this.savingSchoolYearEnd()) return;
  this.savingSchoolYearEnd.set(true);
  this.schoolYearEndMessage.set('');
  this.schoolYearEndError.set('');
  this.api.updateScheduleYearEnd(this.schoolYearEndDate).subscribe({
    next: result => {
      this.schoolYearEndDate = result.through_date;
      this.savingSchoolYearEnd.set(false);
      this.schoolYearEndMessage.set('תאריך הסיום נשמר');
    },
    error: error => {
      this.savingSchoolYearEnd.set(false);
      this.schoolYearEndError.set(error.error?.error || 'שמירת תאריך הסיום נכשלה');
    }
  });
}

systemRoles(): SystemRole[] {
  return this.permissionConfig()?.roles.map(({ role_key, name, is_system }) => ({ role_key, name, is_system })) || [
    { role_key: 'admin', name: 'מנהלת מערכת', is_system: 1 },
    { role_key: 'secretary', name: 'מזכירות', is_system: 1 },
    { role_key: 'laborant', name: 'לבורנטית', is_system: 1 }
  ];
}

selectedRolePermissions(): RolePermissionSet | null {
  return this.permissionConfig()?.roles.find(role => role.role_key === this.selectedPermissionRole()) || null;
}

permissionActionLabel(action: PermissionAction): string {
  return ({ view: 'צפייה', change: 'שינוי' })[action];
}

loadPermissionConfig() {
  this.permissionsError.set('');
  this.auth.loadPermissions().subscribe({
    next: config => {
      this.permissionConfig.set(config);
      if (!config.roles.some(role => role.role_key === this.selectedPermissionRole())) {
        this.selectedPermissionRole.set(
          config.roles.find(role => role.role_key !== 'admin')?.role_key || config.roles[0]?.role_key || ''
        );
      }
      this.permissionsDirty.set(false);
    },
    error: error => this.permissionsError.set(error.error?.error || 'טעינת הגדרות ההרשאות נכשלה')
  });
}

selectPermissionRole(roleKey: string) {
  if (this.permissionsDirty()) {
    this.permissionsError.set('שמרי או בטלי את השינויים לפני מעבר לתפקיד אחר');
    return;
  }
  this.permissionsDirty.set(false);
  this.selectedPermissionRole.set(roleKey);
  this.loadPermissionConfig();
}

setRolePermission(feature: string, action: PermissionAction, enabled: boolean) {
  const config = this.permissionConfig();
  const role = this.selectedRolePermissions();
  if (!config || !role || role.role_key === 'admin') return;
  const updatedRole: RolePermissionSet = {
    ...role,
    permissions: {
      ...role.permissions,
      [feature]: { ...role.permissions[feature], [action]: enabled }
    }
  };
  this.permissionConfig.set({
    ...config,
    roles: config.roles.map(item => item.role_key === updatedRole.role_key ? updatedRole : item)
  });
  this.permissionsDirty.set(true);
  this.permissionsMessage.set('');
}

createRole() {
  const name = this.newRoleName().trim();
  if (!name || this.savingRole()) return;
  this.savingRole.set(true);
  this.permissionsError.set('');
  this.permissionsMessage.set('');
  this.http.post<SystemRole>('/api/roles', { name }).subscribe({
    next: role => {
      this.savingRole.set(false);
      this.newRoleName.set('');
      this.selectedPermissionRole.set(role.role_key);
      this.loadPermissionConfig();
      this.loadUsers();
      this.permissionsMessage.set(`התפקיד "${role.name}" נוסף עם כל ההרשאות פעילות.`);
    },
    error: error => {
      this.savingRole.set(false);
      this.permissionsError.set(error.error?.error || 'יצירת התפקיד נכשלה');
    }
  });
}

saveRolePermissions() {
  const role = this.selectedRolePermissions();
  if (!role || role.role_key === 'admin' || this.savingRole() || !this.permissionsDirty()) return;
  this.savingRole.set(true);
  this.permissionsError.set('');
  this.permissionsMessage.set('');
  this.http.put<{ success: boolean }>(`/api/roles/${encodeURIComponent(role.role_key)}/permissions`, {
    permissions: role.permissions
  }).subscribe({
    next: () => {
      this.savingRole.set(false);
      this.permissionsDirty.set(false);
      this.permissionsMessage.set(`ההרשאות לתפקיד "${role.name}" נשמרו.`);
      this.loadPermissionConfig();
    },
    error: error => {
      this.savingRole.set(false);
      this.permissionsError.set(error.error?.error || 'שמירת ההרשאות נכשלה');
    }
  });
}

sections(): { id: AdminSection; icon: string; label: string }[] {
const all: { id: AdminSection; icon: string; label: string; permission: string }[] = [
{ id: 'tracks', icon: '', label: 'מסלולים', permission: 'tracks' },
{ id: 'students', icon: '', label: 'תלמידות', permission: 'students' },
{ id: 'approvals', icon: '', label: 'סוגי אישורים', permission: 'approvals' },
{ id: 'teachers', icon: '', label: 'מורות ומערכת', permission: 'teachers' },
{ id: 'users', icon: '', label: 'משתמשות והרשאות', permission: 'roles' },
];
return all.filter(s => s.id === 'users'
  ? this.auth.user()?.role === 'admin'
  : this.auth.hasPermission(s.permission));
}

activeSection(): AdminSection | null {
const available = this.sections();
const chosen = this.section();
return available.find(s => s.id === chosen)?.id ?? available[0]?.id ?? null;
}

loadUsers() {
this.http.get<UserAccount[]>('/api/users').subscribe(users => this.users.set(users));
}

createUser() {
this.userError.set('');
this.http.post('/api/users', this.newUser).subscribe({
next: () => {
this.newUser = { name: '', email: '', password: '', role: 'laborant' };
this.loadUsers();
},
error: error => this.userError.set(error.error?.error || 'לא ניתן ליצור את החשבון')
});
}

passwordTarget = signal<UserAccount | null>(null);
newPassword = signal('');
showNewPassword = signal(false);
showNewUserPassword = signal(false);

// עריכת פרטי משתמשת
editingUser = signal<UserAccount | null>(null);
editUserDraft = { name: '', email: '' };
savingEditUser = signal(false);

startEditUser(user: UserAccount) {
  this.editUserDraft = { name: user.name, email: user.email };
  this.userError.set('');
  this.editingUser.set(user);
}

saveEditUser() {
  const user = this.editingUser();
  if (!user) return;
  const name  = this.editUserDraft.name.trim();
  const email = this.editUserDraft.email.trim();
  if (!name || !email) { this.userError.set('שם ואימייל הם שדות חובה'); return; }
  this.savingEditUser.set(true);
  this.userError.set('');
  this.http.patch(`/api/users/${user.id}`, { name, email }).subscribe({
    next: () => {
      this.savingEditUser.set(false);
      this.editingUser.set(null);
      this.loadUsers();
    },
    error: (e: any) => {
      this.savingEditUser.set(false);
      this.userError.set(e.error?.error || 'שגיאה בעדכון הפרטים');
    }
  });
}

// מחיקת משתמשת
deleteUser(user: UserAccount) {
  this.requestTypedConfirmation(`מחיקת ${user.name}`, `מחיקת המשתמשת ${user.name} לצמיתות`, () => {
    this.deleteUserConfirmed(user);
  });
}

private deleteUserConfirmed(user: UserAccount) {
  this.userError.set('');
  this.http.delete(`/api/users/${user.id}`).subscribe({
    next: () => this.loadUsers(),
    error: (e: any) => this.userError.set(e.error?.error || 'לא ניתן למחוק את החשבון')
  });
}

startSetPassword(user: UserAccount) {
this.userError.set('');
this.passwordMessage.set('');
this.resetResult.set(null);
this.newPassword.set('');
this.showNewPassword.set(false);
this.passwordTarget.set(user);
}

savePassword() {
const user = this.passwordTarget();
const password = this.newPassword();
if (!user || this.savingPassword()) return;
if (password.length < 12 || password.length > 128) {
this.userError.set('הסיסמה חייבת להכיל 12 עד 128 תווים');
return;
}
this.userError.set('');
this.passwordMessage.set('');
this.savingPassword.set(true);
this.http.post<{ success: boolean }>(`/api/users/${user.id}/password`, { password }).subscribe({
next: () => {
this.savingPassword.set(false);
this.passwordTarget.set(null);
this.newPassword.set('');
this.passwordMessage.set(`הסיסמה של ${user.name} עודכנה בהצלחה. המשתמשת תצטרך להתחבר מחדש.`);
},
error: error => {
this.savingPassword.set(false);
this.userError.set(error.error?.error || 'לא ניתן לשנות את הסיסמה');
}
});
}

resetPassword(user: UserAccount) {
if (!confirm(`לאפס את הסיסמה של ${user.name}? הסיסמה הנוכחית תפסיק לעבוד והיא תנותק מהמערכת.`)) return;
this.userError.set('');
this.resetResult.set(null);
this.http.post<{ password: string }>(`/api/users/${user.id}/reset-password`, {}).subscribe({
next: result => this.resetResult.set({ name: user.name, password: result.password }),
error: error => this.userError.set(error.error?.error || 'לא ניתן לאפס את הסיסמה')
});
}

resetDatabase() {
this.resetDbMessage.set('');
this.requestTypedConfirmation('מחיקת כל התלמידות', 'מחיקת נתוני התלמידות, המסלולים, הדרישות והמבחנים', () => {
  this.resetDatabaseConfirmed();
});
}

private resetDatabaseConfirmed() {
this.resettingDb.set(true);
this.api.resetDatabase().subscribe({
next: (result) => {
this.resettingDb.set(false);
this.loadTotal();
this.resetDbMessage.set(`${result.message} (נמחקו תלמידות: ${result.cleared['students']}, מסלולים: ${result.cleared['tracks']}, מבחנים: ${result.cleared['exams']})`);
},
error: (error) => {
this.resettingDb.set(false);
this.resetDbMessage.set(error.error?.error || 'איפוס מסד הנתונים נכשל');
}
});
}

private requestTypedConfirmation(expected: string, description: string, action: () => void) {
  this.typedConfirmationInput.set('');
  this.typedConfirmation.set({ expected, description, action });
}

cancelTypedConfirmation() {
  this.typedConfirmation.set(null);
  this.typedConfirmationInput.set('');
}

confirmTypedAction() {
  const confirmation = this.typedConfirmation();
  if (!confirmation || this.typedConfirmationInput() !== confirmation.expected) return;
  this.cancelTypedConfirmation();
  confirmation.action();
}

updateUser(user: UserAccount, role: UserRole, active: boolean) {
this.userError.set('');
this.http.put(`/api/users/${user.id}`, { role, active }).subscribe({
next: () => this.loadUsers(),
error: error => {
this.userError.set(error.error?.error || 'לא ניתן לעדכן את החשבון');
this.loadUsers();
}
});
}

loadTotal() {
this.http.get<any[]>('/api/students').subscribe(s => this.totalImported.set(s.length));
}

// ── Teachers ──────────────────────────────────────────────
teachers = signal<any[]>([]);
newTeacherName = '';
newTeacherSubject = '';
newTeacherSpecialization = '';
newTeacherEmail = '';
newTeacherPhone = '';
savingTeacher = signal(false);
teacherMsg = signal<string | null>(null);
editingTeacherId = signal(0);
editTeacherDraft = { name: '', subject: '', email: '', phone: '' };
draggingTeachers = signal(false);
importingTeachers = signal(false);
teacherImportResult = signal<{ imported: number; skipped: number } | null>(null);
draggingSchedule = signal(false);
importingSchedule = signal(false);
scheduleImportResult = signal<any>(null);
scheduleImportWeek = '';

schoolYearEndDate = '2027-08-31';
savingSchoolYearEnd = signal(false);
schoolYearEndMessage = signal('');
schoolYearEndError = signal('');

periods = signal<any[]>([]);
editingPeriodId = signal(0);
periodError = signal('');
periodDraft = { name: '', start_time: '', end_time: '', is_break: false };

loadPeriods() {
  this.api.getLessonPeriods().subscribe({ next: p => this.periods.set(p), error: () => {} });
}
resetPeriodDraft() {
  this.editingPeriodId.set(0);
  this.periodDraft = { name: '', start_time: '', end_time: '', is_break: false };
}
editPeriod(p: any) {
  this.editingPeriodId.set(p.id);
  this.periodDraft = { name: p.name, start_time: p.start_time, end_time: p.end_time, is_break: !!p.is_break };
}
savePeriod() {
  this.periodError.set('');
  const id = this.editingPeriodId();
  const req = id ? this.api.updateLessonPeriod(id, this.periodDraft) : this.api.createLessonPeriod(this.periodDraft);
  req.subscribe({
    next: () => { this.resetPeriodDraft(); this.loadPeriods(); },
    error: (e: any) => this.periodError.set(e.error?.error || 'שגיאה בשמירה')
  });
}
deletePeriod(id: number) {
  if (!confirm('למחוק שורה זו מהרשימה? שיעורים קיימים בלוח לא יושפעו.')) return;
  this.api.deleteLessonPeriod(id).subscribe({ next: () => this.loadPeriods() });
}

private readonly teacherColors = ['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#ffedd5','#e0f2fe','#f0fdf4'];
teacherColor(id: number) { return this.teacherColors[(id - 1) % this.teacherColors.length]; }

loadTeachers() {
  this.api.getTeachers().subscribe({ next: t => this.teachers.set(t), error: () => {} });
}

createTeacher() {
  if (!this.newTeacherName.trim()) { this.teacherMsg.set('שגיאה: שם המורה הוא שדה חובה'); return; }
  this.savingTeacher.set(true); this.teacherMsg.set(null);
  this.api.createTeacher({
    name: this.newTeacherName.trim(),
    subject: this.newTeacherSubject.trim() || undefined,
    specialization: this.newTeacherSpecialization || undefined,
    email: this.newTeacherEmail.trim() || undefined,
    phone: this.newTeacherPhone.trim() || undefined,
  }).subscribe({
    next: () => {
      this.savingTeacher.set(false);
      this.teacherMsg.set(`✓ המורה "${this.newTeacherName}" נוספה`);
      this.newTeacherName = ''; this.newTeacherSubject = ''; this.newTeacherSpecialization = ''; this.newTeacherEmail = ''; this.newTeacherPhone = '';
      this.loadTeachers();
    },
    error: e => { this.savingTeacher.set(false); this.teacherMsg.set('שגיאה: ' + (e.error?.error || 'לא ניתן להוסיף')); }
  });
}

startEditTeacher(t: any) {
  this.editingTeacherId.set(t.id);
  this.editTeacherDraft = { name: t.name, subject: t.subject || '', email: t.email || '', phone: t.phone || '' };
}

saveTeacher(id: number) {
  this.api.updateTeacher(id, this.editTeacherDraft).subscribe({
    next: () => { this.editingTeacherId.set(0); this.loadTeachers(); },
    error: e => alert(e.error?.error || 'שגיאה')
  });
}

deleteTeacher(id: number) {
  if (!confirm('למחוק מורה זו? כל השיעורים שלה ימחקו גם כן.')) return;
  this.api.deleteTeacher(id).subscribe({ next: () => this.loadTeachers() });
}

deleteAllTeachers() {
  this.requestTypedConfirmation('מחיקת כל המורות', 'מחיקת כל המורות, השיעורים והנוכחות שלהן', () => {
    this.deleteAllTeachersConfirmed();
  });
}

private deleteAllTeachersConfirmed() {
  this.api.deleteAllTeachers().subscribe({
    next: () => this.loadTeachers(),
    error: e => alert(e.error?.error || 'שגיאה במחיקת המורות')
  });
}

onTeacherFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) this.importTeachers(file);
}
onDropTeachers(e: DragEvent) {
  e.preventDefault(); this.draggingTeachers.set(false);
  const file = e.dataTransfer?.files?.[0];
  if (file) this.importTeachers(file);
}
importTeachers(file: File) {
  this.importingTeachers.set(true); this.teacherImportResult.set(null);
  this.api.importTeachersExcel(file).subscribe({
    next: (r: { imported: number; skipped: number }) => { this.importingTeachers.set(false); this.teacherImportResult.set(r); this.loadTeachers(); },
    error: (e: any) => { this.importingTeachers.set(false); alert(e.error?.error || 'שגיאה בייבוא'); }
  });
}

onScheduleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) this.importSchedule(file);
}
onDropSchedule(e: DragEvent) {
  e.preventDefault(); this.draggingSchedule.set(false);
  if (!this.scheduleImportWeek) return;
  const file = e.dataTransfer?.files?.[0];
  if (file) this.importSchedule(file);
}
importSchedule(file: File) {
  if (!this.scheduleImportWeek) return;
  this.importingSchedule.set(true); this.scheduleImportResult.set(null);
  this.api.importScheduleExcel(file, this.scheduleImportWeek).subscribe({
    next: (r: any) => { this.importingSchedule.set(false); this.scheduleImportResult.set(r); },
    error: (e: any) => { this.importingSchedule.set(false); this.scheduleImportResult.set({ error: e.error?.error || 'שגיאה' }); }
  });
}

loadApprovals() {
this.api.getApprovalTypes().subscribe(t => this.approvalTypes.set(t));
}

newApproval() {
this.approvalSaveError.set('');
this.editingApproval.set({ id: null, name: '', template: '', signature: 'principal', type: 'regular' });
}

editApproval(t: any) {
this.approvalSaveError.set('');
this.editingApproval.set({ ...t });
}

saveApproval() {
const t = this.editingApproval()!;
this.approvalSaveError.set('');
this.savingApproval.set(true);
const obs = t.id ? this.api.updateApprovalType(t.id, t) : this.api.createApprovalType(t);
obs.subscribe({
next: () => {
this.savingApproval.set(false);
this.loadApprovals();
this.editingApproval.set(null);
},
error: (error) => {
this.savingApproval.set(false);
this.approvalSaveError.set(error.error?.error || 'שמירת האישור נכשלה. נסי שוב.');
}
});
}

deleteApproval(id: number) {
if (!confirm('למחוק סוג אישור זה?')) return;
this.api.deleteApprovalType(id).subscribe(() => this.loadApprovals());
}

varsHint(type: string): string {
const base = 'משתנים זמינים: <code>{{\u05e9\u05dd}}</code> <code>{{\u05ea\u05d6}}</code> <code>{{\u05e9\u05e0\u05d4}}</code> <code>{{\u05de\u05e1\u05dc\u05d5\u05dc}}</code>';
const extra = ' <code>{{\u05ea\u05d0\u05e8\u05d9\u05da \u05dc\u05d9\u05d3\u05d4}}</code> <code>{{\u05db\u05ea\u05d5\u05d1\u05ea}}</code>';
return type === 'single' ? base + extra : base;
}

onFileChange(e: Event) {
const files = (e.target as HTMLInputElement).files;
if (files) this.importFiles(Array.from(files));
}

onDrop(e: DragEvent) {
e.preventDefault();
this.dragging.set(false);
const files = Array.from(e.dataTransfer?.files ?? []);
if (files.length) this.importFiles(files);
}

importFiles(files: File[]) {
this.results.set([]);
this.importing.set(true);
let done = 0;
const newResults: {
filename: string;
ok: boolean;
imported?: number;
skipped?: number;
withBirthDate?: number;
withAddress?: number;
withPhoneCode?: number;
mergedExisting?: number;
addedExtraFields?: number;
error?: string;
}[] = [];

files.forEach(file => {
const fd = new FormData();
fd.append('file', file);
this.http.post<any>('/api/students/import', fd).subscribe({
next: (r) => {
newResults.push({
filename: file.name,
ok: true,
imported: r.imported,
skipped: r.skipped,
withBirthDate: r.withBirthDate,
withAddress: r.withAddress,
withPhoneCode: r.withPhoneCode,
mergedExisting: r.mergedExisting,
addedExtraFields: r.addedExtraFields
});
if (++done === files.length) { this.importing.set(false); this.results.set([...newResults]); this.loadTotal(); }
},
error: (e) => {
newResults.push({ filename: file.name, ok: false, error: e.error?.error || 'שגיאה' });
if (++done === files.length) { this.importing.set(false); this.results.set([...newResults]); }
}
});
});
}
}

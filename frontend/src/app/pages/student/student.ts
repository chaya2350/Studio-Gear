import { Component, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HDate, months } from '@hebcal/core';
import { ApiService, StudentRequirement, StudentRequirements } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Student } from '../../models';
import { StudentProfileCardComponent } from '../../components/student-profile-card/student-profile-card';
import { isHiddenStudentField } from '../../utils/hidden-student-fields';

const HEBREW_MONTH_NAMES: Record<number, string> = {
  [months.TISHREI]: 'תשרי', [months.CHESHVAN]: 'חשוון', [months.KISLEV]: 'כסלו',
  [months.TEVET]: 'טבת', [months.SHVAT]: 'שבט', [months.ADAR_I]: 'אדר',
  [months.ADAR_II]: 'אדר ב׳', [months.NISAN]: 'ניסן', [months.IYYAR]: 'אייר',
  [months.SIVAN]: 'סיוון', [months.TAMUZ]: 'תמוז', [months.AV]: 'אב', [months.ELUL]: 'אלול',
};

function toHebrewDateLabel(dateStr: string): string {
  try {
    const hd = new HDate(new Date(`${dateStr}T12:00:00`));
    const numerals = ['','א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳','ט׳','י׳','י״א','י״ב','י״ג','י״ד','ט״ו','ט״ז','י״ז','י״ח','י״ט','כ׳','כ״א','כ״ב','כ״ג','כ״ד','כ״ה','כ״ו','כ״ז','כ״ח','כ״ט','ל׳'];
    const day = numerals[hd.getDate()] || String(hd.getDate());
    const month = HEBREW_MONTH_NAMES[hd.getMonth()] || '';
    let yr = hd.getFullYear() % 1000;
    let label = '';
    const vals: [number,string][] = [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
    for (const [n, l] of vals) { while (yr >= n) { label += l; yr -= n; } }
    const yearStr = label.length === 1 ? `${label}׳` : `${label.slice(0,-1)}״${label.slice(-1)}`;
    return `${day} ${month} ${yearStr}`;
  } catch { return ''; }
}

@Component({
selector: 'app-student',
imports: [CommonModule, FormsModule, RouterLink, StudentProfileCardComponent],
template: `
<div *ngIf="student()">
<div class="page-header">
<div class="student-actions">
  <button class="btn btn-secondary" (click)="openGradeSheetExport()" [disabled]="!gradeSheetReady()">ייצוא ציונים</button>
</div>
<div style="display:flex; align-items:center; gap:16px;">
<a href="#" (click)="goBack($event)" class="back-btn">→</a>
<div>
<h1>{{ student()!.name }}</h1>
<p class="subtitle"> {{ student()!.id_number }}
<span *ngIf="student()!.track"> · {{ student()!.track }}{{ student()!.year ? ' ' + student()!.year : '' }}</span>
</p>
</div>
</div>
</div>

<div *ngIf="exportFormatOpen()" class="modal-backdrop" (click)="exportFormatOpen.set(false)">
  <div class="modal-card export-format-modal" role="dialog" aria-modal="true" aria-labelledby="export-format-title" (click)="$event.stopPropagation()">
    <div class="modal-title" id="export-format-title">ייצוא גיליון ציונים</div>
    <p>שנת התלמידה: <strong>{{ gradeSheetYearLabel() }}</strong></p>
    <label class="semester-label">מחצית</label>
    <div class="semester-options" role="group" aria-label="בחירת מחצית">
      <button type="button" [class.active]="gradeSheetSemester() === 'א׳'"
        [attr.aria-pressed]="gradeSheetSemester() === 'א׳'" (click)="gradeSheetSemester.set('א׳')">מחצית א׳</button>
      <button type="button" [class.active]="gradeSheetSemester() === 'ב׳'"
        [attr.aria-pressed]="gradeSheetSemester() === 'ב׳'" (click)="gradeSheetSemester.set('ב׳')">מחצית ב׳</button>
    </div>
    <p>באיזה פורמט תרצי להוריד את הגיליון?</p>
    <div class="export-format-actions">
      <button class="btn btn-primary" [disabled]="!gradeSheetSemester()" (click)="printGradeSheet()">הדפסה / שמירה כ־PDF</button>
      <button class="btn btn-secondary" [disabled]="!gradeSheetSemester()" (click)="exportGradeSheetExcel()">קובץ Excel</button>
    </div>
    <button class="btn btn-ghost" (click)="exportFormatOpen.set(false)">ביטול</button>
  </div>
</div>

<p *ngIf="gradeSheetError()" class="edit-error" role="alert">{{ gradeSheetError() }}</p>
<!-- Profile Card -->
<app-student-profile-card
  [name]="student()!.name"
  [idNumber]="student()!.id_number"
  [track]="student()!.track || ''"
  [year]="student()!.year || ''"
  [phone]="student()!.phone || ''"
  [imageUrl]="student()!.photo_url || ''"
  [totalReqs]="(requirements()?.requirements || []).length"
  [completedReqs]="(requirements()?.requirements || []).filter(r => !!r.completed_at).length"
  [missingRequired]="missingRequired()"
  [totalLoans]="student()!.loans?.length || 0"
  [activeLoans]="(student()!.loans || []).filter(l => !l.actual_return).length"
  [examAvg]="examAvgNum()"
  [examGrades]="examGradesForCard()">
</app-student-profile-card>

<!-- העלאת תמונת פרופיל -->
<div class="photo-upload-bar">
  <label class="photo-upload-btn" [class.uploading]="uploadingPhoto()">
    <input type="file" accept="image/*" [disabled]="uploadingPhoto()" (change)="uploadPhoto($event)" style="display:none">
    {{ uploadingPhoto() ? 'מעלה...' : student()!.photo_url ? '🖼 החלף תמונה' : '📷 הוסף תמונה' }}
  </label>
  <a *ngIf="student()!.photo_url" class="photo-download-btn" [href]="student()!.photo_url" [download]="student()!.name + '.jpg'" target="_blank">⬇ הורדה</a>
  <button *ngIf="student()!.photo_url" class="photo-remove-btn" (click)="removePhoto()">הסר תמונה</button>
  <span *ngIf="photoError()" class="photo-error">{{ photoError() }}</span>
</div>

<div class="detail-grid">
<div class="card">
<div class="student-card-header">
<div class="section-title"> פרטים אישיים</div>
<div class="student-actions" *ngIf="!editing()">
<button class="btn btn-secondary" (click)="startEditing()"> עריכת פרטים</button>
<button class="btn btn-danger" [disabled]="deleting()" (click)="deleteStudent()">
{{ deleting() ? 'מוחק...' : ' מחיקת תלמידה' }}
</button>
</div>
</div>
<form *ngIf="editing()" class="student-edit-form" (ngSubmit)="saveStudent()">
<div class="edit-shell">
<section class="edit-section">
<h3>פרטים בסיסיים</h3>
<div class="edit-grid">
<label class="field">
<span>שם מלא</span>
<input name="name" [(ngModel)]="studentDraft.name" required>
</label>
<label class="field">
<span>טלפון אישי</span>
<input name="phone" [(ngModel)]="studentDraft.phone">
</label>
<label class="field">
<span>כתובת</span>
<input name="address" [(ngModel)]="studentDraft.address">
</label>
<label class="field">
<span>תאריך לידה לועזי</span>
<input type="date" name="birth_date" [(ngModel)]="studentDraft.birth_date">
</label>
<label class="field">
<span>תאריך לידה עברי</span>
<input name="birth_date_hebrew" [(ngModel)]="studentDraft.birth_date_hebrew" placeholder="למשל: כ״ג שבט">
</label>
<label class="field">
<span>מסלול</span>
<input name="track" [(ngModel)]="studentDraft.track">
</label>
<label class="field">
<span>שנה</span>
<input name="year" [(ngModel)]="studentDraft.year">
</label>
<label class="field">
<span>מקבילה (מספר כיתה)</span>
<input name="parallel" [(ngModel)]="studentDraft.parallel" placeholder="למשל: 1, 2, 3">
</label>
</div>
</section>

<section class="edit-section">
<h3>סטטוס אישי</h3>
<div class="edit-grid">
<label class="field">
<span>סטטוס</span>
<select name="marital_status" [(ngModel)]="studentDraft.marital_status">
  <option value="">לא הוגדר</option>
  <option value="רווקה">רווקה</option>
  <option value="מאורסת">מאורסת</option>
  <option value="נשואה">נשואה</option>
</select>
</label>
<label class="field">
<span>שם לאחר חתונה</span>
<input name="married_name" [(ngModel)]="studentDraft.married_name" placeholder="שם משפחה חדש">
</label>
<label class="field">
<span>טלפון אישי (נוסף)</span>
<input name="personal_phone" [(ngModel)]="studentDraft.personal_phone" placeholder="050-0000000">
</label>
</div>
<div *ngIf="studentDraft.marital_status === 'מאורסת'" class="wedding-date-row">
  <label class="field">
    <span>💍 תאריך חתונה</span>
    <input type="date" name="wedding_date" [(ngModel)]="studentDraft.wedding_date"
           (ngModelChange)="updateHebrewWeddingDate()">
  </label>
  <div *ngIf="hebrewWeddingDate" class="hebrew-date-preview">
    <span>📅 {{ hebrewWeddingDate }}</span>
  </div>
</div>
<label class="field" *ngIf="studentDraft.marital_status === 'מאורסת' || studentDraft.marital_status === 'נשואה'">
  <span> מקום חתונה / אולם</span>
  <input name="wedding_venue" [(ngModel)]="studentDraft.wedding_venue" placeholder="שם האולם / עיר">
</label>
</section>

<section class="edit-section">
<h3>טלפון ציבורי</h3>
<div class="edit-grid single-col">
<label class="field">
<span>קוד לטלפון ציבורי</span>
<input name="phone_code" [(ngModel)]="studentDraft.phone_code" placeholder="למשל 02 / 03 / 04">
</label>
</div>
</section>

<section class="edit-section">
<h3>פרטים נוספים</h3>
<div class="extra-edit" *ngIf="editingExtraFields.length">
<div class="extra-edit-row" *ngFor="let f of editingExtraFields; let i = index">
<input [name]="'extra_key_' + i" [(ngModel)]="f.key" placeholder="שם פרט">
<input [name]="'extra_value_' + i" [(ngModel)]="f.value" placeholder="ערך">
<button type="button" class="btn btn-danger" (click)="removeEditingExtraField(i)">מחיקה</button>
</div>
</div>
<p *ngIf="!editingExtraFields.length" class="extra-empty">אין פרטים נוספים כרגע</p>

<div class="extra-add-row">
<input name="newExtraKey" [(ngModel)]="newExtraField.key" placeholder="שם פרט חדש">
<input name="newExtraValue" [(ngModel)]="newExtraField.value" placeholder="ערך">
<button type="button" class="btn btn-secondary" (click)="addEditingExtraField()">הוספה</button>
</div>
</section>
</div>

<div *ngIf="editError()" class="edit-error" role="alert">{{ editError() }}</div>
<div class="edit-actions">
<button class="btn btn-primary" type="submit" [disabled]="saving()">שמור</button>
<button class="btn btn-secondary" type="button" (click)="editing.set(false)">ביטול</button>
</div>
</form>

<div class="quick-stats">
<div class="stat-tile">
<span class="stat-label">סה"כ השאלות</span>
<strong class="stat-value">{{ student()!.loans?.length || 0 }}</strong>
</div>
<div class="stat-tile">
<span class="stat-label">השאלות פעילות</span>
<strong class="stat-value">{{ activeLoans().length }}</strong>
</div>
<div class="stat-tile status" [class.active]="activeLoans().length > 0">
<span class="stat-label">מצב</span>
<span class="badge" [class]="activeLoans().length ? 'badge-loaned' : 'badge-available'">
{{ activeLoans().length ? 'פעילות' : 'ללא פעילות' }}
</span>
</div>
</div>

<div class="info-grid">
<div class="info-row highlight">
<span class="info-label">שם</span>
<span class="info-value">{{ student()!.name }}</span>
</div>
<div class="info-row highlight">
<span class="info-label">ת.ז.</span>
<span class="info-value barcode-val">{{ student()!.id_number }}</span>
</div>
<div class="info-row">
<span class="info-label">תאריך לידה לועזי</span>
<span class="info-value">{{ student()!.birth_date ? formatWeddingDate(student()!.birth_date!) : 'לא הוגדר' }}</span>
</div>
<div class="info-row">
<span class="info-label">תאריך לידה עברי</span>
<span class="info-value">{{ formatHebrewBirthDate(student()!.birth_date_hebrew) || 'לא הוגדר' }}</span>
</div>
<div class="info-row" *ngIf="student()!.phone">
<span class="info-label">טלפון</span>
<span class="info-value">{{ student()!.phone }}</span>
</div>
<div class="info-row" *ngIf="safeAddress()">
<span class="info-label">כתובת</span>
<span class="info-value">{{ safeAddress() }}</span>
</div>
<div class="info-row" *ngIf="classDisplayValue()">
<span class="info-label">כיתה</span>
<span class="info-value">{{ classDisplayValue() }}</span>
</div>
<div class="info-row" *ngIf="student()!.track">
<span class="info-label">מסלול</span>
<span class="info-value">{{ student()!.track }}{{ student()!.year ? ' ' + student()!.year : '' }}</span>
</div>
<div class="info-row" *ngIf="student()!.marital_status">
<span class="info-label">סטטוס</span>
<span class="info-value">{{ student()!.marital_status }}</span>
</div>
<div class="info-row" *ngIf="student()!.married_name">
<span class="info-label">שם לאחר חתונה</span>
<span class="info-value">{{ student()!.married_name }}</span>
</div>
<div class="info-row" *ngIf="student()!.personal_phone">
<span class="info-label">טלפון אישי</span>
<span class="info-value">{{ student()!.personal_phone }}</span>
</div>
<div class="info-row" *ngIf="student()!.wedding_date">
<span class="info-label">💍 תאריך חתונה</span>
<span class="info-value">{{ formatWeddingDate(student()!.wedding_date!) }}</span>
</div>
<div class="info-row" *ngIf="student()!.wedding_venue">
<span class="info-label"> מקום חתונה</span>
<span class="info-value">{{ student()!.wedding_venue }}</span>
</div>
</div>

<div class="extra-fields" *ngIf="hasPublicPhoneBlock() || hasCredentialsBlock() || officialCredentialFields().length || emailFields().length || displayExtraFields().length">
<h3>פרטים נוספים </h3>
<div class="extra-fields-grid credentials-grid" *ngIf="hasPublicPhoneBlock() || hasCredentialsBlock() || officialCredentialFields().length || emailFields().length">
<div class="info-row extra highlight-import public-phone-card" *ngIf="hasPublicPhoneBlock()">
<span class="info-label">טלפון ציבורי</span>
<span class="info-value" *ngIf="phoneCodeValue()">קוד: {{ phoneCodeValue() }}</span>
<span class="info-value" *ngIf="phoneExtensionValue()">שלוחה: {{ phoneExtensionValue() }}</span>
</div>
<div class="info-row extra highlight-import credentials-card" *ngIf="hasCredentialsBlock()">
<span class="info-label">פרטי התחברות</span>
<span class="info-value" *ngIf="usernameValue()">שם משתמש: {{ usernameValue() }}</span>
<span class="info-value" *ngFor="let field of otherPasswordFields()">{{ field.key }}: {{ field.value }}</span>
</div>
<div class="info-row extra highlight-import gov-password-card" *ngIf="officialCredentialFields().length">
<ng-container *ngFor="let field of officialCredentialFields()">
<span class="info-label">{{ field.key }}</span>
<span class="info-value">{{ field.value }}</span>
</ng-container>
</div>
<div class="info-row extra highlight-import email-card" *ngIf="emailFields().length">
<ng-container *ngFor="let field of emailFields()">
<span class="info-label">{{ field.key }}</span>
<span class="info-value">{{ field.value }}</span>
</ng-container>
</div>
</div>
<div class="extra-fields-grid">
<div class="info-row extra" *ngFor="let field of displayExtraFields()">
<span class="info-label">{{ field.key }}</span>
<span class="info-value">{{ field.value }}</span>
</div>
</div>
</div>
</div>

<!-- ── לוח מודעות ── -->
<div class="card notices-card">
  <div class="section-title-row">
    <div class="section-title">📋 לוח מודעות</div>
    <button *ngIf="auth.hasPermission('students','change')"
            class="btn btn-ghost" style="font-size:0.8rem; padding:5px 12px;"
            (click)="noticeFormOpen.set(!noticeFormOpen())">
      {{ noticeFormOpen() ? 'סגור' : '+ מודעה חדשה' }}
    </button>
  </div>

  <div *ngIf="noticeFormOpen() && auth.hasPermission('students','change')" class="notice-form">
    <div class="form-row">
      <div class="form-group">
        <label>כותרת *</label>
        <input [(ngModel)]="newNotice.title" placeholder="כותרת המודעה">
      </div>
      <div class="form-group">
        <label>תאריך *</label>
        <input type="date" [(ngModel)]="newNotice.notice_date">
      </div>
    </div>
    <div class="form-group">
      <label>תוכן *</label>
      <textarea [(ngModel)]="newNotice.body" rows="3" placeholder="תוכן המודעה..."></textarea>
    </div>
    <div class="form-group">
      <label>מי רואה?</label>
      <div class="visibility-chips">
        <button type="button" [class.active]="newNotice.visibility==='staff'" (click)="newNotice.visibility='staff'">👩‍💼 צוות בלבד</button>
        <button type="button" [class.active]="newNotice.visibility==='student'" (click)="newNotice.visibility='student'">👩‍🎓 תלמידה בלבד</button>
        <button type="button" [class.active]="newNotice.visibility==='all'" (click)="newNotice.visibility='all'">🌐 כולם</button>
      </div>
    </div>
    <p *ngIf="noticeError()" class="edit-error">{{ noticeError() }}</p>
    <button class="btn btn-primary" [disabled]="savingNotice()" (click)="saveNotice()">
      {{ savingNotice() ? 'שומר...' : 'הוסף מודעה' }}
    </button>
  </div>

  <div *ngIf="!visibleNotices().length && !noticeFormOpen()" class="req-note">אין מודעות עדיין</div>

  <div class="notices-board">
    <div *ngFor="let n of visibleNotices()" class="notice-pin" [class]="'pin-' + n.visibility">
      <div class="pin-dot"></div>
      <div class="pin-body">
        <div class="pin-header">
          <span class="notice-vis-badge" [class]="'vis-' + n.visibility">
            {{ n.visibility === 'staff' ? '👩‍💼 צוות' : n.visibility === 'student' ? '👩‍🎓 תלמידה' : '🌐 כולם' }}
          </span>
          <span class="notice-date">{{ n.notice_date }}</span>
          <button *ngIf="auth.hasPermission('students','change')" class="doc-del" (click)="deleteNotice(n)" title="מחיקה">✕</button>
        </div>
        <strong class="notice-title">{{ n.title }}</strong>
        <p class="notice-body">{{ n.body }}</p>
        <span *ngIf="n.created_by_name" class="doc-meta">{{ n.created_by_name }}</span>
      </div>
    </div>
  </div>
</div>

<div class="card" *ngIf="activeLoans().length">
<div class="section-title"> השאלות פעילות</div>
<div *ngFor="let l of activeLoans()" class="loan-row active">
<a [routerLink]="['/equipment', l.equipment_id]" class="loan-name">{{ l.equipment_name }}</a>
<div class="loan-meta">
<span>{{ l.loan_date }}</span>
<span>→</span>
<span [style.color]="isOverdue(l) ? 'var(--danger)' : 'inherit'">{{ l.expected_return }}</span>
<span *ngIf="isOverdue(l)" class="badge badge-overdue"> איחור</span>
</div>
</div>
</div>
</div>

<div class="card" style="margin-top:20px;" *ngIf="requirements() as reqs">
<div class="section-title"> דרישות המסלול{{ reqs.track ? ' · ' + reqs.track : '' }}</div>
<p *ngIf="!reqs.track" class="req-note">לא הוגדר מסלול לתלמידה. אפשר להגדיר אותו בעריכת הפרטים.</p>
<p *ngIf="reqs.track && !reqs.defined" class="req-note">
עדיין לא הוגדרו דרישות למסלול הזה.
<a *ngIf="auth.hasPermission('tracks', 'change')" routerLink="/admin" class="req-link">להגדרת המסלול</a>
</p>
<p *ngIf="reqs.defined && !reqs.requirements.length" class="req-note">
למסלול הזה עדיין אין דרישות.
<a *ngIf="auth.hasPermission('tracks', 'change')" routerLink="/admin" class="req-link">להוספת דרישות</a>
</p>
<ng-container *ngIf="reqs.requirements.length">
<div class="req-summary" [class.done]="missingRequired() === 0">
{{ missingRequired() === 0 ? ' כל דרישות החובה הושלמו' : 'חסרות ' + missingRequired() + ' דרישות חובה' }}
</div>
<div *ngIf="requirementError()" class="edit-error" role="alert">{{ requirementError() }}</div>
<ng-container *ngFor="let r of reqs.requirements">
<div *ngIf="r.requires_file" class="req-item file-req" [class.checked]="!!r.completed_at">
<span class="req-text"> {{ r.title }}</span>
<span class="badge req-badge" [class.optional]="!r.required">{{ r.required ? 'חובה' : 'רשות' }}</span>
<ng-container *ngIf="r.completed_at">
<a class="btn btn-secondary" [href]="fileUrl(r)" target="_blank" rel="noopener"> {{ r.file_name || 'צפייה' }}</a>
<button class="btn btn-secondary" type="button" (click)="printFile(r)"> הדפסה</button>
<button class="btn btn-danger" type="button" [disabled]="savingRequirementId() === r.id" (click)="toggleRequirement(r, false)"></button>
</ng-container>
<label class="btn btn-primary upload-btn" [class.disabled]="savingRequirementId() === r.id">
{{ r.completed_at ? ' החלפה' : ' העלאת קובץ' }}
<input
type="file"
accept="application/pdf,image/jpeg,image/png,image/webp"
hidden
[disabled]="savingRequirementId() === r.id"
(change)="uploadFile(r, $event)"
/>
</label>
<span *ngIf="r.completed_at" class="req-by">{{ r.completed_by ? 'הועלה ע"י ' + r.completed_by : '' }}</span>
</div>
<label *ngIf="!r.requires_file" class="req-item" [class.checked]="!!r.completed_at">
<input
type="checkbox"
[checked]="!!r.completed_at"
[disabled]="savingRequirementId() === r.id"
(change)="toggleRequirement(r, $any($event.target).checked)"
/>
<span class="req-text">{{ r.title }}</span>
<span class="badge req-badge" [class.optional]="!r.required">{{ r.required ? 'חובה' : 'רשות' }}</span>
<span *ngIf="r.completed_at" class="req-by">{{ r.completed_by ? 'סומן ע"י ' + r.completed_by : 'הושלם' }}</span>
</label>
</ng-container>
</ng-container>
</div>

<div class="card" style="margin-top:20px;" *ngIf="exams() as ex">
<div class="section-title"> מבחנים וציונים</div>
<p *ngIf="!ex.length" class="req-note">עדיין אין מבחנים רשומים לתלמידה זו.</p>
<div class="table-wrap" *ngIf="ex.length">
<table>
<thead>
<tr><th>מבחן</th><th>תאריך</th><th>ציון</th><th>סטטוס</th></tr>
</thead>
<tbody>
<tr *ngFor="let e of ex">
<td>{{ e.exam_name }}</td>
<td>{{ e.exam_date || '—' }}</td>
<td [class.grade-val]="e.grade != null">{{ e.grade != null ? e.grade : '—' }}</td>
<td><span class="badge" [class.badge-green]="e.grade != null" [class.badge-red]="e.grade == null">{{ e.grade != null ? 'נבחנה' : 'לא נבחנה' }}</span></td>
</tr>
</tbody>
</table>
</div>
<div class="exam-average" *ngIf="studentExamAvg()">
ממוצע כללי: <strong>{{ studentExamAvg() }}</strong>
</div>
</div>

<div class="card" style="margin-top:20px;" *ngIf="attendance() as att">
<div class="section-title">📊 נוכחות בשיעורים</div>
<ng-container *ngIf="att.total_sessions > 0; else noAttendance">
  <!-- Summary banner -->
  <div class="att-summary" [class.good]="att.attendance_pct >= 80" [class.warn]="att.attendance_pct >= 60 && att.attendance_pct < 80" [class.bad]="att.attendance_pct < 60">
    <div class="att-pct">{{ att.attendance_pct }}%</div>
    <div class="att-text">
      <strong>אחוז נוכחות כללי</strong>
      <span>{{ att.total_sessions }} שיעורים | {{ att.total_absent }} היעדרויות | {{ att.total_late }} איחורים</span>
    </div>
  </div>

  <!-- By subject -->
  <div class="att-subjects" *ngIf="att.by_subject.length">
    <div *ngFor="let subj of att.by_subject" class="att-subject-row">
      <div class="subj-info">
        <strong>{{ subj.subject }}</strong>
        <span class="subj-teacher">{{ subj.teacher_name }}</span>
      </div>
      <div class="subj-stats">
        <span *ngIf="subj.absent > 0" class="stat-chip absent">חסרה {{ subj.absent }}</span>
        <span *ngIf="subj.late > 0" class="stat-chip late">איחרה {{ subj.late }}</span>
        <span class="stat-chip total">{{ subj.total }} שיעורים</span>
      </div>
    </div>
  </div>
</ng-container>
<ng-template #noAttendance>
  <p class="req-note">עדיין לא נרשמה נוכחות לתלמידה זו.</p>
</ng-template>
</div>

<div class="card" style="margin-top:20px;">
<div class="section-title"> היסטוריית השאלות ({{ student()!.loans?.length || 0 }})</div>
<div *ngIf="!student()!.loans?.length" class="empty-state" style="padding:30px 0;">
<div class="empty-icon"></div><p>אין היסטוריה</p>
</div>
<div class="table-wrap" *ngIf="student()!.loans?.length">
<table>
<thead>
<tr><th>ציוד</th><th>סוג</th><th>תאריך השאלה</th><th>תאריך החזרה</th><th>הוחזר</th><th>תשלום</th></tr>
</thead>
<tbody>
<tr *ngFor="let l of student()!.loans">
<td><a [routerLink]="['/equipment', l.equipment_id]" style="color:var(--primary); font-weight:700;">{{ l.equipment_name }}</a></td>
<td><span class="badge" [style]="l.loan_type==='rental' ? 'background:#fff8ec;color:#d97706' : 'background:#e6faf4;color:#059669'">{{ l.loan_type === 'rental' ? ' השכרה' : ' השאלה' }}</span></td>
<td>{{ l.loan_date }}</td>
<td>{{ l.expected_return }}</td>
<td>
<span *ngIf="l.actual_return" class="badge badge-available">{{ l.actual_return }}</span>
<span *ngIf="!l.actual_return" class="badge badge-loaned">טרם הוחזר</span>
</td>
<td>
<span *ngIf="l.payment_status === 'charged'" class="badge badge-available"> חויב</span>
<span *ngIf="l.payment_status === 'pending'" class="badge" style="background:#fff8ec;color:#d97706">⏳ ממתין</span>
<span *ngIf="l.payment_status === 'none'" class="badge badge-available">—</span>
</td>
</tr>
</tbody>
</table>
</div>
</div>
</div>

<!-- ── תיק סרוק ── -->
<div class="card" style="margin-top:20px;">
  <div class="section-title-row">
    <div class="section-title">📁 תיק סרוק</div>
    <label class="upload-doc-btn" [class.uploading]="uploadingDoc()">
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" hidden multiple [disabled]="uploadingDoc()" (change)="uploadDocuments($event)">
      {{ uploadingDoc() ? 'מעלה...' : '+ הוסף מסמכים' }}
    </label>
  </div>
  <p *ngIf="docError()" class="edit-error" role="alert">{{ docError() }}</p>
  <div *ngIf="!documents().length" class="req-note">אין מסמכים בתיק עדיין</div>
  <div *ngFor="let doc of documents()" class="doc-row">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18" style="flex-shrink:0;color:var(--primary)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <a [href]="doc.file_url" target="_blank" rel="noopener" class="doc-name">{{ doc.file_name }}</a>
    <span class="doc-meta">{{ doc.created_at | date:'dd/MM/yy' }} · {{ doc.uploaded_by_name || '' }}</span>
    <button class="doc-del" (click)="deleteDocument(doc)" title="מחיקה">✕</button>
  </div>
</div>

<div *ngIf="!student() && !loading()" class="empty-state"><div class="empty-icon"></div>
<p>תלמידה לא נמצאה</p>
<a href="#" (click)="goBack($event)" class="btn btn-primary" style="margin-top:16px;">חזרה</a>
</div>
`,
styles: [`
.back-btn {
width: 36px; height: 36px; background: var(--surface); border: 1.5px solid var(--border);
border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
text-decoration: none; color: var(--text-muted); font-size: 1rem; font-weight: 700;
transition: all var(--transition); box-shadow: var(--shadow-xs);
&:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
}
.photo-upload-bar {
  display: flex; align-items: center; gap: 8px; margin: 8px 0 16px; flex-wrap: wrap;
}
.photo-upload-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1.5px solid var(--border);
  font: inherit; font-size: 0.82rem; font-weight: 700; cursor: pointer; color: var(--text-muted);
  transition: all var(--transition);
  &:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
  &.uploading { opacity: 0.6; cursor: wait; }
}
.photo-remove-btn {
  padding: 6px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; font: inherit; font-size: 0.8rem; cursor: pointer; color: var(--danger);
  &:hover { background: #fee2e2; border-color: var(--danger); }
}
.photo-download-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; font: inherit; font-size: 0.8rem; cursor: pointer;
  color: var(--primary); text-decoration: none;
  &:hover { background: var(--primary-light); border-color: var(--primary); }
}
.wedding-date-row {
  margin-top: 12px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.hebrew-date-preview {
  padding: 8px 14px; background: #fff8ec; border: 1px solid #fde68a;
  border-radius: var(--radius-sm); font-size: 0.88rem; font-weight: 700; color: #92400e;
}
.photo-error { font-size: 0.78rem; color: var(--danger); }
.student-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
.student-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.student-card-header .section-title { margin-bottom: 0; }
.student-edit-form {
display: grid;
gap: 12px;
margin-bottom: 22px;
padding: 16px;
border: 1px solid var(--border);
border-radius: var(--radius);
background: linear-gradient(180deg, var(--surface), var(--surface-2));
box-shadow: var(--shadow-xs);
}
.edit-shell { display: grid; gap: 14px; }
.edit-section {
border: 1px solid var(--border);
border-radius: var(--radius-sm);
background: var(--surface);
padding: 12px;
display: grid;
gap: 10px;
}
.edit-section h3 {
margin: 0;
font-size: 0.86rem;
color: var(--text-muted);
font-weight: 800;
letter-spacing: 0.2px;
}
.edit-grid {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 10px;
}
.edit-grid.single-col { grid-template-columns: 1fr; }
.field {
display: grid;
gap: 6px;
font-size: 0.82rem;
font-weight: 700;
color: var(--text-muted);
}
.field span { font-size: 0.77rem; }
.student-edit-form input {
width: 100%;
border: 1.5px solid var(--border);
border-radius: 10px;
background: var(--surface-2);
color: var(--text);
padding: 9px 12px;
font-size: 0.9rem;
font-family: inherit;
transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
}
.student-edit-form input:focus {
outline: none;
border-color: var(--primary);
box-shadow: 0 0 0 3px var(--primary-glow);
background: var(--surface);
}
.extra-edit {
border: 1px dashed var(--border);
border-radius: var(--radius-sm);
padding: 10px;
background: var(--bg);
display: grid;
gap: 8px;
}
.extra-edit-row {
display: grid;
grid-template-columns: 1fr 1fr auto;
gap: 8px;
align-items: center;
}
.extra-add-row {
display: grid;
grid-template-columns: 1fr 1fr auto;
gap: 8px;
align-items: center;
}
.extra-empty {
margin: 0;
font-size: 0.82rem;
color: var(--text-light);
background: var(--bg);
border: 1px dashed var(--border);
border-radius: 8px;
padding: 9px 10px;
}
.quick-stats {
display: grid;
grid-template-columns: repeat(3, minmax(0, 1fr));
gap: 12px;
margin-bottom: 20px;
}
.stat-tile {
padding: 12px 14px;
border: 1px solid var(--border);
border-radius: var(--radius-sm);
background: linear-gradient(180deg, var(--surface), var(--surface-2));
display: grid;
gap: 5px;
min-height: 74px;
align-content: center;
}
.stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 700; }
.stat-value { font-size: 1.1rem; color: var(--text); }
.stat-tile.status { align-items: start; }
.stat-tile.status.active { border-color: #fdba74; background: linear-gradient(180deg, #fffbeb, #fff7ed); }
.info-grid {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 12px;
align-items: start;
}
.info-row {
display: grid;
gap: 4px;
padding: 12px 14px;
border-radius: var(--radius-sm);
border: 1px solid var(--border);
background: var(--surface);
min-height: 64px;
align-content: center;
}
.info-row.highlight {
background: linear-gradient(180deg, #f8fbff, #f1f7ff);
border-color: #c8ddff;
}
.info-label {
font-size: 0.74rem;
font-weight: 700;
color: var(--text-muted);
letter-spacing: 0.2px;
}
.info-value {
font-size: 0.92rem;
color: var(--text);
line-height: 1.4;
word-break: break-word;
}
.extra-fields {
margin-top: 18px;
padding-top: 14px;
border-top: 1px dashed var(--border);
}
.extra-fields h3 {
margin: 0 0 10px;
font-size: 0.88rem;
color: var(--text-muted);
font-weight: 800;
}
.extra-fields-grid {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 10px;
}
.public-phone-card { grid-column: 1; grid-row: 1; }
.credentials-card { grid-column: 2; grid-row: 1; }
.gov-password-card { grid-column: 1; grid-row: 2; }
.email-card { grid-column: 2; grid-row: 2; }
.info-row.extra {
background: var(--bg);
}
.info-row.extra.highlight-import {
background: linear-gradient(180deg, #f7fff9, #effcf3);
border-color: #b9efcc;
}
.edit-actions {
display: flex;
gap: 8px;
justify-content: flex-end;
border-top: 1px dashed var(--border);
padding-top: 12px;
}
.edit-error { color: var(--danger); font-size: 0.85rem; }
.req-note { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
.req-link { color: var(--primary); font-weight: 700; margin-inline-start: 6px; }
.req-summary {
background: #fef3c7; color: #92400e; border-radius: var(--radius-sm);
padding: 8px 14px; font-weight: 700; font-size: 0.88rem; margin-bottom: 12px;
&.done { background: #dcfce7; color: #166534; }
}
.req-item {
display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin-bottom: 8px;
background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
&.checked { background: #f0fdf4; border-color: #bbf7d0; }
input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }
}
.req-text { flex: 1; font-weight: 600; }
.req-item.checked .req-text { color: var(--text-muted); text-decoration: line-through; }
.req-badge { background: #fee2e2; color: #b91c1c; }
.req-badge.optional { background: var(--primary-light); color: var(--primary); }
.req-by { color: var(--text-muted); font-size: 0.75rem; }
.file-req { flex-wrap: wrap; cursor: default; }
.file-req .btn { padding: 6px 12px; font-size: 0.82rem; text-decoration: none; }
.upload-btn { cursor: pointer; margin: 0; }
.upload-btn.disabled { opacity: 0.6; pointer-events: none; }
/* ── תיק סרוק ── */
.section-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.upload-doc-btn {
  display: inline-flex; align-items: center; padding: 6px 13px;
  border: 1.5px solid var(--primary); border-radius: var(--radius-sm);
  background: var(--primary-light); color: var(--primary); font: inherit; font-size: 0.8rem;
  font-weight: 700; cursor: pointer;
  &.uploading { opacity: 0.6; cursor: wait; }
  &:hover { background: var(--primary); color: white; }
}
.doc-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 4px;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}
.doc-name { color: var(--primary); text-decoration: none; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; &:hover { text-decoration: underline; } }
.doc-meta { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
.doc-del { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.78rem; padding: 3px 5px; border-radius: 4px; flex-shrink: 0; &:hover { color: var(--danger); background: #fee2e2; } }
/* ── לוח מודעות ── */
.notice-form { background: var(--surface-2); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 14px; }
.visibility-chips { display: flex; gap: 6px; flex-wrap: wrap;
  button { padding: 6px 12px; border: 1.5px solid var(--border); border-radius: 999px; background: var(--surface); font: inherit; font-size: 0.8rem; cursor: pointer;
    &.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); font-weight: 700; }
  }
}
.notices-board {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-top: 8px;
}
.notice-pin {
  position: relative; border-radius: var(--radius-sm); padding: 14px 14px 12px;
  box-shadow: 2px 3px 10px rgba(0,0,0,.1); border: 1px solid transparent;
  &.pin-staff    { background: #fffbeb; border-color: #fde68a; }
  &.pin-student  { background: #eff6ff; border-color: #bfdbfe; }
  &.pin-all      { background: #f0fdf4; border-color: #bbf7d0; }
}
.pin-dot {
  position: absolute; top: -6px; right: 50%; transform: translateX(50%);
  width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,.2);
  .pin-staff &    { background: #f59e0b; }
  .pin-student &  { background: #3b82f6; }
  .pin-all &      { background: #10b981; }
}
.pin-body { display: flex; flex-direction: column; gap: 6px; }
.pin-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px; }
.notice-title { font-size: 0.92rem; font-weight: 800; color: var(--text); display: block; }
.notice-date { font-size: 0.72rem; color: var(--text-muted); margin-right: auto; }
.notice-vis-badge { font-size: 0.68rem; padding: 2px 7px; border-radius: 999px; font-weight: 700; white-space: nowrap;
  &.vis-staff    { background: #fef3c7; color: #92400e; }
  &.vis-student  { background: #dbeafe; color: #1e40af; }
  &.vis-all      { background: #dcfce7; color: #166534; }
}
.notice-body { font-size: 0.85rem; color: var(--text); line-height: 1.6; margin: 0; white-space: pre-wrap; word-break: break-word; }
.export-format-modal { width: min(440px, 94vw); }
.export-format-modal p { margin: 8px 0 18px; color: var(--text-muted); }
.semester-label { display: block; margin: 12px 0 6px; font-size: .85rem; font-weight: 700; }
.semester-options { display: flex; gap: 8px; margin-bottom: 14px; }
.semester-options button { flex: 1; padding: 9px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
.semester-options button.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); font-weight: 700; }
.export-format-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
@media (max-width: 1050px) {
.quick-stats { grid-template-columns: 1fr; }
.info-grid { grid-template-columns: 1fr; }
.extra-fields-grid { grid-template-columns: 1fr; }
.credentials-grid .public-phone-card, .credentials-grid .credentials-card, .credentials-grid .gov-password-card, .credentials-grid .email-card {
  grid-column: auto; grid-row: auto;
}
.edit-grid { grid-template-columns: 1fr; }
.extra-edit-row, .extra-add-row { grid-template-columns: 1fr; }
.edit-actions { justify-content: stretch; }
.edit-actions .btn { width: 100%; }
}
@media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }
.barcode-val {
font-family: monospace; background: var(--surface-2); padding: 3px 9px;
border-radius: var(--radius-xs); font-size: 0.85rem; border: 1px solid var(--border);
}
.loan-row {
padding: 12px 0; border-bottom: 1px solid var(--border);
&:last-child { border: none; }
}
.loan-name {
font-weight: 700; color: var(--primary); text-decoration: none; font-size: 0.9rem;
display: block; margin-bottom: 5px;
&:hover { text-decoration: underline; }
}
.loan-meta {
display: flex; gap: 8px; align-items: center; font-size: 0.8rem; color: var(--text-muted);
}
.stats-row {
display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;
}
.stat-pill {
background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px;
padding: 5px 14px; font-size: 0.8rem; font-weight: 700; color: var(--text-muted);
display: flex; align-items: center; gap: 6px;
span { color: var(--text); font-size: 1rem; }
}
.att-summary {
display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-radius: var(--radius-sm);
margin-bottom: 14px; border: 1.5px solid;
&.good { background: #f0fdf4; border-color: #bbf7d0; .att-pct { color: #16a34a; } }
&.warn { background: #fffbeb; border-color: #fde68a; .att-pct { color: #d97706; } }
&.bad { background: #fef2f2; border-color: #fecaca; .att-pct { color: var(--danger); } }
}
.att-pct { font-size: 2rem; font-weight: 800; min-width: 60px; text-align: center; }
.att-text { strong { display: block; font-size: 0.9rem; } span { font-size: 0.8rem; color: var(--text-muted); } }
.att-subjects { display: flex; flex-direction: column; gap: 8px; }
.att-subject-row {
display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.subj-info { strong { display: block; } .subj-teacher { font-size: 0.78rem; color: var(--text-muted); } }
.subj-stats { display: flex; gap: 6px; flex-wrap: wrap; }
.stat-chip {
border-radius: 12px; padding: 3px 10px; font-size: 0.78rem; font-weight: 700;
&.absent { background: #fef2f2; color: #b91c1c; }
&.late { background: #fffbeb; color: #d97706; }
&.total { background: var(--surface-2); color: var(--text-muted); }
}
`]
})
export class StudentComponent implements OnInit {
student = signal<Student | null>(null);
loading = signal(true);
editing = signal(false);
saving = signal(false);
deleting = signal(false);
editError = signal('');
studentDraft = { name: '', phone: '', address: '', birth_date: '', birth_date_hebrew: '', phone_code: '', track: '', year: '', parallel: '', marital_status: '', married_name: '', personal_phone: '', wedding_date: '', wedding_venue: '' };
editingExtraFields: { key: string; value: string }[] = [];
newExtraField = { key: '', value: '' };
today = new Date().toISOString().split('T')[0];
requirements = signal<StudentRequirements | null>(null);
requirementError = signal('');
savingRequirementId = signal<number | null>(null);
exams = signal<any[]>([]);
attendance = signal<any>(null);
gradeSheetError = signal('');
examsLoaded = signal(false);
exportFormatOpen = signal(false);
gradeSheetSemester = signal<'א׳' | 'ב׳' | null>(null);
gradeSheetReady = computed(() => this.examsLoaded() && !!this.attendance());

uploadingPhoto = signal(false);
photoError = signal('');

// ── תיק סרוק ──
documents = signal<any[]>([]);
uploadingDoc = signal(false);
docError = signal('');

// ── לוח מודעות ──
notices = signal<any[]>([]);
noticeFormOpen = signal(false);
noticeError = signal('');
savingNotice = signal(false);
newNotice = { title: '', body: '', notice_date: new Date().toISOString().split('T')[0], visibility: 'staff' };

// תאריך חתונה עברי
hebrewWeddingDate = '';

updateHebrewWeddingDate() {
  const d = this.studentDraft.wedding_date;
  this.hebrewWeddingDate = d ? toHebrewDateLabel(d) : '';
}

formatWeddingDate(dateStr: string): string {
  const heb = toHebrewDateLabel(dateStr);
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    const greg = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    return heb ? `${heb} (${greg})` : greg;
  } catch { return dateStr; }
}

formatHebrewBirthDate(value?: string): string {
  const parsed = /^(\d{1,2})-(\d{1,2})$/.exec(String(value || ''));
  if (!parsed) return '';
  const day = Number(parsed[1]);
  const month = Number(parsed[2]);
  const numerals = ['', 'א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ז׳','ח׳','ט׳','י׳','י״א','י״ב','י״ג','י״ד','ט״ו','ט״ז','י״ז','י״ח','י״ט','כ׳','כ״א','כ״ב','כ״ג','כ״ד','כ״ה','כ״ו','כ״ז','כ״ח','כ״ט','ל׳'];
  const monthNames: Record<number, string> = {
    1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
    7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
    12: 'אדר א׳', 13: 'אדר ב׳', 14: 'אדר'
  };
  return numerals[day] && monthNames[month] ? `${numerals[day]} ${monthNames[month]}` : '';
}

// מודעות לפי הרשאות: admin/secretary/laborant רואים הכל, אחרים רק 'all'+'student'
visibleNotices = computed(() => {  const canSeeStaff = this.auth.hasPermission('students', 'view');
  return this.notices().filter(n =>
    n.visibility === 'all' ||
    n.visibility === 'student' ||
    (n.visibility === 'staff' && canSeeStaff)
  );
});

constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService, private location: Location, private router: Router) {}

uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const current = this.student();
  input.value = '';
  if (!file || !current) return;
  this.uploadingPhoto.set(true);
  this.photoError.set('');
  this.api.uploadStudentPhoto(current.id_number, file).subscribe({
    next: (res: { url: string }) => {
      this.uploadingPhoto.set(false);
      this.student.update(s => s ? { ...s, photo_url: res.url } : s);
    },
    error: () => {
      this.uploadingPhoto.set(false);
      this.photoError.set('שגיאה בהעלאת התמונה');
    }
  });
}

removePhoto() {
  const current = this.student();
  if (!current) return;
  this.api.updateStudentPhoto(current.id_number, '').subscribe({
    next: () => this.student.update(s => s ? { ...s, photo_url: undefined } : s),
    error: () => {}
  });
}

goBack(event: Event) {
event.preventDefault();
if (window.history.length > 1) this.location.back();
else this.router.navigate(['/students']);
}

ngOnInit() {
const id = this.route.snapshot.params['id'];
this.loadStudent(id);
}

loadStudent(id: string) {
this.examsLoaded.set(false);
this.attendance.set(null);
this.gradeSheetError.set('');
this.api.getStudent(id).subscribe({
next: s => {
  this.student.set(s);
  this.loading.set(false);
  this.loadRequirements(s.id_number);
  this.loadExams(s.id_number);
  this.loadAttendance(s.id_number);
  this.loadDocuments(s.id_number);
  this.loadNotices(s.id_number);
},
error: () => this.loading.set(false)
});
}

loadDocuments(id_number: string) {
  this.api.getStudentDocuments(id_number).subscribe({ next: d => this.documents.set(d), error: () => {} });
}

uploadDocuments(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const current = this.student();
  input.value = '';
  if (!files.length || !current) return;
  this.uploadingDoc.set(true);
  this.docError.set('');
  let remaining = files.length;
  for (const file of files) {
    this.api.uploadStudentDocument(current.id_number, file).subscribe({
      next: doc => {
        this.documents.update(d => [doc, ...d]);
        remaining--;
        if (remaining === 0) this.uploadingDoc.set(false);
      },
      error: (e: any) => {
        remaining--;
        this.docError.set(e.error?.error || `שגיאה בהעלאת ${file.name}`);
        if (remaining === 0) this.uploadingDoc.set(false);
      }
    });
  }
}

deleteDocument(doc: any) {
  if (!confirm(`למחוק את "${doc.file_name}"?`)) return;
  const current = this.student();
  if (!current) return;
  this.api.deleteStudentDocument(current.id_number, doc.id).subscribe({
    next: () => this.documents.update(d => d.filter(x => x.id !== doc.id)),
    error: () => {}
  });
}

loadNotices(id_number: string) {
  this.api.getStudentNotices(id_number).subscribe({ next: n => this.notices.set(n), error: () => {} });
}

saveNotice() {
  const current = this.student();
  if (!current) return;
  const { title, body, notice_date, visibility } = this.newNotice;
  if (!title.trim() || !body.trim() || !notice_date) { this.noticeError.set('יש למלא כותרת, תוכן ותאריך'); return; }
  this.savingNotice.set(true); this.noticeError.set('');
  this.api.createStudentNotice(current.id_number, { title: title.trim(), body: body.trim(), notice_date, visibility }).subscribe({
    next: () => {
      this.loadNotices(current.id_number);
      this.newNotice = { title: '', body: '', notice_date: new Date().toISOString().split('T')[0], visibility: 'staff' };
      this.noticeFormOpen.set(false);
      this.savingNotice.set(false);
    },
    error: (e: any) => { this.savingNotice.set(false); this.noticeError.set(e.error?.error || 'שגיאה בשמירה'); }
  });
}

deleteNotice(notice: any) {
  if (!confirm(`למחוק את המודעה "${notice.title}"?`)) return;
  const current = this.student();
  if (!current) return;
  this.api.deleteStudentNotice(current.id_number, notice.id).subscribe({
    next: () => this.notices.update(n => n.filter(x => x.id !== notice.id)),
    error: () => {}
  });
}

loadExams(id_number: string) {
this.api.getStudentExams(id_number).subscribe({
next: rows => {
  this.exams.set(rows);
  this.examsLoaded.set(true);
},
error: () => this.gradeSheetError.set('לא ניתן לטעון את ציוני התלמידה. נסי שוב לפני ייצוא הגיליון.')
});
}

loadAttendance(id_number: string) {
this.api.getStudentAttendance(id_number).subscribe({
next: att => this.attendance.set(att),
error: () => {
  this.attendance.set(null);
  this.gradeSheetError.set('לא ניתן לטעון את נתוני הנוכחות. נסי שוב לפני ייצוא הגיליון.');
}
});
}

private gradeCategory(exam: any): 'קודש' | 'מסלול' {
return exam.track ? 'מסלול' : 'קודש';
}

private attendanceCategory(subject: string): 'קודש' | 'מסלול' | 'תפילה' | null {
const normalized = subject.toLocaleLowerCase('he');
if (/תפילה|שחרית|מנחה|ערבית/.test(normalized)) return 'תפילה';
if (/קודש|גמרא|תנ.?ך|הלכה|חסידות|יהדות/.test(normalized)) return 'קודש';
const tracks = (this.student()?.track || '').split(/[,/|]/).map(track => track.trim()).filter(Boolean);
if (/מסלול/.test(normalized) || tracks.some(track => normalized.includes(track.toLocaleLowerCase('he')))) return 'מסלול';
return null;
}

private attendanceSummary() {
const summaries: Record<string, { total: number; absent: number; late: number }> = {
  קודש: { total: 0, absent: 0, late: 0 },
  מסלול: { total: 0, absent: 0, late: 0 },
  תפילה: { total: 0, absent: 0, late: 0 },
};
const unclassified: any[] = [];
for (const subject of this.attendance()?.by_subject || []) {
  const category = this.attendanceCategory(String(subject.subject || ''));
  if (!category) {
    unclassified.push(subject);
    continue;
  }
  summaries[category].total += Number(subject.total) || 0;
  summaries[category].absent += Number(subject.absent) || 0;
  summaries[category].late += Number(subject.late) || 0;
}
return { summaries, unclassified };
}

gradeSheetYearLabel(): string {
const year = String(this.student()?.year || '').trim();
const normalized = year.replace(/[״׳'"]/g, '');
if (normalized === 'ה') return 'א׳';
if (normalized === 'ו') return 'ב׳';
return year || 'לא הוגדרה';
}

openGradeSheetExport() {
this.gradeSheetSemester.set(null);
this.exportFormatOpen.set(true);
}

async exportGradeSheetExcel() {
const student = this.student();
const semester = this.gradeSheetSemester();
if (!student || !this.attendance() || !semester) return;
this.exportFormatOpen.set(false);
const asOfDate = new Date().toLocaleDateString('he-IL');
let barcodeLoadFailed = false;
try {
const { default: ExcelJS } = await import('exceljs');
const exams = this.exams();
const gradeRows: (string | number)[][] = [
  ['מקצוע', 'מבחן', 'ברקוד', 'תאריך', 'ציון'],
  ...exams.map(exam => [exam.subject || '—', exam.exam_name, '', exam.exam_date || '', exam.grade ?? '']),
];
const { summaries, unclassified } = this.attendanceSummary();
const attendanceRows: (string | number)[][] = [
  ['תחום', 'שיעורים', 'היעדרויות', 'איחורים', 'אחוז נוכחות'],
  ...['קודש', 'מסלול', 'תפילה'].map(category => {
    const summary = summaries[category];
    return [
      `נוכחות ${category}`, summary.total, summary.absent, summary.late,
      summary.total ? Math.round((1 - summary.absent / summary.total) * 100) : '',
    ];
  }),
  ...unclassified.map(subject => [
    `נוכחות - ${subject.subject || 'מקצוע לא מסווג'}`,
    subject.total || 0, subject.absent || 0, subject.late || 0,
    subject.total ? Math.round((1 - subject.absent / subject.total) * 100) : '',
  ]),
];
const workbook = new ExcelJS.Workbook();
workbook.creator = 'סמינר גור';
workbook.subject = 'גיליון ציונים ונוכחות';
const loadBarcode = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    barcodeLoadFailed = true;
    throw new Error('barcode load failed');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return workbook.addImage({ base64: btoa(binary), extension: 'png' });
};
const studentBarcodeId = await loadBarcode(this.api.getStudentAttendanceBarcodeUrl(student.id_number));
const examBarcodeIds = await Promise.all(exams.map(exam =>
  exam.code ? loadBarcode(this.api.getExamBarcodeUrl(exam.code)) : Promise.resolve(null),
));
for (const [name, rows, widths] of [
  ['ציונים', gradeRows, [20, 30, 24, 16, 12]],
  ['נוכחות', attendanceRows, [30, 14, 14, 14, 18]],
] as const) {
  const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true }] });
  sheet.addRows([
    ['גיליון ציונים', ''],
    ['שם התלמידה', student.name],
    ['תעודת זהות', student.id_number],
    ['מסלול', student.track || '—'],
    ['שנת התלמידה', this.gradeSheetYearLabel() === 'לא הוגדרה' ? '—' : this.gradeSheetYearLabel()],
    ['מחצית', semester],
    ['נכון לתאריך', asOfDate],
    [],
    ['ברקוד כללי', ''],
    ...rows,
  ]);
  sheet.columns = widths.map(width => ({ width }));
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF174E3C' } };
  sheet.getRow(9).height = 30;
  sheet.addImage(studentBarcodeId, { tl: { col: 1, row: 8 }, ext: { width: 130, height: 28 } });
  const header = sheet.getRow(10);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174E3C' } };
  if (name === 'ציונים') {
    exams.forEach((exam, index) => {
      const imageId = examBarcodeIds[index];
      if (imageId === null) return;
      const row = sheet.getRow(11 + index);
      row.height = 30;
      sheet.addImage(imageId, { tl: { col: 2, row: 10 + index }, ext: { width: 130, height: 28 } });
    });
  }
  sheet.eachRow(row => row.eachCell(cell => { cell.alignment = { vertical: 'middle', horizontal: 'right' }; }));
}
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `גיליון ציונים - ${student.name}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
} catch {
  this.gradeSheetError.set(barcodeLoadFailed
    ? 'לא ניתן לטעון את הברקודים לגיליון. בדקי את החיבור ונסי שוב.'
    : 'לא ניתן ליצור את קובץ ה־Excel. נסי שוב.');
}
}

printGradeSheet() {
const student = this.student();
const semester = this.gradeSheetSemester();
if (!student || !this.attendance() || !semester) return;
this.exportFormatOpen.set(false);
const asOfDate = new Date().toLocaleDateString('he-IL');
const printWindow = window.open('', '_blank');
if (!printWindow) {
  this.gradeSheetError.set('לא ניתן לפתוח חלון הדפסה. יש לאפשר חלונות קופצים ולנסות שוב.');
  return;
}
this.gradeSheetError.set('');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
const exams = this.exams();
const { summaries, unclassified } = this.attendanceSummary();
const gradeRows = (category: 'קודש' | 'מסלול') => exams
  .filter(exam => this.gradeCategory(exam) === category)
  .map(exam => `<tr><td>${escapeHtml(exam.subject || '—')}</td><td>${escapeHtml(exam.exam_name)}</td><td>${exam.code ? `<img class="barcode-image exam-barcode" src="${escapeHtml(this.api.getExamBarcodeUrl(exam.code))}" alt="ברקוד ${escapeHtml(exam.exam_name)}">` : '—'}</td><td>${escapeHtml(exam.exam_date || '—')}</td><td>${escapeHtml(exam.grade ?? '—')}</td></tr>`)
  .join('');
const studentBarcodeUrl = escapeHtml(this.api.getStudentAttendanceBarcodeUrl(student.id_number));
const attendanceRows = ['קודש', 'מסלול', 'תפילה'].map(category => {
  const summary = summaries[category];
  const pct = summary.total ? `${Math.round((1 - summary.absent / summary.total) * 100)}%` : '—';
  return `<tr><td>נוכחות ${escapeHtml(category)}</td><td>${summary.total}</td><td>${summary.absent}</td><td>${summary.late}</td><td>${pct}</td></tr>`;
}).join('') + unclassified.map(subject =>
  `<tr><td>נוכחות — ${escapeHtml(subject.subject || 'מקצוע לא מסווג')}</td><td>${subject.total || 0}</td><td>${subject.absent || 0}</td><td>${subject.late || 0}</td><td>${subject.total ? `${Math.round((1 - subject.absent / subject.total) * 100)}%` : '—'}</td></tr>`
).join('');
printWindow.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>גיליון ציונים - ${escapeHtml(student.name)}</title><style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#18302b;background:#fff}
.sheet{max-width:900px;margin:28px auto;padding:34px;border:1px solid #dce8e2;border-radius:16px}
.brand{display:flex;align-items:center;gap:22px;border-bottom:3px solid #c5a45d;padding-bottom:20px}
.brand img{width:112px;height:82px;object-fit:contain}.brand-name{color:#536b60;font-size:14px;font-weight:700}
h1{font-size:28px;color:#174e3c;margin:8px 0}.subtitle{color:#7b6842;margin:0;font-size:14px}
.student-info{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}
.info{padding:10px 12px;background:#f3f7f4;border-radius:8px}.info span{display:block;color:#718079;font-size:11px;margin-bottom:5px}.info strong{font-size:14px}
.barcode-info img{width:150px;height:40px;object-fit:contain}.exam-barcode{width:125px;height:32px;object-fit:contain}
h2{font-size:17px;color:#174e3c;margin:24px 0 9px;border-right:4px solid #c5a45d;padding-right:9px}
table{width:100%;border-collapse:collapse;margin-bottom:15px;font-size:13px}
th,td{border:1px solid #d8e1dc;padding:9px 10px;text-align:right}
th{background:#174e3c;color:white;font-weight:700}tbody tr:nth-child(even){background:#f5f8f6}
.footer{margin-top:24px;padding-top:10px;border-top:1px solid #d8e1dc;color:#76837d;font-size:11px}
@media print{.sheet{max-width:none;margin:0;padding:0;border:0;border-radius:0}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
@media(max-width:600px){.sheet{margin:10px;padding:18px}.student-info{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="sheet">
<header class="brand"><img src="/logo.png" alt="לוגו הסמינר"><div><div class="brand-name">סמינר גור</div><h1>גיליון ציונים ונוכחות</h1><p class="subtitle">דוח אישי לתלמידה · נכון לתאריך ${escapeHtml(asOfDate)}</p></div></header>
<section class="student-info">
<div class="info"><span>שם התלמידה</span><strong>${escapeHtml(student.name)}</strong></div>
<div class="info"><span>תעודת זהות</span><strong>${escapeHtml(student.id_number)}</strong></div>
<div class="info"><span>מסלול</span><strong>${escapeHtml(student.track || '—')}</strong></div>
<div class="info"><span>שנת התלמידה</span><strong>${escapeHtml(this.gradeSheetYearLabel() === 'לא הוגדרה' ? '—' : this.gradeSheetYearLabel())}</strong></div>
<div class="info"><span>מחצית</span><strong>${escapeHtml(semester)}</strong></div>
<div class="info barcode-info"><span>ברקוד כללי</span><img class="barcode-image" src="${studentBarcodeUrl}" alt="ברקוד כללי ${escapeHtml(student.id_number)}"></div>
</section>
<h2>ציוני קודש</h2><table><thead><tr><th>מקצוע</th><th>מבחן</th><th>ברקוד</th><th>תאריך</th><th>ציון</th></tr></thead><tbody>${gradeRows('קודש') || '<tr><td colspan="5">אין ציונים</td></tr>'}</tbody></table>
<h2>ציוני מסלול</h2><table><thead><tr><th>מקצוע</th><th>מבחן</th><th>ברקוד</th><th>תאריך</th><th>ציון</th></tr></thead><tbody>${gradeRows('מסלול') || '<tr><td colspan="5">אין ציונים</td></tr>'}</tbody></table>
<h2>נוכחות קודש, מסלול ותפילה</h2><table><thead><tr><th>תחום</th><th>שיעורים</th><th>היעדרויות</th><th>איחורים</th><th>אחוז נוכחות</th></tr></thead><tbody>${attendanceRows}</tbody></table>
<footer class="footer">סמינר גור</footer>
</main><script>window.onload=async()=>{try{await Promise.all([...document.querySelectorAll('.barcode-image')].map(img=>img.decode()));window.print()}catch{alert('לא ניתן לטעון את הברקודים. בדקי את החיבור ונסי שוב.')}}</script></body></html>`);
printWindow.document.close();
}

studentExamAvg(): string {
const graded = this.exams().filter(e => e.grade != null);
if (!graded.length) return '';
return (graded.reduce((sum, e) => sum + e.grade, 0) / graded.length).toFixed(1);
}

examAvgNum(): number | null {
const graded = this.exams().filter(e => e.grade != null);
if (!graded.length) return null;
return graded.reduce((sum: number, e: any) => sum + Number(e.grade), 0) / graded.length;
}

examGradesForCard(): { name: string; grade: number }[] {
return this.exams()
  .filter(e => e.grade != null)
  .slice(-12)
  .map(e => ({ name: e.exam_name, grade: Number(e.grade) }));
}

loadRequirements(id_number: string) {
this.api.getStudentRequirements(id_number).subscribe({
next: r => this.requirements.set(r),
error: () => this.requirements.set(null)
});
}

missingRequired() {
return (this.requirements()?.requirements || []).filter(r => r.required && !r.completed_at).length;
}

toggleRequirement(req: StudentRequirement, completed: boolean) {
const current = this.student();
if (!current || this.savingRequirementId() !== null) return;
this.savingRequirementId.set(req.id);
this.requirementError.set('');
this.api.setStudentRequirement(current.id_number, req.id, completed).subscribe({
next: () => {
this.savingRequirementId.set(null);
this.loadRequirements(current.id_number);
},
error: error => {
this.savingRequirementId.set(null);
this.requirementError.set(error.error?.error || 'לא ניתן לשמור את הסימון');
this.loadRequirements(current.id_number);
}
});
}

fileUrl(req: StudentRequirement) {
return this.api.requirementFileUrl(this.student()!.id_number, req.id) + '?v=' + encodeURIComponent(req.completed_at || '');
}

uploadFile(req: StudentRequirement, event: Event) {
const input = event.target as HTMLInputElement;
const file = input.files?.[0];
const current = this.student();
input.value = '';
if (!file || !current) return;
this.savingRequirementId.set(req.id);
this.requirementError.set('');
this.api.uploadRequirementFile(current.id_number, req.id, file).subscribe({
next: () => {
this.savingRequirementId.set(null);
this.loadRequirements(current.id_number);
},
error: error => {
this.savingRequirementId.set(null);
this.requirementError.set(error.error?.error || 'לא ניתן להעלות את הקובץ');
}
});
}

printFile(req: StudentRequirement) {
const frame = document.createElement('iframe');
frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
frame.src = this.fileUrl(req);
frame.onload = () => {
frame.contentWindow?.focus();
frame.contentWindow?.print();
setTimeout(() => frame.remove(), 60000);
};
document.body.appendChild(frame);
}

startEditing() {
const current = this.student();
if (!current) return;
this.studentDraft = {
name: current.name,
phone: current.phone || '',
address: current.address || '',
birth_date: current.birth_date || '',
birth_date_hebrew: this.formatHebrewBirthDate(current.birth_date_hebrew),
phone_code: this.phoneCodeValue(),
track: current.track || '',
year: current.year || '',
parallel: current.parallel || '',
marital_status: current.marital_status || '',
married_name:   current.married_name   || '',
personal_phone: current.personal_phone || '',
wedding_date:   current.wedding_date   || '',
wedding_venue:  current.wedding_venue  || ''
};
this.editingExtraFields = this.extraFields().map((field) => ({ ...field }));
this.newExtraField = { key: '', value: '' };
this.editError.set('');
this.editing.set(true);
}

addEditingExtraField() {
const key = String(this.newExtraField.key || '').trim();
const value = String(this.newExtraField.value || '').trim();
if (!key || !value) return;
if (isHiddenStudentField(key)) {
this.editError.set('לא ניתן להוסיף פרט מסוג זה.');
return;
}
const exists = this.editingExtraFields.some((field) => field.key.trim() === key);
if (exists) {
this.editError.set('כבר קיים פרט בשם הזה. אפשר לערוך אותו ברשימה.');
return;
}
this.editError.set('');
this.editingExtraFields = [...this.editingExtraFields, { key, value }];
this.newExtraField = { key: '', value: '' };
}

removeEditingExtraField(index: number) {
this.editingExtraFields = this.editingExtraFields.filter((_, i) => i !== index);
}

buildExtraDataForSave() {
const data: Record<string, string> = {};
const currentExtraData = this.student()?.extra_data || {};
for (const [rawKey, rawValue] of Object.entries(currentExtraData)) {
const key = String(rawKey || '').trim();
const value = String(rawValue || '').trim();
if (key && value && !this.isEditableExtraFieldKey(key)) data[key] = value;
}
for (const field of this.editingExtraFields) {
const key = String(field.key || '').trim();
const value = String(field.value || '').trim();
if (!key || !value) continue;
data[key] = value;
}
const ext = String(this.phoneExtensionValue() || '').trim();
if (ext && !Object.keys(data).some((key) => this.isPhoneExtensionKey(key))) {
data['שלוחה'] = ext;
}
return data;
}

saveStudent() {
const current = this.student();
if (!current || this.saving()) return;
if (this.editingExtraFields.some(field => isHiddenStudentField(field.key))) {
this.editError.set('לא ניתן לשמור פרט מסוג זה.');
return;
}
this.saving.set(true);
this.editError.set('');
const payload = {
...this.studentDraft,
extra_data: this.buildExtraDataForSave()
};
this.api.updateStudent(current.id_number, payload).subscribe({next: () => {
this.editing.set(false);
this.saving.set(false);
this.loadStudent(current.id_number);
},
error: error => {
this.editError.set(error.error?.error || 'לא ניתן לשמור את פרטי התלמידה');
this.saving.set(false);
}
});
}

deleteStudent() {
const current = this.student();
if (!current || this.deleting()) return;
const ok = confirm(`למחוק את התלמידה ${current.name}? פעולה זו בלתי הפיכה.`);
if (!ok) return;

this.deleting.set(true);
this.editError.set('');
this.api.deleteStudent(current.id_number).subscribe({
next: () => {
this.deleting.set(false);
this.router.navigate(['/students']);
},
error: error => {
this.deleting.set(false);
this.editError.set(error.error?.error || 'לא ניתן למחוק את התלמידה');
}
});
}

activeLoans() {
return (this.student()?.loans || []).filter(l => !l.actual_return);
}

isOverdue(l: any) {
return !l.actual_return && l.expected_return < this.today;
}

safeAddress() {
const raw = String(this.student()?.address || '').trim();
if (!raw) return '';
// Numeric-only address is a known bad import artifact, so hide it from UI.
if (/^\d+$/.test(raw)) return '';
return raw;
}

extraFields() {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return [];
return Object.entries(data)
.map(([key, value]) => ({ key: String(key), value: String(value ?? '').trim() }))
.filter((field) => field.key && field.value)
.filter((field) => this.isEditableExtraFieldKey(field.key));
}

displayExtraFields() {
return this.extraFields().filter(field => !this.isEmailKey(field.key) && !this.isGovCodeKey(field.key)
  && !this.isEducationUserCodeKey(field.key));
}

isEditableExtraFieldKey(key: string) {
return !this.isPhoneCodeKey(key) && !this.isPhoneExtensionKey(key)
  && !this.isUsernameKey(key) && !this.isPasswordKey(key)
  && !this.isNameKey(key) && !this.isHiddenExtraField(key);
}

isHiddenExtraField(key: string) {
const normalized = this.normalizeFieldKey(key);
return isHiddenStudentField(key)
|| normalized.includes('מקבילה')
|| normalized.includes('מספר')
|| normalized.includes('אופציהב')
|| normalized.includes('אבאחוץ')
|| normalized.includes('אמהחוץ')
|| normalized.includes('אמאחוץ')
|| normalized.includes('ארץלידה')
|| normalized.includes('מסרישום')
|| normalized.includes('אחרמותרשום')
|| normalized.includes('אחרמות')
|| normalized.includes('א תשלום')
|| normalized.includes('payment')
|| normalized.includes('parallel');
}

hasPublicPhoneBlock() {
return Boolean(this.phoneCodeValue() || this.phoneExtensionValue());
}

hasCredentialsBlock() {
return Boolean(this.usernameValue() || this.otherPasswordFields().length);
}

phoneCodeValue() {
const direct = String(this.student()?.phone_code || '').trim();
if (direct) return direct;
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';
const found = Object.entries(data).find(([key, value]) => this.isPhoneCodeKey(key) && String(value || '').trim());
return found ? String(found[1] || '').trim() : '';
}

phoneExtensionValue() {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';
const found = Object.entries(data).find(([key, value]) => this.isPhoneExtensionKey(key) && String(value || '').trim());
return found ? String(found[1] || '').trim() : '';
}

normalizeFieldKey(key: string) {
return String(key || '').toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

isPhoneCodeKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('קודלטלפון') || normalized.includes('קודטלפון') || normalized.includes('קידומת') || normalized.includes('phonecode');
}

isPhoneExtensionKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('שלוחה') || normalized.includes('שלוחת') || normalized.includes('הארכה') || normalized.includes('extension') || normalized.endsWith('ext');
}

usernameValue() {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';
const found = Object.entries(data).find(([key, value]) => this.isUsernameKey(key) && String(value || '').trim());
return found ? String(found[1] || '').trim() : '';
}

private passwordFields(): { key: string; value: string }[] {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return [];
return Object.entries(data)
  .filter(([key, value]) => !isHiddenStudentField(key) && this.isPasswordKey(key) && String(value ?? '').trim())
  .map(([key, value]) => ({ key, value: String(value).trim() }));
}

officialCredentialFields(): { key: string; value: string }[] {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return [];
return Object.entries(data)
  .filter(([key, value]) => !isHiddenStudentField(key) && ((this.isPasswordKey(key) && this.isOfficialPasswordKey(key))
    || this.isGovCodeKey(key) || this.isEducationUserCodeKey(key))
    && String(value ?? '').trim())
  .map(([key, value]) => ({ key, value: String(value).trim() }))
  .sort((a, b) => this.officialCredentialOrder(a.key) - this.officialCredentialOrder(b.key));
}

officialCredentialOrder(key: string) {
if (this.isGovCodeKey(key) || /גוב|gov/.test(this.normalizeFieldKey(key))) return 0;
if (this.isEducationUserCodeKey(key)) return 1;
return 2;
}

otherPasswordFields(): { key: string; value: string }[] {
return this.passwordFields().filter(field => !this.isOfficialPasswordKey(field.key));
}

isOfficialPasswordKey(key: string) {
return /גוב|gov|משרדהחינוך/.test(this.normalizeFieldKey(key));
}

isGovCodeKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'קודלגוב' || normalized === 'קודגוב'
  || normalized === 'govcode' || normalized === 'codeforgov';
}

isEducationUserCodeKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'קודמשתמשלמשרדהחינוך' || normalized === 'קודמשתמשלמשרהחינוך';
}

emailFields(): { key: string; value: string }[] {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return [];
return Object.entries(data)
  .filter(([key, value]) => this.isEmailKey(key) && String(value ?? '').trim())
  .map(([key, value]) => ({ key, value: String(value).trim() }));
}

isEmailKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'מייל' || normalized === 'מיילים' || normalized === 'אימייל' || normalized === 'דואל'
  || normalized === 'email' || normalized === 'mail' || normalized === 'emailaddress';
}

isUsernameKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('שםמשתמש') || normalized.includes('user') || normalized.includes('username') || normalized.includes('login');
}

isPasswordKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('סיסמ') || normalized.includes('ססמ') || normalized.includes('password') || normalized.includes('passwd') || normalized === 'pass';
}

isNameKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'שם' || normalized === 'שםמלא' || normalized === 'שםפרטי' || normalized === 'שםמשפחה';
}

classDisplayValue() {
  // Use class_name from server (year + parallel combined), fallback to manual calculation
  const cn = String((this.student() as any)?.class_name || '').trim();
  if (cn) return cn;

  const year = String(this.student()?.year || '').trim();
  const parallel = String(this.student()?.parallel || '').trim();
  if (year && parallel) return `${year}${parallel}`;
  if (year) return year;
  return '';
}

parallelValue() {
const direct = this.extraValueByKey((key) => this.isParallelKey(key));
if (direct) return direct;

const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';

const entries = Object.entries(data)
.map(([key, value]) => ({ key: String(key || '').trim(), value: String(value || '').trim() }))
.filter((entry) => entry.key && entry.value);

// Some imported sheets use numeric technical keys (e.g. "230") for the parallel column.
const numericKeyCandidate = entries.find((entry) => /^\d{2,4}$/.test(entry.key) && /^\d{1,2}$/.test(entry.value));
if (numericKeyCandidate) return numericKeyCandidate.value;

const numericValueInGenericKey = entries.find((entry) => {
const normalizedKey = this.normalizeFieldKey(entry.key);
return /^\d{1,2}$/.test(entry.value) && (normalizedKey.includes('עמודה') || normalizedKey.includes('column'));
});
if (numericValueInGenericKey) return numericValueInGenericKey.value;

return '';
}

extraValueByKey(matcher: (key: string) => boolean) {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';
const found = Object.entries(data).find(([key, value]) => matcher(key) && String(value || '').trim());
return found ? String(found[1] || '').trim() : '';
}

isClassKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'כיתה' || normalized === 'class' || normalized === 'year';
}

isParallelKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('מקביל') || normalized.includes('parallel') || normalized.includes('קבוצה');
}
}

import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, StudentRequirement, StudentRequirements } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Student } from '../../models';
import { StudentProfileCardComponent } from '../../components/student-profile-card/student-profile-card';

@Component({
selector: 'app-student',
imports: [CommonModule, FormsModule, RouterLink, StudentProfileCardComponent],
template: `
<div *ngIf="student()">
<div class="page-header">
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

<!-- Profile Card -->
<app-student-profile-card
  [name]="student()!.name"
  [idNumber]="student()!.id_number"
  [track]="student()!.track || ''"
  [year]="student()!.year || ''"
  [phone]="student()!.phone || ''"
  [totalReqs]="(requirements()?.requirements || []).length"
  [completedReqs]="(requirements()?.requirements || []).filter(r => !!r.completed_at).length"
  [missingRequired]="missingRequired()"
  [totalLoans]="student()!.loans?.length || 0"
  [activeLoans]="(student()!.loans || []).filter(l => !l.actual_return).length"
  [examAvg]="examAvgNum()"
  [examGrades]="examGradesForCard()">
</app-student-profile-card>

<div class="detail-grid">
<div class="card">
<div class="student-card-header">
<div class="section-title"> פרטים אישיים</div>
<div class="student-actions" *ngIf="!editing()">
<button class="btn btn-secondary" (click)="startEditing()"> עריכת פרטים</button>
<button class="btn btn-danger" [disabled]="deleting()" (click)="deleteStudent()">
{{ deleting() ? 'מוחקת...' : ' מחיקת תלמידה' }}
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
</div>

<div class="extra-fields" *ngIf="hasPublicPhoneBlock() || extraFields().length">
<h3>פרטים נוספים </h3>
<div class="extra-fields-grid" *ngIf="hasPublicPhoneBlock() || hasCredentialsBlock()">
<div class="info-row extra highlight-import">
<span class="info-label">טלפון ציבורי</span>
<span class="info-value" *ngIf="phoneCodeValue()">קוד: {{ phoneCodeValue() }}</span>
<span class="info-value" *ngIf="phoneExtensionValue()">שלוחה: {{ phoneExtensionValue() }}</span>
</div>
<div class="info-row extra highlight-import" *ngIf="hasCredentialsBlock()">
<span class="info-label">פרטי התחברות</span>
<span class="info-value" *ngIf="usernameValue()">שם משתמש: {{ usernameValue() }}</span>
<span class="info-value" *ngIf="passwordValue()">סיסמה: {{ passwordValue() }}</span>
</div>
</div>
<div class="extra-fields-grid">
<div class="info-row extra" *ngFor="let field of extraFields()">
<span class="info-label">{{ field.key }}</span>
<span class="info-value">{{ field.value }}</span>
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
<a *ngIf="auth.user()?.role !== 'secretary'" routerLink="/admin" class="req-link">להגדרת המסלול</a>
</p>
<p *ngIf="reqs.defined && !reqs.requirements.length" class="req-note">
למסלול הזה עדיין אין דרישות.
<a *ngIf="auth.user()?.role !== 'secretary'" routerLink="/admin" class="req-link">להוספת דרישות</a>
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
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
@media (max-width: 1050px) {
.quick-stats { grid-template-columns: 1fr; }
.info-grid { grid-template-columns: 1fr; }
.extra-fields-grid { grid-template-columns: 1fr; }
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
studentDraft = { name: '', phone: '', phone_code: '', track: '', year: '', parallel: '' };
editingExtraFields: { key: string; value: string }[] = [];
newExtraField = { key: '', value: '' };
today = new Date().toISOString().split('T')[0];
requirements = signal<StudentRequirements | null>(null);
requirementError = signal('');
savingRequirementId = signal<number | null>(null);
exams = signal<any[]>([]);
attendance = signal<any>(null);

constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService, private location: Location, private router: Router) {}

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
this.api.getStudent(id).subscribe({
next: s => { this.student.set(s); this.loading.set(false); this.loadRequirements(s.id_number); this.loadExams(s.id_number); this.loadAttendance(s.id_number); },
error: () => this.loading.set(false)
});
}

loadExams(id_number: string) {
this.api.getStudentExams(id_number).subscribe({
next: rows => this.exams.set(rows),
error: () => this.exams.set([])
});
}

loadAttendance(id_number: string) {
this.api.getStudentAttendance(id_number).subscribe({
next: att => this.attendance.set(att),
error: () => this.attendance.set(null)
});
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
phone_code: current.phone_code || '',
track: current.track || '',
year: current.year || '',
parallel: current.parallel || ''
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
.filter((field) => !this.isPhoneCodeKey(field.key) && !this.isPhoneExtensionKey(field.key))
.filter((field) => !this.isUsernameKey(field.key) && !this.isPasswordKey(field.key))
.filter((field) => !this.isNameKey(field.key))
.filter((field) => !this.isHiddenExtraField(field.key));
}

isHiddenExtraField(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('מקבילה')
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
return Boolean(this.usernameValue() || this.passwordValue());
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

passwordValue() {
const data = this.student()?.extra_data;
if (!data || typeof data !== 'object') return '';
const found = Object.entries(data).find(([key, value]) => this.isPasswordKey(key) && String(value || '').trim());
return found ? String(found[1] || '').trim() : '';
}

isUsernameKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('שםמשתמש') || normalized.includes('user') || normalized.includes('username') || normalized.includes('login');
}

isPasswordKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized.includes('סיסמ') || normalized.includes('ססמ') || normalized.includes('password') || normalized === 'pass';
}

isNameKey(key: string) {
const normalized = this.normalizeFieldKey(key);
return normalized === 'שם' || normalized === 'שםמלא' || normalized === 'שםפרטי' || normalized === 'שםמשפחה';
}

classDisplayValue() {
const baseClass = String(this.student()?.year || '').trim() || this.extraValueByKey((key) => this.isClassKey(key));
if (!baseClass) return '';

const normalizedClass = this.normalizeFieldKey(baseClass);
if (normalizedClass.includes('התמח')) {
return 'התמחות';
}

// Prefer the new dedicated 'parallel' field, then fall back to extra_data
const parallel = String(this.student()?.parallel || '').trim() || this.parallelValue();
if (!parallel) return baseClass;

const numericParallel = Number(String(parallel).trim());
if (Number.isFinite(numericParallel)) {
return `${baseClass}${numericParallel + 1}`;
}

return `${baseClass}${parallel}`;
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

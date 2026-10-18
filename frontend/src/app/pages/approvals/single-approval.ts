import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Student } from '../../models';
import { formatHebrewDate } from './hebrew-date';

@Component({
  selector: 'app-single-approval',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ approvalType?.name || 'אישור רווקה' }}</h1>
        <p class="subtitle">הפקת אישור מעמד אישי לתלמידה</p>
      </div>
    </div>

    <div class="single-grid">
      <div class="card">
        <div class="section-title">🪪 בחירה מתלמידות קיימות</div>
        <div class="student-search-box">
          <input [(ngModel)]="studentQuery" (input)="searchStudents()" placeholder="חיפוש לפי שם או ת.ז...">
        </div>

        <div *ngIf="studentSuggestions.length" class="student-suggestions">
          <button type="button" *ngFor="let student of studentSuggestions" class="student-suggestion" (click)="selectStudent(student)">
            <span class="student-name">{{ student.name }}</span>
            <span class="student-meta">{{ student.id_number }} · {{ student.track || 'ללא מסלול' }}{{ student.year ? ' ' + student.year : '' }}</span>
          </button>
        </div>

        <div *ngIf="selectedStudent" class="selected-student-box">
          <strong>{{ selectedStudent.name }}</strong>
          <span>{{ selectedStudent.id_number }}</span>
          <small>{{ selectedStudent.track || 'ללא מסלול' }}{{ selectedStudent.year ? ' • ' + selectedStudent.year : '' }}</small>
        </div>

        <div class="section-title" style="margin-top:20px;">✏️ פרטי התלמידה</div>
        <div class="form-group"><label>שם מלא</label><input [(ngModel)]="name" placeholder="שם התלמידה"></div>
        <div class="form-group"><label>מספר תעודת זהות</label><input [(ngModel)]="idNumber" placeholder="000000000"></div>
        <div class="form-group"><label>תאריך לידה</label><input [(ngModel)]="birthDate" placeholder="01/01/2000"></div>
        <div class="form-group"><label>כתובת מגורים</label><input [(ngModel)]="address" placeholder="רחוב, עיר"></div>
        <div class="form-group"><label>שנת לימודים</label><input [(ngModel)]="academicYear" placeholder='תשפ"ז'></div>
        <div class="form-group"><label>מסלול לימודים</label><input [(ngModel)]="track" placeholder="גרפיקה / בימוי / ..."></div>
        <div class="form-group">
          <label>נוסח האישור — ניתן לעריכה לפני ההדפסה</label>
          <textarea [(ngModel)]="approvalText" rows="9"></textarea>
          <small class="template-hint">המשתנים שבנוסח יוחלפו אוטומטית בפרטים שמולאו.</small>
        </div>
        <label class="background-option">
          <input type="checkbox" [(ngModel)]="useBlankBackground">
          הדפסה על נייר המכתבים (blank)
        </label>
      </div>

      <div class="card">
        <div class="section-title">👁 תצוגה מקדימה</div>
        <div class="doc-preview">
          <div class="doc-watermark"></div>
          <div class="doc-top">
            <div class="doc-top-left">
              <div class="doc-bsd">בס"ד</div>
              <div class="doc-date">{{ todayStr }}</div>
            </div>
            <img src="/logo.png" class="doc-logo">
          </div>
          <div class="doc-title">{{ approvalType?.name || 'אישור רווקה' }}</div>
          <div class="doc-body" [innerHTML]="previewHtml()"></div>
          <div class="doc-footer">
            <div class="doc-sig-block">
              <img [src]="approvalType?.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png'" class="doc-sig-img">
              <div class="doc-sig-name">{{ approvalType?.signature === 'principal' ? 'המנהלת' : 'המזכירות' }}</div>
            </div>
            <img src="/logo.png" class="doc-footer-logo">
          </div>
        </div>

        <button class="btn btn-primary" style="width:100%; margin-top:16px; padding:14px;"
          [disabled]="!name || !idNumber"
          (click)="print()">
          🖨️ הדפס {{ approvalType?.name || 'אישור' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .single-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 700px) { .single-grid { grid-template-columns: 1fr; } }
    .student-search-box { margin-bottom: 12px; }
    .student-search-box input {
      width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface-2); padding: 10px 12px; font-size: 0.95rem;
    }
    .form-group textarea {
      width: 100%; min-height: 150px; border: 1px solid var(--border);
      border-radius: var(--radius-sm); background: var(--surface-2);
      padding: 10px 12px; font: inherit; line-height: 1.7; resize: vertical;
    }
    .template-hint { display: block; margin-top: 5px; color: var(--text-muted); line-height: 1.5; }
    .background-option { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.85rem; }
    .student-suggestions {
      display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; max-height: 220px; overflow-y: auto;
    }
    .student-suggestion {
      text-align: right; border: 1px solid var(--border); background: white; border-radius: var(--radius-sm);
      padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px;
    }
    .student-suggestion:hover { border-color: var(--primary); background: var(--primary-light); }
    .student-name { font-weight: 700; }
    .student-meta { font-size: 0.76rem; color: var(--text-muted); }
    .selected-student-box {
      display: flex; flex-direction: column; gap: 3px; border: 1px solid var(--border);
      background: linear-gradient(145deg, #f7f7ff, #f0f4ff); border-radius: var(--radius-sm);
      padding: 10px 12px; margin-bottom: 14px;
    }
    .selected-student-box strong { font-size: 0.95rem; }
    .selected-student-box span, .selected-student-box small { color: var(--text-muted); }
    .doc-preview {
      position: relative; background: white; border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 18px 20px 14px 20px;
      overflow: hidden; min-height: 380px; display: flex; flex-direction: column;
      box-shadow: var(--shadow-sm);
    }
    .doc-watermark {
      position: absolute; left: 0; top: 0; bottom: 0; width: 14px;
      background: linear-gradient(180deg, #f0ece8 0%, #d4c8bc 30%, #b8a898 60%, #d4c8bc 80%, #f0ece8 100%);
      opacity: 0.7;
    }
    .doc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .doc-top-left { display: flex; flex-direction: column; gap: 2px; }
    .doc-bsd { font-size: 0.72rem; font-weight: 700; color: #333; }
    .doc-date { font-size: 0.7rem; color: #555; }
    .doc-logo { height: 48px; width: auto; }
    .doc-title { font-size: 1.2rem; font-weight: 900; text-align: center; margin-bottom: 12px; color: #1a1a1a; }
    .doc-body { font-size: 0.88rem; line-height: 1.65; text-align: right; color: #1a1a1a; flex: 1; }
    .doc-body p { margin: 0; }
    .doc-body p.ap-spacer { height: 2mm; font-size: 0; line-height: 0; }
    .doc-footer { margin-top: 14px; display: flex; justify-content: flex-start; align-items: flex-end; gap: 12px; }
    .doc-sig-block { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .doc-sig-img { height: 40px; width: auto; }
    .doc-sig-name { font-size: 0.68rem; color: #555; }
    .doc-footer-logo { height: 28px; width: auto; opacity: 0.6; margin-right: auto; }
  `]
})
export class SingleApprovalComponent implements OnInit {
  approvalType: any = null;
  name = '';
  idNumber = '';
  birthDate = '';
  address = '';
  academicYear = 'תשפ"ז';
  track = '';
  approvalText = '';
  todayStr = new Date().toLocaleDateString('he-IL');
  studentQuery = '';
  studentSuggestions: Student[] = [];
  selectedStudent: Student | null = null;
  useBlankBackground = true;

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    combineLatest([
      this.api.getApprovalTypes(),
      this.route.queryParams
    ]).subscribe(([types, p]) => {
      const id = p['type'] ? +p['type'] : null;
      const singleTypes = types.filter((t: any) => t.type === 'single');
      const approvalType = id ? types.find((t: any) => t.id === id) : singleTypes[0];
      if (approvalType?.id !== this.approvalType?.id) {
        this.approvalText = approvalType?.template || '';
      }
      this.approvalType = approvalType;

      const studentRef = p['studentId'] || p['id_number'] || p['student'];
      if (!studentRef) return;
      this.loadStudent(studentRef);
    });
  }

  searchStudents() {
    const q = this.studentQuery.trim();
    if (!q) {
      this.studentSuggestions = [];
      return;
    }
    this.api.getStudents(q).subscribe((students) => {
      this.studentSuggestions = students.slice(0, 8);
    });
  }

  loadStudent(studentRef: string) {
    this.api.getStudent(studentRef).subscribe({
      next: (student) => this.selectStudent(student),
      error: () => {
        this.api.getStudents(studentRef).subscribe((students) => {
          if (students.length) this.selectStudent(students[0]);
        });
      }
    });
  }

  selectStudent(student: Student) {
    this.selectedStudent = student;
    this.studentQuery = student.name;
    this.studentSuggestions = [];
    this.name = student.name;
    this.idNumber = student.id_number;
    this.track = student.track || '';
    this.academicYear = student.year || this.academicYear;
    this.birthDate = student.birth_date || this.birthDate || '';
    this.address = student.address || this.address || '';
  }

  fillTemplate(template: string): string {
    return template
      .replace(/{{שם}}/g, this.name || 'שם התלמידה')
      .replace(/{{תז}}/g, this.idNumber || '000000000')
      .replace(/{{שנה}}/g, this.academicYear)
      .replace(/{{מסלול}}/g, this.track || '___')
      .replace(/{{תאריך לידה}}/g, this.birthDate || '___')
      .replace(/{{כתובת}}/g, this.address || '___');
  }

  previewHtml(): string {
    if (!this.approvalType) return '';
    return this.fillTemplate(this.approvalText)
      .split('\n')
      .map((line: string) => line.trim()
        ? `<p>${this.escapeHtml(line.trim())}</p>`
        : '<p class="ap-spacer"></p>')
      .join('');
  }

  print() {
    if (!this.approvalType) return;

    const today = new Date();
    const dateHe = today.toLocaleDateString('he-IL');
    const hebrewDate = formatHebrewDate(today);

    const sig = this.approvalType.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png';
    const sigName = this.approvalType.signature === 'principal' ? 'המנהלת' : 'המזכירות';
    const assetUrl = (path: string) => new URL(path, window.location.origin).href;
    const bodyHtml = this.fillTemplate(this.approvalText)
      .split('\n')
      .map((line: string) => line.trim()
        ? `<p>${this.escapeHtml(line.trim())}</p>`
        : '<p class="ap-spacer"></p>')
      .join('');
    const documentTitle = `${this.approvalType.name} - ${this.name}`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      return;
    }
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>${this.escapeHtml(documentTitle)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Heebo', Arial, sans-serif; background: white; direction: rtl; }
        html, body { width: 148mm; height: 210mm; margin: 0; }
        .approval-page {
          width: 148mm; height: 210mm; padding: 10mm 12mm;
          display: flex; flex-direction: column; position: relative; overflow: hidden;
          break-inside: avoid; page-break-inside: avoid; isolation: isolate;
        }
        .ap-background { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: fill; }
        .ap-content { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .ap-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; }
        .ap-top-left { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .ap-bsd { font-size: 0.8rem; color: #333; font-weight: 700; }
        .ap-date { font-size: 0.78rem; color: #444; }
        .ap-date-he { direction: rtl; unicode-bidi: isolate; text-align: right; font-size: 0.75rem; color: #555; }
        .ap-title { font-size: 1.45rem; font-weight: 900; text-align: center; margin-bottom: 5mm; color: #1a1a1a; }
        .ap-body { font-size: 0.92rem; line-height: 1.65; text-align: right; color: #1a1a1a; flex: 1; padding-right: 3mm; }
        .ap-body p { margin: 0; }
        .ap-body p.ap-spacer { height: 2mm; font-size: 0; line-height: 0; }
        .ap-footer { margin-top: 7mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }
        .ap-sig { display: flex; flex-direction: column; align-items: center; }
        .ap-sig-img { height: 46px; width: auto; }
        .ap-sig-name { font-size: 0.68rem; color: #555; margin-top: 3px; }
        @media print {
          @page { size: A5 portrait; margin: 0; }
          html, body { width: 148mm; height: 210mm; margin: 0; }
          .approval-page { width: 148mm; height: 210mm; margin: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style></head><body>
      <div class="approval-page">
        ${this.useBlankBackground ? `<img src="${assetUrl('/blank-background.png')}" class="ap-background" alt="">` : ''}
        <div class="ap-content">
        <div class="ap-top">
          <div class="ap-top-left">
            <div class="ap-bsd">בס"ד</div>
            <div class="ap-date">${dateHe}</div>
            <div class="ap-date-he">${hebrewDate || ''}</div>
          </div>
        </div>
        <div class="ap-title">${this.escapeHtml(this.approvalType.name)}</div>
        <div class="ap-body">${bodyHtml}</div>
        <div class="ap-footer">
          <div class="ap-sig">
            <img src="${assetUrl(sig)}" class="ap-sig-img">
            <div class="ap-sig-name">${sigName}</div>
          </div>
        </div>
        </div>
      </div>
    </body></html>`);
    win.document.close();
    Promise.all(Array.from(win.document.images).map(image => image.decode()))
      .then(() => win.print())
      .catch(error => {
        console.error('Could not load approval print images', error);
        win.alert('לא ניתן לטעון את תמונת הרקע או החתימה. בדקי שהקבצים קיימים בתיקיית public והדפיסי שוב.');
      });
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]!);
  }
}

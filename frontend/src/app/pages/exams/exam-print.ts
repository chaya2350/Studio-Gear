import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';


@Component({
  selector: 'app-exam-print',
  imports: [CommonModule],
  template: `
<div *ngIf="loading()" class="loading-center">טוענת...</div>

<div *ngIf="!loading() && exam()">
  <div class="page-header">
    <div>
      <a class="back-link" (click)="router.navigate(['/exams'])" style="cursor:pointer;">← חזרה למבחנים</a>
      <h1>הדפסת מבחן לכיתה</h1>
      <p class="subtitle">{{ exam()?.name }}</p>
    </div>
  </div>

  <!-- רשימת הנבחנות קבועה לפי השיוך שנבחר בעת יצירת המבחן -->
  <div class="card" style="margin-bottom:16px;">
    <div class="section-title">הדפסה מיועדת לתלמידות הבאות ({{ exam()?.students?.length || 0 }})</div>
    <p class="hint">הרשימה נקבעה בעת יצירת המבחן ולא ניתנת לשינוי כאן.</p>
    <div class="assigned-students" *ngIf="exam()?.students?.length; else noAssignedStudents">
      <span class="assigned-student" *ngFor="let s of exam()?.students">{{ s.name }}</span>
    </div>
    <ng-template #noAssignedStudents><p class="hint">עדיין לא שויכו תלמידות למבחן הזה.</p></ng-template>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
      <button class="btn btn-primary" [disabled]="printing() || !exam()?.students?.length" (click)="printExams()">
        🖨 הדפס מבחנים לכיתה (שאלון + ברקוד)
      </button>
      <button class="btn btn-secondary" [disabled]="printing() || !exam()?.students?.length" (click)="printBarcodesOnly()">
        🔗 הדפס דף ברקודים בלבד
      </button>
    </div>

    <p *ngIf="statusMsg()" class="hint" style="color:var(--primary); font-weight:600; margin-top:8px;">{{ statusMsg() }}</p>
    <p *ngIf="errorMsg()" class="hint" style="color:var(--danger); font-weight:600; margin-top:8px;">{{ errorMsg() }}</p>
  </div>

  <ng-container *ngIf="false">
  </ng-container>
</div>
`,
  styles: [`
    .loading-center { text-align:center; padding:60px; color:var(--text-muted); }
    .back-link { font-size:0.85rem; color:var(--primary); margin-bottom:4px; display:block; }
    .filter-mode-toggle { display:flex; gap:6px;
      button { flex:1; padding:8px 12px; border:1.5px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); font:inherit; font-size:0.83rem; font-weight:700; cursor:pointer;
        &.active { border-color:var(--primary); color:var(--primary); background:var(--primary-light); } } }
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .form-group { display:flex; flex-direction:column; gap:4px;
      label { font-size:0.78rem; font-weight:700; color:var(--text-muted); }
      select { height:38px; padding:0 12px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font:inherit; background:var(--surface); } }
    .hint { font-size:0.8rem; color:var(--text-muted); margin:4px 0 10px; line-height:1.6; }
    .search-row { display:flex; gap:8px; margin-bottom:10px;
      input { flex:1; height:38px; padding:0 12px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font:inherit; background:var(--surface); } }
    .assigned-students { display:flex; flex-wrap:wrap; gap:8px; }
    .assigned-student { padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface-2); font-size:0.85rem; font-weight:600; }
  `]
})
export class ExamPrintComponent implements OnInit {
  loading = signal(true);
  printing = signal(false);
  statusMsg = signal('');
  errorMsg = signal('');
  exam = signal<any | null>(null);
  template = signal<any | null>(null);

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    public router: Router
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getExam(id).subscribe({
      next: (exam) => {
        this.exam.set(exam);
        this.api.getExamTemplate(id).subscribe({
          next: (tmpl) => { this.template.set(tmpl); this.loading.set(false); },
          error: () => { this.template.set(null); this.loading.set(false); }
        });
      },
      error: () => this.loading.set(false)
    });
  }

  printExams() {
    this.errorMsg.set('');
    this.statusMsg.set('');
    const exam = this.exam()!;
    const students = exam.students || [];
    if (!students.length) {
      this.errorMsg.set('לא שויכו תלמידות למבחן הזה');
      return;
    }
    this.statusMsg.set(`מדפיסה מבחנים ל-${students.length} תלמידות...`);
    this.openPrintWindow(students, this.template(), exam, false);
  }

  printBarcodesOnly() {
    this.errorMsg.set('');
    this.statusMsg.set('');
    const exam = this.exam()!;
    const students = exam.students || [];
    if (!students.length) {
      this.errorMsg.set('לא שויכו תלמידות למבחן הזה');
      return;
    }
    this.statusMsg.set(`מדפיסה ברקודים ל-${students.length} תלמידות...`);
    this.openPrintWindow(students, null, exam, true);
  }

  private openPrintWindow(students: any[], template: any | null, exam: any, barcodesOnly: boolean) {
    const base = window.location.origin;
    const logoUrl = `${base}/logo.png`;

    const renderQuestion = (q: any, i: number, type: string): string => {
      if (type === 'multiple_choice') {
        const letters = ['א', 'ב', 'ג', 'ד'];
        const opts = (q.options as string[]).map((opt, j) =>
          `<div class="mc-opt"><span class="mc-letter">${letters[j]}</span> ${esc(opt)}</div>`
        ).join('');
        return `<div class="question">
          <p class="q-text"><strong>${i + 1}.</strong> ${esc(q.text)}</p>
          <div class="mc-opts">${opts}</div>
        </div>`;
      } else {
        const lines = Array(q.lines || 5).fill('<div class="answer-line"></div>').join('');
        return `<div class="question">
          <p class="q-text"><strong>${i + 1}.</strong> ${esc(q.text)}</p>
          <div class="answer-lines">${lines}</div>
        </div>`;
      }
    };

    const renderQuestionsHtml = (tmpl: any | null): string => {
      if (!tmpl) return '';
      let qs = tmpl.questions;
      if (typeof qs === 'string') { try { qs = JSON.parse(qs); } catch { qs = []; } }
      if (!Array.isArray(qs) || qs.length === 0) return '';
      return qs.map((q: any, i: number) => renderQuestion(q, i, tmpl.template_type)).join('');
    };

    const questionsHtml = barcodesOnly ? '' : renderQuestionsHtml(template);

    const pages = students.map(s => {
      const barcodeUrl = `${base}/api/exam-codes/${encodeURIComponent(s.code)}/barcode`;
      if (barcodesOnly) {
        return `<div class="barcode-page">
          <div class="bc-header">
            <img class="logo-small" src="${logoUrl}" onerror="this.style.display='none'">
            <div>
              <div class="bc-name">${esc(s.name)}</div>
              <div class="bc-exam">${esc(exam.name)}</div>
            </div>
          </div>
          <img class="bc-img" src="${barcodeUrl}">
          <div class="bc-code">${esc(s.code)}</div>
        </div>`;
      }
      return `<div class="exam-page">
        <div class="exam-header">
          <img class="logo" src="${logoUrl}" onerror="this.style.display='none'">
          <div class="exam-meta">
            <h2 class="exam-title">${esc(exam.name)}</h2>
            <div class="exam-info">
              <span>שם: <strong>${esc(s.name)}</strong></span>
              ${exam.exam_date ? `<span>תאריך: ${esc(exam.exam_date)}</span>` : ''}
              ${s.track ? `<span>מסלול: ${esc(s.track)}</span>` : ''}
            </div>
          </div>
          <div class="barcode-wrap">
            <img src="${barcodeUrl}">
            <div class="bc-code-sm">${esc(s.code)}</div>
          </div>
        </div>
        <hr class="divider">
        <div class="questions">${questionsHtml || '<p style="color:#999; text-align:center; margin:30px 0;">לא הוגדרו שאלות למבחן זה</p>'}</div>
      </div>`;
    }).join('');

    const style = barcodesOnly ? `
      body { font-family:'David','Times New Roman',serif; direction:rtl; margin:0; background:white; }
      .barcode-page { display:inline-block; border:1.5px dashed #999; border-radius:10px; padding:12px 16px; margin:8px; text-align:center; width:200px; vertical-align:top; page-break-inside:avoid; }
      .bc-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .logo-small { width:36px; height:36px; object-fit:contain; }
      .bc-name { font-weight:800; font-size:13px; }
      .bc-exam { font-size:10px; color:#555; }
      .bc-img { width:90%; display:block; margin:4px auto; }
      .bc-code { font-family:monospace; font-size:9px; color:#666; }
      @media print { .barcode-page { page-break-inside:avoid; } }
    ` : `
      body { font-family:'David','Times New Roman',serif; direction:rtl; margin:0; background:white; font-size:13px; }
      .exam-page { padding:20px 28px; min-height:100vh; box-sizing:border-box; page-break-after:always; }
      .exam-page:last-child { page-break-after:auto; }
      .exam-header { display:flex; align-items:flex-start; gap:16px; margin-bottom:10px; }
      .logo { width:70px; height:70px; object-fit:contain; flex-shrink:0; }
      .exam-meta { flex:1; }
      .exam-title { font-size:18px; margin:0 0 6px; font-weight:800; }
      .exam-info { display:flex; flex-wrap:wrap; gap:14px; font-size:12px; color:#333; }
      .barcode-wrap { text-align:center; flex-shrink:0; }
      .barcode-wrap img { width:140px; display:block; }
      .bc-code-sm { font-family:monospace; font-size:9px; color:#666; text-align:center; }
      .divider { border:none; border-top:2px solid #222; margin:10px 0; }
      .questions { }
      .question { margin-bottom:18px; page-break-inside:avoid; }
      .q-text { margin:0 0 6px; line-height:1.6; font-size:13px; }
      .mc-opts { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; padding-right:10px; }
      .mc-opt { font-size:12px; display:flex; align-items:center; gap:6px; }
      .mc-letter { display:inline-block; width:22px; height:22px; border:1.5px solid #333; border-radius:50%; text-align:center; line-height:20px; font-weight:700; font-size:11px; flex-shrink:0; }
      .answer-lines { padding-right:10px; }
      .answer-line { border-bottom:1px solid #999; height:24px; margin-bottom:2px; }
      @media print { .exam-page { page-break-after:always; } .exam-page:last-child { page-break-after:auto; } }
    `;

    const win = window.open('', '_blank', 'width=900,height=1000');
    const title = barcodesOnly ? `ברקודים — ${exam.name}` : `מבחנים — ${exam.name}`;
    win!.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${title}</title><style>${style}</style></head><body>${pages}</body></html>`);
    win!.document.close();

    const imgs = Array.from(win!.document.images);
    Promise.all(imgs.map(img => img.complete
      ? Promise.resolve()
      : new Promise(res => { img.onload = img.onerror = () => res(null); })
    )).then(() => setTimeout(() => win!.print(), 200));
  }
}

function esc(s: any): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute } from '@angular/router';

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
        <div class="section-title">✏️ פרטי התלמידה</div>
        <div class="form-group"><label>שם מלא</label><input [(ngModel)]="name" placeholder="שם התלמידה"></div>
        <div class="form-group"><label>מספר תעודת זהות</label><input [(ngModel)]="idNumber" placeholder="000000000"></div>
        <div class="form-group"><label>תאריך לידה</label><input [(ngModel)]="birthDate" placeholder="01/01/2000"></div>
        <div class="form-group"><label>כתובת מגורים</label><input [(ngModel)]="address" placeholder="רחוב, עיר"></div>
        <div class="form-group"><label>שנת לימודים</label><input [(ngModel)]="academicYear" placeholder='תשפ"ז'></div>
        <div class="form-group"><label>מסלול לימודים</label><input [(ngModel)]="track" placeholder="גרפיקה / בימוי / ..."></div>
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
    .doc-body { font-size: 0.82rem; line-height: 2; color: #1a1a1a; flex: 1; }
    .doc-body p { margin-bottom: 1px; }
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
  todayStr = new Date().toLocaleDateString('he-IL');

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.api.getApprovalTypes().subscribe(types => {
      this.route.queryParams.subscribe(p => {
        const id = p['type'] ? +p['type'] : null;
        const singleTypes = types.filter((t: any) => t.type === 'single');
        this.approvalType = id ? types.find((t: any) => t.id === id) : singleTypes[0];
      });
    });
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
    return this.fillTemplate(this.approvalType.template)
      .split('\n').map((line: string) => `<p>${line || '&nbsp;'}</p>`).join('');
  }

  print() {
    if (!this.approvalType) return;
    const today = new Date();
    const dateHe = today.toLocaleDateString('he-IL');
    let hebrewDate = '';
    try { hebrewDate = today.toLocaleDateString('he-IL-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' }); } catch {}

    const sig = this.approvalType.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png';
    const sigName = this.approvalType.signature === 'principal' ? 'המנהלת' : 'המזכירות';
    const bodyHtml = this.fillTemplate(this.approvalType.template)
      .split('\n').map((line: string) => `<p>${line || '&nbsp;'}</p>`).join('');

    const win = window.open('', '_blank', 'width=800,height=900')!;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>${this.approvalType.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Heebo', Arial, sans-serif; background: white; direction: rtl; }
        .approval-page {
          width: 210mm; min-height: 297mm; padding: 14mm 18mm 14mm 18mm;
          display: flex; flex-direction: column; position: relative; background: white; overflow: hidden;
        }
        .ap-watermark {
          position: absolute; left: 0; top: 0; bottom: 0; width: 18mm;
          background: linear-gradient(180deg, #f0ece8 0%, #d4c8bc 30%, #b8a898 60%, #d4c8bc 80%, #f0ece8 100%);
          opacity: 0.6;
        }
        .ap-watermark-logo { position: absolute; left: 1mm; top: 50%; transform: translateY(-50%); width: 16mm; opacity: 0.15; }
        .ap-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12mm; }
        .ap-top-left { display: flex; flex-direction: column; gap: 3px; text-align: left; }
        .ap-bsd { font-size: 0.8rem; color: #333; font-weight: 700; }
        .ap-date { font-size: 0.78rem; color: #444; }
        .ap-date-he { font-size: 0.75rem; color: #555; }
        .ap-logo { height: 75px; width: auto; }
        .ap-title { font-size: 1.9rem; font-weight: 900; text-align: center; margin-bottom: 10mm; color: #1a1a1a; }
        .ap-body { font-size: 1rem; line-height: 2.3; color: #1a1a1a; flex: 1; padding-right: 4mm; }
        .ap-body p { margin-bottom: 2px; }
        .ap-footer { margin-top: 12mm; display: flex; justify-content: flex-start; align-items: flex-end; gap: 8mm; }
        .ap-sig-block { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .ap-sig-img { height: 65px; width: auto; }
        .ap-sig-name { font-size: 0.8rem; color: #444; }
        .ap-footer-logo { height: 45px; width: auto; opacity: 0.7; margin-right: auto; }
        @media print { @page { size: A4; margin: 0; } }
      </style></head><body>
      <div class="approval-page">
        <div class="ap-watermark"></div>
        <img src="/logo.png" class="ap-watermark-logo">
        <div class="ap-top">
          <div class="ap-top-left">
            <div class="ap-bsd">בס"ד</div>
            <div class="ap-date-he">${hebrewDate}</div>
            <div class="ap-date">${dateHe}</div>
          </div>
          <img src="/logo.png" class="ap-logo">
        </div>
        <div class="ap-title">${this.approvalType.name}</div>
        <div class="ap-body">${bodyHtml}</div>
        <div class="ap-footer">
          <div class="ap-sig-block">
            <img src="${sig}" class="ap-sig-img">
            <div class="ap-sig-name">${sigName}</div>
          </div>
          <img src="/logo.png" class="ap-footer-logo">
        </div>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`);
    win.document.close();
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-approvals',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>אישורים לתלמידות</h1>
        <p class="subtitle">הפקת אישורים מותאמים אישית</p>
      </div>
    </div>

    <div class="approvals-grid">
      <!-- עמודה שמאל: בחירת תלמידות -->
      <div class="card">
        <div class="section-title">👩‍🎓 בחירת תלמידות</div>
        <div class="search-bar" style="margin-bottom:14px;">
          <span class="search-icon">🔍</span>
          <input [(ngModel)]="searchQ" (input)="onSearch()" placeholder="חיפוש לפי שם או ת.ז...">
        </div>

        <div class="select-actions">
          <button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="selectAll()">✓ בחר הכל ({{ filtered().length }})</button>
          <button class="btn btn-secondary" style="font-size:0.78rem; padding:5px 12px;" (click)="clearAll()">✕ נקה בחירה</button>
          <span class="selected-count" *ngIf="selected().size">{{ selected().size }} נבחרו</span>
        </div>

        <div class="students-list">
          <div *ngFor="let s of filtered()" class="student-row" [class.selected]="selected().has(s.id_number)" (click)="toggle(s.id_number)">
            <input type="checkbox" [checked]="selected().has(s.id_number)" (click)="$event.stopPropagation()">
            <div class="student-row-info">
              <strong>{{ s.name }}</strong>
              <span>{{ s.id_number }} · {{ s.track }}{{ s.year ? ' ' + s.year : '' }}</span>
            </div>
          </div>
          <div *ngIf="!filtered().length" class="empty-state" style="padding:20px 0;">
            <div class="empty-icon">👩‍🎓</div>
            <p>לא נמצאו תלמידות</p>
          </div>
        </div>
      </div>

      <!-- עמודה ימין: סוג אישור + הדפסה -->
      <div class="card">
        <div class="section-title">📄 סוג אישור</div>
        <div class="approval-types">
          <div *ngFor="let t of types()" class="type-card" [class.active]="selectedType()?.id === t.id" (click)="selectedType.set(t)">
            <div class="type-name">{{ t.name }}</div>
            <div class="type-sig">חתימה: {{ t.signature === 'principal' ? 'מנהלת' : 'מזכירות' }}</div>
          </div>
        </div>

        <div *ngIf="selectedType()" class="template-preview">
          <div class="section-title" style="margin-top:20px;">👁 תצוגה מקדימה</div>
          <div class="preview-box" [innerHTML]="previewText()"></div>
        </div>

        <div class="year-row">
          <label>שנת לימודים:</label>
          <input [(ngModel)]="academicYear" placeholder="תשפ&quot;ז" style="width:120px;">
        </div>

        <button class="btn btn-primary" style="width:100%; margin-top:16px; padding:14px;"
          [disabled]="!selected().size || !selectedType()"
          (click)="printApprovals()">
          🖨️ הדפס {{ selected().size }} אישורים
        </button>
        <p *ngIf="!selected().size || !selectedType()" style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:8px;">
          {{ !selected().size ? 'בחרי תלמידות' : 'בחרי סוג אישור' }}
        </p>
      </div>
    </div>
  `,
  styles: [`
    .approvals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 700px) { .approvals-grid { grid-template-columns: 1fr; } }

    .select-actions { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .selected-count { font-size: 0.8rem; font-weight: 700; color: var(--primary); background: var(--primary-light); padding: 3px 10px; border-radius: 20px; }

    .students-list { max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .student-row {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: var(--radius-sm); border: 1.5px solid var(--border);
      cursor: pointer; transition: all var(--transition);
      &:hover { border-color: var(--primary); background: var(--primary-light); }
    }
    .student-row.selected { border-color: var(--primary); background: var(--primary-light); }
    .student-row-info { flex: 1; strong { display: block; font-size: 0.9rem; } span { font-size: 0.75rem; color: var(--text-muted); } }

    .approval-types { display: flex; flex-direction: column; gap: 8px; }
    .type-card {
      padding: 14px 16px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
      cursor: pointer; transition: all var(--transition);
      &:hover { border-color: var(--primary); background: var(--primary-light); }
    }
    .type-card.active { border-color: var(--primary); background: var(--primary-light); box-shadow: 0 0 0 2px var(--primary); }
    .type-name { font-weight: 800; font-size: 0.95rem; }
    .type-sig { font-size: 0.75rem; color: var(--text-muted); margin-top: 3px; }

    .template-preview { margin-top: 4px; }
    .preview-box {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 14px 16px; font-size: 0.85rem; line-height: 1.8; white-space: pre-wrap;
      color: var(--text-muted); max-height: 160px; overflow-y: auto;
    }
    .year-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 0.875rem; font-weight: 600; }
  `]
})
export class ApprovalsComponent implements OnInit {
  all = signal<any[]>([]);
  filtered = signal<any[]>([]);
  types = signal<any[]>([]);
  selected = signal<Set<string>>(new Set());
  selectedType = signal<any | null>(null);
  searchQ = '';
  academicYear = 'תשפ"ז';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getStudents().subscribe(s => { this.all.set(s); this.filtered.set(s); });
    this.api.getApprovalTypes().subscribe(t => { this.types.set(t); if (t.length) this.selectedType.set(t[0]); });
  }

  onSearch() {
    const q = this.searchQ.trim().toLowerCase();
    this.filtered.set(q ? this.all().filter(s => s.name.includes(q) || s.id_number.includes(q)) : this.all());
  }

  toggle(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  selectAll() { this.selected.set(new Set(this.filtered().map(s => s.id_number))); }
  clearAll()  { this.selected.set(new Set()); }

  previewText(): string {
    const t = this.selectedType();
    if (!t) return '';
    return t.template
      .replace(/{{שם}}/g, 'שם התלמידה')
      .replace(/{{תז}}/g, '000000000')
      .replace(/{{שנה}}/g, this.academicYear)
      .replace(/{{מסלול}}/g, 'מסלול לימודים')
      .replace(/\n/g, '<br>');
  }

  printApprovals() {
    const type = this.selectedType();
    if (!type || !this.selected().size) return;

    const students = this.all().filter(s => this.selected().has(s.id_number));
    const today = new Date();
    const dateHe = today.toLocaleDateString('he-IL');
    const hebrewDate = this.getHebrewDate();

    const pages = students.map(s => {
      const text = type.template
        .replace(/{{\u05e9\u05dd}}/g, s.name)
        .replace(/{{\u05ea\u05d6}}/g, s.id_number)
        .replace(/{{\u05e9\u05e0\u05d4}}/g, this.academicYear)
        .replace(/{{\u05de\u05e1\u05dc\u05d5\u05dc}}/g, s.track ? `${s.track}${s.year ? ' ' + s.year : ''}` : '')
        .split('\n').map((line: string) => `<p>${line || '&nbsp;'}</p>`).join('');

      const sig = type.signature === 'principal' ? '/sig-principal.png' : '/sig-secretary.png';
      const sigName = type.signature === 'principal' ? '\u05d4\u05de\u05e0\u05d4\u05dc\u05ea' : '\u05d4\u05de\u05d6\u05db\u05d9\u05e8ו\u05ea';

      return `
        <div class="approval-page">
          <div class="ap-watermark"></div>
          <img src="/logo.png" class="ap-watermark-logo">
          <div class="ap-top">
            <div class="ap-top-left">
              <div class="ap-bsd">\u05d1\u05e1"\u05d3</div>
              <div class="ap-date-he">${hebrewDate}</div>
              <div class="ap-date">${dateHe}</div>
            </div>
            <img src="/logo.png" class="ap-logo">
          </div>
          <div class="ap-title">${type.name}</div>
          <div class="ap-body">${text}</div>
          <div class="ap-footer">
            <div class="ap-sig-block">
              <img src="${sig}" class="ap-sig-img">
              <div class="ap-sig-name">${sigName}</div>
            </div>
            <img src="/logo.png" class="ap-footer-logo">
          </div>
        </div>
      `;
    }).join('<div class="page-break"></div>');

    const win = window.open('', '_blank', 'width=800,height=900')!;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>\u05d0\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Heebo', Arial, sans-serif; background: white; direction: rtl; }
        .approval-page {
          width: 210mm; min-height: 297mm; padding: 14mm 18mm 14mm 18mm;
          display: flex; flex-direction: column; position: relative;
          background: white; overflow: hidden;
        }
        .ap-watermark {
          position: absolute; left: 0; top: 0; bottom: 0; width: 18mm;
          background: linear-gradient(180deg, #f0ece8 0%, #d4c8bc 30%, #b8a898 60%, #d4c8bc 80%, #f0ece8 100%);
          opacity: 0.6;
        }
        .ap-watermark-logo {
          position: absolute; left: 1mm; top: 50%; transform: translateY(-50%);
          width: 16mm; opacity: 0.15;
        }
        .ap-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 12mm; padding-bottom: 4mm;
        }
        .ap-top-left { display: flex; flex-direction: column; gap: 3px; text-align: left; }
        .ap-bsd { font-size: 0.8rem; color: #333; font-weight: 700; }
        .ap-date { font-size: 0.78rem; color: #444; }
        .ap-date-he { font-size: 0.75rem; color: #555; }
        .ap-logo { height: 75px; width: auto; }
        .ap-title {
          font-size: 1.9rem; font-weight: 900; text-align: center;
          margin-bottom: 10mm; color: #1a1a1a; letter-spacing: -0.5px;
        }
        .ap-body { font-size: 1rem; line-height: 2.3; color: #1a1a1a; flex: 1; padding-right: 4mm; }
        .ap-body p { margin-bottom: 1px; }
        .ap-footer {
          margin-top: 12mm;
          display: flex; justify-content: flex-start; align-items: flex-end; gap: 8mm;
        }
        .ap-sig-block { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .ap-sig-img { height: 65px; width: auto; }
        .ap-sig-name { font-size: 0.8rem; color: #444; }
        .ap-footer-logo { height: 45px; width: auto; opacity: 0.7; margin-right: auto; }
        .page-break { page-break-after: always; }
        @media print {
          @page { size: A4; margin: 0; }
          .page-break { page-break-after: always; }
        }
      </style></head><body>
      ${pages}
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`);
    win.document.close();
  }

  getHebrewDate(): string {
    const d = new Date();
    try {
      return d.toLocaleDateString('he-IL-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return ''; }
  }
}

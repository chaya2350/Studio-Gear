import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

interface McQuestion {
  text: string;
  options: [string, string, string, string];
  answer: number; // 0-3
}

interface OpenQuestion {
  text: string;
  lines: number; // שורות ריקות להשאיר לתשובה
}

@Component({
  selector: 'app-exam-editor',
  imports: [CommonModule, FormsModule],
  template: `
<div *ngIf="loading()" class="loading-center">טוענת...</div>

<div *ngIf="!loading() && exam()">
  <div class="page-header">
    <div>
      <a class="back-link" (click)="router.navigate(['/exams'])" style="cursor:pointer;">← חזרה למבחנים</a>
      <h1>עריכת תוכן מבחן</h1>
      <p class="subtitle">{{ exam()?.name }}</p>
    </div>
    <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'שומרת...' : ' שמור מבחן' }}
    </button>
  </div>

  <!-- בחירת תבנית -->
  <div class="card" style="margin-bottom:16px;">
    <div class="section-title"> סוג מבחן</div>
    <div class="type-toggle">
      <button [class.active]="templateType() === 'multiple_choice'" (click)="setType('multiple_choice')">
        🅐 אמריקאי (multiple choice)
      </button>
      <button [class.active]="templateType() === 'open'" (click)="setType('open')">
         שאלות פתוחות
      </button>
    </div>
  </div>

  <!-- שאלות אמריקאיות -->
  <div *ngIf="templateType() === 'multiple_choice'" class="questions-wrap">
    <div *ngFor="let q of mcQuestions(); let i = index" class="card question-card">
      <div class="question-header">
        <span class="q-num">שאלה {{ i + 1 }}</span>
        <button class="del-btn" (click)="removeMcQuestion(i)" title="מחק שאלה">✕</button>
      </div>
      <div class="form-group">
        <label>טקסט השאלה</label>
        <textarea rows="2" [(ngModel)]="q.text" placeholder="הקלידי את השאלה כאן..."></textarea>
      </div>
      <div class="options-grid">
        <div *ngFor="let opt of q.options; let j = index" class="option-row">
          <button class="answer-btn" [class.correct]="q.answer === j" (click)="q.answer = j" [title]="q.answer===j ? 'תשובה נכונה' : 'סמן כנכונה'">
            {{ ['א','ב','ג','ד'][j] }}
          </button>
          <input [(ngModel)]="q.options[j]" placeholder="אפשרות {{ ['א','ב','ג','ד'][j] }}">
        </div>
      </div>
      <p class="hint">לחצי על הכפתור הצבעוני לסימון התשובה הנכונה</p>
    </div>

    <button class="btn btn-secondary add-btn" (click)="addMcQuestion()">＋ הוסף שאלה</button>
  </div>

  <!-- שאלות פתוחות -->
  <div *ngIf="templateType() === 'open'" class="questions-wrap">
    <div *ngFor="let q of openQuestions(); let i = index" class="card question-card">
      <div class="question-header">
        <span class="q-num">שאלה {{ i + 1 }}</span>
        <button class="del-btn" (click)="removeOpenQuestion(i)" title="מחק שאלה">✕</button>
      </div>
      <div class="form-group">
        <label>טקסט השאלה</label>
        <textarea rows="3" [(ngModel)]="q.text" placeholder="הקלידי את השאלה כאן..."></textarea>
      </div>
      <div class="form-group lines-form">
        <label>שורות תשובה בהדפסה</label>
        <input type="number" min="2" max="20" [(ngModel)]="q.lines" style="width:80px;">
      </div>
    </div>

    <button class="btn btn-secondary add-btn" (click)="addOpenQuestion()">＋ הוסף שאלה</button>
  </div>

  <div *ngIf="questions().length === 0" class="empty-state">
    <div class="empty-icon"> </div>
    <p>אין עדיין שאלות. לחצי על "הוסף שאלה" להתחיל</p>
  </div>

  <div *ngIf="saveError()" class="alert alert-error" style="margin-top:12px;">{{ saveError() }}</div>
  <div *ngIf="saveSuccess()" class="alert alert-success" style="margin-top:12px;">המבחן נשמר בהצלחה!</div>
</div>
`,
  styles: [`
    .loading-center { text-align:center; padding:60px; color:var(--text-muted); }
    .back-link { font-size:0.85rem; color:var(--primary); margin-bottom:4px; display:block; }
    .type-toggle { display:flex; gap:8px; flex-wrap:wrap;
      button { padding:10px 20px; border:1.5px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); font:inherit; font-size:0.9rem; cursor:pointer; font-weight:600;
        &.active { border-color:var(--primary); color:var(--primary); background:var(--primary-light); } } }
    .questions-wrap { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; }
    .question-card { padding:16px; }
    .question-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .q-num { font-size:0.8rem; font-weight:700; color:var(--primary); background:var(--primary-light); padding:3px 10px; border-radius:20px; }
    .del-btn { border:none; background:transparent; cursor:pointer; font-size:1rem; opacity:0.5; &:hover{opacity:1;color:var(--danger);} }
    .form-group { display:flex; flex-direction:column; gap:4px; margin-bottom:10px;
      label { font-size:0.78rem; font-weight:700; color:var(--text-muted); }
      textarea,input { padding:8px 12px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font:inherit; resize:vertical; background:var(--surface); } }
    .options-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:6px; }
    .option-row { display:flex; align-items:center; gap:8px;
      input { flex:1; height:36px; padding:0 10px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font:inherit; background:var(--surface); } }
    .answer-btn { width:32px; height:32px; border-radius:50%; border:2px solid var(--border); background:var(--surface); font-weight:800; font-size:0.85rem; cursor:pointer; flex-shrink:0; transition:all .15s;
      &.correct { border-color:#22c55e; background:#dcfce7; color:#16a34a; } }
    .hint { font-size:0.75rem; color:var(--text-muted); margin:0; }
    .lines-form { flex-direction:row; align-items:center; gap:10px; margin-bottom:0; }
    .add-btn { align-self:flex-start; }
    .empty-state { text-align:center; padding:40px; .empty-icon { font-size:2.5rem; margin-bottom:8px; } p { color:var(--text-muted); } }
  `]
})
export class ExamEditorComponent implements OnInit {
  loading = signal(true);
  saving = signal(false);
  saveError = signal('');
  saveSuccess = signal(false);

  exam = signal<any | null>(null);
  templateType = signal<'multiple_choice' | 'open'>('open');
  mcQuestions = signal<McQuestion[]>([]);
  openQuestions = signal<OpenQuestion[]>([]);

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
          next: (tmpl) => {
            const type = tmpl.template_type || 'open';
            this.templateType.set(type);
            const qs = Array.isArray(tmpl.questions) ? tmpl.questions : [];
            if (type === 'multiple_choice') {
              this.mcQuestions.set(qs.map((q: any) => ({
                text: q.text || '',
                options: [q.options?.[0] || '', q.options?.[1] || '', q.options?.[2] || '', q.options?.[3] || ''],
                answer: q.answer ?? 0
              })));
            } else {
              this.openQuestions.set(qs.map((q: any) => ({
                text: q.text || '',
                lines: q.lines ?? 5
              })));
            }
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        });
      },
      error: () => { this.loading.set(false); }
    });
  }

  questions(): any[] {
    return this.templateType() === 'multiple_choice' ? this.mcQuestions() : this.openQuestions();
  }

  setType(t: 'multiple_choice' | 'open') {
    this.templateType.set(t);
  }

  addMcQuestion() {
    this.mcQuestions.update(qs => [...qs, { text: '', options: ['', '', '', ''], answer: 0 }]);
  }

  removeMcQuestion(i: number) {
    this.mcQuestions.update(qs => qs.filter((_, idx) => idx !== i));
  }

  addOpenQuestion() {
    this.openQuestions.update(qs => [...qs, { text: '', lines: 5 }]);
  }

  removeOpenQuestion(i: number) {
    this.openQuestions.update(qs => qs.filter((_, idx) => idx !== i));
  }

  save() {
    this.saveError.set('');
    this.saveSuccess.set(false);
    const questions = this.templateType() === 'multiple_choice'
      ? this.mcQuestions()
      : this.openQuestions();
    this.saving.set(true);
    this.api.saveExamTemplate(this.exam()!.id, {
      template_type: this.templateType(),
      questions
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (e) => {
        this.saving.set(false);
        this.saveError.set(e.error?.error || 'שמירה נכשלה');
      }
    });
  }
}

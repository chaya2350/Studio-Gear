import { Component, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { BrowserMultiFormatReader } from '@zxing/browser';

@Component({
selector: 'app-exam-scan',
imports: [CommonModule, FormsModule],
template: `
<div class="page-header">
<div>
<h1> רישום ציון מבחן</h1>
<p class="subtitle">סרקי את הברקוד על המבחן ורשמי את הציון</p>
</div>
</div>

<div class="scan-wrapper">
<div class="mode-toggle">
<button [class.active]="mode()==='camera'" (click)="setMode('camera')"> מצלמה</button>
<button [class.active]="mode()==='manual'" (click)="setMode('manual')">⌨ הקלדה</button>
</div>

<div class="scan-card card">
<div *ngIf="mode()==='camera'" class="camera-section">
<div class="video-wrap">
<video #videoEl autoplay playsinline></video>
<div class="scan-overlay"><div class="scan-frame"></div></div>
</div>
<p class="scan-hint">כוון את המצלמה לברקוד על המבחן</p>
<div *ngIf="cameraError()" class="alert alert-error">{{ cameraError() }}</div>
</div>

<div *ngIf="mode()==='manual'" class="manual-section">
<div class="barcode-input-wrap">
<span class="barcode-icon"></span>
<input [(ngModel)]="manualCode" placeholder="הקלד/סרוק קוד מבחן (EX...)" (keyup.enter)="lookupManual()">
</div>
<button class="btn btn-primary" style="width:100%; margin-top:12px; padding:12px;" (click)="lookupManual()"> חפש מבחן</button>
</div>
</div>

<!-- תוצאה -->
<div class="card result-card" *ngIf="result()">
<div class="section-title"> פרטי המבחן</div>
<div class="result-grid">
<div class="result-item"><span class="label">תלמידה</span><strong>{{ result()!.student_name }}</strong></div>
<div class="result-item"><span class="label">מבחן</span><strong>{{ result()!.exam_name }}</strong></div>
<div class="result-item" *ngIf="result()!.track"><span class="label">מסלול</span><span>{{ result()!.track }}{{ result()!.year ? ' ' + result()!.year : '' }}</span></div>
<div class="result-item" *ngIf="result()!.exam_date"><span class="label">תאריך</span><span>{{ result()!.exam_date }}</span></div>
</div>

<div class="grade-form">
<label>ציון</label>
<div class="grade-row">
<input type="number" min="0" max="100" [(ngModel)]="gradeInput" (keyup.enter)="saveGrade()" placeholder="0-100">
<button class="btn btn-primary" [disabled]="saving()" (click)="saveGrade()"> שמור ציון</button>
</div>
<p *ngIf="result()!.grade != null" class="current-grade">ציון קיים: <strong>{{ result()!.grade }}</strong> (יוחלף בשמירה)</p>
</div>
</div>

<div class="alert alert-error" *ngIf="lookupError()">{{ lookupError() }}</div>
<div class="alert alert-success" *ngIf="successMsg()">{{ successMsg() }}</div>
</div>
`,
styles: [`
.scan-wrapper { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
.mode-toggle { display: flex; gap: 6px;
button { flex: 1; padding: 9px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); font: inherit; font-weight: 600; cursor: pointer;
&.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } } }

.video-wrap { position: relative; border-radius: var(--radius-sm); overflow: hidden; aspect-ratio: 4/3; background: black;
video { width: 100%; height: 100%; object-fit: cover; } }
.scan-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); }
.scan-frame { width: 240px; height: 100px; border: 2.5px solid white; border-radius: var(--radius-sm); box-shadow: 0 0 0 2000px rgba(0,0,0,0.35); }
.scan-hint { text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 10px; }

.barcode-input-wrap { display: flex; align-items: center; gap: 10px; background: var(--surface-2); border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px;
&:focus-within { border-color: var(--primary); background: white; }
input { flex: 1; border: none; background: transparent; font: inherit; direction: rtl; &:focus { outline: none; } } }

.result-card { animation: fadeIn 0.25s ease; }
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.result-item { .label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px; } strong { font-size: 1rem; } span { font-size: 0.9rem; } }
.grade-form { label { font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 6px; } }
.grade-row { display: flex; gap: 8px;
input { width: 120px; height: 42px; padding: 0 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font: inherit; font-size: 1.1rem; font-weight: 700; text-align: center; }
button { flex: 1; } }
.current-grade { margin-top: 10px; font-size: 0.83rem; color: var(--text-muted); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`]
})
export class ExamScanComponent implements AfterViewInit, OnDestroy {
@ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;

mode = signal<'camera' | 'manual'>('camera');
cameraError = signal('');
lookupError = signal('');
successMsg = signal('');
saving = signal(false);
result = signal<any | null>(null);
gradeInput: number | null = null;
manualCode = '';

private reader = new BrowserMultiFormatReader();
private isScanning = false;

constructor(private api: ApiService) { }

ngAfterViewInit() {
if (this.mode() === 'camera') this.startCamera();
}

ngOnDestroy() { this.stopCamera(); }

setMode(m: 'camera' | 'manual') {
this.mode.set(m);
this.lookupError.set('');
if (m === 'camera') setTimeout(() => this.startCamera());
else this.stopCamera();
}

private startCamera() {
this.stopCamera();
const video = this.videoEl?.nativeElement;
if (!video) return;
this.isScanning = true;
this.reader.decodeFromVideoDevice(undefined, video, (result) => {
if (result && this.isScanning) {
const code = result.getText().trim();
if (this.result()?.code === code) return; // אותו קוד — המתן שמירה
this.lookup(code);
}
}).catch(() => this.cameraError.set('לא ניתן לגשת למצלמה. בדקי הרשאות או השתמשי בהקלדה ידנית.'));
}

private stopCamera() {
this.isScanning = false;
BrowserMultiFormatReader.releaseAllStreams();
}

lookupManual() {
const code = this.manualCode.trim();
if (!code) return;
this.lookup(code);
}

lookup(code: string) {
this.lookupError.set('');
this.successMsg.set('');
this.api.getExamCode(code).subscribe({
next: (r) => {
this.result.set(r);
this.gradeInput = r.grade != null ? r.grade : null;
},
error: (e) => {
this.result.set(null);
this.lookupError.set(e.error?.error || 'ברקוד לא מוכר');
}
});
}

saveGrade() {
const r = this.result();
if (!r || this.gradeInput == null) return;
const grade = Number(this.gradeInput);
if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
this.lookupError.set('הציון חייב להיות בין 0 ל-100');
return;
}
this.saving.set(true);
this.api.setExamCodeGrade(r.code, grade).subscribe({
next: () => {
this.saving.set(false);
this.successMsg.set(` ציון ${grade} נשמר ל${r.student_name} במבחן "${r.exam_name}"`);
this.result.set({ ...r, grade });
this.gradeInput = null;
setTimeout(() => this.successMsg.set(''), 4000);
},
error: (e) => {
this.saving.set(false);
this.lookupError.set(e.error?.error || 'שמירה נכשלה');
}
});
}
}

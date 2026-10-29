import { Component, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { BrowserMultiFormatReader } from '@zxing/browser';

type ScanPhase = 'session' | 'absent' | 'late' | 'done';

@Component({
  selector: 'app-attendance-scan',
  imports: [CommonModule, FormsModule],
  template: `
<div class="page-header">
  <div>
    <h1>📋 רישום נוכחות</h1>
    <p class="subtitle">סרקי ברקוד שיעור מהדף השבועי</p>
  </div>
</div>

<div class="scan-wrapper">

  <!-- Mode toggle -->
  <div class="mode-toggle">
    <button [class.active]="mode()==='camera'" (click)="setMode('camera')">📷 מצלמה</button>
    <button [class.active]="mode()==='manual'" (click)="setMode('manual')">⌨ הקלדה</button>
  </div>

  <!-- SHARED CAMERA BLOCK — always in DOM when camera mode, shown only on active scan phases -->
  <div class="scan-card card" *ngIf="mode()==='camera' && phase() !== 'done'">
    <div class="camera-section">
      <div class="video-wrap">
        <video #videoEl autoplay playsinline muted></video>
        <div class="scan-overlay"><div class="scan-frame"></div></div>
      </div>
      <p class="scan-hint">
        <ng-container *ngIf="phase()==='session'">כוון לברקוד שיעור</ng-container>
        <ng-container *ngIf="phase()==='absent'">כוון לברקוד תלמידה נעדרת</ng-container>
        <ng-container *ngIf="phase()==='late'">כוון לברקוד תלמידה שאיחרה</ng-container>
      </p>
      <div *ngIf="cameraError()" class="alert alert-error">{{ cameraError() }}</div>
    </div>
  </div>

  <!-- PHASE: session scan -->
  <ng-container *ngIf="phase() === 'session'">
    <div class="phase-label card">
      <div class="phase-step">שלב 1</div>
      <h2>סרקי ברקוד שיעור</h2>
      <p class="phase-hint">סרקי את הברקוד מהדף השבועי (ברקוד היום-כיתה)</p>
    </div>

    <div class="scan-card card" *ngIf="mode()==='manual'">
      <div class="manual-section">
        <input [(ngModel)]="manualCode" placeholder="הקלד/סרוק קוד שיעור (ATT-...)"
               (keyup.enter)="processSessionBarcode(manualCode)" class="code-input" #manualInput autofocus>
        <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:12px"
                (click)="processSessionBarcode(manualCode)">חפש שיעור</button>
      </div>
    </div>
    <div *ngIf="sessionError()" class="alert alert-error">{{ sessionError() }}</div>
  </ng-container>

  <!-- PHASE: session details → start -->
  <ng-container *ngIf="phase() === 'absent' || phase() === 'late' || phase() === 'done'">

    <!-- Session info banner -->
    <div class="session-banner card">
      <div class="session-info">
        <div class="session-field"><span class="label">מורה</span><strong>{{ currentSession()?.teacher?.name }}</strong></div>
        <div class="session-field"><span class="label">כיתה</span><strong>{{ currentSession()?.class_name }}</strong></div>
        <div class="session-field"><span class="label">תאריך</span><strong>{{ currentSession()?.lesson_date }}</strong></div>
        <div class="session-field" *ngIf="currentSession()?.subject"><span class="label">מקצוע</span><strong>{{ currentSession()?.subject }}</strong></div>
        <div class="session-field" *ngIf="currentSession()?.start_time"><span class="label">שעה</span><strong>{{ currentSession()?.start_time }}</strong></div>
      </div>
      <div class="session-stats">
        <div class="stat"><span>{{ currentSession()?.student_count }}</span><small>תלמידות</small></div>
        <div class="stat absent"><span>{{ absentList().length }}</span><small>נעדרות</small></div>
        <div class="stat late"><span>{{ lateList().length }}</span><small>איחור</small></div>
      </div>
    </div>

    <!-- PHASE: absent -->
    <ng-container *ngIf="phase() === 'absent'">
      <div class="phase-label card">
        <div class="phase-step">שלב 2</div>
        <h2>סרקי תלמידות שלא הגיעו</h2>
        <p class="phase-hint">סרקי את ברקוד כל תלמידה שנעדרה. לחצי "סיימתי" כשאת מוכנה</p>
      </div>

      <div class="scan-card card" *ngIf="mode()==='manual'">
        <div class="manual-section">
          <input [(ngModel)]="manualCode" placeholder="סרקי/הקלידי ברקוד תלמידה (STU-...)"
                 (keyup.enter)="processStudentBarcode(manualCode, 'absent')" class="code-input">
          <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:12px"
                  (click)="processStudentBarcode(manualCode, 'absent')">רשמי כנעדרת</button>
        </div>
      </div>

      <div *ngIf="lastScanned()" class="last-scanned">
        ✓ {{ lastScanned() }} — נרשמה כנעדרת
      </div>
      <div *ngIf="scanError()" class="alert alert-error">{{ scanError() }}</div>

      <!-- Absent list -->
      <div *ngIf="absentList().length" class="scanned-list card">
        <div class="list-header">נעדרות ({{ absentList().length }})</div>
        <div *ngFor="let s of absentList()" class="scanned-row absent-row">
          <span class="student-name">{{ s.name }}</span>
          <button class="undo-btn" (click)="undoRecord(s.id_number, 'absent')">ביטול</button>
        </div>
      </div>

      <button class="btn btn-primary btn-large" style="width:100%;margin-top:16px" (click)="goToLate()">
        סיימתי נעדרות → עבר לאיחורים
      </button>
      <button class="btn btn-secondary" style="width:100%;margin-top:8px" (click)="skipToFinish()">
        אין נעדרות ואיחורים — סיים
      </button>
    </ng-container>

    <!-- PHASE: late -->
    <ng-container *ngIf="phase() === 'late'">
      <div class="phase-label card">
        <div class="phase-step">שלב 3</div>
        <h2>סרקי תלמידות שאיחרו</h2>
        <p class="phase-hint">סרקי את ברקוד כל תלמידה שאיחרה. לחצי "סיים" כשאת מוכנה</p>
      </div>

      <div class="scan-card card" *ngIf="mode()==='manual'">
        <div class="manual-section">
          <input [(ngModel)]="manualCode" placeholder="סרקי/הקלידי ברקוד תלמידה (STU-...)"
                 (keyup.enter)="processStudentBarcode(manualCode, 'late')" class="code-input">
          <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:12px"
                  (click)="processStudentBarcode(manualCode, 'late')">רשמי כמאחרת</button>
        </div>
      </div>

      <div *ngIf="lastScanned()" class="last-scanned late">
        ✓ {{ lastScanned() }} — נרשמה כמאחרת
      </div>
      <div *ngIf="scanError()" class="alert alert-error">{{ scanError() }}</div>

      <!-- Late list -->
      <div *ngIf="lateList().length" class="scanned-list card">
        <div class="list-header">איחורים ({{ lateList().length }})</div>
        <div *ngFor="let s of lateList()" class="scanned-row late-row">
          <span class="student-name">{{ s.name }}</span>
          <button class="undo-btn" (click)="undoRecord(s.id_number, 'late')">ביטול</button>
        </div>
      </div>

      <button class="btn btn-primary btn-large" style="width:100%;margin-top:16px"
              [disabled]="finalizing()" (click)="finalizeSession()">
        {{ finalizing() ? 'שומר...' : '✓ סיים ושמור נוכחות' }}
      </button>
      <button class="btn btn-secondary" style="width:100%;margin-top:8px" (click)="phase.set('absent')">
        ← חזור לנעדרות
      </button>
    </ng-container>

    <!-- PHASE: done -->
    <ng-container *ngIf="phase() === 'done'">
      <div class="done-card card">
        <div class="done-icon">✅</div>
        <h2>הנוכחות נשמרה!</h2>
        <div class="done-summary">
          <div class="done-stat">
            <span class="done-val">{{ currentSession()?.student_count }}</span>
            <small>סה"כ תלמידות</small>
          </div>
          <div class="done-stat absent">
            <span class="done-val">{{ absentList().length }}</span>
            <small>נעדרות</small>
          </div>
          <div class="done-stat late">
            <span class="done-val">{{ lateList().length }}</span>
            <small>איחור</small>
          </div>
          <div class="done-stat present">
            <span class="done-val">{{ (currentSession()?.student_count || 0) - absentList().length - lateList().length }}</span>
            <small>נוכחות</small>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:20px" (click)="startNew()">
          📋 רישום שיעור נוסף
        </button>
      </div>
    </ng-container>

  </ng-container>

</div>
`,
  styles: [`
.scan-wrapper { max-width: 600px; display: flex; flex-direction: column; gap: 14px; }

.mode-toggle { display: flex; gap: 6px;
  button { flex: 1; padding: 9px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); font: inherit; font-weight: 600; cursor: pointer; color: var(--text-muted);
    &.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } } }

.phase-label { padding: 16px;
  .phase-step { font-size: 0.75rem; font-weight: 700; color: var(--primary); text-transform: uppercase;
    letter-spacing: 1px; margin-bottom: 4px; }
  h2 { margin: 0 0 6px; font-size: 1.15rem; }
  .phase-hint { margin: 0; font-size: 0.85rem; color: var(--text-muted); } }

.scan-card { padding: 16px; }
.video-wrap { position: relative; border-radius: var(--radius-sm); overflow: hidden;
  aspect-ratio: 4/3; background: black;
  video { width: 100%; height: 100%; object-fit: cover; } }
.scan-overlay { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.35); }
.scan-frame { width: 260px; height: 80px; border: 2.5px solid white; border-radius: 8px;
  box-shadow: 0 0 0 2000px rgba(0,0,0,0.3); }
.scan-hint { text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 10px; }
.code-input { width: 100%; border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 14px;
  font: inherit; font-size: 0.95rem; box-sizing: border-box;
  &:focus { outline: none; border-color: var(--primary); } }

.session-banner { padding: 16px; }
.session-info { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
.session-field { display: grid; gap: 3px;
  .label { font-size: 0.73rem; color: var(--text-muted); font-weight: 700; }
  strong { font-size: 0.95rem; } }
.session-stats { display: flex; gap: 12px;
  .stat { flex: 1; text-align: center; border: 1.5px solid var(--border); border-radius: 10px;
    padding: 10px; span { display: block; font-size: 1.6rem; font-weight: 700; }
    small { font-size: 0.75rem; color: var(--text-muted); }
    &.absent span { color: var(--danger); }
    &.late span { color: #d97706; } } }

.last-scanned { padding: 12px 16px; border-radius: var(--radius-sm); font-weight: 700;
  background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
  &.late { background: #fef3c7; color: #92400e; border-color: #fde68a; } }

.scanned-list { padding: 0; overflow: hidden;
  .list-header { padding: 10px 16px; background: var(--surface-2); font-weight: 700; font-size: 0.85rem; border-bottom: 1px solid var(--border); } }
.scanned-row { display: flex; align-items: center; justify-content: space-between;
  padding: 9px 16px; border-bottom: 1px solid var(--border);
  &:last-child { border: none; } }
.absent-row { background: #fff5f5; }
.late-row { background: #fffbeb; }
.student-name { font-weight: 600; }
.undo-btn { background: none; border: 1px solid var(--border); border-radius: 6px;
  padding: 3px 10px; font-size: 0.78rem; cursor: pointer; color: var(--text-muted);
  &:hover { border-color: var(--danger); color: var(--danger); } }

.done-card { padding: 32px 20px; text-align: center;
  .done-icon { font-size: 3rem; margin-bottom: 12px; }
  h2 { margin: 0 0 20px; font-size: 1.3rem; color: #166534; } }
.done-summary { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.done-stat { text-align: center; border: 1.5px solid var(--border); border-radius: 10px;
  padding: 12px 18px; min-width: 80px;
  .done-val { display: block; font-size: 2rem; font-weight: 700; }
  small { font-size: 0.78rem; color: var(--text-muted); }
  &.absent .done-val { color: var(--danger); }
  &.late .done-val { color: #d97706; }
  &.present .done-val { color: #059669; } }

.btn-large { font-size: 1rem; padding: 14px; }
.alert { border-radius: var(--radius-sm); padding: 10px 14px; font-size: 0.88rem; }
.alert-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  `]
})
export class AttendanceScanComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;

  mode = signal<'camera' | 'manual'>('manual');
  phase = signal<ScanPhase>('session');

  currentSession = signal<any>(null);
  absentList = signal<{ id_number: string; name: string }[]>([]);
  lateList = signal<{ id_number: string; name: string }[]>([]);

  sessionError = signal('');
  scanError = signal('');
  lastScanned = signal('');
  finalizing = signal(false);
  cameraError = signal('');

  manualCode = '';
  private reader: BrowserMultiFormatReader | null = null;
  private scanCooldown = false;

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngAfterViewInit() {
    if (this.mode() === 'camera') this.startCamera();

    const barcode = this.route.snapshot.queryParamMap.get('barcode');
    if (barcode) {
      this.processSessionBarcode(barcode);
    }

    this.route.queryParamMap.subscribe((params) => {
      const nextBarcode = params.get('barcode');
      if (nextBarcode && this.phase() === 'session') {
        this.processSessionBarcode(nextBarcode);
      }
    });
  }

  ngOnDestroy() { this.stopCamera(); }

  setMode(m: 'camera' | 'manual') {
    this.mode.set(m);
    if (m === 'camera') {
      // Wait for Angular to render the video element
      setTimeout(() => this.startCamera(), 150);
    } else {
      this.stopCamera();
    }
  }

  // Called when moving from absent → late phase (camera needs to keep running)
  goToLate() {
    this.scanError.set('');
    this.lastScanned.set('');
    this.phase.set('late');
    // Camera element stays in DOM — no restart needed
  }

  private async startCamera() {
    // Video element may not be in DOM yet — retry once if missing
    if (!this.videoEl?.nativeElement) {
      setTimeout(() => this.startCamera(), 200);
      return;
    }
    this.stopCamera();
    this.cameraError.set('');
    try {
      this.reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices.length) {
        this.cameraError.set('לא נמצאה מצלמה. השתמשי בהקלדה ידנית.');
        return;
      }
      // Prefer back camera on mobile; otherwise last device
      const backCam = devices.find(d => /back|rear|environment/i.test(d.label));
      const deviceId = (backCam || devices[devices.length - 1]).deviceId;
      await this.reader.decodeFromVideoDevice(deviceId, this.videoEl!.nativeElement, (result, err) => {
        if (result && !this.scanCooldown) {
          this.scanCooldown = true;
          const code = result.getText();
          this.handleScan(code);
          setTimeout(() => { this.scanCooldown = false; }, 2000);
        }
        // Suppress not-found errors (continuous scan produces these constantly)
        void err;
      });
    } catch (e: any) {
      this.cameraError.set('לא ניתן לפתוח מצלמה. השתמשי בהקלדה ידנית.');
    }
  }

  private stopCamera() {
    try {
      if (this.reader) {
        (this.reader as any).stopContinuousDecode?.();
        (this.reader as any).reset?.();
      }
    } catch {}
    this.reader = null;
  }

  private handleScan(code: string) {
    if (this.phase() === 'session') this.processSessionBarcode(code);
    else if (this.phase() === 'absent') this.processStudentBarcode(code, 'absent');
    else if (this.phase() === 'late') this.processStudentBarcode(code, 'late');
  }

  processSessionBarcode(code: string) {
    if (!code.trim()) return;
    this.sessionError.set('');
    this.api.scanAttendanceBarcode(code.trim()).subscribe({
      next: (session) => {
        this.currentSession.set(session);
        this.absentList.set([]);
        this.lateList.set([]);
        // Restore existing records if session already had some
        for (const r of (session.records || [])) {
          if (r.status === 'absent') this.absentList.update(l => [...l, { id_number: r.id_number, name: r.name || r.id_number }]);
          if (r.status === 'late') this.lateList.update(l => [...l, { id_number: r.id_number, name: r.name || r.id_number }]);
        }
        this.phase.set('absent');
        this.manualCode = '';
        // Camera is already running (same video element) — no restart needed
      },
      error: e => this.sessionError.set(e.error?.error || 'ברקוד לא מוכר')
    });
  }

  processStudentBarcode(code: string, type: 'absent' | 'late') {
    if (!code.trim()) return;
    this.scanError.set('');

    // Accept both STU-{id} format and plain id_number (from USB scanner)
    const match = code.trim().match(/^STU-(.+)$/);
    const idNumber = match ? match[1] : code.trim();

    const sessionId = this.currentSession()?.session?.id;
    if (!sessionId) return;

    const apiCall = type === 'absent'
      ? this.api.markAbsent(sessionId, idNumber)
      : this.api.markLate(sessionId, idNumber);

    apiCall.subscribe({
      next: (r) => {
        this.lastScanned.set(r.name || idNumber);
        const list = type === 'absent' ? this.absentList : this.lateList;
        const existing = list().find(s => s.id_number === r.id_number);
        if (!existing) list.update(l => [...l, { id_number: r.id_number, name: r.name }]);
        this.manualCode = '';
        setTimeout(() => this.lastScanned.set(''), 3000);
      },
      error: e => this.scanError.set(e.error?.error || 'תלמידה לא נמצאה')
    });
  }

  undoRecord(id_number: string, type: 'absent' | 'late') {
    const sessionId = this.currentSession()?.session?.id;
    if (!sessionId) return;
    this.api.submitSessionRecords(sessionId, [{ id_number, status: 'present' }]).subscribe({
      next: () => {
        if (type === 'absent') this.absentList.update(l => l.filter(s => s.id_number !== id_number));
        else this.lateList.update(l => l.filter(s => s.id_number !== id_number));
      }
    });
  }

  skipToFinish() {
    this.finalizeSession();
  }

  finalizeSession() {
    const sessionId = this.currentSession()?.session?.id;
    if (!sessionId) return;
    this.finalizing.set(true);

    const records = [
      ...this.absentList().map(s => ({ id_number: s.id_number, status: 'absent' })),
      ...this.lateList().map(s => ({ id_number: s.id_number, status: 'late' }))
    ];

    this.api.submitSessionRecords(sessionId, records).subscribe({
      next: () => {
        this.finalizing.set(false);
        this.stopCamera();
        this.phase.set('done');
      },
      error: e => { this.finalizing.set(false); this.scanError.set(e.error?.error || 'שגיאה בשמירה'); }
    });
  }

  startNew() {
    this.currentSession.set(null);
    this.absentList.set([]);
    this.lateList.set([]);
    this.lastScanned.set('');
    this.scanError.set('');
    this.sessionError.set('');
    this.manualCode = '';
    this.phase.set('session');
    if (this.mode() === 'camera') {
      setTimeout(() => this.startCamera(), 150);
    }
  }
}

import { Component, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { BrowserMultiFormatReader } from '@zxing/browser';

@Component({
  selector: 'app-scan',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>סריקת ברקוד</h1>
        <p class="subtitle">סרוק ברקוד של ציוד כדי לצפות בפרטיו</p>
      </div>
    </div>

    <div class="scan-wrapper">
      <div class="mode-toggle">
        <button [class.active]="mode()==='camera'" (click)="setMode('camera')">📷 מצלמה</button>
        <button [class.active]="mode()==='manual'" (click)="setMode('manual')">⌨️ הקלדה ידנית</button>
      </div>

      <div class="scan-card card">
        <div *ngIf="mode()==='camera'" class="camera-section">
          <div class="video-wrap">
            <video #videoEl autoplay playsinline></video>
            <div class="scan-overlay">
              <div class="scan-frame"></div>
            </div>
          </div>
          <p class="scan-hint">כוון את המצלמה לברקוד</p>
          <div *ngIf="cameraError()" class="alert alert-error">{{ cameraError() }}</div>
        </div>

        <div *ngIf="mode()==='manual'" class="manual-section">
          <div class="barcode-input-wrap">
            <span class="barcode-icon">🔖</span>
            <input
              [(ngModel)]="manualBarcode"
              placeholder="הקלד מספר ברקוד..."
              (keyup.enter)="searchManual()"
              autofocus
            >
          </div>
          <button class="btn btn-primary" style="width:100%; margin-top:12px; padding:12px;" (click)="searchManual()">
            🔍 חפש ציוד
          </button>
        </div>

        <div *ngIf="error()" class="alert alert-error" style="margin-top:16px;">{{ error() }}</div>
      </div>
    </div>
  `,
  styles: [`
    .scan-wrapper { max-width: 480px; margin: 0 auto; }

    .mode-toggle {
      display: flex;
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: var(--radius);
      padding: 5px;
      margin-bottom: 16px;
      gap: 4px;

      button {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.9rem;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.18s;

        &.active { background: var(--primary); color: white; box-shadow: var(--shadow); }
        &:not(.active):hover { background: var(--primary-light); color: var(--primary); }
      }
    }

    .scan-card { padding: 24px; }

    .video-wrap {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      background: #0a0a1a;
      aspect-ratio: 4/3;

      video { width: 100%; height: 100%; object-fit: cover; display: block; }
    }

    .scan-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.35);
    }

    .scan-frame {
      width: 200px;
      height: 120px;
      border: 2.5px solid var(--primary);
      border-radius: 10px;
      box-shadow: 0 0 0 2000px rgba(0,0,0,0.3);
      position: relative;

      &::before, &::after {
        content: '';
        position: absolute;
        width: 20px;
        height: 20px;
        border-color: white;
        border-style: solid;
      }
      &::before { top: -2px; right: -2px; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
      &::after  { bottom: -2px; left: -2px; border-width: 0 0 3px 3px; border-radius: 0 0 4px 0; }
    }

    .scan-hint {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 12px;
    }

    .barcode-input-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      transition: border-color 0.18s;

      &:focus-within { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px rgba(108,99,255,0.1); }

      .barcode-icon { font-size: 1.2rem; }

      input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 1rem;
        font-family: inherit;
        direction: rtl;
        color: var(--text);
        &:focus { outline: none; }
        &::placeholder { color: var(--text-muted); }
      }
    }
  `]
})
export class ScanComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

  mode = signal<'camera' | 'manual'>('camera');
  error = signal('');
  cameraError = signal('');
  manualBarcode = '';
  private reader = new BrowserMultiFormatReader();
  private scanning = false;

  constructor(private router: Router, private api: ApiService) {}

  ngAfterViewInit() { this.startCamera(); }

  setMode(m: 'camera' | 'manual') {
    this.mode.set(m);
    this.error.set('');
    if (m === 'camera') setTimeout(() => this.startCamera(), 100);
    else this.stopCamera();
  }

  startCamera() {
    this.cameraError.set('');
    this.scanning = true;
    BrowserMultiFormatReader.listVideoInputDevices().then(devices => {
      if (!devices.length) { this.cameraError.set('לא נמצאה מצלמה'); return; }
      this.reader.decodeFromVideoDevice(undefined, this.videoEl.nativeElement, (result) => {
        if (result && this.scanning) {
          this.scanning = false;
          this.navigate(result.getText());
        }
      });
    }).catch(() => this.cameraError.set('לא ניתן לגשת למצלמה'));
  }

  stopCamera() {
    this.scanning = false;
    BrowserMultiFormatReader.releaseAllStreams();
  }

  searchManual() {
    if (!this.manualBarcode.trim()) return;
    this.navigate(this.manualBarcode.trim());
  }

  navigate(barcode: string) {
    this.api.getEquipmentByBarcode(barcode).subscribe({
      next: (item) => this.router.navigate(['/equipment', item.id]),
      error: () => this.error.set(`ברקוד "${barcode}" לא נמצא במערכת`)
    });
  }

  ngOnDestroy() { this.stopCamera(); }
}

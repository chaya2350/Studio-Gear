import { Injectable } from '@angular/core';

/**
 * BeepService — Web Audio API tones for barcode scan feedback.
 * No audio files required. AudioContext is created lazily on first use
 * (browser policy: AudioContext must be created after a user gesture).
 */
@Injectable({ providedIn: 'root' })
export class BeepService {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  /** Short high-pitch double-pip — successful scan */
  success(): void {
    this.play([
      { freq: 1046, dur: 0.07, start: 0.0  },  // C6
      { freq: 1318, dur: 0.10, start: 0.08 },  // E6
    ], 0.18);
  }

  /** Low double-beep — scan failed / not found */
  error(): void {
    this.play([
      { freq: 300, dur: 0.12, start: 0.0  },
      { freq: 250, dur: 0.14, start: 0.14 },
    ], 0.22);
  }

  private play(
    notes: { freq: number; dur: number; start: number }[],
    gain: number,
  ): void {
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        env.gain.setValueAtTime(0, now + note.start);
        env.gain.linearRampToValueAtTime(gain, now + note.start + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

        osc.connect(env);
        env.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.01);
      }
    } catch {
      // AudioContext not available (SSR or policy block) — silently ignore
    }
  }
}

import { Injectable, signal } from '@angular/core';

interface RequestProgress {
  loaded: number;
  total?: number;
}

@Injectable({ providedIn: 'root' })
export class LoadingService {
  readonly visible = signal(false);
  readonly progress = signal<number | null>(null);

  private readonly requests = new Map<number, RequestProgress>();
  private nextRequestId = 0;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  startRequest(): number {
    const id = this.nextRequestId++;
    this.requests.set(id, { loaded: 0 });

    if (this.requests.size === 1 && !this.visible()) {
      this.showTimer = setTimeout(() => {
        this.showTimer = null;
        if (this.requests.size > 0) this.visible.set(true);
      }, 1000);
    }

    this.updateProgress();
    return id;
  }

  updateRequest(id: number, loaded: number, total?: number): void {
    const request = this.requests.get(id);
    if (!request) return;

    request.loaded = loaded;
    request.total = total;
    this.updateProgress();
  }

  finishRequest(id: number): void {
    this.requests.delete(id);

    if (this.requests.size === 0) {
      if (this.showTimer) clearTimeout(this.showTimer);
      this.showTimer = null;
      this.visible.set(false);
      this.progress.set(null);
      return;
    }

    this.updateProgress();
  }

  private updateProgress(): void {
    const active = [...this.requests.values()];
    if (!active.length || active.some(request => !request.total || request.total <= 0)) {
      this.progress.set(null);
      return;
    }

    const loaded = active.reduce((sum, request) => sum + request.loaded, 0);
    const total = active.reduce((sum, request) => sum + request.total!, 0);
    this.progress.set(Math.min(100, Math.round((loaded / total) * 100)));
  }
}

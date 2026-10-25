import { HttpClient } from '@angular/common/http';
import { Injectable, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';

export type NotificationSeverity = 'danger' | 'warning' | 'info';
export type NotificationType = 'overdue' | 'exam' | 'pages' | 'messages' | 'tasks' | 'requirements';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  icon: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
  /** set locally once the user opens the drawer */
  read?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  readonly all = signal<AppNotification[]>([]);
  /** IDs dismissed in this session (stored in memory + localStorage) */
  private dismissed = new Set<string>(this.loadDismissed());

  readonly unread = computed(() =>
    this.all().filter(n => !n.read && !this.dismissed.has(n.id)).length
  );

  readonly visible = computed(() =>
    this.all().filter(n => !this.dismissed.has(n.id))
  );

  constructor(private http: HttpClient) {}

  refresh(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>('/api/notifications').pipe(
      tap(list => this.all.set(list)),
      catchError(() => of([] as AppNotification[])),
    );
  }

  /** Mark all currently-visible notifications as "read" (seen in drawer) */
  markAllRead() {
    this.all.update(list => list.map(n => ({ ...n, read: true })));
  }

  dismiss(id: string) {
    this.dismissed.add(id);
    this.saveDismissed();
    // Trigger reactivity by re-setting the same list
    this.all.update(list => [...list]);
  }

  dismissAll() {
    for (const n of this.all()) this.dismissed.add(n.id);
    this.saveDismissed();
    this.all.update(list => [...list]);
  }

  private loadDismissed(): string[] {
    try {
      return JSON.parse(localStorage.getItem('notif_dismissed') ?? '[]');
    } catch {
      return [];
    }
  }

  private saveDismissed() {
    // Keep only IDs still present to avoid unbounded growth
    const currentIds = new Set(this.all().map(n => n.id));
    const toSave = [...this.dismissed].filter(id => currentIds.has(id));
    try { localStorage.setItem('notif_dismissed', JSON.stringify(toSave)); } catch {}
  }
}

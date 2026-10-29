import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface Favorite { item_type: 'student' | 'equipment'; item_id: string; created_at: string; }
export interface StaffNote { id: number; item_type: 'student' | 'equipment'; item_id: string; body: string; created_at: string; author_name: string; }
export interface ActivityItem { id: number; action: string; item_type: string; item_id: string; details: string; created_at: string; user_name: string | null; }

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  readonly favorites = signal<Favorite[]>([]);
  constructor(private http: HttpClient) { }

  loadFavorites(): Observable<Favorite[]> {
    return this.http.get<Favorite[]>('/api/favorites').pipe(tap(items => this.favorites.set(items)));
  }
  isFavorite(type: Favorite['item_type'], id: string | number): boolean {
    return this.favorites().some(item => item.item_type === type && item.item_id === String(id));
  }
  toggleFavorite(type: Favorite['item_type'], id: string | number): Observable<unknown> {
    const itemId = String(id);
    if (this.isFavorite(type, itemId)) {
      return this.http.delete(`/api/favorites/${type}/${encodeURIComponent(itemId)}`).pipe(
        tap(() => this.favorites.update(list => list.filter(item => !(item.item_type === type && item.item_id === itemId)))));
    }
    return this.http.post('/api/favorites', { item_type: type, item_id: itemId }).pipe(
      tap(() => this.favorites.update(list => [{ item_type: type, item_id: itemId, created_at: new Date().toISOString() }, ...list])));
  }
  getNotes(type: 'student' | 'equipment', id: string | number) {
    return this.http.get<StaffNote[]>('/api/notes', { params: { item_type: type, item_id: String(id) } });
  }
  addNote(type: 'student' | 'equipment', id: string | number, body: string) {
    return this.http.post<{ id: number }>('/api/notes', { item_type: type, item_id: String(id), body });
  }
  getActivity() { return this.http.get<ActivityItem[]>('/api/activity'); }
}

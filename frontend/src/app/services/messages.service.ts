import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface MessageUser {
  id: number;
  name: string;
  role: string;
}

export interface MessageReaction {
  message_id: number;
  user_id: number;
  emoji: string;
  user_name: string;
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  sender_name: string;
  recipient_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
  reactions: MessageReaction[];
}

@Injectable({ providedIn: 'root' })
export class MessagesService {
  readonly unreadCount = signal(0);

  constructor(private http: HttpClient) {}

  getUsers(): Observable<MessageUser[]> {
    return this.http.get<MessageUser[]>('/api/messages/users');
  }

  getMessages(): Observable<DirectMessage[]> {
    return this.http.get<DirectMessage[]>('/api/messages');
  }

  refreshUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>('/api/messages/unread-count')
      .pipe(tap(({ count }) => this.unreadCount.set(count)));
  }

  sendMessage(recipient_id: number, body: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>('/api/messages', { recipient_id, body });
  }

  toggleReaction(messageId: number, emoji: string): Observable<{ added: boolean }> {
    return this.http.post<{ added: boolean }>(`/api/messages/${messageId}/reactions`, { emoji });
  }
}

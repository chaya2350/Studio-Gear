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
  edited_at: string | null;
  read_at: string | null;
  reactions: MessageReaction[];
  group_id: string | null;
}

export interface PersonalTask {
  id: number;
  user_id: number;
  source_message_id: number | null;
  title: string;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  visibility: 'private' | 'public' | 'shared';
  creator_name?: string;
  shared_with?: { id: number; name: string }[];
}

@Injectable({ providedIn: 'root' })
export class MessagesService {
  readonly unreadCount = signal(0);

  constructor(private http: HttpClient) {}

  getUsers(): Observable<MessageUser[]> {
    return this.http.get<MessageUser[]>('/api/messages/users');
  }

  getMessages(markRead = false): Observable<DirectMessage[]> {
    const url = markRead ? '/api/messages?markRead=1' : '/api/messages';
    return this.http.get<DirectMessage[]>(url);
  }

  refreshUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>('/api/messages/unread-count')
      .pipe(tap(({ count }) => this.unreadCount.set(count)));
  }

  sendMessage(recipient_ids: number[], body: string): Observable<{ id: number; ids: number[] }> {
    return this.http.post<{ id: number; ids: number[] }>('/api/messages', { recipient_ids, body });
  }

  editMessage(messageId: number, body: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`/api/messages/${messageId}`, { body });
  }

  toggleReaction(messageId: number, emoji: string): Observable<{ added: boolean }> {
    return this.http.post<{ added: boolean }>(`/api/messages/${messageId}/reactions`, { emoji });
  }

  getTasks(): Observable<PersonalTask[]> {
    return this.http.get<PersonalTask[]>('/api/tasks');
  }

  addMessageToTasks(messageId: number, due_date: string): Observable<PersonalTask> {
    return this.http.post<PersonalTask>(`/api/messages/${messageId}/tasks`, { due_date });
  }

  setTaskCompleted(taskId: number, completed: boolean): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`/api/tasks/${taskId}/completion`, { completed });
  }

  createTask(title: string, due_date: string, visibility: 'private' | 'public' | 'shared', shared_user_ids?: number[]): Observable<PersonalTask> {
    return this.http.post<PersonalTask>('/api/tasks', { title, due_date, visibility, shared_user_ids });
  }

  rescheduleTask(taskId: number, due_date: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`/api/tasks/${taskId}/due-date`, { due_date });
  }

  getGroupRecipients(groupId: string): Observable<{id: number; name: string}[]> {
    return this.http.get<{id: number; name: string}[]>(`/api/messages/group/${encodeURIComponent(groupId)}/recipients`);
  }

  deleteTask(taskId: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/tasks/${taskId}`);
  }
}

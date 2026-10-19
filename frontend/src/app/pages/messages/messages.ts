import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { DirectMessage, MessageUser, MessagesService } from '../../services/messages.service';

type MessageView = 'inbox' | 'sent' | 'all';

@Component({
  selector: 'app-messages',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>💬 הודעות</h1>
        <p class="subtitle">הודעות פרטיות בין משתמשות המערכת</p>
      </div>
      <button class="btn btn-secondary" type="button" (click)="loadMessages()">🔄 רענון</button>
    </div>

    <div class="messages-layout">
      <section class="card compose-card">
        <div class="section-title">✉️ הודעה חדשה</div>
        <div *ngIf="usersError" class="alert alert-error" role="alert">
          {{ usersError }}
          <button type="button" class="retry-button" (click)="loadUsers()">נסי שוב</button>
        </div>
        <label for="recipient">אל</label>
        <select id="recipient" [(ngModel)]="recipientId" (ngModelChange)="selectRecipient($event)"
          [disabled]="usersLoading || !users.length">
          <option [ngValue]="null">{{ usersLoading ? 'טוענת משתמשות…' : users.length ? 'בחרי משתמשת רשומה' : 'אין משתמשות פעילות אחרות' }}</option>
          <option *ngFor="let user of users" [ngValue]="user.id">{{ user.name }}</option>
        </select>
        <div *ngIf="replyToName" class="reply-hint">
          משיבה ל{{ replyToName }}
          <button type="button" (click)="replyToName = ''" aria-label="ביטול תשובה">✕</button>
        </div>
        <label for="message-body">תוכן ההודעה</label>
        <textarea id="message-body" [(ngModel)]="body" rows="5" maxlength="4000"
          placeholder="כתבי הודעה..."></textarea>
        <div class="compose-footer">
          <small>{{ body.length }}/4000</small>
          <button class="btn btn-primary" type="button" [disabled]="sending || usersLoading || !recipientId || !body.trim()"
            (click)="send()">{{ sending ? 'שולחת…' : 'שליחת הודעה 📩' }}</button>
        </div>
        <div *ngIf="sendError" class="alert alert-error" role="alert">{{ sendError }}</div>
        <div *ngIf="sendSuccess" class="success-message" role="status" aria-live="polite">
          <span class="success-icon" aria-hidden="true">✓</span>
          <span>{{ sendSuccess }}</span>
        </div>
      </section>

      <section class="card inbox-card">
        <div class="section-title">📬 רצף הודעות</div>
        <nav class="conversation-tabs" aria-label="שיחות עם משתמשות">
          <button type="button" [class.active]="selectedConversationId === null"
            (click)="selectConversation(null)">כל השיחות</button>
          <button *ngFor="let contact of conversationUsers()" type="button"
            [class.active]="selectedConversationId === contact.id"
            (click)="selectConversation(contact.id)">
            {{ contact.name }}
          </button>
        </nav>
        <div class="message-filters" role="group" aria-label="סינון הודעות">
          <button type="button" [class.active]="view === 'inbox'" (click)="view = 'inbox'">התקבלו</button>
          <button type="button" [class.active]="view === 'sent'" (click)="view = 'sent'">נשלחו</button>
          <button type="button" [class.active]="view === 'all'" (click)="view = 'all'">רצף השיחה</button>
        </div>
        <div *ngIf="messagesError" class="alert alert-error" role="alert">{{ messagesError }}</div>
        <div *ngIf="loading" class="empty-state">טוענת הודעות…</div>
        <div *ngIf="!loading && !visibleMessages().length" class="empty-state">
          <div class="empty-icon">📭</div>
          <p>אין הודעות להצגה</p>
        </div>

        <article *ngFor="let message of visibleMessages()" class="message-row"
          [class.sent]="message.sender_id === auth.user()?.id"
          [class.received]="message.recipient_id === auth.user()?.id">
          <div class="message-bubble">
            <div class="message-heading">
              <div>
                <strong>{{ message.sender_id === auth.user()?.id ? 'את ל־' + message.recipient_name : 'מאת ' + message.sender_name }}</strong>
                <span>{{ message.created_at | date:'dd/MM/yyyy HH:mm' }}</span>
              </div>
              <button class="reply-button" type="button" (click)="reply(message)">השיבי ↩</button>
            </div>
            <p class="message-body">{{ message.body }}</p>
            <div class="message-actions">
              <div class="reaction-list" *ngIf="message.reactions.length">
                <button *ngFor="let group of reactionGroups(message)" type="button"
                  [class.mine]="group.mine" [title]="group.names"
                  (click)="toggleReaction(message, group.emoji)">
                  {{ group.emoji }} {{ group.count }}
                </button>
              </div>
              <div class="emoji-control">
                <button class="emoji-toggle" type="button" (click)="toggleEmojiPicker(message.id)"
                  [attr.aria-expanded]="emojiPickerMessageId === message.id"
                  [attr.aria-label]="emojiPickerMessageId === message.id ? 'סגירת בחירת אימוג׳י' : 'הוספת תגובת אימוג׳י'">
                  {{ emojiPickerMessageId === message.id ? '×' : '😊' }}
                </button>
                <div class="emoji-picker" *ngIf="emojiPickerMessageId === message.id" aria-label="בחירת אימוג׳י">
                  <button *ngFor="let emoji of emojis" type="button" (click)="toggleReaction(message, emoji)"
                    [attr.aria-label]="'תגובה ' + emoji" [attr.aria-pressed]="hasReacted(message, emoji)">
                    {{ emoji }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .messages-layout { display: grid; grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr); gap: 20px; align-items: start; }
    .compose-card, .inbox-card { min-width: 0; }
    label { display: block; margin: 14px 0 6px; font-weight: 700; font-size: 0.85rem; }
    select, textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); padding: 10px 12px; font: inherit; }
    textarea { resize: vertical; line-height: 1.7; }
    .compose-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; }
    .compose-footer small { color: var(--text-muted); }
    .reply-hint { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--primary); font-size: 0.85rem; }
    .reply-hint button { border: 0; background: transparent; cursor: pointer; color: inherit; }
    .success-message { display: flex; align-items: center; gap: 9px; margin-top: 14px; padding: 12px 14px; border: 1px solid #a7f3d0; border-radius: var(--radius-sm); background: #ecfdf5; color: #047857; font-weight: 700; }
    .success-icon { display: inline-flex; width: 23px; height: 23px; align-items: center; justify-content: center; border-radius: 50%; background: #10b981; color: white; }
    .retry-button { margin-right: 8px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
    .conversation-tabs { display: flex; gap: 6px; margin-bottom: 12px; padding-bottom: 9px; overflow-x: auto; border-bottom: 1px solid var(--border); }
    .conversation-tabs button { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); color: var(--text-muted); padding: 6px 12px; cursor: pointer; font: inherit; font-size: 0.8rem; white-space: nowrap; }
    .conversation-tabs button.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); font-weight: 700; }
    .message-filters { display: flex; gap: 5px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .message-filters button { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); padding: 3px 9px; cursor: pointer; font: inherit; font-size: 0.72rem; }
    .message-filters button.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); font-weight: 700; }
    .inbox-card { background: var(--surface-2); }
    .message-row { display: flex; margin: 6px 0; }
    .message-row.sent { justify-content: flex-start; }
    .message-row.received { justify-content: flex-end; }
    .message-bubble { width: fit-content; max-width: min(88%, 640px); padding: 8px 11px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-xs); }
    .message-row.sent .message-bubble { border-color: #c7d2fe; border-top-right-radius: 3px; background: var(--primary-light); }
    .message-row.received .message-bubble { border-top-left-radius: 3px; }
    .message-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .message-heading strong, .message-heading span { display: block; }
    .message-heading strong { font-size: 0.78rem; }
    .message-heading span { color: var(--text-muted); font-size: 0.68rem; margin-top: 2px; }
    .reply-button { border: 0; background: transparent; color: var(--primary); cursor: pointer; font: inherit; font-size: 0.8rem; white-space: nowrap; }
    .message-body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; font-size: 0.85rem; margin: 7px 0; }
    .message-actions, .reaction-list { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .reaction-list button { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); cursor: pointer; padding: 3px 8px; font: inherit; }
    .reaction-list button.mine { border-color: var(--primary); background: var(--primary-light); }
    .emoji-control { position: relative; margin-right: auto; }
    .emoji-toggle { width: 27px; height: 27px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--text-muted); cursor: pointer; font-size: 0.9rem; line-height: 1; }
    .emoji-toggle:hover, .emoji-toggle[aria-expanded="true"] { border-color: var(--primary); background: var(--primary-light); color: var(--primary); }
    .emoji-picker { position: absolute; z-index: 5; right: 0; bottom: 32px; display: flex; gap: 3px; padding: 5px 7px; border: 1px solid var(--border); border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); }
    .emoji-picker button { border: 0; border-radius: 50%; background: transparent; cursor: pointer; font-size: 1rem; padding: 3px; line-height: 1; }
    .emoji-picker button:hover { background: var(--primary-light); }
    @media (max-width: 800px) { .messages-layout { grid-template-columns: 1fr; } }
  `]
})
export class MessagesComponent implements OnInit {
  readonly emojis = ['👍', '❤️', '😊', '😂', '🙏', '🎉', '✅', '❓'];
  users: MessageUser[] = [];
  messages: DirectMessage[] = [];
  recipientId: number | null = null;
  body = '';
  view: MessageView = 'all';
  selectedConversationId: number | null = null;
  replyToName = '';
  emojiPickerMessageId: number | null = null;
  loading = false;
  usersLoading = false;
  sending = false;
  usersError = '';
  messagesError = '';
  sendError = '';
  sendSuccess = '';

  constructor(
    public auth: AuthService,
    private messagesApi: MessagesService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadUsers();
    this.loadMessages();
  }

  loadUsers() {
    this.usersLoading = true;
    this.usersError = '';
    this.messagesApi.getUsers().subscribe({
      next: users => {
        this.users = users;
        this.usersLoading = false;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.usersLoading = false;
        this.usersError = error.error?.error || 'לא ניתן לטעון את המשתמשות הרשומות';
        this.changeDetector.markForCheck();
      }
    });
  }

  visibleMessages(): DirectMessage[] {
    const userId = this.auth.user()?.id;
    return this.messages.filter(message => {
      if (this.selectedConversationId !== null &&
        message.sender_id !== this.selectedConversationId &&
        message.recipient_id !== this.selectedConversationId) return false;
      if (this.view === 'inbox') return message.recipient_id === userId;
      if (this.view === 'sent') return message.sender_id === userId;
      return true;
    }).sort((first, second) =>
      second.created_at.localeCompare(first.created_at) || second.id - first.id
    );
  }

  conversationUsers(): MessageUser[] {
    const currentUserId = this.auth.user()?.id;
    const contacts = new Map(this.users.map(user => [user.id, user]));
    for (const message of this.messages) {
      if (message.sender_id !== currentUserId && !contacts.has(message.sender_id)) {
        contacts.set(message.sender_id, {
          id: message.sender_id,
          name: message.sender_name,
          role: ''
        });
      }
      if (message.recipient_id !== currentUserId && !contacts.has(message.recipient_id)) {
        contacts.set(message.recipient_id, {
          id: message.recipient_id,
          name: message.recipient_name,
          role: ''
        });
      }
    }
    return Array.from(contacts.values()).sort((first, second) => first.name.localeCompare(second.name, 'he'));
  }

  selectConversation(userId: number | null) {
    this.selectedConversationId = userId;
    this.emojiPickerMessageId = null;
    const activeContact = this.users.find(user => user.id === userId);
    if (activeContact) {
      this.recipientId = activeContact.id;
      this.replyToName = activeContact.name;
    } else if (userId === null) {
      this.recipientId = null;
      this.replyToName = '';
    } else {
      this.recipientId = null;
      this.replyToName = '';
    }
    this.sendError = '';
    this.sendSuccess = '';
  }

  selectRecipient(userId: number | null) {
    this.selectedConversationId = userId;
    this.replyToName = '';
    this.sendError = '';
    this.sendSuccess = '';
  }

  loadMessages() {
    this.loading = true;
    this.messagesError = '';
    this.messagesApi.getMessages().subscribe({
      next: messages => {
        this.messages = messages;
        this.loading = false;
        this.changeDetector.markForCheck();
        this.messagesApi.refreshUnreadCount().subscribe({
          error: error => console.error('Could not refresh unread message count', error)
        });
      },
      error: error => {
        this.loading = false;
        this.messagesError = error.error?.error || 'לא ניתן לטעון את ההודעות';
        this.changeDetector.markForCheck();
      }
    });
  }

  send() {
    if (!this.recipientId || !this.body.trim() || this.sending) return;
    this.sending = true;
    this.sendError = '';
    this.sendSuccess = '';
    this.messagesApi.sendMessage(this.recipientId, this.body).subscribe({
      next: () => {
        const recipient = this.users.find(user => user.id === this.recipientId);
        const recipientName = recipient?.name || 'המשתמשת שנבחרה';
        this.body = '';
        this.replyToName = '';
        this.sendSuccess = `ההודעה נשלחה בהצלחה אל ${recipientName}`;
        this.sending = false;
        this.changeDetector.markForCheck();
        this.loadMessages();
      },
      error: error => {
        this.sending = false;
        this.sendError = error.error?.error || 'לא ניתן לשלוח את ההודעה';
        this.changeDetector.markForCheck();
      }
    });
  }

  reply(message: DirectMessage) {
    const currentId = this.auth.user()?.id;
    const recipientId = message.sender_id === currentId ? message.recipient_id : message.sender_id;
    const recipient = this.users.find(user => user.id === recipientId);
    if (!recipient) {
      this.sendError = 'המשתמשת אינה פעילה עוד במערכת';
      return;
    }
    this.recipientId = recipient.id;
    this.replyToName = recipient.name;
    this.sendError = '';
    this.sendSuccess = '';
  }

  reactionGroups(message: DirectMessage) {
    const groups = new Map<string, typeof message.reactions>();
    for (const reaction of message.reactions) {
      groups.set(reaction.emoji, [...(groups.get(reaction.emoji) || []), reaction]);
    }
    return Array.from(groups, ([emoji, reactions]) => ({
      emoji,
      count: reactions.length,
      mine: reactions.some(reaction => reaction.user_id === this.auth.user()?.id),
      names: reactions.map(reaction => reaction.user_name).join(', ')
    }));
  }

  hasReacted(message: DirectMessage, emoji: string): boolean {
    return message.reactions.some(reaction =>
      reaction.user_id === this.auth.user()?.id && reaction.emoji === emoji
    );
  }

  toggleEmojiPicker(messageId: number) {
    this.emojiPickerMessageId = this.emojiPickerMessageId === messageId ? null : messageId;
  }

  toggleReaction(message: DirectMessage, emoji: string) {
    this.messagesApi.toggleReaction(message.id, emoji).subscribe({
      next: () => {
        this.emojiPickerMessageId = null;
        this.loadMessages();
      },
      error: error => {
        this.messagesError = error.error?.error || 'לא ניתן לשמור את תגובת האימוג׳י';
        this.changeDetector.markForCheck();
      }
    });
  }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { interval, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { DirectMessage, MessageUser, MessagesService, PersonalTask } from '../../services/messages.service';

type MessageView = 'inbox' | 'sent' | 'all';

@Component({
selector: 'app-messages',
imports: [CommonModule, FormsModule, RouterLink],
template: `
<div class="page-header">
<div>
<h1> הודעות</h1>
<p class="subtitle">הודעות פרטיות בין משתמשות המערכת</p>
</div>
<button class="btn btn-secondary" type="button" (click)="loadMessages()"> רענון</button>
</div>

<div class="messages-layout">
<section class="card compose-card">
<div class="section-title"> הודעה חדשה</div>
<div *ngIf="usersError" class="alert alert-error" role="alert">
{{ usersError }}
<button type="button" class="retry-button" (click)="loadUsers()">נסי שוב</button>
</div>
<fieldset class="recipient-picker" [disabled]="usersLoading || !users.length || sending || loadingReply">
<legend>אל</legend>
<p class="recipient-instructions">סמני את כל מי שצריכה לקבל את ההודעה:</p>
<div *ngIf="usersLoading" class="recipient-empty">טוענת משתמשות…</div>
<div *ngIf="!usersLoading && !users.length && !usersError" class="recipient-empty">אין משתמשות זמינות לבחירה</div>
<div *ngIf="users.length" class="recipient-options">
  <label *ngFor="let user of users" class="recipient-option" [class.checked]="isRecipientSelected(user.id)">
    <input type="checkbox" [checked]="isRecipientSelected(user.id)" (change)="toggleRecipient(user.id)">
    <span>{{ user.name }}</span>
  </label>
</div>
<div class="selected-recipients" aria-live="polite">
  <strong>נבחרו {{ recipientIds.length }} נמענות:</strong>
  <span *ngIf="!recipientIds.length" class="recipient-empty">עדיין לא נבחרו נמענות</span>
  <div *ngIf="recipientIds.length" class="recipient-chips">
    <span *ngFor="let recipient of selectedRecipients()" class="recipient-chip">
      {{ recipient.name }}
      <button type="button" [disabled]="sending || loadingReply"
        [attr.aria-label]="'הסירי את ' + recipient.name"
        (click)="toggleRecipient(recipient.id)">×</button>
    </span>
  </div>
</div>
</fieldset>
<div *ngIf="replyToMessage as original" class="reply-hint">
<div><strong>בתשובה להודעה מאת {{ original.sender_name }}</strong><div class="reply-preview">{{ original.body }}</div></div>
<button type="button" (click)="cancelReply()" [disabled]="sending" aria-label="ביטול תשובה">×</button>
</div>
<label for="message-body">תוכן ההודעה</label>
<textarea id="message-body" [(ngModel)]="body" rows="5" maxlength="4000"
placeholder="כתבי הודעה..."></textarea>
<div class="attachment-picker">
  <div class="attachment-heading">קובץ מצורף <span>רשות</span></div>
  <div class="attachment-controls">
    <label for="message-file" class="attachment-button" [class.disabled]="sending">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5 12 20.4a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.4-8.4"/></svg>
      {{ attachment ? 'החלפת קובץ' : 'בחירת קובץ' }}
    </label>
    <input id="message-file" class="file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
           [disabled]="sending" (change)="selectAttachment($event)">
    <span *ngIf="!attachment" class="attachment-empty">לא נבחר קובץ</span>
  </div>
  <div *ngIf="attachment" class="attachment-selected">
    <span class="attachment-name">📎 {{ attachment.name }}</span>
    <button type="button" class="attachment-remove" [disabled]="sending" (click)="clearAttachment()">הסרה</button>
  </div>
  <small class="attachment-hint">תמונה, PDF, Word, Excel או טקסט · עד 10MB</small>
</div>
<div class="compose-footer">
<small>{{ body.length }}/4000</small>
<button class="btn btn-primary" type="button" [disabled]="sending || loadingReply || usersLoading || !recipientIds.length || !body.trim()"
(click)="send()">{{ sending ? 'שולחת…' : 'שליחת הודעה ' }}</button>
</div>
<div *ngIf="sendError" class="alert alert-error" role="alert">{{ sendError }}</div>
<div *ngIf="sendSuccess" class="success-message" role="status" aria-live="polite">
<span class="success-icon" aria-hidden="true"></span>
<span>{{ sendSuccess }}</span>
</div>
</section>

<section class="card inbox-card">
<div class="section-title"> רצף הודעות</div>
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
<div class="empty-icon"></div>
<p>אין הודעות להצגה</p>
</div>

<article *ngFor="let message of visibleMessages()" class="message-row"
[class.sent]="message.sender_id === auth.user()?.id"
[class.received]="message.recipient_id === auth.user()?.id">
<div class="message-bubble">
<div class="message-heading">
<div>
<strong>{{ message.sender_id === auth.user()?.id
  ? (message.group_id ? 'את ל: ' + message.recipient_name : 'את ל־' + message.recipient_name)
  : 'מאת ' + message.sender_name }}</strong>
<span>{{ message.created_at | date:'dd/MM/yyyy HH:mm' }}{{ message.edited_at ? ' (נערך)' : '' }}</span>
</div>
<div style="display:flex;gap:6px;align-items:center">
<button *ngIf="message.sender_id === auth.user()?.id" class="reply-button" type="button" (click)="startEdit(message)" aria-label="עריכת ההודעה" title="עריכת ההודעה">✏️</button>
<button class="reply-button" type="button" [disabled]="sending || loadingReply" (click)="reply(message)">
  {{ message.group_id ? 'השב לכולם ↩' : 'השיבי ↩' }}
</button>
</div>
</div>
<div *ngIf="message.reply_to_id && message.reply_to_body !== null" class="message-quote">
<strong>בתשובה ל{{ message.reply_to_sender_name }}</strong>
<div class="reply-preview">{{ message.reply_to_body }}</div>
</div>
<ng-container *ngIf="editingMessageId === message.id; else showBody">
<textarea style="width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);padding:8px;font:inherit;resize:vertical;margin:6px 0" [(ngModel)]="editBody" rows="3" maxlength="4000"></textarea>
<div style="display:flex;gap:8px;margin-bottom:4px">
<button class="btn btn-primary" style="padding:4px 12px;font-size:0.8rem" type="button" [disabled]="savingEdit || !editBody.trim()" (click)="saveEdit(message)">{{ savingEdit ? 'שומרת…' : 'שמירה' }}</button>
<button class="btn btn-secondary" style="padding:4px 12px;font-size:0.8rem" type="button" [disabled]="savingEdit" (click)="cancelEdit()">ביטול</button>
</div>
<p *ngIf="editError" class="alert alert-error">{{ editError }}</p>
</ng-container>
<ng-template #showBody><p class="message-body">{{ message.body }}</p></ng-template>
<a *ngIf="message.attachment_name" class="attachment-link" [href]="'/api/messages/' + message.id + '/attachment'">
  📎 הורדת קובץ: {{ message.attachment_name }}
</a>
<div class="message-actions">
<div class="message-task">
<a *ngIf="taskForMessage(message) as task" routerLink="/calendar/personal"
[queryParams]="{ date: task.due_date }" class="task-added">
נשמרה · פתחי ביומן שלי
</a>
<button *ngIf="!taskForMessage(message)" type="button" class="task-add-button"
(click)="startTask(message)">
＋ למשימות שלי
</button>
<form *ngIf="taskDraftMessageId === message.id" class="task-date-form"
(ngSubmit)="addMessageTask(message)">
<label [for]="'task-date-' + message.id">תאריך למשימה</label>
<input [id]="'task-date-' + message.id" type="date" name="taskDueDate"
[(ngModel)]="taskDueDate" required>
<label class="gantt-all-day-toggle"><input type="checkbox" name="taskAllDay" [(ngModel)]="taskAllDay"> כל היום</label>
<ng-container *ngIf="!taskAllDay">
<label [for]="'task-start-' + message.id">משעה</label>
<input [id]="'task-start-' + message.id" type="time" name="taskStartTime"
[(ngModel)]="taskStartTime" required>
<label [for]="'task-end-' + message.id">עד שעה</label>
<input [id]="'task-end-' + message.id" type="time" name="taskEndTime"
[(ngModel)]="taskEndTime" required>
</ng-container>
<button type="submit" [disabled]="savingTask">הוספה</button>
<button type="button" (click)="taskDraftMessageId = null">ביטול</button>
</form>
</div>
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
{{ emojiPickerMessageId === message.id ? '×' : '☺' }}
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
<div *ngIf="taskError" class="alert alert-error task-error" role="alert">{{ taskError }}</div>
`,
styles: [`
.messages-layout { display: grid; grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr); gap: 20px; align-items: start; }
.compose-card, .inbox-card { min-width: 0; }
label { display: block; margin: 14px 0 6px; font-weight: 700; font-size: 0.85rem; }
textarea { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); padding: 10px 12px; font: inherit; }
textarea { resize: vertical; line-height: 1.7; }
.recipient-picker { min-width: 0; margin: 0; padding: 7px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.recipient-picker legend { padding: 0 4px; font-weight: 700; font-size: .8rem; }
.recipient-instructions { margin: 0 0 5px; color: var(--text-muted); font-size: .74rem; }
.recipient-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 4px; max-height: 190px; overflow-y: auto; }
.recipient-option { display: flex; align-items: center; gap: 5px; margin: 0; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-xs); background: var(--surface); cursor: pointer; font-size: .75rem; }
.recipient-option.checked { border-color: var(--primary); background: var(--primary-light); color: var(--primary); }
.recipient-option input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: var(--primary); }
.recipient-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selected-recipients { margin-top: 6px; font-size: .76rem; }
.recipient-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.recipient-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 16px; background: var(--primary-light); color: var(--primary); font-size: .72rem; font-weight: 700; }
.recipient-chip button { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: .9rem; line-height: 1; }
.recipient-chip button:disabled { opacity: .5; cursor: default; }
.recipient-empty { color: var(--text-muted); font-size: .74rem; }
.attachment-picker { margin-top: 16px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
.attachment-heading { font-size: .85rem; font-weight: 700; }
.attachment-heading span { font-size: .75rem; font-weight: 400; color: var(--text-muted); margin-right: 5px; }
.attachment-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 9px; }
.attachment-button { display: inline-flex; align-items: center; gap: 7px; margin: 0; padding: 8px 12px; border: 1px solid var(--primary); border-radius: var(--radius-sm); color: var(--primary); background: var(--surface); cursor: pointer; font-size: .82rem; }
.attachment-button:hover { background: var(--primary-light); }
.attachment-button.disabled { opacity: .5; cursor: default; }
.attachment-button svg { width: 17px; height: 17px; }
.file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.attachment-controls:focus-within .attachment-button { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.attachment-empty, .attachment-hint { color: var(--text-muted); font-size: .78rem; }
.attachment-selected { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; padding: 9px 10px; border-radius: var(--radius-xs); background: var(--surface); font-size: .85rem; }
.attachment-name { min-width: 0; overflow-wrap: anywhere; }
.attachment-remove { flex-shrink: 0; border: 0; background: transparent; color: var(--danger); cursor: pointer; font: inherit; }
.attachment-remove:disabled { opacity: .5; cursor: default; }
.attachment-hint { display: block; margin-top: 8px; }
.attachment-link { display: inline-block; margin: 8px 0; color: var(--primary); overflow-wrap: anywhere; }
.compose-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; }
.compose-footer small { color: var(--text-muted); }
.reply-hint, .message-quote { border-right: 3px solid var(--primary); border-radius: var(--radius-xs); background: var(--primary-light); padding: 8px 10px; font-size: .82rem; }
.reply-hint { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; color: var(--text); }
.reply-hint button { align-self: flex-start; border: 0; background: transparent; cursor: pointer; color: var(--text); font-size: 1.2rem; }
.message-quote { margin-top: 8px; color: var(--text); }
.reply-preview { white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-muted); }
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
.message-task { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.task-add-button, .task-date-form button { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--primary); padding: 4px 9px; cursor: pointer; font: inherit; font-size: 0.72rem; }
.task-added { color: var(--success); font-size: 0.72rem; font-weight: 700; text-decoration: none; }
.task-date-form { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.task-date-form label { margin: 0; font-size: 0.7rem; }
.task-date-form input { max-width: 145px; border: 1px solid var(--border); border-radius: 8px; padding: 4px 6px; font: inherit; font-size: 0.75rem; }
.task-date-form button:disabled { opacity: 0.5; cursor: wait; }
.task-error { margin-top: 12px; }
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
export class MessagesComponent implements OnInit, OnDestroy {
private destroy$ = new Subject<void>();
readonly emojis = ['👍', '❤️', '😊', '😂', '🙏', '🎉', '✅', '❓'];
users: MessageUser[] = [];
messages: DirectMessage[] = [];
recipientIds: number[] = [];
body = '';
attachment: File | null = null;
view: MessageView = 'all';
selectedConversationId: number | null = null;
replyToMessage: DirectMessage | null = null;
loadingReply = false;
private replyRequest?: Subscription;
emojiPickerMessageId: number | null = null;
editingMessageId: number | null = null;
editBody = '';
savingEdit = false;
editError = '';
loading = false;
usersLoading = false;
sending = false;
usersError = '';
messagesError = '';
sendError = '';
sendSuccess = '';
tasks: PersonalTask[] = [];
taskDraftMessageId: number | null = null;
taskDueDate = this.localToday();
taskStartTime = '08:00';
taskEndTime = '09:00';
taskAllDay = false;
savingTask = false;
taskError = '';

constructor(
public auth: AuthService,
private messagesApi: MessagesService,
private changeDetector: ChangeDetectorRef
) {}

ngOnInit() {
this.loadUsers();
this.loadMessages(true);  // בפתיחה — מסמן הכל כנקרא
this.loadTasks();
// רענון אוטומטי כל 30 שניות — בלי לסמן כנקרא
interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadMessages(false));
}

ngOnDestroy() { this.replyRequest?.unsubscribe(); this.destroy$.next(); this.destroy$.complete(); }

private localToday(): string {
const today = new Date();
return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

loadTasks() {
this.messagesApi.getTasks().subscribe({
next: tasks => {
this.tasks = tasks;
this.changeDetector.markForCheck();
},
error: error => {
this.taskError = error.error?.error || 'לא ניתן לטעון את המשימות האישיות';
this.changeDetector.markForCheck();
}
});
}

taskForMessage(message: DirectMessage): PersonalTask | undefined {
return this.tasks.find(task => task.source_message_id === message.id);
}

startTask(message: DirectMessage) {
this.taskDraftMessageId = message.id;
this.taskDueDate = this.localToday();
this.taskStartTime = '08:00';
this.taskEndTime = '09:00';
this.taskAllDay = false;
this.taskError = '';
}

addMessageTask(message: DirectMessage) {
if (!this.taskDueDate || this.savingTask) return;
this.savingTask = true;
this.taskError = '';
this.messagesApi.addMessageToTasks(
message.id,
this.taskDueDate,
this.taskAllDay ? undefined : this.taskStartTime,
this.taskAllDay ? undefined : this.taskEndTime
).subscribe({
next: task => {
this.tasks = [...this.tasks.filter(existing => existing.id !== task.id), task];
this.taskDraftMessageId = null;
this.savingTask = false;
this.changeDetector.markForCheck();
},
error: error => {
this.savingTask = false;
this.taskError = error.error?.error || 'לא ניתן להוסיף את ההודעה למשימות';
this.changeDetector.markForCheck();
}
});
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

// סנן לפי שיחה ותצוגה
const filtered = this.messages.filter(message => {
  if (this.selectedConversationId !== null &&
    message.sender_id !== this.selectedConversationId &&
    message.recipient_id !== this.selectedConversationId) return false;
  if (this.view === 'inbox') return message.recipient_id === userId;
  if (this.view === 'sent') return message.sender_id === userId;
  return true;
});

// מיזוג הודעות קבוצתיות — כשנשלחה ל-N אנשים, להציג רק פעם אחת
const seenGroups = new Set<string>();
const result: DirectMessage[] = [];
for (const msg of filtered) {
  if (msg.group_id && msg.sender_id === userId) {
    if (seenGroups.has(msg.group_id)) continue; // כבר הוספנו אחת מהקבוצה
    seenGroups.add(msg.group_id);
    // בנה שם מרוכב של כל הנמענים בקבוצה
    const groupMessages = this.messages.filter(m => m.group_id === msg.group_id && m.sender_id === userId);
    const recipientNames = [...new Set(groupMessages.map(m => m.recipient_name))].join(', ');
    result.push({ ...msg, recipient_name: recipientNames });
  } else {
    result.push(msg);
  }
}

return result.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
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
this.cancelReply();
this.selectedConversationId = userId;
this.emojiPickerMessageId = null;
const activeContact = this.users.find(user => user.id === userId);
if (activeContact) {
this.recipientIds = [activeContact.id];
} else {
this.recipientIds = [];
}
this.sendError = '';
this.sendSuccess = '';
}

selectRecipient(userId: number | null) {
this.cancelReply();
this.selectedConversationId = userId;
this.sendError = '';
this.sendSuccess = '';
}

isRecipientSelected(userId: number): boolean {
return this.recipientIds.includes(userId);
}

selectedRecipients(): MessageUser[] {
return this.recipientIds
  .map(id => this.users.find(user => user.id === id))
  .filter((user): user is MessageUser => user !== undefined);
}

toggleRecipient(userId: number) {
this.cancelReply();
this.recipientIds = this.isRecipientSelected(userId)
  ? this.recipientIds.filter(id => id !== userId)
  : [...this.recipientIds, userId];
this.sendError = '';
this.sendSuccess = '';
}

loadMessages(markRead = false) {
this.loading = true;
this.messagesError = '';
this.messagesApi.getMessages(markRead).subscribe({
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
if (!this.recipientIds.length || !this.body.trim() || this.sending || this.loadingReply) return;
this.sending = true;
this.sendError = '';
this.sendSuccess = '';
this.messagesApi.sendMessage(this.recipientIds, this.body, this.attachment, this.replyToMessage?.id).subscribe({
next: () => {
const names = this.recipientIds.map(id => this.users.find(u => u.id === id)?.name || '').filter(Boolean).join(', ');
this.body = '';
this.clearAttachment();
this.cancelReply();
this.sendSuccess = `ההודעה נשלחה בהצלחה אל ${names}`;
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

selectAttachment(event: Event) {
const input = event.target as HTMLInputElement;
const file = input.files?.[0] || null;
if (file && file.size > 10 * 1024 * 1024) {
  this.clearAttachment();
  this.sendError = 'גודל הקובץ המרבי הוא 10MB';
  return;
}
this.sendError = '';
this.attachment = file;
}

clearAttachment() {
this.attachment = null;
const input = document.getElementById('message-file');
if (input instanceof HTMLInputElement) input.value = '';
}

reply(message: DirectMessage) {
if (this.sending || this.loadingReply) return;
this.cancelReply();
const currentId = this.auth.user()?.id;
const recipientId = message.sender_id === currentId ? message.recipient_id : message.sender_id;
const recipient = this.users.find(user => user.id === recipientId);
if (!recipient) { this.sendError = 'המשתמשת אינה פעילה עוד במערכת'; return; }

if (message.group_id) {
  this.loadingReply = true;
  this.replyRequest = this.messagesApi.getGroupRecipients(message.group_id).subscribe({
    next: (others) => {
      this.recipientIds = [...new Set([recipient.id, ...others.map(o => o.id).filter(id => this.users.some(user => user.id === id))])];
      this.replyToMessage = message;
      this.loadingReply = false;
      this.sendError = '';
      this.sendSuccess = '';
      this.changeDetector.markForCheck();
    },
    error: error => {
      this.loadingReply = false;
      this.sendError = error.error?.error || 'לא ניתן לטעון את נמענות ההודעה';
      this.changeDetector.markForCheck();
    }
  });
} else {
  this.recipientIds = [recipient.id];
  this.replyToMessage = message;
}
this.sendError = '';
this.sendSuccess = '';
}

cancelReply() {
this.replyRequest?.unsubscribe();
this.loadingReply = false;
this.replyToMessage = null;
}

startEdit(message: DirectMessage) {
if (message.sender_id !== this.auth.user()?.id || this.savingEdit) return;
this.editingMessageId = message.id;
this.editBody = message.body;
this.editError = '';
}

cancelEdit() {
this.editingMessageId = null;
this.editBody = '';
this.editError = '';
}

saveEdit(message: DirectMessage) {
if (message.sender_id !== this.auth.user()?.id || !this.editBody.trim() || this.savingEdit) return;
this.savingEdit = true;
this.editError = '';
this.messagesApi.editMessage(message.id, this.editBody).subscribe({
next: () => { this.editingMessageId = null; this.savingEdit = false; this.loadMessages(); },
error: err => { this.savingEdit = false; this.editError = err.error?.error || 'לא ניתן לערוך'; this.changeDetector.markForCheck(); }
});
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

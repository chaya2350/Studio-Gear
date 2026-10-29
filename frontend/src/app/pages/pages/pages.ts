import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface PageTopic {
  id: number;
  name: string;
  page_count: number;
  pending_requests?: number;
  granted_requests?: number;
}
interface PersonalPage {
  id: number;
  title: string;
  body: string;
  visibility: 'private' | 'public';
  creator_name: string;
  created_at: string;
  can_edit: boolean;
  can_view: boolean;
  pending_requests: number;
  my_request_status?: 'pending' | 'approved' | 'denied';
}
interface AccessRequest {
  id: number;
  user_name: string;
  page_title: string;
  status: 'pending' | 'approved' | 'denied';
}

@Component({
selector: 'app-pages',
imports: [CommonModule, FormsModule],
template: `
<div class="page-header">
<div>
<h1>דפים</h1>
<p class="subtitle">נושאים ודפים — פרטיים או ציבוריים</p>
</div>
<button class="btn btn-primary" (click)="openNewTopic()">נושא חדש</button>
</div>

<!-- חיפוש נושאים -->
<div class="search-bar" style="margin-bottom:16px;">
<span class="search-icon"></span>
<input [(ngModel)]="topicQuery" placeholder="חיפוש נושא..." >
</div>

<div class="topics-grid" *ngIf="!selectedTopic()">
<div *ngFor="let t of filteredTopics()" class="topic-card" (click)="selectTopic(t)">
<div class="topic-info">
<strong>{{ t.name }}</strong>
<span>{{ t.page_count }} דפים</span>
</div>
<span class="topic-badge" *ngIf="(t.pending_requests || 0) + (t.granted_requests || 0) > 0">{{ (t.pending_requests || 0) + (t.granted_requests || 0) }}</span>
</div>
<div *ngIf="!filteredTopics().length" class="empty-state" style="grid-column: 1/-1;">
<p>{{ topicQuery() ? 'לא נמצאו נושאים מתאימים' : 'עדיין אין נושאים. לחצי על "נושא חדש"' }}</p>
</div>
</div>

<!-- נושא נבחר: רשימת דפים -->
<div *ngIf="selectedTopic() as topic">
<div class="topic-header">
<button class="btn btn-ghost back-btn" (click)="backToTopics()">חזרה לנושאים</button>
<div>
<h2>{{ topic.name }}</h2>
<span class="topic-sub">{{ pages().length }} דפים</span>
</div>
<button class="btn btn-primary" style="margin-right:auto;" (click)="openNewPage()">דף חדש</button>
</div>

<!-- בקשות גישה פתוחות לדפים שלי -->
<div class="card requests-card" *ngIf="incomingRequests().length">
<div class="section-title">בקשות גישה ממתינות</div>
<div *ngFor="let r of incomingRequests()" class="request-row">
<span><strong>{{ r.user_name }}</strong> מבקש/ת גישה לדף "{{ r.page_title }}"</span>
<div class="request-actions">
<button class="btn btn-primary" style="padding:5px 12px;" (click)="decideRequest(r.id, 'approved')">אישור</button>
<button class="btn btn-secondary" style="padding:5px 12px;" (click)="decideRequest(r.id, 'denied')">דחייה</button>
</div>
</div>
</div>

<div class="pages-list">
<div *ngFor="let p of pages()" class="page-row" (click)="openPage(p)">
<div class="page-row-info">
<strong>{{ p.title }}</strong>
<span>נוצר ע"י {{ p.creator_name }} · {{ p.created_at.slice(0, 10) }}</span>
</div>
<div class="page-row-badges">
<span class="badge" [class.public-badge]="p.visibility === 'public'" [class.private-badge]="p.visibility === 'private'">
{{ p.visibility === 'public' ? 'ציבורי' : 'פרטי' }}
</span>
<span class="badge locked" *ngIf="!p.can_view && !p.my_request_status">אין גישה</span>
<span class="badge pending-badge" *ngIf="p.my_request_status === 'pending'">בקשה ממתינה</span>
<span class="badge approved-badge" *ngIf="p.my_request_status === 'approved'">קיבלת גישה — פתחי</span>
<span class="badge denied-badge" *ngIf="p.my_request_status === 'denied'">הבקשה נדחתה</span>
<span class="badge pending-badge" *ngIf="p.can_view && p.pending_requests > 0">{{ p.pending_requests }} בקשות</span>
</div>
</div>
<div *ngIf="!pages().length" class="empty-state">
<p>עדיין אין דפים בנושא הזה</p>
</div>
</div>
</div>

<!-- תצוגת דף -->
<div *ngIf="viewingPage() as page" class="modal-backdrop" (click)="closePage()">
<div class="modal card" (click)="$event.stopPropagation()">
<div class="modal-header">
<h3>{{ page.title }}</h3>
<button class="close-btn" (click)="closePage()">סגור</button>
</div>
<div class="page-meta">
<span>נוצר ע"י {{ page.creator_name }}</span>
<span class="badge" [class.public-badge]="page.visibility === 'public'" [class.private-badge]="page.visibility === 'private'">
{{ page.visibility === 'public' ? ' ציבורי' : ' פרטי' }}
</span>
</div>
<div class="page-body">{{ page.body }}</div>
<div class="modal-actions" *ngIf="page.can_edit">
<button class="btn btn-secondary" (click)="editPage(page)">עריכה</button>
<button class="btn btn-danger" (click)="removePage(page)">מחיקה</button>
</div>
<div class="modal-actions" *ngIf="page.can_edit">
<button class="btn btn-ghost" (click)="showRequests(page)">בקשות גישה</button>
</div>
</div>
</div>

<!-- מודל יצירה/עריכה -->
<div *ngIf="editorOpen()" class="modal-backdrop" (click)="editorOpen.set(false)">
<div class="modal card" (click)="$event.stopPropagation()">
<div class="modal-header">
<h3>{{ editingPage() ? 'עריכת דף' : 'דף חדש' }}</h3>
<button class="close-btn" (click)="editorOpen.set(false)">סגור</button>
</div>
<div class="form-group">
<label>כותרת *</label>
<input [(ngModel)]="editor.title" placeholder="כותרת הדף">
</div>
<div class="form-group">
<label>תוכן *</label>
<textarea [(ngModel)]="editor.body" rows="10" placeholder="תוכן הדף..."></textarea>
</div>
<div class="form-group">
<label>מי יוכל לראות את הדף?</label>
<div class="visibility-toggle">
<button [class.active]="editor.visibility === 'private'" (click)="editor.visibility = 'private'"> פרטי — רק אני ומי שאישרתי</button>
<button [class.active]="editor.visibility === 'public'" (click)="editor.visibility = 'public'"> ציבורי — כולם</button>
</div>
</div>
<div class="modal-actions">
<button class="btn btn-primary" [disabled]="saving()" (click)="savePage()">{{ saving() ? 'שומר...' : 'שמור' }}</button>
<button class="btn btn-secondary" (click)="editorOpen.set(false)">ביטול</button>
</div>
</div>
</div>

<!-- מודל נושא חדש -->
<div *ngIf="newTopicOpen()" class="modal-backdrop" (click)="newTopicOpen.set(false)">
<div class="modal card" (click)="$event.stopPropagation()">
<div class="modal-header">
<h3>נושא חדש</h3>
<button class="close-btn" (click)="newTopicOpen.set(false)">סגור</button>
</div>
<div class="form-group">
<label>שם הנושא *</label>
<input [(ngModel)]="newTopicName" (keyup.enter)="saveTopic()" placeholder="לדוגמה: סדנאות, מבחנים, רעיונות...">
</div>
<div class="modal-actions">
<button class="btn btn-primary" (click)="saveTopic()">צרי נושא</button>
<button class="btn btn-secondary" (click)="newTopicOpen.set(false)">ביטול</button>
</div>
</div>
</div>

<!-- מודל בקשות גישה לדף -->
<div *ngIf="requestsPage()" class="modal-backdrop" (click)="requestsPage.set(null)">
<div class="modal card" (click)="$event.stopPropagation()">
<div class="modal-header">
<h3>בקשות גישה — {{ requestsPage()?.title }}</h3>
<button class="close-btn" (click)="requestsPage.set(null)">סגור</button>
</div>
<div *ngFor="let r of pageRequests()" class="request-row">
<span><strong>{{ r.user_name }}</strong> — {{ statusLabel(r.status) }}</span>
<div class="request-actions" *ngIf="r.status === 'pending'">
<button class="btn btn-primary" style="padding:5px 12px;" (click)="decideRequest(r.id, 'approved', requestsPage()?.id)">אישור</button>
<button class="btn btn-secondary" style="padding:5px 12px;" (click)="decideRequest(r.id, 'denied', requestsPage()?.id)">דחייה</button>
</div>
</div>
<p *ngIf="!pageRequests().length" class="hint">אין בקשות עדיין</p>
</div>
</div>

<p *ngIf="message()" class="hint" style="color:var(--primary); font-weight:600;">{{ message() }}</p>
<p *ngIf="error()" class="hint" style="color:var(--danger); font-weight:600;">{{ error() }}</p>
`,
styles: [`
.topics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.topic-card {
display: flex; align-items: center; gap: 12px; padding: 16px 18px;
border: 1.5px solid var(--border); border-radius: var(--radius-sm);
cursor: pointer; transition: all var(--transition); background: var(--surface);
&:hover { border-color: var(--primary); background: var(--primary-light); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
}
.topic-icon { font-size: 1.8rem; position: relative; }
.card-badge {
position: absolute; top: -6px; left: -8px;
background: var(--danger); color: white; border-radius: 50%;
min-width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
font-size: 0.66rem; font-weight: 800; padding: 0 4px;
animation: badge-pulse 1.5s ease infinite;
}
@keyframes badge-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.topic-info { display: flex; flex-direction: column; gap: 2px;
strong { font-size: 1rem; } span { font-size: 0.78rem; color: var(--text-muted); } }

.topic-header { display: flex; align-items: center; gap: 12px; margin: 10px 0 16px;
h2 { margin: 0; font-size: 1.25rem; } .topic-sub { font-size: 0.8rem; color: var(--text-muted); } }
.back-btn { font-size: 1.2rem; }

.pages-list { display: flex; flex-direction: column; gap: 8px; }
.page-row {
display: flex; align-items: center; justify-content: space-between; gap: 12px;
padding: 14px 16px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
cursor: pointer; transition: all var(--transition); background: var(--surface);
&:hover { border-color: var(--primary); background: var(--primary-light); }
}
.page-row-info { flex: 1; strong { display: block; font-size: 0.95rem; } span { font-size: 0.75rem; color: var(--text-muted); } }
.page-row-badges { display: flex; gap: 6px; align-items: center; }
.badge { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.public-badge { background: #e6faf4; color: #059669; }
.private-badge { background: #fef3e2; color: #d97706; }
.pending-badge { background: var(--primary-light); color: var(--primary); }
.approved-badge { background: #e6faf4; color: #059669; }
.denied-badge { background: #fde8e8; color: #b91c1c; }
.badge.locked { background: var(--surface-2); color: var(--text-muted); }

.requests-card { margin-bottom: 16px; }
.request-row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;
&:last-child { border-bottom: none; } }
.request-actions { display: flex; gap: 6px; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 600;
display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal { width: 100%; max-width: 560px; max-height: 85vh; overflow-y: auto; padding: 20px 24px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
h3 { margin: 0; font-size: 1.15rem; } }
.close-btn { border: none; background: transparent; font-size: 1.1rem; cursor: pointer; color: var(--text-muted);
&:hover { color: var(--text); } }
.page-meta { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px; }
.page-body { white-space: pre-wrap; line-height: 1.7; font-size: 0.92rem; padding: 14px;
background: var(--surface-2); border-radius: var(--radius-sm); margin-bottom: 14px; }
.modal-actions { display: flex; gap: 8px; margin-top: 14px; }
.form-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px;
label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
input, textarea { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
font: inherit; background: var(--surface); resize: vertical; } }
.visibility-toggle { display: flex; gap: 6px;
button { flex: 1; padding: 10px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
background: var(--surface); font: inherit; font-size: 0.83rem; font-weight: 600; cursor: pointer;
&.active { border-color: var(--primary); color: var(--primary); background: var(--primary-light); } } }
.hint { font-size: 0.82rem; margin-top: 10px; }
`]
  })

export class PagesComponent implements OnInit {
  topics = signal<PageTopic[]>([]);
  selectedTopic = signal<PageTopic | null>(null);
  pages = signal<PersonalPage[]>([]);
  incomingRequests = signal<AccessRequest[]>([]);
  pageRequests = signal<(AccessRequest & { user_id: number })[]>([]);
requestsPage = signal<any | null>(null);
viewingPage = signal<any | null>(null);
topicQuery = signal('');

filteredTopics = computed(() => {
const q = this.topicQuery().trim().toLowerCase();
if (!q) return this.topics();
return this.topics().filter(t => t.name.toLowerCase().includes(q));
});

newTopicOpen = signal(false);
newTopicName = '';
editorOpen = signal(false);
editingPage = signal<any | null>(null);
editor = { title: '', body: '', visibility: 'private' as 'private' | 'public' };
saving = signal(false);
message = signal('');
error = signal('');

constructor(private api: ApiService, private route: ActivatedRoute, public auth: AuthService) { }

ngOnInit() {
this.loadTopics();
this.loadIncomingRequests();
}

loadTopics() {
this.api.getPageTopics().subscribe(t => this.topics.set(t));
}

loadIncomingRequests() {
this.api.getIncomingPageRequests().subscribe(r => this.incomingRequests.set(r));
}

selectTopic(t: any) {
this.selectedTopic.set(t);
this.loadPages(t.id);
}

loadPages(topicId: number) {
this.api.getTopicPages(topicId).subscribe(p => this.pages.set(p));
}

backToTopics() {
this.selectedTopic.set(null);
this.loadTopics();
}

openNewTopic() {
this.newTopicName = '';
this.newTopicOpen.set(true);
}

saveTopic() {
const name = this.newTopicName.trim();
if (!name) return;
this.api.createPageTopic(name).subscribe({
next: () => {
this.newTopicOpen.set(false);
this.loadTopics();
},
error: (e) => this.error.set(e.error?.error || 'יצירת הנושא נכשלה'),
});
}

openNewPage() {
this.editingPage.set(null);
this.editor = { title: '', body: '', visibility: 'private' };
this.editorOpen.set(true);
}

editPage(page: any) {
this.editingPage.set(page);
this.editor = { title: page.title, body: page.body, visibility: page.visibility };
this.editorOpen.set(true);
}

savePage() {
const title = this.editor.title.trim();
if (!title || !this.editor.body.trim()) {
this.error.set('נא למלא כותרת ותוכן');
return;
}
this.saving.set(true);
const topic = this.selectedTopic();
const payload = { title, body: this.editor.body, visibility: this.editor.visibility };
const editing = this.editingPage();
if (editing) {
this.api.updatePage(editing.id, payload).subscribe({
next: () => this.afterSave('הדף עודכן בהצלחה'),
error: (e: any) => this.saveError(e),
});
} else {
this.api.createPage(topic!.id, payload).subscribe({
next: () => this.afterSave('הדף נוצר בהצלחה'),
error: (e: any) => this.saveError(e),
});
}
}

private afterSave(msg: string) {
this.saving.set(false);
this.editorOpen.set(false);
this.message.set(msg);
this.loadPages(this.selectedTopic()!.id);
this.loadTopics(); // עדכון ספירת הדפים על כרטיסי הנושאים
}

private saveError(e: any) {
this.saving.set(false);
this.error.set(e.error?.error || 'השמירה נכשלה');
}

openPage(p: any) {
if (!p.can_view) {
if (confirm(`אין לך הרשאת גישה לדף "${p.title}". לבקש גישה?`)) {
this.api.requestPageAccess(p.id).subscribe({
next: () => this.message.set('הבקשה נשלחה — לחצי על היוצר/ת לאישור'),
error: (e) => this.error.set(e.error?.error || 'שליחת הבקשה נכשלה'),
});
}
return;
}
this.api.getPage(p.id).subscribe(page => this.viewingPage.set(page));
}

closePage() {
this.viewingPage.set(null);
if (this.selectedTopic()) this.loadPages(this.selectedTopic()!.id);
}

removePage(page: any) {
if (!confirm(`למחוק את הדף "${page.title}"?`)) return;
this.api.deletePage(page.id).subscribe(() => {
this.closePage();
this.loadTopics();
});
}

showRequests(page: any) {
this.requestsPage.set(page);
this.api.getPageRequests(page.id).subscribe(r => this.pageRequests.set(r));
}

decideRequest(requestId: number, status: 'approved' | 'denied', pageId?: number) {
this.api.decidePageRequest(requestId, status).subscribe(() => {
if (pageId) {
this.api.getPageRequests(pageId).subscribe(r => this.pageRequests.set(r));
}
this.loadIncomingRequests();
this.loadTopics();
const topic = this.selectedTopic();
if (topic) this.loadPages(topic.id);
});
}

statusLabel(status: string): string {
  return status === 'approved' ? 'אושרה' : status === 'denied' ? 'נדחתה' : 'ממתינה';
}
}

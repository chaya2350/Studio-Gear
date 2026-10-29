import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-reports', imports: [CommonModule],
  template: `<div class="page-header"><div><h1>דוחות</h1><p class="subtitle">הורדת נתוני השאלות לקובץ CSV שנפתח ב-Excel</p></div></div>
  <section class="card report-card"><h2>דוח השאלות והחזרות</h2><p>כולל פרטי ציוד, שואלת, תאריכים וסטטוס החזרה ותשלום.</p><a class="btn btn-primary" href="/api/reports/loans.csv" download>הורדת דוח השאלות</a></section>`,
  styles: [`.report-card{padding:24px;max-width:640px}.report-card p{color:var(--text-muted);margin-bottom:18px}`]
})
export class ReportsComponent { }

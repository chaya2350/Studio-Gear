import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.HomeComponent) },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./pages/approvals/approvals').then((m) => m.ApprovalsComponent),
      },
      {
        path: 'approvals/single',
        loadComponent: () =>
          import('./pages/approvals/single-approval').then((m) => m.SingleApprovalComponent),
      },
      {
        path: 'equipment',
        loadComponent: () =>
          import('./pages/equipment-list/equipment-list').then((m) => m.EquipmentListComponent),
      },
      {
        path: 'equipment/new',
        loadComponent: () =>
          import('./pages/equipment-form/equipment-form').then((m) => m.EquipmentFormComponent),
      },
      {
        path: 'equipment/:id/edit',
        loadComponent: () =>
          import('./pages/equipment-form/equipment-form').then((m) => m.EquipmentFormComponent),
      },
      {
        path: 'equipment/:id',
        loadComponent: () =>
          import('./pages/equipment-detail/equipment-detail').then(
            (m) => m.EquipmentDetailComponent,
          ),
      },
      {
        path: 'scan',
        loadComponent: () => import('./pages/scan/scan').then((m) => m.ScanComponent),
      },
      {
        path: 'loans',
        loadComponent: () => import('./pages/loans/loans').then((m) => m.LoansComponent),
      },
      {
        path: 'calendar',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'equipment' },
          {
            path: 'equipment',
            loadComponent: () => import('./pages/monthly-calendar/monthly-calendar').then((m) => m.MonthlyCalendarComponent),
            data: { view: 'equipment' },
          },
          {
            path: 'personal',
            loadComponent: () => import('./pages/monthly-calendar/monthly-calendar').then((m) => m.MonthlyCalendarComponent),
            data: { view: 'personal' },
          },
          {
            path: 'schedule',
            loadComponent: () => import('./pages/monthly-calendar/monthly-calendar').then((m) => m.MonthlyCalendarComponent),
            data: { view: 'schedule' },
          },
        ],
      },
      { path: 'my-calendar', redirectTo: 'calendar/personal' },
      {
        path: 'messages',
        loadComponent: () => import('./pages/messages/messages').then((m) => m.MessagesComponent),
      },
      {
        path: 'admin',
        loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminComponent),
      },
      { path: 'tracks', redirectTo: 'admin' },
      {
        path: 'checkout',
        loadComponent: () => import('./pages/checkout/checkout').then((m) => m.CheckoutComponent),
      },
      {
        path: 'exams',
        loadComponent: () => import('./pages/exams/exams').then((m) => m.ExamsComponent),
      },
      {
        path: 'database',
        loadComponent: () => import('./pages/database/database').then((m) => m.DatabaseComponent),
      },
      {
        path: 'exams/scan',
        loadComponent: () => import('./pages/exams/exam-scan').then((m) => m.ExamScanComponent),
      },
      {
        path: 'pages',
        loadComponent: () => import('./pages/pages/pages').then((m) => m.PagesComponent),
      },
      {
        path: 'students',
        loadComponent: () =>
          import('./pages/student-search/student-search').then((m) => m.StudentSearchComponent),
      },
      {
        path: 'students/:id',
        loadComponent: () => import('./pages/student/student').then((m) => m.StudentComponent),
      },
      {
        path: 'kiosk',
        loadComponent: () => import('./pages/kiosk/kiosk').then((m) => m.KioskComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

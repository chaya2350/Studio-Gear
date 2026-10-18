import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent) },
      { path: 'approvals', loadComponent: () => import('./pages/approvals/approvals').then(m => m.ApprovalsComponent) },
      { path: 'approvals/single', loadComponent: () => import('./pages/approvals/single-approval').then(m => m.SingleApprovalComponent) },
      { path: 'equipment', loadComponent: () => import('./pages/equipment-list/equipment-list').then(m => m.EquipmentListComponent) },
      { path: 'equipment/new', loadComponent: () => import('./pages/equipment-form/equipment-form').then(m => m.EquipmentFormComponent) },
      { path: 'equipment/:id/edit', loadComponent: () => import('./pages/equipment-form/equipment-form').then(m => m.EquipmentFormComponent) },
      { path: 'equipment/:id', loadComponent: () => import('./pages/equipment-detail/equipment-detail').then(m => m.EquipmentDetailComponent) },
      { path: 'scan', loadComponent: () => import('./pages/scan/scan').then(m => m.ScanComponent) },
      { path: 'loans', loadComponent: () => import('./pages/loans/loans').then(m => m.LoansComponent) },
      { path: 'calendar', loadComponent: () => import('./pages/calendar/calendar').then(m => m.CalendarComponent) },
      { path: 'admin', loadComponent: () => import('./pages/admin/admin').then(m => m.AdminComponent) },
      { path: 'checkout', loadComponent: () => import('./pages/checkout/checkout').then(m => m.CheckoutComponent) },
      { path: 'students', loadComponent: () => import('./pages/student-search/student-search').then(m => m.StudentSearchComponent) },
      { path: 'students/:id', loadComponent: () => import('./pages/student/student').then(m => m.StudentComponent) },
      { path: '**', redirectTo: '' }
    ]
  }
];

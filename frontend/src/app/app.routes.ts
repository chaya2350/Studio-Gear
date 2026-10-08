import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'equipment', pathMatch: 'full' },
  { path: 'equipment', loadComponent: () => import('./pages/equipment-list/equipment-list').then(m => m.EquipmentListComponent) },
  { path: 'equipment/new', loadComponent: () => import('./pages/equipment-form/equipment-form').then(m => m.EquipmentFormComponent) },
  { path: 'equipment/:id/edit', loadComponent: () => import('./pages/equipment-form/equipment-form').then(m => m.EquipmentFormComponent) },
  { path: 'equipment/:id', loadComponent: () => import('./pages/equipment-detail/equipment-detail').then(m => m.EquipmentDetailComponent) },
  { path: 'scan', loadComponent: () => import('./pages/scan/scan').then(m => m.ScanComponent) },
  { path: 'loans', loadComponent: () => import('./pages/loans/loans').then(m => m.LoansComponent) },
  { path: 'categories', loadComponent: () => import('./pages/categories/categories').then(m => m.CategoriesComponent) },
];

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, PermissionAction } from './services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.loadUser();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

  const path = state.url.split(/[?#]/, 1)[0];
  if (path === '/permission-denied') return true;
  const permission = routePermission(path);
  return !permission || auth.hasPermission(permission.feature, permission.action)
    ? true
    : router.createUrlTree(['/permission-denied']);
};

function routePermission(path: string): { feature: string; action: PermissionAction } | null {
  if (path === '/') return null;
  if (path === '/admin') return { feature: 'admin_panel', action: 'view' };
  if (path === '/graduates') return { feature: 'students', action: 'view' };
  if (path === '/checkout') return { feature: 'loans', action: 'create' };
  if (path === '/equipment/new') return { feature: 'equipment', action: 'create' };
  if (/^\/equipment\/[^/]+\/edit$/.test(path)) return { feature: 'equipment', action: 'edit' };
  if (path === '/exams/scan' || /^\/exams\/[^/]+\/edit$/.test(path)) return { feature: 'exams', action: 'edit' };
  if (path.startsWith('/students-table') || path.startsWith('/students')) return { feature: 'students', action: 'view' };
  if (path.startsWith('/teachers')) return { feature: 'teachers', action: 'view' };
  if (path.startsWith('/schedule')) return { feature: 'schedule', action: 'view' };
  if (path.startsWith('/attendance')) return { feature: 'attendance', action: 'view' };
  if (path.startsWith('/approvals')) return { feature: 'approvals', action: 'view' };
  if (path.startsWith('/exams')) return { feature: 'exams', action: 'view' };
  if (path.startsWith('/calendar') || path.startsWith('/my-calendar')) return { feature: 'calendar', action: 'view' };
  if (path.startsWith('/equipment') || path === '/scan' || path === '/kiosk') return { feature: 'equipment', action: 'view' };
  if (path.startsWith('/loans')) return { feature: 'loans', action: 'view' };
  if (path.startsWith('/messages')) return { feature: 'messages', action: 'view' };
  if (path.startsWith('/pages')) return { feature: 'pages', action: 'view' };
  if (path === '/reports') return { feature: 'reports', action: 'view' };
  if (path.startsWith('/database')) return { feature: 'reports', action: 'view' };
  return null;
}

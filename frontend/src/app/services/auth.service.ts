import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, Observable, of, tap, throwError } from 'rxjs';

export type UserRole = string;
export type PermissionAction = 'view' | 'change';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  role_name?: string;
  permissions?: Record<string, Record<PermissionAction, boolean>>;
}

export interface SystemRole {
  role_key: string;
  name: string;
  is_system: number;
}

export interface PermissionFeature {
  key: string;
  label: string;
  description: string;
  supportsChange?: boolean;
}

export interface RolePermissionSet extends SystemRole {
  permissions: Record<string, Record<PermissionAction, boolean>>;
}

export interface PermissionsConfiguration {
  actions: PermissionAction[];
  catalog: PermissionFeature[];
  roles: RolePermissionSet[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  private loadRequest: Promise<AuthUser | null> | null = null;

  constructor(private http: HttpClient) {}

  hasPermission(permission: string, action: PermissionAction = 'view'): boolean {
    const user = this.user();
    return user?.role === 'admin' || user?.permissions?.[permission]?.[action] === true;
  }

  loadPermissions(): Observable<PermissionsConfiguration> {
    return this.http.get<PermissionsConfiguration>('/api/permissions');
  }

  loadUser(): Promise<AuthUser | null> {
    if (this.user()) return Promise.resolve(this.user());
    if (!this.loadRequest) {
      this.loadRequest = firstValueFrom(
        this.http
          .get<AuthUser>('/api/auth/me')
          .pipe(
            catchError((error: HttpErrorResponse) =>
              error.status === 401 ? of(null) : throwError(() => error),
            ),
          ),
      )
        .then((user) => {
          this.user.set(user);
          return user;
        })
        .finally(() => {
          this.loadRequest = null;
        });
    }
    return this.loadRequest;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthUser>('/api/auth/login', { email, password })
      .pipe(tap((user) => this.user.set(user)));
  }

  logout(): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>('/api/auth/logout', {})
      .pipe(tap(() => this.user.set(null)));
  }
}

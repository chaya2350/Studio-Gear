import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, Observable, of, tap, throwError } from 'rxjs';

export type UserRole = 'admin' | 'laborant' | 'secretary';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  private loadRequest: Promise<AuthUser | null> | null = null;

  constructor(private http: HttpClient) {}

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

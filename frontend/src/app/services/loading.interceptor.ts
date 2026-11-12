import { HttpContext, HttpContextToken, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { LoadingService } from './loading.service';

export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

export function backgroundLoadingContext(): HttpContext {
  return new HttpContext().set(SKIP_GLOBAL_LOADING, true);
}

export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(SKIP_GLOBAL_LOADING)) return next(request);

  const loading = inject(LoadingService);
  const requestId = loading.startRequest();

  return next(request.clone({ reportProgress: true })).pipe(
    tap(event => {
      if (event.type === HttpEventType.UploadProgress || event.type === HttpEventType.DownloadProgress) {
        loading.updateRequest(requestId, event.loaded, event.total);
      }
    }),
    finalize(() => loading.finishRequest(requestId)),
  );
};

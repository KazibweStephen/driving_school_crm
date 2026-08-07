import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  let authReq = req;
  if (token) {
    authReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/refresh')) {
        return from(auth.refreshToken()).pipe(
          switchMap((ok) => {
            if (!ok) return throwError(() => error);
            const newToken = auth.getToken();
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            });
            return next(retried);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};

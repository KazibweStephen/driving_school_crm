import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationRefreshService {
  private _refresh$ = new Subject<void>();
  refresh$ = this._refresh$.asObservable();

  trigger() {
    this._refresh$.next();
  }
}

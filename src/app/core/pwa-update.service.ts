import { ApplicationRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, interval } from 'rxjs';
import { filter, first } from 'rxjs/operators';

/**
 * "A new version is ready — reload?" Watches the service worker for a freshly
 * downloaded version, flips `updateReady`, and the App shell shows a banner.
 * `reload()` activates the new version and refreshes.
 *
 * Only active in production builds (the service worker is disabled under
 * `ng serve`), so `isEnabled` short-circuits in dev.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  readonly updateReady = signal(false);

  init(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));

    // Check for a new version once the app stabilizes, then hourly while open.
    const appStable$ = this.appRef.isStable.pipe(first((stable) => stable));
    const everyHour$ = interval(60 * 60 * 1000);
    concat(appStable$, everyHour$).subscribe(() => {
      this.swUpdate.checkForUpdate().catch(() => {
        /* offline / transient — try again next tick */
      });
    });
  }

  async reload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      document.location.reload();
    }
  }
}

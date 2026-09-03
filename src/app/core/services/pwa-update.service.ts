import { Injectable, DestroyRef, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter } from 'rxjs';
import { APP_VERSION } from '../app-version';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly updateAvailable = signal(false);
  readonly isChecking = signal(false);
  readonly currentVersion = APP_VERSION;

  constructor() {
    if (this.swUpdate.isEnabled) {
      // 1. Listen for new PWA version ready events
      const sub = this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        )
        .subscribe(() => {
          this.updateAvailable.set(true);
          this.promptUserToUpdate();
        });

      this.destroyRef.onDestroy(() => sub.unsubscribe());

      // 2. Proactively check for updates on startup & foreground focus
      void this.checkForUpdate(false);

      if (typeof window !== 'undefined') {
        const onFocus = (): void => {
          if (document.visibilityState === 'visible') {
            void this.checkForUpdate(false);
          }
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        this.destroyRef.onDestroy(() => {
          window.removeEventListener('focus', onFocus);
          document.removeEventListener('visibilitychange', onFocus);
        });
      }
    }
  }

  /**
   * Manually or automatically check server for new PWA build.
   */
  async checkForUpdate(manual = true): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      if (manual) {
        const ref = this.snackBar.open(
          `Running v${this.currentVersion}. Reload app now?`,
          'Reload',
          { duration: 5000 },
        );
        ref.onAction().subscribe(() => this.forceReload());
      }
      return;
    }

    this.isChecking.set(true);
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      if (hasUpdate) {
        this.updateAvailable.set(true);
        this.promptUserToUpdate();
      } else if (manual) {
        this.snackBar.open(
          `You're on the latest version (v${this.currentVersion}).`,
          'OK',
          { duration: 3000 },
        );
      }
    } catch (err) {
      console.warn('PWA update check failed:', err);
      if (manual) {
        const ref = this.snackBar.open(
          `Unable to check updates. Reload app?`,
          'Reload',
          { duration: 5000 },
        );
        ref.onAction().subscribe(() => this.forceReload());
      }
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Activates the downloaded PWA version and reloads the browser tab.
   */
  async reloadToUpdate(): Promise<void> {
    if (this.swUpdate.isEnabled) {
      try {
        await this.swUpdate.activateUpdate();
      } catch (err) {
        console.warn('Failed to activate SW update:', err);
      }
    }
    this.forceReload();
  }

  private forceReload(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  private promptUserToUpdate(): void {
    const snack = this.snackBar.open(
      `A new version of rūpa is available!`,
      'Reload Now',
      {
        duration: 15000,
      },
    );

    snack.onAction().subscribe(() => {
      void this.reloadToUpdate();
    });
  }
}

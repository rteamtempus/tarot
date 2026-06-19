import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaUpdateService } from './core/pwa-update.service';
import { ProfileService } from './core/profile.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col px-5">
      <router-outlet />
    </main>

    @if (pwa.updateReady()) {
      <button
        (click)="pwa.reload()"
        class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-screen-sm rounded-2xl bg-gold px-4 py-3 text-center text-sm font-medium text-night shadow-lg"
      >
        A new version is ready — tap to update
      </button>
    }
  `,
})
export class App {
  protected readonly pwa = inject(PwaUpdateService);
  // Ensures the tarot_profiles row exists for the signed-in user (lazy upsert,
  // since the shared DB has no auth.users trigger). Self-starts on auth change.
  private readonly profile = inject(ProfileService);

  constructor() {
    this.pwa.init();
  }
}

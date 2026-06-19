import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { ProfileService } from '../../core/profile.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex min-h-screen flex-col py-12">
      <header class="flex items-baseline justify-between">
        <h1 class="font-display text-4xl font-medium text-gold">Tarot</h1>
        <button (click)="signOut()" class="text-sm text-on-night-soft">sign out</button>
      </header>

      <p class="mt-3 text-on-night-soft">{{ greeting() }}</p>

      <div class="mt-10 rounded-2xl border border-night-soft bg-night-soft/60 p-6">
        <h2 class="font-display text-2xl text-on-night">Foundation ready</h2>
        <p class="mt-2 text-sm leading-relaxed text-on-night-soft">
          Auth, the shared Supabase client, and your profile are wired up. The
          reading view, spreads, and AI synthesis come next — see
          <code>FEATURES.md</code>.
        </p>
      </div>
    </section>
  `,
})
export class Home {
  private readonly supabase = inject(SupabaseService);
  private readonly profile = inject(ProfileService);
  private readonly router = inject(Router);

  protected readonly greeting = computed(() => {
    const name = this.profile.profile()?.display_name;
    return name ? `welcome back, ${name}.` : 'welcome back.';
  });

  protected async signOut(): Promise<void> {
    await this.supabase.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}

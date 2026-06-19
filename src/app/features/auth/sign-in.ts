import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-sign-in',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex min-h-screen flex-col justify-center py-16">
      <h1 class="font-display text-5xl font-medium text-gold">Tarot</h1>
      <p class="mt-2 text-on-night-soft">a quiet mirror for reflection.</p>

      @if (!supabase.isConfigured) {
        <p class="mt-6 rounded-2xl bg-night-soft p-4 text-sm text-on-night-soft">
          Supabase isn't configured yet. Add your project URL and anon key to
          <code>src/environments/environment.development.ts</code>, then reload.
        </p>
      }

      <form class="mt-8 flex flex-col gap-4" (ngSubmit)="submit()">
        <input
          name="email"
          type="email"
          autocomplete="email"
          placeholder="email"
          [(ngModel)]="email"
          class="rounded-2xl border border-night-soft bg-night-soft px-4 py-3 text-on-night outline-none placeholder:text-on-night-soft focus:border-gold"
        />
        <input
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="password"
          [(ngModel)]="password"
          class="rounded-2xl border border-night-soft bg-night-soft px-4 py-3 text-on-night outline-none placeholder:text-on-night-soft focus:border-gold"
        />
        <button
          type="submit"
          [disabled]="busy()"
          class="rounded-2xl bg-gold px-4 py-3 font-medium text-night transition active:scale-[0.99] disabled:opacity-60"
        >
          {{ busy() ? 'one moment…' : 'enter' }}
        </button>
      </form>

      @if (error()) {
        <p class="mt-4 text-sm text-on-night-soft">{{ error() }}</p>
      }
    </section>
  `,
})
export class SignIn {
  protected readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const { error } = await this.supabase.signInWithPassword(
        this.email.trim(),
        this.password,
      );
      if (error) {
        this.error.set(error.message);
        return;
      }
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}

import { effect, inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TarotProfile } from './models';

/**
 * Owns the user's `tarot_profiles` row.
 *
 * The shared database has NO trigger on auth.users (a tarot trigger would
 * collide with / overwrite life-assistant's signup path, and would also miss
 * users who already exist from the other app). So the profile row is created
 * lazily, client-side, the first time we see a session — an idempotent upsert.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService);

  readonly profile = signal<TarotProfile | null>(null);

  private ensuredFor: string | null = null;

  constructor() {
    // React to sign-in: ensure the row exists, then load it.
    effect(() => {
      const session = this.supabase.session();
      const userId = session?.user?.id ?? null;
      if (!userId) {
        this.ensuredFor = null;
        this.profile.set(null);
        return;
      }
      if (this.ensuredFor === userId) return;
      this.ensuredFor = userId;
      void this.ensure(userId);
    });
  }

  private async ensure(userId: string): Promise<void> {
    const meta = this.supabase.session()?.user?.user_metadata as
      | { display_name?: string }
      | undefined;

    // Idempotent: insert on first sight, do nothing on conflict. `ignoreDuplicates`
    // avoids clobbering a profile the user has already customized.
    await this.supabase.client
      .from('tarot_profiles')
      .upsert(
        { id: userId, display_name: meta?.display_name ?? null },
        { onConflict: 'id', ignoreDuplicates: true },
      );

    const { data } = await this.supabase.client
      .from('tarot_profiles')
      .select('id, display_name, use_reversals, default_deck_id, default_set_id, default_spread_id')
      .eq('id', userId)
      .single();

    if (data) this.profile.set(data as TarotProfile);
  }
}

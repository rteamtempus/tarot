# Seed data

Reference / built-in data for the tarot app. All of it lives in the **shared** Supabase project, so
**apply it deliberately — only with Rory's go-ahead** (see `../../CLAUDE.md`).

## Files
- **`build-seed.mjs`** — generator for the deterministic reference data. Run with `npm run seed:build`
  (from the repo root). Emits `0002_seed_reference.sql`. Idempotent (`ON CONFLICT` upserts), safe to
  re-run.
- **`0002_seed_reference.sql`** — GENERATED. Contains:
  - all 78 canonical cards (RWS-78),
  - the built-in **Original (RWS-based)** interpretation set (row only),
  - the built-in **Rider-Waite-Smith** deck + `card_images` path mappings (`rws/<card_id>.png` in the
    `tarot-card-art` bucket),
  - the built-in spreads: **Three-Card**, **Celtic Cross**, **Cross of Kells**,
  - the `tarot_principles` AI scaffolding.

## Still to generate (content, not structure)
- **Interpretation meanings** — the upright/reversed **text + keywords** for all 78 cards in the
  Original set (`tarot_interpretations` rows). This is authored content; generate it as JSON/SQL in a
  later pass and load into `set_id = 22222222-2222-4222-8222-222222222222`.
- **Card art** — upload the public-domain RWS images to the `tarot-card-art` bucket at the paths the
  `card_images` rows expect.

## Applying (when approved)
```
# schema first, then seed (against the linked shared project)
supabase db push                       # runs migrations/0001_tarot_init.sql
psql "$DATABASE_URL" -f supabase/seed/0002_seed_reference.sql
```

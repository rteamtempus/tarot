# Seed data

Built-in / reference data for the tarot app. It ships as **timestamped migrations** (so a single
`supabase db push` applies schema + data), generated from source by `build-seed.mjs`.

> Everything lives in the **shared** life-assistant Supabase project. Apply via `supabase db push`
> deliberately — it writes to the live DB. See [`../../CLAUDE.md`](../../CLAUDE.md) for the
> shared-migration-history rules.

## Generator
- **`build-seed.mjs`** — run with `npm run seed:build` (repo root). Reads the canonical card list
  (hard-coded, RWS-78) and `../../interpretations.json`, and writes two migrations into
  `../migrations/`:
  - **`20260619120100_tarot_seed_reference.sql`** — 78 cards; the built-in **Rider-Waite-Smith**
    deck + `card_images` (paths point at `rws/<original-filename>.png` in the `tarot-card-art`
    bucket, via the `ART_PREFIX` constant); the **Original (RWS-based)** interpretation-set row; the
    built-in spreads (**Three-Card**, **Celtic Cross**, **Cross of Kells**); the `tarot_principles`
    AI scaffolding.
  - **`20260619120200_tarot_seed_interpretations.sql`** — upright/reversed text + keywords for all
    78 cards in the Original set.
  Both are idempotent (`ON CONFLICT` upserts).

## Editing the data
- **Card meanings:** edit `../../interpretations.json`, then `npm run seed:build`. (Its `set_id`/
  `name` fields are ignored — set_id is forced to the Original set; names live on `tarot_cards`.)
- **Cards / deck / spreads / principles:** edit `build-seed.mjs`, then re-run.
- Don't hand-edit the generated `*_seed_*.sql` — regenerate instead.
- ⚠️ Once a migration has been pushed to the remote, changing its file won't re-apply (the CLI
  records it as done). To change already-applied data, add a **new** timestamped migration
  (`supabase migration new tarot_<change>`) — or, pre-first-push, just regenerate.

## Card art
The images are already uploaded to the public `tarot-card-art` bucket under `rws/` (original
filenames). `scripts/upload-art.mjs` can re-upload from `Cards-png/` if ever needed (service-role
key). `CardBacks.png` is in the bucket too (no card row; the app references it directly).

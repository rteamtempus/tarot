-- ============================================================
-- Tarot Reflection App — Supabase / Postgres schema
-- ------------------------------------------------------------
-- SHARED DATABASE: this app piggybacks on the life-assistant
-- Supabase project. To keep the two apps cleanly separated:
--   * every table, type, function and trigger is prefixed `tarot_`
--   * NO trigger is placed on the shared auth.users table
--     (the profile row is lazily upserted client-side on first load,
--      which also covers users who already exist from life-assistant)
--
-- Design notes:
--  * "Card" (canonical) / "Interpretation set" (author text) /
--    "Deck" (art) are three ORTHOGONAL concepts that all join
--    against the canonical card id. Never collapse them.
--  * Shared/built-in content uses the (is_public OR owner_id = uid)
--    pattern. User content is owner-scoped via RLS.
--  * Readings snapshot a few fields (spread_name, position_label,
--    position_index, position_meaning) so historical readings survive
--    later edits to a spread. Live FKs are kept for joins.
--  * Canonical structure is locked to RWS-78 (strict enums + shape check).
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------- Enums (prefixed to avoid collisions in the shared DB) ----------
create type tarot_arcana_type      as enum ('major', 'minor');
create type tarot_suit_type        as enum ('wands', 'cups', 'swords', 'pentacles');
create type tarot_court_type       as enum ('page', 'knight', 'queen', 'king');
create type tarot_orientation_type as enum ('upright', 'reversed');

-- reading_type / analysis_mode / source are text+check (not enums) so they
-- can grow without a type migration — matching the life-assistant convention.

-- ---------- updated_at helper ----------
create or replace function tarot_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. CANONICAL CARDS  (reference data, read-only to clients)
--    Locked to the RWS 78-card structure.
-- ============================================================
create table tarot_cards (
  id            text primary key,          -- 'major_00_fool', 'wands_05', 'cups_queen'
  name          text        not null,
  arcana        tarot_arcana_type not null,
  suit          tarot_suit_type,           -- null for majors
  number        smallint,                  -- 0..21 majors; 1..10 pips; null for courts
  court         tarot_court_type,          -- null unless a court card
  element       text,                      -- 'fire','water','air','earth','spirit'
  core_keywords text[]      not null default '{}',  -- neutral, author-independent
  sort_order    smallint    not null,      -- stable 0..77 ordering of the deck
  created_at    timestamptz not null default now(),

  -- shape integrity for the three card kinds
  constraint tarot_card_shape check (
    (arcana = 'major' and suit is null and court is null and number between 0 and 21)
    or (arcana = 'minor' and suit is not null and court is null and number between 1 and 10)
    or (arcana = 'minor' and suit is not null and court is not null and number is null)
  )
);

-- ============================================================
-- 2. INTERPRETATION SETS  (per-author meaning text)
-- ============================================================
create table tarot_interpretation_sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 'Original (RWS-based)', 'Pollack (imported)'
  author      text,                          -- attribution shown in UI
  description text,
  owner_id    uuid references auth.users(id) on delete cascade,  -- null => built-in
  is_public   boolean not null default false,
  is_builtin  boolean not null default false,
  source_id   uuid references tarot_interpretation_sets(id) on delete set null, -- lineage when cloned
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tarot_sets_updated before update on tarot_interpretation_sets
  for each row execute function tarot_set_updated_at();

create table tarot_interpretations (
  id               uuid primary key default gen_random_uuid(),
  set_id           uuid not null references tarot_interpretation_sets(id) on delete cascade,
  card_id          text not null references tarot_cards(id),
  upright_text     text,
  upright_keywords text[] not null default '{}',   -- the cheap surface the AI theme-search reads
  reversed_text    text,
  reversed_keywords text[] not null default '{}',
  updated_at       timestamptz not null default now(),  -- powers offline cache invalidation
  -- full-text column powers "which cards are about change?" theme search.
  -- keywords are weighted 'A' (primary match target) over the prose 'B'.
  search tsvector generated always as (
    setweight(to_tsvector('english',
      array_to_string(upright_keywords, ' ') || ' ' ||
      array_to_string(reversed_keywords, ' ')), 'A')
    || setweight(to_tsvector('english',
      coalesce(upright_text,'') || ' ' || coalesce(reversed_text,'')), 'B')
  ) stored,
  unique (set_id, card_id)
);
create trigger trg_tarot_interp_updated before update on tarot_interpretations
  for each row execute function tarot_set_updated_at();
create index tarot_interpretations_search_idx on tarot_interpretations using gin (search);

-- ============================================================
-- 3. DECKS  (art only) + per-card images
-- ============================================================
create table tarot_decks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 'Rider-Waite-Smith (1909, public domain)'
  description text,
  owner_id    uuid references auth.users(id) on delete cascade,
  is_public   boolean not null default false,
  is_builtin  boolean not null default false,
  source_id   uuid references tarot_decks(id) on delete set null,  -- lineage when cloned
  created_at  timestamptz not null default now()
);

create table tarot_card_images (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references tarot_decks(id) on delete cascade,
  card_id    text not null references tarot_cards(id),
  image_path text not null,                  -- Storage path (public bucket: tarot-card-art)
  thumb_path text,
  unique (deck_id, card_id)
);

-- ============================================================
-- 4. SPREADS + positions (custom builder lives here)
-- ============================================================
create table tarot_spreads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid references auth.users(id) on delete cascade,
  is_public   boolean not null default false,
  is_builtin  boolean not null default false,
  source_id   uuid references tarot_spreads(id) on delete set null, -- lineage when cloned
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tarot_spreads_updated before update on tarot_spreads
  for each row execute function tarot_set_updated_at();

create table tarot_spread_positions (
  id             uuid primary key default gen_random_uuid(),
  spread_id      uuid not null references tarot_spreads(id) on delete cascade,
  position_index smallint not null,          -- stable id within the spread (1..N)
  label          text not null,              -- 'The Present', 'Crossing', 'Hopes & Fears'
  meaning        text,                       -- what this position signifies (feeds AI)
  reading_order  smallint not null,          -- order positions are read in
  x              numeric  not null default 0,   -- relative canvas coords (0..1 recommended)
  y              numeric  not null default 0,
  rotation_deg   smallint not null default 0,   -- 90 = the sideways "crossing" card
  z_index        smallint not null default 0,   -- layering (crossing card sits on top)
  card_count     smallint not null default 1,   -- multi-card spots (e.g. 2-card placements)
  unique (spread_id, position_index)
);

-- ============================================================
-- 5. READINGS  (an instance: manual / photo / random draw)
-- ============================================================
create table tarot_readings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  spread_id     uuid references tarot_spreads(id)            on delete set null,
  spread_name   text,                         -- snapshot
  deck_id       uuid references tarot_decks(id)              on delete set null,
  set_id        uuid references tarot_interpretation_sets(id) on delete set null,
  reading_type  text not null default 'spread'
                check (reading_type in ('spread','daily','practice')),
  question      text,                         -- "what the reading is for"
  use_reversals boolean not null default true,
  source        text not null default 'manual'
                check (source in ('manual','photo','draw')),
  created_at    timestamptz not null default now()
);

create table tarot_reading_cards (
  id               uuid primary key default gen_random_uuid(),
  reading_id       uuid not null references tarot_readings(id) on delete cascade,
  position_id      uuid references tarot_spread_positions(id) on delete set null,
  position_index   smallint,                    -- snapshot
  position_label   text,                        -- snapshot
  position_meaning text,                        -- snapshot (feeds AI; survives spread edits)
  card_id          text not null references tarot_cards(id),
  orientation      tarot_orientation_type not null default 'upright',
  slot_index       smallint not null default 0, -- 0-based slot within a multi-card position
  draw_order       smallint,                    -- overall sequence to read the cards in
  unique (reading_id, position_id, slot_index)
);

-- ============================================================
-- 6. AI ANALYSIS  (multiple per reading: regenerate / study vs reading)
-- ============================================================
create table tarot_reading_analyses (
  id          uuid primary key default gen_random_uuid(),
  reading_id  uuid not null references tarot_readings(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  mode        text not null default 'reading' check (mode in ('reading','study')),
  model       text,                           -- e.g. 'gemini-2.5-flash'
  input       jsonb,                          -- snapshot of the prompt context (reproducibility)
  summary     text,
  connections jsonb,                          -- structured card-combination notes
  questions   text[] not null default '{}',   -- reflective questions posed back to user
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 7. JOURNALING  (reflection log; reading optional for daily draws)
-- ============================================================
create table tarot_journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  reading_id uuid references tarot_readings(id) on delete set null,
  prompt     text,                            -- AI-posed question, if any
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tarot_journal_updated before update on tarot_journal_entries
  for each row execute function tarot_set_updated_at();

-- ============================================================
-- 8. PROFILES + settings
--    Lazily upserted client-side on first load (no auth.users trigger,
--    so existing life-assistant users are covered too).
-- ============================================================
create table tarot_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  use_reversals     boolean not null default true,
  default_deck_id   uuid references tarot_decks(id)               on delete set null,
  default_set_id    uuid references tarot_interpretation_sets(id) on delete set null,
  default_spread_id uuid references tarot_spreads(id)             on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_tarot_profiles_updated before update on tarot_profiles
  for each row execute function tarot_set_updated_at();

-- ============================================================
-- 9. TAROT PRINCIPLES  (editable scaffolding fed to the AI prompt)
--    Global app-config, seeded/edited via service role. (Add an owner_id
--    + is_public pattern later if per-user overrides are ever wanted —
--    purely additive.)
-- ============================================================
create table tarot_principles (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,   -- 'arcana','suit','court','numerology','reversal','dignity'
  key        text not null,   -- 'major','wands','queen','3','reversed','fire+water'
  title      text,
  body       text not null,   -- the text injected into the synthesis system prompt
  sort_order smallint not null default 0,
  unique (category, key)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table tarot_cards               enable row level security;
alter table tarot_interpretation_sets enable row level security;
alter table tarot_interpretations     enable row level security;
alter table tarot_decks               enable row level security;
alter table tarot_card_images         enable row level security;
alter table tarot_spreads             enable row level security;
alter table tarot_spread_positions    enable row level security;
alter table tarot_readings            enable row level security;
alter table tarot_reading_cards       enable row level security;
alter table tarot_reading_analyses    enable row level security;
alter table tarot_journal_entries     enable row level security;
alter table tarot_profiles            enable row level security;
alter table tarot_principles          enable row level security;

-- ---- Reference data: read-only to all authenticated users ----
create policy "tarot read cards"      on tarot_cards      for select to authenticated using (true);
create policy "tarot read principles" on tarot_principles for select to authenticated using (true);

-- ---- Shared-or-owned parents (sets / decks / spreads) ----
-- SELECT visible if public or owned; writes only by owner.
create policy "tarot sets read"   on tarot_interpretation_sets for select using (is_public or owner_id = auth.uid());
create policy "tarot sets write"  on tarot_interpretation_sets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "tarot decks read"  on tarot_decks for select using (is_public or owner_id = auth.uid());
create policy "tarot decks write" on tarot_decks for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "tarot spreads read"  on tarot_spreads for select using (is_public or owner_id = auth.uid());
create policy "tarot spreads write" on tarot_spreads for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---- Children inherit access from their parent ----
create policy "tarot interp read" on tarot_interpretations for select using (
  exists (select 1 from tarot_interpretation_sets s
          where s.id = tarot_interpretations.set_id and (s.is_public or s.owner_id = auth.uid())));
create policy "tarot interp write" on tarot_interpretations for all using (
  exists (select 1 from tarot_interpretation_sets s
          where s.id = tarot_interpretations.set_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from tarot_interpretation_sets s
          where s.id = tarot_interpretations.set_id and s.owner_id = auth.uid()));

create policy "tarot images read" on tarot_card_images for select using (
  exists (select 1 from tarot_decks d
          where d.id = tarot_card_images.deck_id and (d.is_public or d.owner_id = auth.uid())));
create policy "tarot images write" on tarot_card_images for all using (
  exists (select 1 from tarot_decks d
          where d.id = tarot_card_images.deck_id and d.owner_id = auth.uid()))
  with check (
  exists (select 1 from tarot_decks d
          where d.id = tarot_card_images.deck_id and d.owner_id = auth.uid()));

create policy "tarot positions read" on tarot_spread_positions for select using (
  exists (select 1 from tarot_spreads sp
          where sp.id = tarot_spread_positions.spread_id and (sp.is_public or sp.owner_id = auth.uid())));
create policy "tarot positions write" on tarot_spread_positions for all using (
  exists (select 1 from tarot_spreads sp
          where sp.id = tarot_spread_positions.spread_id and sp.owner_id = auth.uid()))
  with check (
  exists (select 1 from tarot_spreads sp
          where sp.id = tarot_spread_positions.spread_id and sp.owner_id = auth.uid()));

-- ---- Owner-only user content ----
create policy "tarot readings own" on tarot_readings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tarot reading_cards own" on tarot_reading_cards for all using (
  exists (select 1 from tarot_readings r where r.id = tarot_reading_cards.reading_id and r.user_id = auth.uid()))
  with check (
  exists (select 1 from tarot_readings r where r.id = tarot_reading_cards.reading_id and r.user_id = auth.uid()));

create policy "tarot analyses own" on tarot_reading_analyses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tarot journal own" on tarot_journal_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tarot profile own" on tarot_profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- STORAGE
-- ------------------------------------------------------------
-- Create a PUBLIC bucket `tarot-card-art` via the Supabase dashboard.
-- Public buckets are world-readable + CDN-cached (no read policy needed),
-- and writes are restricted to the service role used by seeding/migrations.
-- The bucket name is prefixed to stay clear of life-assistant's `entry-audio`.
-- (When user-uploaded decks arrive, add owner-scoped policies for a private
--  bucket then — additive, no change here.)
-- ============================================================

-- ============================================================
-- Helpful indexes
-- ============================================================
create index idx_tarot_interp_card        on tarot_interpretations (card_id);
create index idx_tarot_images_card        on tarot_card_images (card_id);
create index idx_tarot_positions_spread   on tarot_spread_positions (spread_id, reading_order);
create index idx_tarot_readings_user      on tarot_readings (user_id, created_at desc);
create index idx_tarot_readings_spread    on tarot_readings (spread_id);
create index idx_tarot_reading_cards_rdg  on tarot_reading_cards (reading_id, draw_order);
create index idx_tarot_analyses_reading   on tarot_reading_analyses (reading_id, created_at desc);
create index idx_tarot_analyses_user      on tarot_reading_analyses (user_id);
create index idx_tarot_journal_user       on tarot_journal_entries (user_id, created_at desc);
create index idx_tarot_journal_reading    on tarot_journal_entries (reading_id);

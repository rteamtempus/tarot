# Tarot Reflection App — Feature & Build Spec

A personal, AI-assisted tarot app for **reading, reflection, and learning** — not fortune-telling. The app's job is to remove the friction of flipping between card meanings, surface connections across a spread, and prompt honest self-reflection.

> **Framing matters and shapes the AI prompts:** the user is a deliberate skeptic. Tarot is treated as a structured mirror for reflecting on how one actually feels about a situation. The AI must **raise questions and surface tensions, never predict the future.**

---

## 1. Tech Stack

- **Frontend:** Angular PWA (offline-first), standalone components + signals (same stack as life-assistant).
- **Backend / DB / Auth / Storage:** Supabase. **Shared project with life-assistant** (ref `snlrpqamjzwoksmoxzir`) — all tarot tables/types/functions are `tarot_`-prefixed to stay separate. See `CLAUDE.md` for the hard rules.
- **AI:** **Google Gemini** (`gemini-2.5-flash`), called from a **Supabase Edge Function** — never from the browser (protects the key). Reuses the existing `GEMINI_API_KEY` secret and the life-assistant `_shared/gemini.ts` pattern. Used for reading synthesis, photo card recognition (Gemini multimodal), and theme-search fallback. AI calls are the only part that requires network.
- **Art:** Rider-Waite-Smith (Pamela Colman Smith, 1909) — public domain in the US. Bundled as the single built-in deck. No other decks needed for v1.
- **Schema:** see `schema.sql` (companion file). This doc references its tables. Canonical card structure is locked to **RWS-78**.
- **Hosting:** Vercel.

---

## 2. Core Data Model (summary — full DDL in `schema.sql`)

Three orthogonal concepts, all joined on a **canonical card id** (e.g. `major_00_fool`, `wands_05`, `cups_queen`):

| Concept | Table(s) | What it holds |
|---|---|---|
| **Card** (canonical) | `tarot_cards` | The fixed 78-card structure: arcana, suit, number, court, element, neutral core keywords. Reference data. |
| **Interpretation set** (author) | `tarot_interpretation_sets`, `tarot_interpretations` | Per-author meaning text **and keywords**, upright + reversed, keyed by card. Switchable in settings. |
| **Deck** (art) | `tarot_decks`, `tarot_card_images` | Images keyed by card. RWS bundled. |
| **Spread** | `tarot_spreads`, `tarot_spread_positions` | Layout, position meanings, reading order, rotation, layering, multi-card spots. |
| **Reading** (instance) | `tarot_readings`, `tarot_reading_cards` | A specific reading: which cards, orientations, positions. |
| **AI output** | `tarot_reading_analyses` | Generated summary, connections, reflective questions. Multiple per reading. |
| **Reflection** | `tarot_journal_entries` | The user's written reflections. |
| **Settings** | `tarot_profiles` | Reversals toggle, default deck/set/spread. Upserted client-side on first load (no `auth.users` trigger — the DB is shared). |
| **Scaffolding** | `tarot_principles` | Editable structural knowledge fed into the AI prompt. |

**Reversals are first-class:** every interpretation stores upright + reversed text **and a separate keyword list for each orientation**; every reading card stores an orientation; every random draw flips a coin; "use reversals" is a user setting that also governs draw logic.

**Keywords vs prose — why both:** each interpretation carries short `upright_keywords` / `reversed_keywords` arrays *and* the full upright/reversed prose. **Theme search (and the AI fallback) read the keywords, not the paragraphs** — searching 78 cards × two paragraphs each is expensive and noisy; keywords are the cheap, high-signal surface. The Postgres full-text index weights keywords above prose accordingly.

**Snapshotting:** `tarot_readings` / `tarot_reading_cards` denormalize `spread_name` / `position_label` / `position_index` / `position_meaning` so a saved reading still renders correctly — and can be re-analyzed with its original context — even if the user later edits or deletes that spread. Live FKs are kept for joins. `tarot_reading_analyses.input` also snapshots the exact prompt context for reproducibility.

---

## 3. Features

### 3.1 Card data & canonical IDs
- Seed `tarot_cards` with all 78 cards, stable ids, `sort_order` 0–77, element + core keywords.
- This table is read-only to clients (seeded via service role / migration).

### 3.2 Interpretation sets by author
- Ship **one original, public-domain-safe set** ("Original (RWS-based)", `is_builtin = true`) with upright/reversed text **and keywords** for all 78 cards.
- Users can create their own sets and **import** datasets they own (copyrighted books are the user's responsibility — the app never bundles them).
- **Settings** chooses the active set.
- **Author comparison view:** show 2–3 sets side-by-side for one card. Pure query, no schema change — great for learning that interpretation is a lens, not a fact.

### 3.3 Decks & images (offline)
- Bundle RWS art in a **public** Supabase Storage bucket (`tarot-card-art`); `tarot_card_images` maps deck+card → path. Public bucket = CDN-cached, no auth round-trip.
- Cache images in the PWA so the deck works fully offline.

### 3.4 Spreads + custom spread builder
- Ship built-in spreads (three-card, Celtic Cross, and the **Cross of Kells** below).
- **Custom builder** (drag positions on a canvas). Each position supports:
  - `x` / `y` — relative canvas coordinates.
  - `rotation_deg` — e.g. **90°** for the sideways "crossing" card.
  - `z_index` — **layering** cards on top of each other.
  - `card_count` — **multiple cards in one spot**.
  - `label`, `meaning`, `reading_order`.
- **Multi-card spots are a v1 feature, not a later add** — they're core to how the user reads (see below).

#### Worked example — the user's primary spread: the **Cross of Kells** (extended Celtic Cross)
A 12-position variation (Janet Farrar, 1980s). 16 cards total:
- **Positions 1–6** — standard Celtic Cross center: 1 Significator, 2 What Crosses You (`rotation_deg = 90`, `z_index = 1`, sits on top of 1), 3 Past Influences, 4 Receding Influences, 5 Major Influences, 6 The Immediate Future.
- **Positions 7–10 each hold TWO cards** (`card_count = 2`): 7 How to Move Forward, 8 Dangers & Pitfalls, 9 Home & Family, 10 The Immediate Outcome.
- **Positions 11–12** — single cards to the left: 11 Overall Picture, 12 The Life Card (long-term).

**Why the two-card spots matter (drives the data model & UI):** the paired cards in 7–10 are read **together** for one subject — they may surface two distinct facets, pros vs. cons, or synergize into a more robust read of that theme. So a multi-card position has **one shared `meaning`**; the two cards are distinguished by `slot_index` (0/1) and read as a pair. Build the reading view and the AI prompt to treat a position's cards as a set, not in isolation.

### 3.5 Photo → reading (spread-first)
- **Two separable problems; do not attempt blind detection.**
  1. User **picks the spread first.** This makes recognition a tractable spatial mapping onto *known* positions rather than open-ended layout detection.
  2. Gemini (multimodal) maps detected cards (with orientation) onto those positions.
- Result is rendered as an **editable confirmation list** — card, orientation, position/slot — so any misread is a two-tap fix. This UX is what makes an imperfect vision model feel reliable. Nothing is saved until the user confirms.
- Set `tarot_readings.source = 'photo'`.

### 3.6 Reading view (the core daily-use screen)
- One scrollable page. Cards **grouped by position**, positions ordered by `reading_order`; the multiple cards within a position ordered by `slot_index` and presented as a pair.
- Each entry shows: position label + meaning, card name, orientation, and the active set's upright/reversed text.
- This screen alone solves the original pain point (no more flipping back and forth). Build it early and well.

### 3.7 AI synthesis ("do a reading")
- Inputs: the spread + position meanings, the cards + orientations (grouped by position, pairs flagged), the active interpretation text, the user's `question`, and the `tarot_principles` scaffolding.
- Runs in the Edge Function via Gemini with JSON output (`responseMimeType: application/json` + a response schema).
- Output stored in `tarot_reading_analyses` as `{ summary, connections (jsonb), questions (text[]) }`, plus `model` and the `input` snapshot.
- See **§4** for the system prompt.

### 3.8 Random draw / no-deck mode
- App draws cards for the selected spread (respecting `use_reversals` and `card_count` per position), displays the art, and can generate a reading. `tarot_readings.source = 'draw'`.

### 3.9 Study mode vs reading mode (`tarot_reading_analyses.mode`)
- **Reading mode:** reflective synthesis.
- **Study mode:** annotates the *mechanics* — why this suit/element, this number, this court role, this position, why a reversal shifts the meaning, why a paired position reads the way it does. Turns any reading into a lesson.

### 3.10 Journaling / reflection
- After a reading, AI poses 1–2 open questions (stored in `tarot_reading_analyses.questions`); user writes back into `tarot_journal_entries`.
- Re-reading old entries is the reflective payoff. **Build this right after the core** — it's the feature that gives the app lasting value.

### 3.11 Daily one-card draw
- Low-friction habit hook. `reading_type = 'daily'`. Pairs with journaling.

### 3.12 Theme search ("which cards are about change?")
- **Two-tier, both wired in v1:**
  1. **Postgres FTS** against the `tarot_interpretations.search` tsvector (GIN index) — keywords weighted above prose. Fast, offline-cacheable, free. The default.
  2. **Gemini fallback** (`gemini-2.5-flash`) for fuzzy/conceptual themes FTS misses. The model is given the compact **keyword lists** for the candidate cards (the reading's cards, or the whole deck) — *not* the full paragraphs — so the call stays cheap. Returns the matching card ids + a one-line why.
- Directly serves the not-memorized problem.

### 3.13 Profiles & history
- Supabase auth → a `tarot_profiles` row is **upserted client-side on first load** (no `auth.users` trigger, since the DB is shared with life-assistant and existing users must be covered too).
- History screen: past readings with their cards, analyses, and linked journal entries.
- Settings: `use_reversals`, `default_deck_id`, `default_set_id`, `default_spread_id`.

---

## 4. AI Synthesis — System Prompt Scaffolding

Inject the relevant `tarot_principles` rows, then the reading data. Draft system prompt:

> You are a reflective reading assistant for a tarot practice. Tarot here is a tool for **self-reflection, not prediction**. Never state what *will* happen. Help the user notice patterns, tensions, and questions worth sitting with about the situation they described.
>
> Use this structural knowledge:
> - **Major vs Minor Arcana:** Majors point to larger life themes and forces at play; Minors to everyday, situational texture. A reading heavy in Majors suggests the matter feels significant.
> - **Suits & elements:** Wands = fire (drive, action, will); Cups = water (emotion, relationship); Swords = air (thought, conflict, clarity); Pentacles = earth (work, body, material).
> - **Court cards:** often people, roles, or approaches the user is embodying or encountering (Page = learner/messenger, Knight = active pursuit, Queen = inward mastery, King = outward authority).
> - **Numerology arc:** aces = seed/potential → middle numbers = development & friction → tens = culmination.
> - **Reversals:** read as blocked, internalized, diminished, or in-process expressions of the upright meaning — not simple opposites.
> - **Paired positions:** when a position holds two cards, read them **together** for that subject — they may show two facets, pros vs. cons, or reinforce each other into a stronger read. Do not interpret them in isolation.
> - **Connections / elemental dignities:** note where adjacent cards reinforce or tension each other (e.g. fire + water), and surface combinations rather than reading each card in isolation. **This is the most valuable thing you do.**
>
> For each reading you receive the spread positions and their meanings, the cards with orientation (grouped by position, with pairs flagged), the chosen interpretation text, and the user's stated question.
>
> Respond as JSON only, no preamble or markdown:
> `{ "summary": string, "connections": [{ "cards": [string], "note": string }], "questions": [string] }`
> — `summary`: a reflective synthesis tied to the user's question. `connections`: notable card combinations (including the within-position pairs) and what tension/theme they raise. `questions`: 1–2 open questions to journal on.

In **study mode**, swap the instruction to *explain the mechanics* of why each card lands the way it does, citing the structural rules above.

---

## 5. Offline-First / PWA Notes
- `tarot_cards`, `tarot_interpretation_sets`/`tarot_interpretations`, `tarot_decks`/`tarot_card_images`, and `tarot_spreads`/`tarot_spread_positions` are largely static → cache aggressively for offline reading, drawing, and study. Use `tarot_interpretations.updated_at` for incremental cache invalidation.
- Only synthesis, photo recognition, and AI theme search require network. Degrade gracefully: a reading can be assembled and read fully offline (incl. Postgres-FTS theme search once cached client-side); the AI layer is additive.

---

## 6. Suggested Build Phasing
1. **Foundation:** schema + seed `tarot_cards`, the original interpretation set (text + keywords), RWS deck, built-in spreads (incl. Cross of Kells). Auth + client-side profile upsert.
2. **Core reading view (§3.6):** manual card entry into a chosen spread → grouped, ordered reading page, **with multi-card positions working** (the Cross of Kells pairs). *This is the daily driver — nail it first.*
3. **Custom spread builder (§3.4)** with the Cross of Kells as the test case (rotation, layering, 2-card spots).
4. **AI synthesis (§3.7) + journaling (§3.10).**
5. **Random draw (§3.8)** + daily draw (§3.11).
6. **Photo → reading (§3.5).**
7. **Study mode, author comparison, theme search (§3.9, 3.2, 3.12).**

---

## 7. Resolved Decisions & Remaining Open Items

**Resolved:**
- **Multi-card position meanings:** one shared `meaning` per position; the cards (e.g. the Cross of Kells pairs) are distinguished by `slot_index` and read together. Per-slot sub-meanings are not needed.
- **Multi-card spots:** baked into v1 (core to the user's Cross of Kells).
- **Theme search:** Postgres FTS **and** the Gemini fallback, both from day one. Search targets keywords, not prose.
- **Spread editing vs saved readings:** snapshot approach is sufficient (now incl. `position_meaning`); no full immutable spread versioning.
- **AI provider:** Gemini `gemini-2.5-flash` via Edge Function.

**Still open:**
- **Connections storage:** `tarot_reading_analyses.connections` is `jsonb` — fine to start free-form; tighten the shape once the prompt output stabilizes.
- **Seed dataset:** the full 78-card original interpretation set (upright + reversed + keywords, per orientation) is referenced here but not yet built — generate as seed JSON before/with Phase 1.
- **Per-user `tarot_principles`:** currently global (service-role editable). Adding a per-user override (owner_id + is_public) later is purely additive if wanted.

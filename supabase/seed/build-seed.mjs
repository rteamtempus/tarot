// ============================================================
// build-seed.mjs — generate the deterministic reference seed.
//
//   node supabase/seed/build-seed.mjs   (or: npm run seed:build)
//
// Emits supabase/seed/0002_seed_reference.sql containing:
//   * all 78 canonical cards (RWS-78)
//   * the built-in "Original (RWS-based)" interpretation set (row only —
//     the upright/reversed text + keywords are content, generated separately)
//   * the built-in Rider-Waite-Smith deck + its card_image mappings
//   * the built-in spreads: Three-Card, Celtic Cross, Cross of Kells
//   * the tarot_principles AI scaffolding
//
// The output is idempotent (ON CONFLICT upserts), so it is safe to re-run.
// It does NOT touch the cloud — apply it deliberately (and only with Rory's
// go-ahead, since the DB is shared with life-assistant).
// ============================================================
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '0002_seed_reference.sql');

// Fixed UUIDs so the built-ins keep stable ids across re-runs.
const DECK_RWS = '11111111-1111-4111-8111-111111111111';
const SET_ORIGINAL = '22222222-2222-4222-8222-222222222222';
const SPREAD_THREE = '33333333-3333-4333-8333-333333333333';
const SPREAD_CELTIC = '44444444-4444-4444-8444-444444444444';
const SPREAD_KELLS = '55555555-5555-4555-8555-555555555555';

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `'{${a.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(',')}}'`;
const slug = (s) =>
  s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ---------- 78 canonical cards ----------
const MAJORS = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor',
  'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit',
  'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
  'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World',
];
const SUITS = [
  { suit: 'wands', element: 'fire' },
  { suit: 'cups', element: 'water' },
  { suit: 'swords', element: 'air' },
  { suit: 'pentacles', element: 'earth' },
];
const PIPS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const COURTS = ['page', 'knight', 'queen', 'king'];
const COURT_NUM = { page: 11, knight: 12, queen: 13, king: 14 }; // matches the dumped art naming
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// Folder INSIDE the bucket where the art lives. '' = bucket root. If you dropped
// the files into a subfolder (e.g. 'rws/'), set it here and re-run.
const ART_PREFIX = 'rws/';
// `image_path` must match the art filenames as dumped in the bucket (as-is):
//   majors  -> "NN-PascalName.png"  e.g. "10-WheelOfFortune.png"
//   minors  -> "SuitNN.png"         pips 01-10, courts 11-14  e.g. "Cups13.png"
const majorArt = (i, name) =>
  `${String(i).padStart(2, '0')}-${name.split(' ').map(cap).join('')}.png`;

const cards = [];
let order = 0;
MAJORS.forEach((name, i) => {
  cards.push({
    id: `major_${String(i).padStart(2, '0')}_${slug(name)}`,
    name, arcana: 'major', suit: null, number: i, court: null,
    element: null, sort_order: order++, art: majorArt(i, name),
  });
});
for (const { suit, element } of SUITS) {
  PIPS.forEach((pip, i) => {
    const n = i + 1;
    cards.push({
      id: `${suit}_${String(n).padStart(2, '0')}`,
      name: `${pip} of ${cap(suit)}`, arcana: 'minor', suit, number: n, court: null,
      element, sort_order: order++, art: `${cap(suit)}${String(n).padStart(2, '0')}.png`,
    });
  });
  for (const court of COURTS) {
    cards.push({
      id: `${suit}_${court}`,
      name: `${cap(court)} of ${cap(suit)}`, arcana: 'minor', suit, number: null, court,
      element, sort_order: order++, art: `${cap(suit)}${COURT_NUM[court]}.png`,
    });
  }
}

// ---------- built-in spreads ----------
// position: [index, label, meaning, reading_order, x, y, rotation_deg, z_index, card_count]
const threeCard = [
  [1, 'Past', 'What has led here.', 1, 0.2, 0.5, 0, 0, 1],
  [2, 'Present', 'Where things stand now.', 2, 0.5, 0.5, 0, 0, 1],
  [3, 'Future', 'Where the current path tends.', 3, 0.8, 0.5, 0, 0, 1],
];
const celtic = [
  [1, 'The Significator', 'The heart of the matter / the querent.', 1, 0.32, 0.5, 0, 0, 1],
  [2, 'What Crosses You', 'The opposing or complicating force.', 2, 0.32, 0.5, 90, 1, 1],
  [3, 'Past Influences', 'Recent past feeding the situation.', 3, 0.32, 0.74, 0, 0, 1],
  [4, 'Major Influences', 'What is consciously in mind / above.', 4, 0.32, 0.26, 0, 0, 1],
  [5, 'Receding Influences', 'What is passing away / behind.', 5, 0.14, 0.5, 0, 0, 1],
  [6, 'The Immediate Future', 'What is approaching.', 6, 0.5, 0.5, 0, 0, 1],
  [7, 'Self', 'Your stance / attitude.', 7, 0.78, 0.8, 0, 0, 1],
  [8, 'Environment', 'Others and outside influences.', 8, 0.78, 0.6, 0, 0, 1],
  [9, 'Hopes & Fears', 'What you hope for and dread.', 9, 0.78, 0.4, 0, 0, 1],
  [10, 'The Outcome', 'Where it all tends.', 10, 0.78, 0.2, 0, 0, 1],
];
// Cross of Kells: extended Celtic Cross. Positions 7-10 hold TWO cards each;
// position 2 crosses position 1 (rotated, on top). 16 cards total.
const kells = [
  [1, 'The Significator', 'The heart of the matter / the querent.', 1, 0.30, 0.5, 0, 0, 1],
  [2, 'What Crosses You', 'The opposing or complicating force.', 2, 0.30, 0.5, 90, 1, 1],
  [3, 'Past Influences', 'Recent past feeding the situation.', 3, 0.30, 0.74, 0, 0, 1],
  [4, 'Receding Influences', 'What is passing away.', 4, 0.16, 0.5, 0, 0, 1],
  [5, 'Major Influences', 'The larger forces at play.', 5, 0.30, 0.26, 0, 0, 1],
  [6, 'The Immediate Future', 'What is approaching.', 6, 0.44, 0.5, 0, 0, 1],
  [7, 'How to Move Forward', 'Two cards read together: the way ahead — facets, pros/cons, or synergy.', 7, 0.66, 0.2, 0, 0, 2],
  [8, 'Dangers & Pitfalls', 'Two cards read together: what to watch for.', 8, 0.66, 0.4, 0, 0, 2],
  [9, 'Home & Family', 'Two cards read together: the domestic / relational sphere.', 9, 0.66, 0.6, 0, 0, 2],
  [10, 'The Immediate Outcome', 'Two cards read together: where it tends near-term.', 10, 0.66, 0.8, 0, 0, 2],
  [11, 'Overall Picture', 'The broad shape of the life right now.', 11, 0.04, 0.32, 0, 0, 1],
  [12, 'The Life Card', 'The long-term / life-level outcome.', 12, 0.04, 0.68, 0, 0, 1],
];

// ---------- tarot_principles (AI scaffolding, FEATURES §4) ----------
const principles = [
  ['arcana', 'major', 'Major Arcana', 'Majors point to larger life themes and forces at play. A reading heavy in Majors suggests the matter feels significant.', 1],
  ['arcana', 'minor', 'Minor Arcana', 'Minors speak to everyday, situational texture rather than grand themes.', 2],
  ['suit', 'wands', 'Wands — Fire', 'Drive, action, will, creativity, momentum.', 3],
  ['suit', 'cups', 'Cups — Water', 'Emotion, relationship, intuition, connection.', 4],
  ['suit', 'swords', 'Swords — Air', 'Thought, conflict, clarity, communication.', 5],
  ['suit', 'pentacles', 'Pentacles — Earth', 'Work, body, money, the material and practical.', 6],
  ['court', 'page', 'Page', 'Learner / messenger — new energy, curiosity, a beginning.', 7],
  ['court', 'knight', 'Knight', 'Active pursuit — movement, drive, sometimes excess.', 8],
  ['court', 'queen', 'Queen', 'Inward mastery — holding the suit with depth and care.', 9],
  ['court', 'king', 'King', 'Outward authority — directing the suit in the world.', 10],
  ['numerology', 'arc', 'Numerology Arc', 'Aces = seed/potential; middle numbers = development and friction; tens = culmination.', 11],
  ['reversal', 'reversed', 'Reversals', 'Read as blocked, internalized, diminished, or in-process expressions of the upright meaning — not simple opposites.', 12],
  ['dignity', 'adjacent', 'Connections / Elemental Dignities', 'Note where adjacent cards reinforce or tension each other (e.g. fire + water); surface combinations rather than reading each card alone. This is the most valuable layer.', 13],
];

// ---------- emit SQL ----------
let sql = `-- 0002_seed_reference.sql — GENERATED by supabase/seed/build-seed.mjs. Do not edit by hand.
-- Deterministic RWS-78 reference data + built-in deck/set/spreads/principles.
-- Idempotent (ON CONFLICT upserts). Apply only with Rory's go-ahead (shared cloud DB).

begin;

-- ---- cards ----
insert into tarot_cards (id, name, arcana, suit, number, court, element, sort_order) values
${cards
  .map(
    (c) =>
      `  (${q(c.id)}, ${q(c.name)}, ${q(c.arcana)}, ${q(c.suit)}, ${
        c.number === null ? 'null' : c.number
      }, ${q(c.court)}, ${q(c.element)}, ${c.sort_order})`,
  )
  .join(',\n')}
on conflict (id) do update set
  name = excluded.name, arcana = excluded.arcana, suit = excluded.suit,
  number = excluded.number, court = excluded.court, element = excluded.element,
  sort_order = excluded.sort_order;

-- ---- built-in interpretation set (row only; meanings are generated separately) ----
insert into tarot_interpretation_sets (id, name, author, description, owner_id, is_public, is_builtin)
values (${q(SET_ORIGINAL)}, 'Original (RWS-based)', 'App (public-domain)',
  'A neutral, public-domain-safe interpretation set based on the Rider-Waite-Smith tradition.',
  null, true, true)
on conflict (id) do update set
  name = excluded.name, author = excluded.author, description = excluded.description,
  is_public = excluded.is_public, is_builtin = excluded.is_builtin;

-- ---- built-in RWS deck + card image mappings ----
insert into tarot_decks (id, name, description, owner_id, is_public, is_builtin)
values (${q(DECK_RWS)}, 'Rider-Waite-Smith (1909)',
  'Pamela Colman Smith / A. E. Waite, 1909 — public domain in the US.', null, true, true)
on conflict (id) do update set
  name = excluded.name, description = excluded.description,
  is_public = excluded.is_public, is_builtin = excluded.is_builtin;

insert into tarot_card_images (deck_id, card_id, image_path) values
${cards.map((c) => `  (${q(DECK_RWS)}, ${q(c.id)}, ${q(`${ART_PREFIX}${c.art}`)})`).join(',\n')}
on conflict (deck_id, card_id) do update set image_path = excluded.image_path;

`;

function spreadSql(id, name, description, positions) {
  let s = `-- ---- spread: ${name} ----
insert into tarot_spreads (id, name, description, owner_id, is_public, is_builtin)
values (${q(id)}, ${q(name)}, ${q(description)}, null, true, true)
on conflict (id) do update set
  name = excluded.name, description = excluded.description,
  is_public = excluded.is_public, is_builtin = excluded.is_builtin;

insert into tarot_spread_positions
  (spread_id, position_index, label, meaning, reading_order, x, y, rotation_deg, z_index, card_count) values
${positions
  .map(
    (p) =>
      `  (${q(id)}, ${p[0]}, ${q(p[1])}, ${q(p[2])}, ${p[3]}, ${p[4]}, ${p[5]}, ${p[6]}, ${p[7]}, ${p[8]})`,
  )
  .join(',\n')}
on conflict (spread_id, position_index) do update set
  label = excluded.label, meaning = excluded.meaning, reading_order = excluded.reading_order,
  x = excluded.x, y = excluded.y, rotation_deg = excluded.rotation_deg,
  z_index = excluded.z_index, card_count = excluded.card_count;

`;
  return s;
}

sql += spreadSql(SPREAD_THREE, 'Three-Card', 'Past / Present / Future — a quick, focused read.', threeCard);
sql += spreadSql(SPREAD_CELTIC, 'Celtic Cross', 'The classic ten-card Celtic Cross.', celtic);
sql += spreadSql(
  SPREAD_KELLS,
  'Cross of Kells',
  'Extended Celtic Cross (Janet Farrar). 12 positions; positions 7–10 hold two cards each (16 cards).',
  kells,
);

sql += `-- ---- AI scaffolding ----
insert into tarot_principles (category, key, title, body, sort_order) values
${principles.map((p) => `  (${q(p[0])}, ${q(p[1])}, ${q(p[2])}, ${q(p[3])}, ${p[4]})`).join(',\n')}
on conflict (category, key) do update set
  title = excluded.title, body = excluded.body, sort_order = excluded.sort_order;

commit;
`;

writeFileSync(OUT, sql);
console.log(`Wrote ${OUT}`);
console.log(`  ${cards.length} cards, 3 spreads, ${principles.length} principles.`);

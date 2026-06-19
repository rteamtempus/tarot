// ============================================================
// stage-art.mjs — map the downloaded RWS PNGs to the canonical
// card-id filenames the DB expects, ready to upload to the
// `tarot-card-art` Storage bucket.
//
//   node scripts/stage-art.mjs
//
// Reads ./Cards-png/*.png and writes ./art-upload/rws/<card_id>.png
// (plus back.png). Both folders are gitignored — art is uploaded to
// Storage, not committed to the repo.
// ============================================================
import { readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'Cards-png');
const OUT = join(root, 'art-upload', 'rws');

const slug = (s) =>
  s.toLowerCase().replace(/^the/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const SUITS = { wands: 'wands', cups: 'cups', swords: 'swords', pentacles: 'pentacles' };
const COURT = { 11: 'page', 12: 'knight', 13: 'queen', 14: 'king' };

// Map a source filename (no ext) -> canonical card id, or null to skip.
function toCardId(base) {
  // Majors: "00-TheFool" -> major_00_fool
  const maj = base.match(/^(\d{2})-(.+)$/);
  if (maj) return `major_${maj[1]}_${slug(maj[2])}`;

  // Minors: "Cups01".."Cups14"
  const min = base.match(/^([A-Za-z]+)(\d{2})$/);
  if (min) {
    const suit = SUITS[min[1].toLowerCase()];
    if (!suit) return null;
    const n = parseInt(min[2], 10);
    if (n >= 1 && n <= 10) return `${suit}_${String(n).padStart(2, '0')}`;
    if (COURT[n]) return `${suit}_${COURT[n]}`;
  }
  return null;
}

if (!existsSync(SRC)) {
  console.error(`Source folder not found: ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

let mapped = 0;
const skipped = [];
for (const file of readdirSync(SRC)) {
  if (!file.toLowerCase().endsWith('.png')) continue;
  const base = file.replace(/\.png$/i, '');

  if (/^cardbacks?$/i.test(base)) {
    copyFileSync(join(SRC, file), join(OUT, 'back.png'));
    continue;
  }

  const id = toCardId(base);
  if (!id) {
    skipped.push(file);
    continue;
  }
  copyFileSync(join(SRC, file), join(OUT, `${id}.png`));
  mapped++;
}

console.log(`Mapped ${mapped} card images -> ${OUT}`);
if (skipped.length) console.log(`Skipped (unrecognized): ${skipped.join(', ')}`);
if (mapped !== 78) console.warn(`WARNING: expected 78 cards, mapped ${mapped}.`);

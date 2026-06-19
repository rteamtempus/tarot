// ============================================================
// build-apply-bundle.mjs — concatenate all tarot migrations (in order) into a
// single file for the Supabase SQL Editor.
//
//   npm run db:bundle
//
// Writes supabase/apply/tarot_apply.sql (gitignored — regenerate any time).
// We apply tarot's migrations DIRECTLY (SQL editor or scripts/apply-sql.mjs),
// NOT via `supabase db push`, because the shared migration history makes push
// refuse. See ../CLAUDE.md.
// ============================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrDir = join(root, 'supabase', 'migrations');
const outDir = join(root, 'supabase', 'apply');
const out = join(outDir, 'tarot_apply.sql');

const files = readdirSync(migrDir)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // timestamp prefixes sort chronologically

const header =
  '-- GENERATED bundle of all tarot migrations, in order, for the Supabase SQL Editor.\n' +
  '-- Paste into a new query and Run. Safe on a fresh schema (seed parts are idempotent).\n' +
  '-- Do NOT use `supabase db push` for tarot — the shared migration history makes it refuse.\n\n';

const body = files
  .map((f) => `-- ===== ${f} =====\n` + readFileSync(join(migrDir, f), 'utf8'))
  .join('\n\n');

mkdirSync(outDir, { recursive: true });
writeFileSync(out, header + body);
console.log(`Wrote ${out}`);
console.log(`  ${files.length} migrations: ${files.join(', ')}`);

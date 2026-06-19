// ============================================================
// apply-sql.mjs — run one or more .sql files against the shared Supabase DB.
//
//   node scripts/apply-sql.mjs <file.sql> [more.sql ...]
//   npm run db:apply -- supabase/migrations/0001_tarot_init.sql supabase/seed/0002_seed_reference.sql
//
// Connects directly via the session pooler (NOT `supabase db push`), so tarot's
// SQL never touches life-assistant's shared migration history. Requires either
// DATABASE_URL or SUPABASE_DB_PASSWORD in .env (gitignored).
//
// WARNING: writes to the LIVE shared database. Run deliberately.
// ============================================================
import { readFileSync } from 'node:fs';
import pkg from 'pg';
import { loadEnv, databaseUrl } from './_env.mjs';

const { Client } = pkg;
loadEnv();

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/apply-sql.mjs <file.sql> [more.sql ...]');
  process.exit(1);
}

const url = databaseUrl();
if (!url) {
  console.error(
    'No DB credentials. Add SUPABASE_DB_PASSWORD (or DATABASE_URL) to .env.\n' +
      'Find it in: Supabase dashboard → Project Settings → Database → Connection string / password.',
  );
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    process.stdout.write(`Applying ${f} … `);
    await client.query(sql);
    console.log('ok');
  }
  console.log('Done.');
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

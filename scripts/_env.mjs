// Minimal .env loader (no dependency). Reads KEY=VALUE lines from ./.env at the
// repo root into process.env (without overwriting already-set vars). Quotes are
// stripped; lines starting with # are ignored.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadEnv() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export const PROJECT_REF = 'snlrpqamjzwoksmoxzir';
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

// Session-pooler connection (port 5432 supports DDL). Built from the DB password
// unless a full DATABASE_URL is supplied.
export function databaseUrl() {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'];
  const pw = process.env['SUPABASE_DB_PASSWORD'];
  if (!pw) return null;
  const enc = encodeURIComponent(pw);
  return `postgresql://postgres.${PROJECT_REF}:${enc}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}

// ============================================================
// upload-art.mjs — create the public `tarot-card-art` bucket (if needed) and
// upload the card art as-is.
//
//   npm run art:upload
//
// Uploads ./Cards-png/*.png to <ART_PREFIX><filename> in the bucket, matching
// the image_path values the seed generates (original filenames, bucket root by
// default). Requires SUPABASE_SERVICE_ROLE_KEY in .env (gitignored).
//
// You can also just drag the files into the bucket via the dashboard — this is
// only for a reproducible/repeatable upload.
//
// WARNING: writes to the LIVE shared Storage. Run deliberately.
// ============================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, SUPABASE_URL } from './_env.mjs';

loadEnv();

const BUCKET = 'tarot-card-art';
const ART_PREFIX = ''; // keep in sync with build-seed.mjs ART_PREFIX

const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
if (!key) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
      'Find it in: Supabase dashboard → Project Settings → API → service_role (secret).',
  );
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'Cards-png');
if (!existsSync(dir)) {
  console.error(`No art folder at ${dir}.`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

// Ensure a public bucket exists.
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '10MB',
  });
  if (error) {
    console.error(`Failed to create bucket: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created public bucket "${BUCKET}".`);
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
let ok = 0;
for (const f of files) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${ART_PREFIX}${f}`, readFileSync(join(dir, f)), {
      contentType: 'image/png',
      upsert: true,
    });
  if (error) {
    console.error(`  ${f}: ${error.message}`);
  } else {
    ok++;
  }
}
console.log(`Uploaded ${ok}/${files.length} files to ${BUCKET}/ (prefix "${ART_PREFIX}").`);

// Vercel build step: writes src/environments/environment.ts from the
// project's SUPABASE_URL and SUPABASE_ANON_KEY environment variables.
// The committed environment.ts stays empty; this runs only in vercel.json's
// buildCommand, so local and loop builds are unchanged.
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('write-env: SUPABASE_URL and SUPABASE_ANON_KEY must both be set.');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.error('write-env: SUPABASE_URL must look like https://<ref>.supabase.co');
  process.exit(1);
}

writeFileSync(
  'src/environments/environment.ts',
  `export const environment = { production: true, supabaseUrl: ${JSON.stringify(url)}, supabaseAnonKey: ${JSON.stringify(key)} };\n`,
);
console.log('write-env: wrote src/environments/environment.ts');

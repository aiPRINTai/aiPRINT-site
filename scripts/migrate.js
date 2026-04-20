// One-shot schema apply. Reads api/db/schema.sql and executes it against
// Vercel Postgres. All statements are CREATE ... IF NOT EXISTS so it's safe
// to re-run.
//
// Usage:
//   POSTGRES_URL="postgres://..." node scripts/migrate.js
//
// Get POSTGRES_URL from Vercel → Storage → your Postgres DB → .env.local tab.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from '@vercel/postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../api/db/schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  console.error('❌ Set POSTGRES_URL (or DATABASE_URL) before running.');
  process.exit(1);
}

// Strip line comments first, THEN split on `;`. The previous version filtered
// out any chunk whose first line started with `--`, which silently dropped
// real statements that happened to be preceded by a comment between two
// semicolons (e.g. `CREATE INDEX idx_generations_image_url`). Don't do that.
const stripped = schema
  .split('\n')
  .map(line => {
    const i = line.indexOf('--');
    return i === -1 ? line : line.slice(0, i);
  })
  .join('\n');

const statements = stripped
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Applying ${statements.length} statements from schema.sql...`);

for (const stmt of statements) {
  const preview = stmt.split('\n')[0].slice(0, 80);
  try {
    await sql.query(stmt);
    console.log(`  ✓ ${preview}`);
  } catch (err) {
    console.error(`  ✗ ${preview}\n     ${err.message}`);
  }
}

console.log('Done.');
process.exit(0);

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return fallback;
  return arg.slice(prefix.length);
}

const state = (parseArg('state', 'california') || 'california').toLowerCase();
const batch = Math.max(1, Number(parseArg('batch', '2')) || 2);

const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: false }
  : {
      host: process.env.PGHOST ?? '127.0.0.1',
      port: Number(process.env.PGPORT ?? 54333),
      database: process.env.PGDATABASE ?? 'gongsihegui_db',
      user: process.env.PGUSER ?? 'gongsi_admin',
      password: process.env.PGPASSWORD ?? 'gongsi_pass_2026',
      ssl: false,
    };

function toCitySlug(value) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function cleanCity(value) {
  const raw = String(value ?? '').trim().replace(/^"+|"+$/g, '');
  if (!raw) return null;
  const normalized = raw
    .replace(/,\s*(ca|california)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const isAddressLike =
    /^\d+\b/.test(normalized) ||
    /\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\b/i.test(normalized) ||
    normalized.length > 40;

  if (isAddressLike || /^(-\s*select\s*-|select|unknown|n\/?a)$/i.test(normalized)) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const client = new pg.Client(dbConfig);
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS city_release_control (
      state_slug text NOT NULL,
      city_slug text NOT NULL,
      city_name text NOT NULL,
      released_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (state_slug, city_slug)
    )
  `);

  const stateCode = state === 'california' ? 'CA' : state.toUpperCase();
  const stateName = state === 'california' ? 'California' : state;

  const result = await client.query(
    `SELECT city, COUNT(*)::int AS company_count
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
       AND (
         lower(state) = lower($1)
         OR lower(state) = lower($2)
       )
       AND trim(coalesce(city, '')) <> ''
     GROUP BY city
     ORDER BY company_count DESC, city ASC`,
    [stateCode, stateName]
  );

  const cityCounts = new Map();
  for (const row of result.rows) {
    const cleaned = cleanCity(row.city);
    if (!cleaned) continue;
    cityCounts.set(cleaned, (cityCounts.get(cleaned) ?? 0) + Number(row.company_count));
  }

  const ranked = Array.from(cityCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => ({ name, slug: toCitySlug(name) }));

  const released = await client.query(
    `SELECT city_slug
     FROM city_release_control
     WHERE state_slug = $1`,
    [state]
  );
  const currentSet = new Set(released.rows.map((item) => item.city_slug));

  const toAdd = ranked.filter((item) => !currentSet.has(item.slug)).slice(0, batch);

  if (toAdd.length > 0) {
    const valuesSql = toAdd
      .map((_, idx) => `($1, $${idx * 2 + 2}, $${idx * 2 + 3})`)
      .join(', ');
    const params = [state, ...toAdd.flatMap((item) => [item.slug, item.name])];

    await client.query(
      `INSERT INTO city_release_control (state_slug, city_slug, city_name)
       VALUES ${valuesSql}
       ON CONFLICT (state_slug, city_slug) DO NOTHING`,
      params
    );
  }

  await client.end();

  if (toAdd.length === 0) {
    console.log(`[done] no unreleased city pages left for ${state}`);
    return;
  }

  console.log(`[ok] added ${toAdd.length} city pages for ${state}:`);
  for (const item of toAdd) {
    console.log(` - ${item.name}: /state/${state}/city/${item.slug}`);
  }
  console.log(`\nRelease database now controls:`);
  console.log(` - city pages`);
  console.log(` - company pages under those cities`);
  console.log(` - city/company sitemap URLs`);
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});

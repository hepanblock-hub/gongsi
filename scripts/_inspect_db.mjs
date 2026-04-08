import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://gongsi_admin:gongsi_pass_2026@localhost:54333/gongsihegui_db' });

const rc = await pool.query('SELECT city_name FROM city_release_control ORDER BY released_at');
console.log('released cities:', rc.rows.map(r => r.city_name));

for (const row of rc.rows) {
  const cnt = await pool.query(
    "SELECT COUNT(*) FROM company_pages WHERE state='CA' AND UPPER(city) = UPPER($1)",
    [row.city_name]
  );
  console.log(`  ${row.city_name}: ${cnt.rows[0].count} pages`);
}

const totalReleased = await pool.query(
  "SELECT COUNT(*) FROM company_pages cp WHERE cp.state='CA' AND UPPER(cp.city) IN (SELECT UPPER(city_name) FROM city_release_control WHERE state_slug='california')"
);
console.log('\ntotal released pages to snapshot:', totalReleased.rows[0].count);

// Sample slugs (strip /company/ prefix)
const sample = await pool.query(
  "SELECT slug FROM company_pages WHERE state='CA' AND UPPER(city) = 'LOS ANGELES' LIMIT 5"
);
console.log('sample LA slugs:', sample.rows.map(r => r.slug));

await pool.end();
process.exit(0);

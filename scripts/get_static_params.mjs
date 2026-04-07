import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 54333),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gongsihegui_db',
  ssl: false,
});

// Check table structure
const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='company_pages' ORDER BY ordinal_position`);
console.log('company_pages columns:', cols.rows.map(r => r.column_name).join(', '));

// Top 10 companies with rich data
const companies = await pool.query(`
  SELECT slug, company_name
  FROM company_pages
  WHERE state = 'CA'
  ORDER BY updated_at DESC
  LIMIT 10
`);

// Cities in California with most companies
const cities = await pool.query(`
  SELECT DISTINCT lower(trim(city)) as city, count(*) as cnt
  FROM company_pages
  WHERE lower(state) IN ('ca', 'california')
    AND city IS NOT NULL
    AND city != ''
    AND city !~ '^[0-9]'
    AND length(trim(city)) > 2
    AND length(trim(city)) < 40
  GROUP BY lower(trim(city))
  ORDER BY cnt DESC
  LIMIT 20
`);

console.log('=== TOP 10 COMPANY SLUGS ===');
companies.rows.forEach(r => console.log(r.slug, '|', r.company_name));

console.log('\n=== TOP 20 CITIES ===');
cities.rows.forEach(r => console.log(r.city, '|', r.cnt));

await pool.end();

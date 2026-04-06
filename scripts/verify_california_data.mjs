import pg from 'pg';
import { getWorkspaceRoot, loadWorkspaceEnv } from './_env.mjs';

const rootDir = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(rootDir);
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('缺少 DATABASE_URL。');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    const summary = await client.query(`
      SELECT 'companies' AS bucket, COUNT(*)::bigint AS total FROM companies WHERE upper(state) = 'CA'
      UNION ALL
      SELECT 'osha_inspections', COUNT(*)::bigint FROM osha_inspections WHERE upper(state) = 'CA'
      UNION ALL
      SELECT 'contractor_licenses', COUNT(*)::bigint FROM contractor_licenses WHERE upper(state) = 'CA'
      UNION ALL
      SELECT 'company_registrations', COUNT(*)::bigint FROM company_registrations WHERE upper(state) = 'CA'
      UNION ALL
      SELECT 'company_pages', COUNT(*)::bigint FROM company_pages WHERE upper(state) = 'CA'
    `);

    const topCities = await client.query(`
      SELECT city, COUNT(*)::bigint AS total
      FROM osha_inspections
      WHERE upper(state) = 'CA'
      GROUP BY city
      ORDER BY total DESC, city ASC
      LIMIT 10
    `);

    const dateRange = await client.query(`
      SELECT MIN(inspection_date) AS min_date, MAX(inspection_date) AS max_date
      FROM osha_inspections
      WHERE upper(state) = 'CA'
    `);

    console.log('California 数据概览');
    for (const row of summary.rows) {
      console.log(`- ${row.bucket}: ${row.total}`);
    }

    console.log('');
    console.log('OSHA 日期范围');
    console.log(`- earliest: ${dateRange.rows[0]?.min_date ?? 'n/a'}`);
    console.log(`- latest: ${dateRange.rows[0]?.max_date ?? 'n/a'}`);

    console.log('');
    console.log('OSHA Top 10 城市');
    for (const row of topCities.rows) {
      console.log(`- ${row.city ?? 'Unknown'}: ${row.total}`);
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

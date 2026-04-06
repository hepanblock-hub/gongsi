import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import {
  getWorkspaceRoot,
  loadWorkspaceEnv,
  normalizeCompanyName,
  parseNullableDate,
} from './_env.mjs';

const rootDir = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(rootDir);
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('缺少 DATABASE_URL。请先在根目录 .env 中配置数据库连接。');
}

const csvPath =
  process.env.CSLB_MASTER_CSV_PATH ||
  path.join(rootDir, 'downloads', 'california', 'cslb', 'master_license.csv');

const batchSize = Math.max(500, Number(process.env.CSLB_IMPORT_BATCH_SIZE || 2000));
const stateCode = (process.env.CALIFORNIA_STATE_CODE || 'CA').toUpperCase();
const sourceName = 'California CSLB';
const sourceUrl = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/';

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`未找到 CSV 文件：${csvPath}`);
  }

  console.log(`开始导入 CSLB 数据：${csvPath}`);
  const startedAt = new Date();
  const client = await pool.connect();

  const counters = {
    totalRead: 0,
    validRows: 0,
    insertedLicenses: 0,
    insertedCompanies: 0,
  };

  try {
    await client.query('BEGIN');
    await upsertSource(client, {
      sourceName,
      sourceUrl,
      notes: `Import started at ${startedAt.toISOString()}`,
    });
    await client.query('COMMIT');

    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let headers = null;
    let batch = [];

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      if (!headers) {
        headers = parseCsvLine(line).map((x) => x.trim());
        continue;
      }

      counters.totalRead += 1;
      const row = mapMasterLicenseRow(headers, line, stateCode);
      if (!row) {
        continue;
      }

      counters.validRows += 1;
      batch.push(row);

      if (batch.length >= batchSize) {
        const result = await flushBatch(client, batch);
        counters.insertedLicenses += result.insertedLicenses;
        counters.insertedCompanies += result.insertedCompanies;
        console.log(
          `已处理 ${counters.totalRead} 行，当前有效 ${counters.validRows}，新增执照 ${counters.insertedLicenses}，新增公司 ${counters.insertedCompanies}`,
        );
        batch = [];
      }
    }

    if (batch.length > 0) {
      const result = await flushBatch(client, batch);
      counters.insertedLicenses += result.insertedLicenses;
      counters.insertedCompanies += result.insertedCompanies;
    }

    await client.query('BEGIN');
    await upsertCompanyPages(client, stateCode);
    await upsertSource(client, {
      sourceName,
      sourceUrl,
      notes: `Imported ${counters.insertedLicenses} new contractor licenses, scanned ${counters.totalRead} lines at ${new Date().toISOString()}`,
    });
    await client.query('COMMIT');

    console.log('CSLB 导入完成：');
    console.log(`- 读取行数: ${counters.totalRead}`);
    console.log(`- 有效行数: ${counters.validRows}`);
    console.log(`- 新增执照: ${counters.insertedLicenses}`);
    console.log(`- 新增公司: ${counters.insertedCompanies}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}

function mapMasterLicenseRow(headers, line, fallbackState) {
  const values = parseCsvLine(line);
  const record = Object.create(null);

  for (let i = 0; i < headers.length; i += 1) {
    record[headers[i]] = (values[i] ?? '').trim();
  }

  const companyName = cleanText(record.FullBusinessName) || cleanText(record.BusinessName);
  if (!companyName) {
    return null;
  }
  if (!hasAlphabet(companyName)) {
    return null;
  }

  const state = (cleanText(record.State) || fallbackState).toUpperCase();
  if (state !== fallbackState) {
    return null;
  }

  const statusPrimary = cleanText(record.PrimaryStatus);
  const statusSecondary = cleanText(record.SecondaryStatus);
  const status = clampText([statusPrimary, statusSecondary].filter(Boolean).join(' | ') || null, 50);

  const licenseNo = cleanText(record.LicenseNo);
  const issueDate = parseNullableDate(record.IssueDate);
  const expiryDate = parseNullableDate(record.ExpirationDate);

  const source = licenseNo
    ? `https://www2.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=${encodeURIComponent(licenseNo)}`
    : sourceUrl;

  return {
    company_name: companyName,
    normalized_name: normalizeCompanyName(companyName),
    license_number: licenseNo,
    license_type: clampText(cleanText(record.BusinessType), 100),
    status,
    issue_date: issueDate,
    expiry_date: expiryDate,
    state: clampText(state, 50),
    city: cleanText(record.City),
    source_url: source,
  };
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function clampText(value, maxLen) {
  if (!value) {
    return null;
  }
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function hasAlphabet(value) {
  return /[A-Za-z]/.test(String(value ?? ''));
}

async function flushBatch(client, rows) {
  await client.query('BEGIN');
  try {
    const licensesResult = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM json_to_recordset($1::json) AS x(
            company_name text,
            normalized_name text,
            license_number text,
            license_type text,
            status text,
            issue_date date,
            expiry_date date,
            state text,
            city text,
            source_url text
          )
        ),
        inserted AS (
          INSERT INTO contractor_licenses (
            company_name,
            normalized_name,
            license_number,
            license_type,
            status,
            issue_date,
            expiry_date,
            state,
            source_url
          )
          SELECT
            i.company_name,
            i.normalized_name,
            i.license_number,
            i.license_type,
            i.status,
            i.issue_date,
            i.expiry_date,
            i.state,
            i.source_url
          FROM incoming i
          WHERE i.normalized_name IS NOT NULL
            AND i.normalized_name <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM contractor_licenses cl
              WHERE (
                COALESCE(NULLIF(cl.license_number, ''), '__none__') = COALESCE(NULLIF(i.license_number, ''), '__none__')
              )
              AND COALESCE(cl.normalized_name, '') = COALESCE(i.normalized_name, '')
              AND COALESCE(cl.state, '') = COALESCE(i.state, '')
            )
          RETURNING 1
        )
        SELECT COUNT(*)::int AS inserted_count FROM inserted
      `,
      [JSON.stringify(rows)],
    );

    const companiesResult = await client.query(
      `
        WITH incoming AS (
          SELECT DISTINCT ON (normalized_name, COALESCE(state, ''), COALESCE(city, ''))
            company_name,
            normalized_name,
            state,
            city
          FROM json_to_recordset($1::json) AS x(
            company_name text,
            normalized_name text,
            license_number text,
            license_type text,
            status text,
            issue_date date,
            expiry_date date,
            state text,
            city text,
            source_url text
          )
          WHERE normalized_name IS NOT NULL AND normalized_name <> ''
        ),
        inserted AS (
          INSERT INTO companies (name, normalized_name, state, city)
          SELECT i.company_name, i.normalized_name, i.state, i.city
          FROM incoming i
          WHERE NOT EXISTS (
            SELECT 1
            FROM companies c
            WHERE c.normalized_name = i.normalized_name
              AND COALESCE(c.state, '') = COALESCE(i.state, '')
              AND COALESCE(c.city, '') = COALESCE(i.city, '')
          )
          RETURNING 1
        )
        SELECT COUNT(*)::int AS inserted_count FROM inserted
      `,
      [JSON.stringify(rows)],
    );

    await client.query('COMMIT');
    return {
      insertedLicenses: licensesResult.rows[0]?.inserted_count ?? 0,
      insertedCompanies: companiesResult.rows[0]?.inserted_count ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertCompanyPages(client, state) {
  await client.query(
    `
      WITH scoped_companies AS (
        SELECT
          name AS company_name,
          normalized_name,
          state,
          city,
          '/company/' || replace(normalized_name, ' ', '-') || '-' || lower(state) AS slug,
          ROW_NUMBER() OVER (
            PARTITION BY '/company/' || replace(normalized_name, ' ', '-') || '-' || lower(state)
            ORDER BY name ASC, city ASC NULLS LAST
          ) AS rn
        FROM companies
        WHERE upper(state) = upper($1)
          AND normalized_name IS NOT NULL
          AND normalized_name <> ''
      )
      INSERT INTO company_pages (slug, company_name, state, city, last_generated_at)
      SELECT s.slug, s.company_name, s.state, s.city, NOW()
      FROM scoped_companies s
      WHERE s.rn = 1
      AND NOT EXISTS (
        SELECT 1
        FROM company_pages cp
        WHERE cp.slug = s.slug
      )
    `,
    [state],
  );

  await client.query(
    `
      UPDATE company_pages cp
      SET updated_at = NOW(), last_generated_at = NOW()
      FROM companies c
      WHERE cp.slug = '/company/' || replace(c.normalized_name, ' ', '-') || '-' || lower(c.state)
        AND upper(c.state) = upper($1)
        AND c.normalized_name IS NOT NULL
        AND c.normalized_name <> ''
    `,
    [state],
  );
}

async function upsertSource(client, source) {
  await client.query(
    `
      UPDATE data_sources
      SET last_fetched_at = NOW(), notes = $3::text
      WHERE source_name = $1::varchar AND source_url = $2::text
    `,
    [source.sourceName, source.sourceUrl, source.notes],
  );

  await client.query(
    `
      INSERT INTO data_sources (source_name, source_url, last_fetched_at, notes)
      SELECT $1::varchar, $2::text, NOW(), $3::text
      WHERE NOT EXISTS (
        SELECT 1
        FROM data_sources
        WHERE source_name = $1::varchar AND source_url = $2::text
      )
    `,
    [source.sourceName, source.sourceUrl, source.notes],
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

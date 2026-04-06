import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { getWorkspaceRoot, loadWorkspaceEnv, normalizeCompanyName } from './_env.mjs';

const rootDir = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(rootDir);
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('缺少 DATABASE_URL。请先在根目录 .env 中配置数据库连接。');
}

const sourceDir =
  process.env.OSHA_EXTRACTED_CSV_DIR ||
  path.join(rootDir, 'downloads', 'california', 'osha', 'extracted');

const stateCode = (process.env.CALIFORNIA_STATE_CODE || 'CA').toUpperCase();
const dryRun = process.argv.includes('--dry-run');

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`未找到 OSHA 解包目录：${sourceDir}`);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b));

  const mappings = new Map();
  let scannedRows = 0;
  let candidateRows = 0;

  for (const fileName of files) {
    const filePath = path.join(sourceDir, fileName);
    console.log(`扫描映射源：${fileName}`);
    for await (const record of iterateCsvObjects(filePath)) {
      scannedRows += 1;
      const state = cleanText(record.state ?? record.State)?.toUpperCase();
      if (state !== stateCode) {
        continue;
      }

      const rawName = cleanText(record.company_name ?? record.CompanyName);
      if (!rawName || hasAlphabet(rawName)) {
        continue;
      }

      const resolvedName =
        firstAlphabetic(
          cleanText(record.establishment_name ?? record.EstablishmentName),
          cleanText(record.Employer ?? record.employer),
          cleanText(record.business_name ?? record.BusinessName),
        );

      if (!resolvedName) {
        continue;
      }

      candidateRows += 1;
      const city = cleanText(record.city ?? record.City) ?? '';
      const key = buildKey(rawName, state, city);
      const entry = mappings.get(key) ?? {
        codeName: rawName,
        state,
        city,
        candidates: new Map(),
      };
      entry.candidates.set(resolvedName, (entry.candidates.get(resolvedName) ?? 0) + 1);
      mappings.set(key, entry);
    }
  }

  const resolved = [];
  for (const entry of mappings.values()) {
    const ranked = [...entry.candidates.entries()].sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    });

    const [bestName, bestCount] = ranked[0] ?? [];
    if (!bestName) {
      continue;
    }

    resolved.push({
      old_name: entry.codeName,
      new_name: bestName,
      normalized_name: normalizeCompanyName(bestName),
      state: entry.state,
      city: entry.city || null,
      confidence: bestCount,
      alternatives: ranked.length,
    });
  }

  console.log(`扫描完成：总行数 ${scannedRows}，候选行 ${candidateRows}，可用映射 ${resolved.length}`);

  const client = await pool.connect();
  try {
    const stats = await summarizeMatches(client, resolved);
    console.log(`数据库命中：OSHA ${stats.osha_rows}，companies ${stats.company_rows}，pages ${stats.page_rows}`);

    if (dryRun) {
      console.log('Dry run 模式，不写入数据库。示例映射：');
      for (const sample of resolved.slice(0, 10)) {
        console.log(`- ${sample.old_name} @ ${sample.city ?? 'n/a'} => ${sample.new_name}`);
      }
      return;
    }

    await client.query('BEGIN');
    await applyBackfill(client, resolved);
    await rebuildCompanyPages(client, stateCode);
    await client.query('COMMIT');

    console.log('历史回填完成。');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function summarizeMatches(client, mappings) {
  const payload = JSON.stringify(mappings);
  const query = `
    WITH incoming AS (
      SELECT *
      FROM json_to_recordset($1::json) AS x(
        old_name text,
        new_name text,
        normalized_name text,
        state text,
        city text,
        confidence integer,
        alternatives integer
      )
    )
    SELECT
      (SELECT COUNT(*)::int
       FROM osha_inspections oi
       JOIN incoming i
         ON oi.company_name = i.old_name
        AND upper(oi.state) = upper(i.state)
        AND COALESCE(upper(oi.city), '') = COALESCE(upper(i.city), '')) AS osha_rows,
      (SELECT COUNT(*)::int
       FROM companies c
       JOIN incoming i
         ON c.name = i.old_name
        AND upper(c.state) = upper(i.state)
        AND COALESCE(upper(c.city), '') = COALESCE(upper(i.city), '')) AS company_rows,
      (SELECT COUNT(*)::int
       FROM company_pages cp
       JOIN incoming i
         ON cp.company_name = i.old_name
        AND upper(cp.state) = upper(i.state)
        AND COALESCE(upper(cp.city), '') = COALESCE(upper(i.city), '')) AS page_rows
  `;

  const { rows } = await client.query(query, [payload]);
  return rows[0] ?? { osha_rows: 0, company_rows: 0, page_rows: 0 };
}

async function applyBackfill(client, mappings) {
  const payload = JSON.stringify(mappings);

  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM json_to_recordset($1::json) AS x(
          old_name text,
          new_name text,
          normalized_name text,
          state text,
          city text,
          confidence integer,
          alternatives integer
        )
      )
      UPDATE osha_inspections oi
      SET company_name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE oi.company_name = i.old_name
        AND upper(oi.state) = upper(i.state)
        AND COALESCE(upper(oi.city), '') = COALESCE(upper(i.city), '')
    `,
    [payload],
  );

  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM json_to_recordset($1::json) AS x(
          old_name text,
          new_name text,
          normalized_name text,
          state text,
          city text,
          confidence integer,
          alternatives integer
        )
      )
      UPDATE companies c
      SET name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE c.name = i.old_name
        AND upper(c.state) = upper(i.state)
        AND COALESCE(upper(c.city), '') = COALESCE(upper(i.city), '')
    `,
    [payload],
  );

  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM json_to_recordset($1::json) AS x(
          old_name text,
          new_name text,
          normalized_name text,
          state text,
          city text,
          confidence integer,
          alternatives integer
        )
      )
      DELETE FROM company_pages cp
      USING incoming i
      WHERE cp.company_name = i.old_name
        AND upper(cp.state) = upper(i.state)
        AND COALESCE(upper(cp.city), '') = COALESCE(upper(i.city), '')
    `,
    [payload],
  );
}

async function rebuildCompanyPages(client, state) {
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
          AND name ~* '[A-Za-z]'
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
      SET company_name = c.name,
          city = c.city,
          updated_at = NOW(),
          last_generated_at = NOW()
      FROM companies c
      WHERE cp.slug = '/company/' || replace(c.normalized_name, ' ', '-') || '-' || lower(c.state)
        AND upper(c.state) = upper($1)
        AND c.normalized_name IS NOT NULL
        AND c.normalized_name <> ''
        AND c.name ~* '[A-Za-z]'
    `,
    [state],
  );

  await client.query(
    `
      DELETE FROM company_pages
      WHERE upper(state) = upper($1)
        AND company_name !~* '[A-Za-z]'
    `,
    [state],
  );
}

async function* iterateCsvObjects(filePath) {
  let headers = null;
  for await (const values of iterateCsvRecords(filePath)) {
    if (!headers) {
      headers = values.map((value) => value.trim());
      continue;
    }

    const record = Object.create(null);
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = values[index] ?? '';
    }
    yield record;
  }
}

async function* iterateCsvRecords(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = '';
  for await (const line of rl) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!isCompleteCsvRecord(buffer)) {
      continue;
    }

    yield parseCsvLine(buffer);
    buffer = '';
  }

  if (buffer) {
    yield parseCsvLine(buffer);
  }
}

function isCompleteCsvRecord(input) {
  let inQuotes = false;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== '"') {
      continue;
    }

    if (inQuotes && input[index + 1] === '"') {
      index += 1;
      continue;
    }

    inQuotes = !inQuotes;
  }
  return !inQuotes;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
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

function hasAlphabet(value) {
  return /[A-Za-z]/.test(String(value ?? ''));
}

function firstAlphabetic(...values) {
  for (const value of values) {
    if (value && hasAlphabet(value)) {
      return value;
    }
  }
  return null;
}

function buildKey(name, state, city) {
  return [name, state, city].join('||');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

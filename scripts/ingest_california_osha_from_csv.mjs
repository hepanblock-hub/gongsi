import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import {
  getWorkspaceRoot,
  loadWorkspaceEnv,
  normalizeCompanyName,
  parseNullableBoolean,
  parseNullableDate,
  parseNullableNumber,
  pickFirst,
} from './_env.mjs';

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

const batchSize = Math.max(1000, Number(process.env.OSHA_IMPORT_BATCH_SIZE || 5000));
const stateCode = (process.env.CALIFORNIA_STATE_CODE || 'CA').toUpperCase();
const sourceName = 'California OSHA (Local CSV)';
const sourceUrl = 'https://www.osha.gov/data';

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`未找到 OSHA 解包目录：${sourceDir}`);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`目录下没有 CSV：${sourceDir}`);
  }

  console.log(`开始导入 OSHA CSV，目录：${sourceDir}`);
  console.log(`文件数：${files.length}`);

  const client = await pool.connect();
  const counters = {
    totalRead: 0,
    validRows: 0,
    insertedInspections: 0,
    insertedCompanies: 0,
  };

  try {
    await client.query('BEGIN');
    await upsertSource(client, {
      sourceName,
      sourceUrl,
      notes: `Import started at ${new Date().toISOString()}`,
    });
    await client.query('COMMIT');

    for (const fileName of files) {
      const filePath = path.join(sourceDir, fileName);
      console.log(`处理文件：${fileName}`);
      await ingestOneFile(client, filePath, fileName, counters);
    }

    await client.query('BEGIN');
    await upsertCompanyPages(client, stateCode);
    await upsertSource(client, {
      sourceName,
      sourceUrl,
      notes: `Imported ${counters.insertedInspections} new OSHA rows from local CSV at ${new Date().toISOString()}`,
    });
    await client.query('COMMIT');

    console.log('OSHA 本地 CSV 导入完成：');
    console.log(`- 读取行数: ${counters.totalRead}`);
    console.log(`- 有效行数: ${counters.validRows}`);
    console.log(`- 新增 inspections: ${counters.insertedInspections}`);
    console.log(`- 新增 companies: ${counters.insertedCompanies}`);
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

async function ingestOneFile(client, filePath, fileName, counters) {
  let headers = null;
  let batch = [];

  for await (const values of iterateCsvRecords(filePath)) {
    if (!headers) {
      headers = values.map((v) => v.trim());
      continue;
    }

    counters.totalRead += 1;
    const row = mapOshaRow(headers, values, fileName);
    if (!row) {
      continue;
    }

    counters.validRows += 1;
    batch.push(row);

    if (batch.length >= batchSize) {
      const result = await flushBatch(client, batch);
      counters.insertedInspections += result.insertedInspections;
      counters.insertedCompanies += result.insertedCompanies;
      console.log(
        `  已读取 ${counters.totalRead}，有效 ${counters.validRows}，新增 OSHA ${counters.insertedInspections}，新增公司 ${counters.insertedCompanies}`,
      );
      batch = [];
    }
  }

  if (batch.length > 0) {
    const result = await flushBatch(client, batch);
    counters.insertedInspections += result.insertedInspections;
    counters.insertedCompanies += result.insertedCompanies;
  }
}

function mapOshaRow(headers, values, fileName) {
  const record = Object.create(null);
  for (let i = 0; i < headers.length; i += 1) {
    record[headers[i]] = (values[i] ?? '').trim();
  }

  const state = cleanText(pickFirst(record, ['state', 'State']))?.toUpperCase();
  if (!state || state !== stateCode) {
    return null;
  }

  const companyName = pickPreferredCompanyName(record);
  if (!companyName) {
    return null;
  }

  const city = cleanText(pickFirst(record, ['city', 'City']));

  const inspectionDate = parseNullableDate(
    pickFirst(record, ['inspection_date', 'date_of_incident', 'EventDate', 'created_timestamp']),
  );

  const rowType = detectRowType(record, fileName);
  const violationType = clampText(
    cleanText(
      pickFirst(record, ['incident_outcome', 'EventTitle', 'NatureTitle', 'change_reason']),
    ),
    100,
  );

  const severity = clampText(buildSeverity(record), 50);
  const penalty = parseNullableNumber(
    pickFirst(record, ['penalty', 'initial_penalty', 'proposed_penalty', 'total_penalty']),
  );
  const openCase = parseNullableBoolean(pickFirst(record, ['open_case', 'Inspection']));

  const uniqueToken =
    cleanText(pickFirst(record, ['id', 'case_number', 'UPA', 'establishment_id'])) ||
    `${companyName}:${inspectionDate || 'na'}:${city || 'na'}`;

  return {
    company_name: companyName,
    normalized_name: normalizeCompanyName(companyName),
    inspection_date: inspectionDate,
    inspection_type: rowType,
    violation_type: violationType,
    severity,
    penalty,
    open_case: openCase,
    state,
    city,
    source_url: `https://www.osha.gov/data#${encodeURIComponent(fileName)}-${encodeURIComponent(uniqueToken)}`,
  };
}

function detectRowType(record, fileName) {
  const keys = Object.keys(record).map((k) => k.toLowerCase());
  if (keys.includes('eventdate') || fileName.toLowerCase().includes('january2015tojuly2025')) {
    return 'severe_injury_report';
  }
  if (keys.includes('case_number') || fileName.toLowerCase().includes('case_detail')) {
    return 'case_detail';
  }
  return 'summary_300a';
}

function buildSeverity(record) {
  const hospital = parseNullableBoolean(record.Hospitalized);
  const amputation = parseNullableBoolean(record.Amputation);
  const eyeLoss = parseNullableBoolean(record['Loss of Eye']);

  const labels = [];
  if (hospital) labels.push('hospitalized');
  if (amputation) labels.push('amputation');
  if (eyeLoss) labels.push('loss_of_eye');

  if (labels.length > 0) {
    return labels.join('|');
  }

  const deaths = parseNullableNumber(record.total_deaths);
  if (deaths && deaths > 0) {
    return `fatality:${deaths}`;
  }

  const injuries = parseNullableNumber(record.no_injuries_illnesses);
  if (injuries && injuries > 0) {
    return `injury_count:${injuries}`;
  }

  return cleanText(pickFirst(record, ['nature_title_pred', 'NatureTitle', 'incident_outcome']));
}

async function* iterateCsvRecords(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let buffer = '';
  for await (const line of rl) {
    if (!buffer) {
      buffer = line;
    } else {
      buffer += `\n${line}`;
    }

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
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== '"') {
      continue;
    }

    if (inQuotes && input[i + 1] === '"') {
      i += 1;
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

function pickPreferredCompanyName(record) {
  const primary = cleanText(record.company_name ?? record.CompanyName);
  const establishment = cleanText(record.establishment_name ?? record.EstablishmentName);
  const employer = cleanText(record.Employer ?? record.employer);

  if (hasAlphabet(primary)) {
    return primary;
  }
  if (hasAlphabet(establishment)) {
    return establishment;
  }
  if (hasAlphabet(employer)) {
    return employer;
  }
  return primary || establishment || employer || null;
}

async function flushBatch(client, rows) {
  await client.query('BEGIN');
  try {
    const inspectionsResult = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM json_to_recordset($1::json) AS x(
            company_name text,
            normalized_name text,
            inspection_date date,
            inspection_type text,
            violation_type text,
            severity text,
            penalty numeric,
            open_case boolean,
            state text,
            city text,
            source_url text
          )
        ),
        inserted AS (
          INSERT INTO osha_inspections (
            company_name,
            normalized_name,
            inspection_date,
            inspection_type,
            violation_type,
            severity,
            penalty,
            open_case,
            state,
            city,
            source_url
          )
          SELECT
            i.company_name,
            i.normalized_name,
            i.inspection_date,
            i.inspection_type,
            i.violation_type,
            i.severity,
            i.penalty,
            i.open_case,
            i.state,
            i.city,
            i.source_url
          FROM incoming i
          WHERE i.normalized_name IS NOT NULL
            AND i.normalized_name <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM osha_inspections oi
              WHERE oi.normalized_name = i.normalized_name
                AND COALESCE(oi.inspection_date::text, '') = COALESCE(i.inspection_date::text, '')
                AND COALESCE(oi.inspection_type, '') = COALESCE(i.inspection_type, '')
                AND COALESCE(oi.city, '') = COALESCE(i.city, '')
                AND COALESCE(oi.state, '') = COALESCE(i.state, '')
                AND COALESCE(oi.source_url, '') = COALESCE(i.source_url, '')
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
            inspection_date date,
            inspection_type text,
            violation_type text,
            severity text,
            penalty numeric,
            open_case boolean,
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
      insertedInspections: inspectionsResult.rows[0]?.inserted_count ?? 0,
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

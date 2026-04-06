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
const apiKey = process.env.DOL_API_KEY;
const agency = process.env.OSHA_DOL_AGENCY || 'osha';
const endpoint = process.env.OSHA_DOL_ENDPOINT || 'enforcement';
const stateField = process.env.OSHA_DOL_STATE_FIELD || 'state';
const stateCode = (process.env.CALIFORNIA_STATE_CODE || 'CA').toUpperCase();
const limit = Math.min(Number(process.env.OSHA_DOL_LIMIT || 1000), 10000);
const maxRecords = Number(process.env.OSHA_DOL_MAX_RECORDS || 0);
const baseUrl = process.env.DOL_API_BASE_URL || 'https://apiprod.dol.gov/v4/get';
const sourceName = 'California OSHA';
const sourceUrl = `${baseUrl}/${agency}/${endpoint}/json`;

if (!databaseUrl) {
  throw new Error('缺少 DATABASE_URL。请先在根目录 .env 中配置数据库连接。');
}

if (!apiKey) {
  throw new Error('缺少 DOL_API_KEY。请先在 .env 中添加 DOL API key，再运行导入。');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  const startedAt = new Date();
  console.log(`开始导入 ${sourceName} 数据，agency=${agency} endpoint=${endpoint} state=${stateCode}`);

  const normalizedRows = [];
  let offset = 0;
  let totalFetched = 0;

  while (true) {
    const rawRows = await fetchBatch(offset, limit);
    if (rawRows.length === 0) {
      break;
    }

    const currentBatch = rawRows
      .map((row) => normalizeInspectionRow(row))
      .filter(Boolean);

    normalizedRows.push(...currentBatch);
    totalFetched += rawRows.length;
    console.log(`已抓取 ${totalFetched} 条原始记录，当前有效 ${normalizedRows.length} 条。`);

    if (rawRows.length < limit) {
      break;
    }

    offset += limit;
    if (maxRecords > 0 && totalFetched >= maxRecords) {
      console.log(`达到 OSHA_DOL_MAX_RECORDS=${maxRecords}，停止继续抓取。`);
      break;
    }
  }

  if (normalizedRows.length === 0) {
    console.log('没有拿到可入库的 California OSHA 记录。请检查 endpoint、state 字段名或 API key。');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertSource(client, {
      sourceName,
      sourceUrl,
      notes: `Imported ${normalizedRows.length} California OSHA rows on ${startedAt.toISOString()}`,
    });

    const uniqueRows = dedupeRows(normalizedRows);
    await insertCompanies(client, uniqueRows);
    await insertInspections(client, uniqueRows);
    await upsertCompanyPages(client, stateCode);
    await client.query('COMMIT');

    console.log(`导入完成：${uniqueRows.length} 条清洗后 OSHA 记录已处理。`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function fetchBatch(offset, currentLimit) {
  const url = new URL(`${baseUrl}/${agency}/${endpoint}/json`);
  url.searchParams.set('X-API-KEY', apiKey);
  url.searchParams.set('limit', String(currentLimit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('sort_by', stateField);
  url.searchParams.set(
    'filter_object',
    JSON.stringify({
      field: stateField,
      operator: 'eq',
      value: stateCode,
    }),
  );

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OSHA API 请求失败：${response.status} ${response.statusText}\n${body.slice(0, 1200)}`);
  }

  const payload = await response.json();
  return extractRows(payload);
}

function extractRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.data,
    payload?.results,
    payload?.result,
    payload?.records,
    payload?.response,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function normalizeInspectionRow(raw) {
  const companyName = pickPreferredCompanyName(raw);

  if (!companyName) {
    return null;
  }

  const state = cleanText(
    pickFirst(raw, ['state', 'site_state', 'state_abbr', 'st', 'inspection_state']),
  )?.toUpperCase();

  if (state && state !== stateCode) {
    return null;
  }

  const city = cleanText(
    pickFirst(raw, ['city', 'site_city', 'inspection_city', 'cty_name']),
  );

  const inspectionId = cleanText(
    pickFirst(raw, ['inspection_nr', 'inspection_number', 'activity_nr', 'case_number', 'id']),
  );

  const inspectionDate = parseNullableDate(
    pickFirst(raw, [
      'inspection_date',
      'open_date',
      'activity_date',
      'date_opened',
      'case_open_date',
    ]),
  );

  const inspectionType = cleanText(
    pickFirst(raw, ['inspection_type', 'scope', 'activity_type', 'type']),
  );

  const violationType = cleanText(
    pickFirst(raw, [
      'violation_type',
      'violation_group',
      'standard_type',
      'citation_type',
      'viol_type',
    ]),
  );

  const severity = cleanText(
    pickFirst(raw, ['severity', 'gravity', 'serious_event', 'serious']),
  );

  const penalty = parseNullableNumber(
    pickFirst(raw, [
      'penalty',
      'initial_penalty',
      'current_penalty',
      'proposed_penalty',
      'total_penalty',
      'contest_penalty',
    ]),
  );

  const statusValue = cleanText(
    pickFirst(raw, ['open_case', 'case_status', 'status', 'is_open']),
  );
  const openCase =
    parseNullableBoolean(statusValue) ??
    (statusValue ? statusValue.toLowerCase().includes('open') : null);

  return {
    company_name: companyName,
    normalized_name: normalizeCompanyName(companyName),
    inspection_date: inspectionDate,
    inspection_type: inspectionType,
    violation_type: violationType,
    severity,
    penalty,
    open_case: openCase,
    state: state || stateCode,
    city,
    source_url: buildSourceUrl(inspectionId),
  };
}

function buildSourceUrl(inspectionId) {
  if (!inspectionId) {
    return 'https://www.osha.gov/data';
  }
  return `https://www.osha.gov/ords/imis/establishment.inspection_detail?id=${encodeURIComponent(inspectionId)}`;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function hasAlphabet(value) {
  return /[A-Za-z]/.test(String(value ?? ''));
}

function pickPreferredCompanyName(raw) {
  const primary = cleanText(pickFirst(raw, ['company_name']));
  const establishment = cleanText(pickFirst(raw, ['establishment_name', 'site_name', 'business_name', 'name']));
  const employer = cleanText(pickFirst(raw, ['employer_name', 'trade_nm']));

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

function dedupeRows(rows) {
  const seen = new Set();
  const uniqueRows = [];

  for (const row of rows) {
    const key = [
      row.normalized_name,
      row.inspection_date,
      row.inspection_type,
      row.penalty,
      row.city,
      row.state,
      row.source_url,
    ].join('::');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

async function upsertSource(client, source) {
  await client.query(
    `
      UPDATE data_sources
      SET last_fetched_at = NOW(), notes = $3
      WHERE source_name = $1 AND source_url = $2
    `,
    [source.sourceName, source.sourceUrl, source.notes],
  );

  await client.query(
    `
      INSERT INTO data_sources (source_name, source_url, last_fetched_at, notes)
      SELECT $1, $2, NOW(), $3
      WHERE NOT EXISTS (
        SELECT 1
        FROM data_sources
        WHERE source_name = $1 AND source_url = $2
      )
    `,
    [source.sourceName, source.sourceUrl, source.notes],
  );
}

async function insertCompanies(client, rows) {
  await client.query(
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
      dedup AS (
        SELECT DISTINCT ON (normalized_name, COALESCE(state, ''), COALESCE(city, ''))
          company_name,
          normalized_name,
          state,
          city
        FROM incoming
        WHERE normalized_name IS NOT NULL AND normalized_name <> ''
      )
      INSERT INTO companies (name, normalized_name, state, city)
      SELECT d.company_name, d.normalized_name, d.state, d.city
      FROM dedup d
      WHERE NOT EXISTS (
        SELECT 1
        FROM companies c
        WHERE c.normalized_name = d.normalized_name
          AND COALESCE(c.state, '') = COALESCE(d.state, '')
          AND COALESCE(c.city, '') = COALESCE(d.city, '')
      )
    `,
    [JSON.stringify(rows)],
  );
}

async function insertInspections(client, rows) {
  await client.query(
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
      )
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
      WHERE NOT EXISTS (
        SELECT 1
        FROM osha_inspections oi
        WHERE oi.normalized_name = i.normalized_name
          AND COALESCE(oi.inspection_date::text, '') = COALESCE(i.inspection_date::text, '')
          AND COALESCE(oi.inspection_type, '') = COALESCE(i.inspection_type, '')
          AND COALESCE(oi.penalty, -1) = COALESCE(i.penalty, -1)
          AND COALESCE(oi.city, '') = COALESCE(i.city, '')
          AND COALESCE(oi.state, '') = COALESCE(i.state, '')
          AND COALESCE(oi.source_url, '') = COALESCE(i.source_url, '')
      )
    `,
    [JSON.stringify(rows)],
  );
}

async function upsertCompanyPages(client, state) {
  await client.query(
    `
      WITH scoped_companies AS (
        SELECT DISTINCT
          name AS company_name,
          normalized_name,
          state,
          city,
          '/company/' || replace(normalized_name, ' ', '-') || '-' || lower(state) AS slug
        FROM companies
        WHERE upper(state) = upper($1)
          AND normalized_name IS NOT NULL
          AND normalized_name <> ''
      )
      INSERT INTO company_pages (slug, company_name, state, city, last_generated_at)
      SELECT s.slug, s.company_name, s.state, s.city, NOW()
      FROM scoped_companies s
      WHERE NOT EXISTS (
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

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
const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`未找到 OSHA 解包目录：${sourceDir}`);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b));

  const directVotes = new Map(); // code|state|city -> Map(name -> count)
  const fpVotes = new Map(); // fingerprint -> Map(name -> count)
  const unresolvedCodeFp = new Map(); // code|state|city -> Map(fingerprint -> count)

  let scannedRows = 0;
  for (const fileName of files) {
    console.log(`扫描：${fileName}`);
    const filePath = path.join(sourceDir, fileName);
    for await (const row of iterateCsvObjects(filePath)) {
      scannedRows += 1;
      const state = cleanText(row.state ?? row.State)?.toUpperCase();
      if (state !== stateCode) {
        continue;
      }

      const city = cleanText(row.city ?? row.City) ?? '';
      const company = cleanText(row.company_name ?? row.CompanyName);
      const estab = cleanText(row.establishment_name ?? row.EstablishmentName);
      const employer = cleanText(row.Employer ?? row.employer);

      const fields = [company, estab, employer].filter(Boolean);
      const codeFields = unique(fields.filter((v) => isCodeName(v)));
      const alphaFields = unique(fields.filter((v) => hasAlphabet(v) && !isCodeName(v)));

      for (const code of codeFields) {
        const codeKey = buildCodeKey(code, state, city);
        for (const name of alphaFields) {
          addVote(directVotes, codeKey, name, 1);
        }
      }

      const primaryName = pickPrimaryName(company, estab, employer);
      const fp = buildFingerprint(row, state, city);
      if (fp && primaryName) {
        addVote(fpVotes, fp, primaryName, 1);
      }

      if (fp) {
        for (const code of codeFields) {
          addVote(unresolvedCodeFp, buildCodeKey(code, state, city), fp, 1);
        }
      }
    }
  }

  console.log(`扫描完成：${scannedRows} 行`);

  const resolved = [];
  const allCodeKeys = new Set([...directVotes.keys(), ...unresolvedCodeFp.keys()]);

  for (const codeKey of allCodeKeys) {
    const [codeName, state, city] = splitCodeKey(codeKey);
    const nameVotes = new Map();

    const direct = directVotes.get(codeKey);
    if (direct) {
      for (const [name, count] of direct.entries()) {
        nameVotes.set(name, (nameVotes.get(name) ?? 0) + count * 3);
      }
    }

    const fps = unresolvedCodeFp.get(codeKey);
    if (fps) {
      for (const [fp, fpCount] of fps.entries()) {
        const names = fpVotes.get(fp);
        if (!names) continue;
        for (const [name, count] of names.entries()) {
          nameVotes.set(name, (nameVotes.get(name) ?? 0) + count * fpCount);
        }
      }
    }

    const ranked = [...nameVotes.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const [bestName, bestScore] = ranked[0] ?? [];
    const secondScore = ranked[1]?.[1] ?? 0;

    if (!bestName) continue;
    if (bestScore < 2) continue;
    if (bestScore < secondScore * 1.3) continue;

    resolved.push({
      old_name: codeName,
      new_name: bestName,
      normalized_name: normalizeCompanyName(bestName),
      state,
      city: city || null,
      score: bestScore,
      alternatives: ranked.length,
    });
  }

  console.log(`可用弱匹配映射：${resolved.length}`);

  const client = await pool.connect();
  try {
    const stats = await summarizeMatches(client, resolved);
    console.log(`数据库命中：OSHA ${stats.osha_rows}，companies ${stats.company_rows}，pages ${stats.page_rows}`);

    if (dryRun) {
      console.log('Dry run，不写库。样例：');
      for (const sample of resolved.slice(0, 20)) {
        console.log(`- ${sample.old_name} @ ${sample.city ?? 'n/a'} => ${sample.new_name} (score=${sample.score})`);
      }
      return;
    }

    await client.query('BEGIN');
    await applyBackfill(client, resolved);
    await rebuildCompanyPages(client, stateCode);
    await client.query('COMMIT');
    console.log('第二轮弱匹配回填完成。');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function summarizeMatches(client, mappings) {
  const payload = JSON.stringify(mappings);
  const { rows } = await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM json_to_recordset($1::json) AS x(
          old_name text,
          new_name text,
          normalized_name text,
          state text,
          city text,
          score integer,
          alternatives integer
        )
      )
      SELECT
        (SELECT COUNT(*)::int
         FROM osha_inspections oi
         JOIN incoming i
           ON oi.company_name = i.old_name
          AND upper(oi.state) = upper(i.state)
          AND COALESCE(upper(oi.city), '') = COALESCE(upper(i.city), '')
         WHERE oi.company_name !~* '[A-Za-z]') AS osha_rows,
        (SELECT COUNT(*)::int
         FROM companies c
         JOIN incoming i
           ON c.name = i.old_name
          AND upper(c.state) = upper(i.state)
          AND COALESCE(upper(c.city), '') = COALESCE(upper(i.city), '')
         WHERE c.name !~* '[A-Za-z]') AS company_rows,
        (SELECT COUNT(*)::int
         FROM company_pages cp
         JOIN incoming i
           ON cp.company_name = i.old_name
          AND upper(cp.state) = upper(i.state)
          AND COALESCE(upper(cp.city), '') = COALESCE(upper(i.city), '')
         WHERE cp.company_name !~* '[A-Za-z]') AS page_rows
    `,
    [payload],
  );
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
          score integer,
          alternatives integer
        )
      )
      UPDATE osha_inspections oi
      SET company_name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE oi.company_name = i.old_name
        AND oi.company_name !~* '[A-Za-z]'
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
          score integer,
          alternatives integer
        )
      )
      UPDATE companies c
      SET name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE c.name = i.old_name
        AND c.name !~* '[A-Za-z]'
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
          score integer,
          alternatives integer
        )
      )
      DELETE FROM company_pages cp
      USING incoming i
      WHERE cp.company_name = i.old_name
        AND cp.company_name !~* '[A-Za-z]'
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

function buildFingerprint(row, state, city) {
  const ein = cleanDigits(row.ein ?? row.EIN);
  const estId = cleanDigits(row.establishment_id ?? row.EstablishmentId);
  const zip = cleanDigits(row.zip_code ?? row.Zip ?? row.ZIPCode);
  const naics = cleanDigits(row.naics_code ?? row['Primary NAICS']);
  const address = normalizeAddress(row.street_address ?? row.Address1 ?? row.MailingAddress);

  const parts = [state, city, zip, address, ein, estId, naics].filter(Boolean);
  const strongSignals = [ein, estId, address].filter(Boolean).length;
  if (parts.length < 4 || strongSignals < 1) {
    return null;
  }
  return parts.join('|');
}

function pickPrimaryName(company, estab, employer) {
  const candidates = [company, estab, employer].filter(Boolean);
  for (const candidate of candidates) {
    if (hasAlphabet(candidate) && !isCodeName(candidate)) {
      return candidate;
    }
  }
  return null;
}

function addVote(outerMap, key, value, score) {
  const inner = outerMap.get(key) ?? new Map();
  inner.set(value, (inner.get(value) ?? 0) + score);
  outerMap.set(key, inner);
}

function unique(values) {
  return [...new Set(values)];
}

function isCodeName(value) {
  if (!value) return false;
  const text = String(value).trim();
  return (
    /^[0-9]{3,}[-/ ][0-9A-Za-z-]+$/.test(text) ||
    /^[0-9]{7,}$/.test(text) ||
    /^[0-9]+\.[0-9]+$/.test(text)
  );
}

function hasAlphabet(value) {
  return /[A-Za-z]/.test(String(value ?? ''));
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function cleanDigits(value) {
  const text = cleanText(value);
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, '');
  return digits || null;
}

function normalizeAddress(value) {
  const text = cleanText(value);
  if (!text) return null;
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function buildCodeKey(codeName, state, city) {
  return [codeName, state, city].join('||');
}

function splitCodeKey(key) {
  const [codeName, state, city] = key.split('||');
  return [codeName, state, city];
}

async function* iterateCsvObjects(filePath) {
  let headers = null;
  for await (const values of iterateCsvRecords(filePath)) {
    if (!headers) {
      headers = values.map((v) => v.trim());
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
    if (input[index] !== '"') continue;
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

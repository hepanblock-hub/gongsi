import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { getWorkspaceRoot, loadWorkspaceEnv, normalizeCompanyName } from './_env.mjs';

const rootDir = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(rootDir);
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('缺少 DATABASE_URL');

const sourceDir =
  process.env.OSHA_EXTRACTED_CSV_DIR ||
  path.join(rootDir, 'downloads', 'california', 'osha', 'extracted');

const stateCode = (process.env.CALIFORNIA_STATE_CODE || 'CA').toUpperCase();
const dryRun = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  const client = await pool.connect();
  try {
    const targetRows = await client.query(
      `
        SELECT DISTINCT company_name, upper(state) AS state, coalesce(city, '') AS city
        FROM osha_inspections
        WHERE company_name !~* '[A-Za-z]'
          AND upper(state) = $1
      `,
      [stateCode],
    );

    const targetSet = new Set(
      targetRows.rows.map((r) => buildCodeKey(r.company_name, r.state, r.city)),
    );

    const signatureNameVotes = new Map(); // signature -> Map(name -> {count, years:Set})
    const codeSignatureVotes = new Map(); // codeKey -> Map(signature -> {count, years:Set})

    const files = fs
      .readdirSync(sourceDir)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .sort((a, b) => a.localeCompare(b));

    let scanned = 0;
    for (const fileName of files) {
      console.log(`扫描：${fileName}`);
      const filePath = path.join(sourceDir, fileName);
      for await (const row of iterateCsvObjects(filePath)) {
        scanned += 1;
        const state = cleanText(row.state ?? row.State)?.toUpperCase();
        if (state !== stateCode) continue;

        const city = cleanText(row.city ?? row.City) ?? '';
        const company = cleanText(row.company_name ?? row.CompanyName);
        const estab = cleanText(row.establishment_name ?? row.EstablishmentName);
        const employer = cleanText(row.Employer ?? row.employer);

        const ein = cleanDigits(row.ein ?? row.EIN);
        const addr = normalizeAddress(row.street_address ?? row.Address1 ?? row.MailingAddress);
        const zip = cleanDigits(row.zip_code ?? row.Zip ?? row.ZIPCode);
        const naics = cleanDigits(row.naics_code ?? row['Primary NAICS']);
        const estId = cleanDigits(row.establishment_id ?? row.EstablishmentId);
        const year = extractYear(row.year_filing_for ?? row.Year ?? row.created_timestamp ?? row.created_at);

        // 严格策略要求 EIN + 地址双一致
        if (!ein || !addr) continue;

        const signature = [state, city, ein, addr, zip ?? '', naics ?? '', estId ?? ''].join('|');
        const candidateName = pickAlphaName(company, estab, employer);
        if (candidateName) {
          addNameVote(signatureNameVotes, signature, candidateName, year);
        }

        const code = pickCodeName(company, estab, employer);
        if (!code) continue;

        const codeKey = buildCodeKey(code, state, city);
        if (!targetSet.has(codeKey)) continue;

        addSignatureVote(codeSignatureVotes, codeKey, signature, year);
      }
    }

    console.log(`扫描完成：${scanned} 行`);

    const mappings = [];
    for (const [codeKey, signatureMap] of codeSignatureVotes.entries()) {
      const sigRanked = rankVotes(signatureMap);
      const topSig = sigRanked[0];
      const secondSig = sigRanked[1];
      if (!topSig) continue;

      // 严格：签名至少跨2年且计数>=2
      if (topSig.years < 2 || topSig.count < 2) continue;
      if (secondSig && topSig.count < secondSig.count * 1.5) continue;

      const nameMap = signatureNameVotes.get(topSig.key);
      if (!nameMap) continue;
      const nameRanked = rankVotes(nameMap);
      const topName = nameRanked[0];
      const secondName = nameRanked[1];
      if (!topName) continue;

      // 严格：名称也需跨2年且有优势
      if (topName.years < 2 || topName.count < 2) continue;
      if (secondName && topName.count < secondName.count * 1.5) continue;

      const [old_name, state, city] = splitCodeKey(codeKey);
      mappings.push({
        old_name,
        new_name: topName.key,
        normalized_name: normalizeCompanyName(topName.key),
        state,
        city: city || null,
        evidence_count: topName.count,
        evidence_years: topName.years,
      });
    }

    console.log(`第三轮可用映射：${mappings.length}`);

    const stats = await summarizeMatches(client, mappings);
    console.log(`数据库命中：OSHA ${stats.osha_rows}，companies ${stats.company_rows}`);

    if (dryRun) {
      console.log('Dry run，不写库。样例：');
      for (const x of mappings.slice(0, 20)) {
        console.log(`- ${x.old_name} @ ${x.city ?? 'n/a'} => ${x.new_name} (count=${x.evidence_count}, years=${x.evidence_years})`);
      }
      return;
    }

    await client.query('BEGIN');
    await applyBackfill(client, mappings);
    await rebuildCompanyPages(client, stateCode);
    await client.query('COMMIT');
    console.log('第三轮严格回填完成。');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

function rankVotes(map) {
  return [...map.entries()]
    .map(([key, v]) => ({ key, count: v.count, years: v.years.size }))
    .sort((a, b) => (b.count - a.count) || (b.years - a.years) || a.key.localeCompare(b.key));
}

function addNameVote(container, signature, name, year) {
  const m = container.get(signature) ?? new Map();
  const cur = m.get(name) ?? { count: 0, years: new Set() };
  cur.count += 1;
  if (year) cur.years.add(year);
  m.set(name, cur);
  container.set(signature, m);
}

function addSignatureVote(container, codeKey, signature, year) {
  const m = container.get(codeKey) ?? new Map();
  const cur = m.get(signature) ?? { count: 0, years: new Set() };
  cur.count += 1;
  if (year) cur.years.add(year);
  m.set(signature, cur);
  container.set(codeKey, m);
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
          evidence_count integer,
          evidence_years integer
        )
      )
      SELECT
        (SELECT COUNT(*)::int
         FROM osha_inspections oi
         JOIN incoming i
           ON oi.company_name = i.old_name
          AND upper(oi.state) = upper(i.state)
          AND coalesce(upper(oi.city), '') = coalesce(upper(i.city), '')
         WHERE oi.company_name !~* '[A-Za-z]') AS osha_rows,
        (SELECT COUNT(*)::int
         FROM companies c
         JOIN incoming i
           ON c.name = i.old_name
          AND upper(c.state) = upper(i.state)
          AND coalesce(upper(c.city), '') = coalesce(upper(i.city), '')
         WHERE c.name !~* '[A-Za-z]') AS company_rows
    `,
    [payload],
  );
  return rows[0] ?? { osha_rows: 0, company_rows: 0 };
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
          evidence_count integer,
          evidence_years integer
        )
      )
      UPDATE osha_inspections oi
      SET company_name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE oi.company_name = i.old_name
        AND oi.company_name !~* '[A-Za-z]'
        AND upper(oi.state) = upper(i.state)
        AND coalesce(upper(oi.city), '') = coalesce(upper(i.city), '')
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
          evidence_count integer,
          evidence_years integer
        )
      )
      UPDATE companies c
      SET name = i.new_name,
          normalized_name = i.normalized_name
      FROM incoming i
      WHERE c.name = i.old_name
        AND c.name !~* '[A-Za-z]'
        AND upper(c.state) = upper(i.state)
        AND coalesce(upper(c.city), '') = coalesce(upper(i.city), '')
    `,
    [payload],
  );
}

async function rebuildCompanyPages(client, state) {
  await client.query(
    `
      DELETE FROM company_pages
      WHERE upper(state) = upper($1)
        AND company_name !~* '[A-Za-z]'
    `,
    [state],
  );

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
        AND NOT EXISTS (SELECT 1 FROM company_pages cp WHERE cp.slug = s.slug)
    `,
    [state],
  );
}

function pickAlphaName(company, estab, employer) {
  for (const x of [company, estab, employer]) {
    if (x && hasAlphabet(x) && !isCodeName(x)) return x;
  }
  return null;
}

function pickCodeName(company, estab, employer) {
  for (const x of [company, estab, employer]) {
    if (x && isCodeName(x)) return x;
  }
  return null;
}

function extractYear(value) {
  const text = cleanText(value);
  if (!text) return null;
  const m = text.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function buildCodeKey(code, state, city) {
  return [code, state, city].join('||');
}

function splitCodeKey(key) {
  const [a, b, c] = key.split('||');
  return [a, b, c];
}

function cleanText(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

function cleanDigits(v) {
  const t = cleanText(v);
  if (!t) return null;
  const d = t.replace(/[^0-9]/g, '');
  return d || null;
}

function normalizeAddress(v) {
  const t = cleanText(v);
  if (!t) return null;
  return t.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function hasAlphabet(v) {
  return /[A-Za-z]/.test(String(v ?? ''));
}

function isCodeName(v) {
  const t = String(v ?? '').trim();
  return (
    /^[0-9]{3,}[-/ ][0-9A-Za-z-]+$/.test(t) ||
    /^[0-9]{6,}$/.test(t) ||
    /^[0-9]+\.[0-9]+$/.test(t)
  );
}

async function* iterateCsvObjects(filePath) {
  let headers = null;
  for await (const values of iterateCsvRecords(filePath)) {
    if (!headers) {
      headers = values.map((x) => x.trim());
      continue;
    }
    const rec = Object.create(null);
    for (let i = 0; i < headers.length; i += 1) rec[headers[i]] = values[i] ?? '';
    yield rec;
  }
}

async function* iterateCsvRecords(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let buffer = '';
  for await (const line of rl) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if (!isCompleteCsvRecord(buffer)) continue;
    yield parseCsvLine(buffer);
    buffer = '';
  }
  if (buffer) yield parseCsvLine(buffer);
}

function isCompleteCsvRecord(input) {
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== '"') continue;
    if (inQuotes && input[i + 1] === '"') {
      i += 1;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return !inQuotes;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

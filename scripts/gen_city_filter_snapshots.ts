/**
 * gen_city_filter_snapshots.ts
 * 从已生成的 state/{stateSlug}.json 拆分出城市和筛选快照
 * 零 DB 查询 — 直接内存拆分
 *
 * 用法：
 *   npx tsx scripts/gen_city_filter_snapshots.ts
 *   SNAPSHOT_STATE=california npx tsx scripts/gen_city_filter_snapshots.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const ROOT      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.SNAPSHOT_DATA_ROOT ?? path.join(ROOT, 'kuaizhao', 'data');

const TARGET_STATES = (process.env.SNAPSHOT_STATE ?? 'california').split(',').map(s => s.trim());

// ─── 与 filter 页面一致的过滤逻辑 ─────────────────────────────────────────────

type Company = {
  company_name: string;
  slug: string;
  state: string;
  city: string | null;
  has_osha: boolean;
  has_license: boolean;
  has_registration: boolean;
  osha_count: number | null;
  injury_count: number | null;
  license_status: string | null;
  updated_at: string | null;
  [k: string]: unknown;
};

function categoryOf(c: Company): string {
  const sources = [c.has_osha, c.has_license, c.has_registration].filter(Boolean).length;
  if (sources === 3) return 'full';
  if (c.has_osha && !c.has_license && !c.has_registration) return 'osha-only';
  if (!c.has_osha && c.has_license && !c.has_registration) return 'license-only';
  if (!c.has_osha && !c.has_license && c.has_registration) return 'registration-only';
  if (sources === 2) return 'partial';
  return 'basic';
}

function isEncodedName(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return /^[0-9]/.test(name) || /^[A-Z0-9-]{10,}$/.test(compact) || /\d{3,}/.test(compact);
}

function qualityScore(c: Company): number {
  let score = 0;
  score += Math.min(c.osha_count ?? 0, 10) * 10;
  score += Math.min(c.injury_count ?? 0, 5) * 20;
  score += c.has_license ? 15 : 0;
  score += c.has_registration ? 10 : 0;
  score += (c.license_status ?? '').toLowerCase() === 'active' ? 20 : 0;
  score += isEncodedName(c.company_name) ? 0 : 25;
  return score;
}

function compareCompanies(a: Company, b: Company): number {
  const diff = qualityScore(b) - qualityScore(a);
  return diff !== 0 ? diff : a.company_name.localeCompare(b.company_name);
}

function summarizeCategories(companies: Company[]) {
  return {
    full: companies.filter((c) => categoryOf(c) === 'full').length,
    partial: companies.filter((c) => categoryOf(c) === 'partial').length,
    oshaOnly: companies.filter((c) => categoryOf(c) === 'osha-only').length,
    licenseOnly: companies.filter((c) => categoryOf(c) === 'license-only').length,
    registrationOnly: companies.filter((c) => categoryOf(c) === 'registration-only').length,
    basic: companies.filter((c) => categoryOf(c) === 'basic').length,
  };
}

function toCitySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function normalizeCityName(city: string | null): string {
  const raw = (city ?? '').trim();
  if (!raw) return '';
  return raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

const PRIMARY_FILTER_SLUGS = [
  'quality', 'osha-violations', 'recently-updated', 'active-licenses',
  'full-profiles', 'partial-profiles', 'osha-only', 'license-only',
  'registration-only', 'basic-listings', 'contractor-licenses',
  'business-registration', 'expired-licenses', 'suspended-licenses',
];

function applyFilter(companies: Company[], filterSlug: string): Company[] {
  let result = [...companies];

  switch (filterSlug) {
    case 'full-profiles':       result = result.filter(c => categoryOf(c) === 'full'); break;
    case 'partial-profiles':    result = result.filter(c => categoryOf(c) === 'partial'); break;
    case 'osha-only':           result = result.filter(c => categoryOf(c) === 'osha-only'); break;
    case 'license-only':        result = result.filter(c => categoryOf(c) === 'license-only'); break;
    case 'registration-only':   result = result.filter(c => categoryOf(c) === 'registration-only'); break;
    case 'basic-listings':      result = result.filter(c => categoryOf(c) === 'basic'); break;
    case 'contractor-licenses': result = result.filter(c => c.has_license); break;
    case 'business-registration': result = result.filter(c => c.has_registration); break;
    case 'osha-violations':     result = result.filter(c => c.has_osha); break;
    case 'active-licenses':     result = result.filter(c => (c.license_status ?? '').toLowerCase() === 'active'); break;
    case 'expired-licenses':    result = result.filter(c => (c.license_status ?? '').toLowerCase() === 'expired'); break;
    case 'suspended-licenses':  result = result.filter(c => (c.license_status ?? '').toLowerCase() === 'suspended'); break;
  }

  // 排序
  if (filterSlug === 'osha-violations') {
    result.sort((a, b) => (b.osha_count ?? 0) - (a.osha_count ?? 0) || compareCompanies(a, b));
  } else if (filterSlug === 'recently-updated') {
    result.sort((a, b) => {
      const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const db2 = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return db2 - da || compareCompanies(a, b);
    });
  } else {
    result.sort(compareCompanies);
  }

  return result;
}

async function writeJson(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
}

// ─── 从数据库直接聚合生成 StateCompanyCategoryRow ───────────────────────────

const STATE_SLUG_TO_CODES: Record<string, string[]> = {
  california: ['ca', 'california'],
  florida: ['fl', 'florida'],
};

function getStateCodes(stateSlug: string): string[] {
  return STATE_SLUG_TO_CODES[stateSlug] ?? [stateSlug];
}

async function loadCompaniesFromDatabase(stateSlug: string): Promise<Company[]> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://gongsi_admin:gongsi_pass_2026@localhost:54333/gongsihegui_db'
  });

  const stateCodes = getStateCodes(stateSlug);
  const { rows } = await pool.query<Company>(
    `WITH filtered_companies AS (
       SELECT
         replace(regexp_replace(cp.slug, '^/?company/', ''), '\\', '') AS slug,
         cp.company_name,
         cp.state,
         cp.city,
         cp.updated_at::text AS updated_at,
         normalize_company_name(cp.company_name) AS normalized_name
       FROM company_pages cp
       WHERE cp.company_name ~* '[A-Za-z]'
         AND lower(trim(cp.company_name)) <> '- select -'
         AND (
           lower(trim(cp.state)) = ANY($1::text[])
           OR lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = ANY($1::text[])
         )
     ),
     osha_counts AS (
       SELECT
         oi.normalized_name,
         COUNT(*) FILTER (WHERE oi.inspection_date IS NOT NULL)::int AS osha_count,
         COUNT(*) FILTER (
           WHERE oi.inspection_date IS NOT NULL
             AND (
               oi.severity ~ '^injury_count:[0-9]+$'
               OR oi.severity ~ '^fatality:[0-9]+$'
             )
         )::int AS injury_count,
         MAX(oi.inspection_date)::text AS latest_inspection_date
       FROM osha_inspections oi
       WHERE (
         lower(trim(oi.state)) = ANY($1::text[])
         OR lower(regexp_replace(oi.state, '\\s+', '-', 'g')) = ANY($1::text[])
       )
       GROUP BY oi.normalized_name
     ),
     license_counts AS (
       SELECT
         cl.normalized_name,
         COUNT(*) FILTER (WHERE cl.issue_date IS NOT NULL)::int AS license_count
       FROM contractor_licenses cl
       WHERE (
         lower(trim(cl.state)) = ANY($1::text[])
         OR lower(regexp_replace(cl.state, '\\s+', '-', 'g')) = ANY($1::text[])
       )
       GROUP BY cl.normalized_name
     ),
     latest_license AS (
       SELECT DISTINCT ON (cl.normalized_name)
         cl.normalized_name,
         cl.status AS license_status
       FROM contractor_licenses cl
       WHERE (
         lower(trim(cl.state)) = ANY($1::text[])
         OR lower(regexp_replace(cl.state, '\\s+', '-', 'g')) = ANY($1::text[])
       )
       ORDER BY cl.normalized_name, cl.issue_date DESC NULLS LAST, cl.created_at DESC
     ),
     registration_counts AS (
       SELECT
         cr.normalized_name,
         COUNT(*) FILTER (WHERE cr.incorporation_date IS NOT NULL)::int AS registration_count
       FROM company_registrations cr
       WHERE (
         lower(trim(cr.state)) = ANY($1::text[])
         OR lower(regexp_replace(cr.state, '\\s+', '-', 'g')) = ANY($1::text[])
       )
       GROUP BY cr.normalized_name
     )
     SELECT
       fc.slug,
       fc.company_name,
       fc.state,
       fc.city,
       (COALESCE(oc.osha_count, 0) > 0) AS has_osha,
       (COALESCE(lc.license_count, 0) > 0) AS has_license,
       (COALESCE(rc.registration_count, 0) > 0) AS has_registration,
       COALESCE(oc.osha_count, 0) AS osha_count,
       COALESCE(oc.injury_count, 0) AS injury_count,
       ll.license_status,
       fc.updated_at,
       oc.latest_inspection_date
     FROM filtered_companies fc
     LEFT JOIN osha_counts oc ON oc.normalized_name = fc.normalized_name
     LEFT JOIN license_counts lc ON lc.normalized_name = fc.normalized_name
     LEFT JOIN latest_license ll ON ll.normalized_name = fc.normalized_name
     LEFT JOIN registration_counts rc ON rc.normalized_name = fc.normalized_name
     ORDER BY fc.company_name ASC`,
    [stateCodes]
  );

  await pool.end();
  return rows;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
async function processState(stateSlug: string) {
  console.log(`  [${stateSlug}] 从数据库聚合读取数据...`);
  const allCompanies = await loadCompaniesFromDatabase(stateSlug);
  console.log(`  [${stateSlug}] 共 ${allCompanies.length} 家公司`);

  // 先覆盖 state 快照为全量（避免旧文件仅 5000 条）
  const cityCounts = Array.from(
    allCompanies.reduce((m, c) => {
      const city = normalizeCityName(c.city);
      if (!city) return m;
      m.set(city, (m.get(city) ?? 0) + 1);
      return m;
    }, new Map<string, number>())
  )
    .map(([city, company_count]) => ({ city, company_count }))
    .sort((a, b) => b.company_count - a.company_count || a.city.localeCompare(b.city));

  const sortedCompanies = [...allCompanies].sort(compareCompanies);
  const topCompanies = sortedCompanies.slice(0, 100);
  const analyzedBase = Math.max(1, allCompanies.length);
  const categoryCount = summarizeCategories(allCompanies);

  await writeJson(path.join(DATA_ROOT, 'state', `${stateSlug}.json`), {
    generatedAt: new Date().toISOString(),
    state: stateSlug,
    summary: {
      state: stateSlug,
      company_count: allCompanies.length,
      osha_count: allCompanies.filter((c) => c.has_osha).length,
      license_count: allCompanies.filter((c) => c.has_license).length,
      registration_count: allCompanies.filter((c) => c.has_registration).length,
    },
    companyPages: topCompanies,
    cityCounts,
    stats: {
      analyzed_company_count: allCompanies.length,
      categoryCount,
      oshaCoveragePct: Number((((allCompanies.filter((c) => c.has_osha).length) / analyzedBase) * 100).toFixed(1)),
      licenseCoveragePct: Number((((allCompanies.filter((c) => c.has_license).length) / analyzedBase) * 100).toFixed(1)),
      registrationCoveragePct: Number((((allCompanies.filter((c) => c.has_registration).length) / analyzedBase) * 100).toFixed(1)),
    },
    citiesMap: null,
  });
  console.log(`  [${stateSlug}] 州快照已改为轻量版 (topCompanies=100, analyzed=${allCompanies.length})`);

  // ── 城市快照 ───────────────────────────────────────────────────────────────
  const cityDir = path.join(DATA_ROOT, 'city', stateSlug);
  await fs.mkdir(cityDir, { recursive: true });

  // 按城市分组
  const citiesMap = new Map<string, Company[]>();
  for (const c of allCompanies) {
    const name = normalizeCityName(c.city);
    if (!name) continue;
    const slug = toCitySlug(name);
    if (!citiesMap.has(slug)) citiesMap.set(slug, []);
    citiesMap.get(slug)!.push(c);
  }

  let cityCount = 0;
  for (const [citySlug, companies] of citiesMap) {
    const sorted = [...companies].sort(compareCompanies);
    await writeJson(path.join(cityDir, `${citySlug}.json`), {
      generatedAt: new Date().toISOString(),
      stateSlug,
      citySlug,
      companies: sorted,
    });
    cityCount++;
  }
  console.log(`  [${stateSlug}] 城市快照: ${cityCount} 个`);

  // ── 筛选快照 ───────────────────────────────────────────────────────────────
  const filterDir = path.join(DATA_ROOT, 'filter', stateSlug);
  await fs.mkdir(filterDir, { recursive: true });

  for (const filterSlug of PRIMARY_FILTER_SLUGS) {
    const filtered = applyFilter(allCompanies, filterSlug);
    const topForFilter = filtered.slice(0, 100); // 只取前 100 条，减少文件大小
    const categoryCount = summarizeCategories(filtered);
    
    await writeJson(path.join(filterDir, `${filterSlug}.json`), {
      generatedAt: new Date().toISOString(),
      stateSlug,
      filterSlug,
      summary: {
        total_count: filtered.length,
        shown_count: topForFilter.length,
        categoryCount,
      },
      companies: topForFilter, // 轻量版：只保留前 100
    });
    process.stdout.write('.');
  }
  console.log(`\n  [${stateSlug}] 筛选快照: ${PRIMARY_FILTER_SLUGS.length} 个 (每个最多 100 家公司)`);
}

async function main() {
  console.log('▶ 城市 & 筛选快照生成（从 state 快照拆分，零 DB 查询）');
  console.log(`  数据目录: ${DATA_ROOT}`);
  const start = Date.now();

  for (const stateSlug of TARGET_STATES) {
    console.log(`\n处理州: ${stateSlug}`);
    await processState(stateSlug);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  // 统计
  let cityTotal = 0, filterTotal = 0;
  for (const stateSlug of TARGET_STATES) {
    try {
      cityTotal  += (await fs.readdir(path.join(DATA_ROOT, 'city',   stateSlug))).length;
      filterTotal += (await fs.readdir(path.join(DATA_ROOT, 'filter', stateSlug))).length;
    } catch {}
  }
  console.log(`\n📊 城市快照: ${cityTotal} | 筛选快照: ${filterTotal} | 用时: ${elapsed}s`);
  console.log('✅ 完成！');
}

main().catch(e => { console.error('❌', e); process.exit(1); });

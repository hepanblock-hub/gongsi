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
import { sanitizeSnapshotSlug } from '../lib/snapshotKey';

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

// ─── 从 company 快照推导 StateCompanyCategoryRow ─────────────────────────────

type RawSnapshot = {
  slug: string;
  osha: Array<{ severity?: string | null; inspection_date?: string | null }>;
  licenses: Array<{ status?: string | null; issue_date?: string | null }>;
  registrations: Array<{ incorporation_date?: string | null }>;
};

function snapshotToCategory(
  base: { slug: string; company_name: string; state: string; city: string | null; updated_at: string | null },
  snap: RawSnapshot | null,
): Company {
  const osha = snap?.osha ?? [];
  const licenses = snap?.licenses ?? [];
  const registrations = snap?.registrations ?? [];

  const injuryOsha = osha.filter(o =>
    o.severity && (/^injury_count:\d+$/i.test(o.severity) || /^fatality:\d+$/i.test(o.severity))
  );

  const latestLicense = licenses.sort((a, b) => {
    const da = a.issue_date ? new Date(a.issue_date).getTime() : 0;
    const db2 = b.issue_date ? new Date(b.issue_date).getTime() : 0;
    return db2 - da;
  })[0];

  return {
    slug:           base.slug,
    company_name:   base.company_name,
    state:          base.state,
    city:           base.city,
    updated_at:     base.updated_at ?? null,
    has_osha:       osha.length > 0,
    has_license:    licenses.length > 0,
    has_registration: registrations.length > 0,
    osha_count:     osha.length,
    injury_count:   injuryOsha.length,
    license_status: latestLicense?.status ?? null,
    latest_inspection_date: osha[0]?.inspection_date ?? null,
  };
}

async function loadCompaniesFromSnapshots(stateSlug: string): Promise<Company[]> {
  const companyDir = path.join(DATA_ROOT, 'company');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://gongsi_admin:gongsi_pass_2026@localhost:54333/gongsihegui_db' });

  const caWhere = "(lower(trim(state)) IN ('ca','california') OR lower(regexp_replace(state, '\\s+', '-', 'g'))='california')";
  const sql = stateSlug === 'california'
    ? `SELECT slug, company_name, state, city, updated_at::text FROM company_pages WHERE ${caWhere} AND company_name ~* '[A-Za-z]' AND lower(trim(company_name)) <> '- select -' ORDER BY id ASC`
    : `SELECT slug, company_name, state, city, updated_at::text FROM company_pages WHERE lower(regexp_replace(state, '\\s+', '-', 'g'))=$1 AND company_name ~* '[A-Za-z]' AND lower(trim(company_name)) <> '- select -' ORDER BY id ASC`;

  const { rows } = stateSlug === 'california'
    ? await pool.query<{ slug: string; company_name: string; state: string; city: string | null; updated_at: string | null }>(sql)
    : await pool.query<{ slug: string; company_name: string; state: string; city: string | null; updated_at: string | null }>(sql, [stateSlug]);

  await pool.end();

  const results: Company[] = [];
  let loaded = 0;
  for (const base of rows) {
    const cleanSlug = String(base.slug).replace(/^\/?company\//, '');
    const candidates = [cleanSlug, sanitizeSnapshotSlug(cleanSlug)];
    let snap: RawSnapshot | null = null;
    try {
      let raw: string | null = null;
      for (const candidate of [...new Set(candidates)]) {
        const fp = path.join(companyDir, `${candidate}.json`);
        try {
          raw = await fs.readFile(fp, 'utf8');
          break;
        } catch {}
      }
      if (raw) snap = JSON.parse(raw) as RawSnapshot;
      else throw new Error('missing snapshot');
    } catch {
      snap = { slug: cleanSlug, osha: [], licenses: [], registrations: [] };
    }
    results.push(snapshotToCategory({ ...base, slug: cleanSlug }, snap));
    loaded++;
    if (loaded % 10000 === 0) process.stdout.write(`\r    已读取: ${loaded}/${rows.length}...   `);
  }
  process.stdout.write('\r');
  return results;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
async function processState(stateSlug: string) {
  console.log(`  [${stateSlug}] 从 company 快照读取数据...`);
  const allCompanies = await loadCompaniesFromSnapshots(stateSlug);
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

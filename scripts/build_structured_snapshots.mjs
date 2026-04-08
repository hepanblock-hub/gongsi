import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { getWorkspaceRoot, loadWorkspaceEnv } from './_env.mjs';

const { Pool } = pg;
const ROOT = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(ROOT);

const OUTPUT_ROOT = path.join(ROOT, 'kuaizhao', 'data');
const STATE_DIR = path.join(OUTPUT_ROOT, 'state');
const CITY_DIR = path.join(OUTPUT_ROOT, 'city');
const FILTER_DIR = path.join(OUTPUT_ROOT, 'filter');
const COMPANY_DIR = path.join(OUTPUT_ROOT, 'company');

const ROOT_PAGES = [
  '/',
  '/search',
  '/about',
  '/faq',
  '/methodology',
  '/privacy',
  '/terms',
  '/sources',
  '/editorial-policy',
];

const FILTER_SLUGS = [
  'quality',
  'osha-violations',
  'recently-updated',
  'active-licenses',
  'full-profiles',
  'partial-profiles',
  'osha-only',
  'license-only',
  'registration-only',
  'basic-listings',
  'contractor-licenses',
  'business-registration',
  'expired-licenses',
  'suspended-licenses',
];

function isLocalDb(raw) {
  try {
    const u = new URL(raw);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function citySlug(raw) {
  const value = (raw ?? '').trim().replace(/^"+|"+$/g, '');
  if (!value) return null;
  const normalized = value
    .replace(/,\s*(ca|california)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const isAddressLike =
    /^\d+\b/.test(normalized) ||
    /\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\b/i.test(normalized) ||
    normalized.length > 40;

  if (isAddressLike || /^(-\s*select\s*-|select|unknown|n\/?a)$/i.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function ensureStructure() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(CITY_DIR, { recursive: true });
  await fs.mkdir(FILTER_DIR, { recursive: true });
  await fs.mkdir(COMPANY_DIR, { recursive: true });

  // 删除旧 query_* 目录，保持结构干净
  const entries = await fs.readdir(OUTPUT_ROOT, { withFileTypes: true });
  await Promise.all(entries
    .filter((e) => e.isDirectory() && e.name.startsWith('query_'))
    .map((e) => fs.rm(path.join(OUTPUT_ROOT, e.name), { recursive: true, force: true })));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL 未设置');
  if (!isLocalDb(dbUrl)) throw new Error('DATABASE_URL 非本地数据库，已阻止执行');

  await ensureStructure();

  const pool = new Pool({ connectionString: dbUrl, ssl: false });

  const generatedAt = new Date().toISOString();
  console.log('开始生成结构化快照...');
  console.log('输出目录:', OUTPUT_ROOT);

  // 1) 根目录页面
  for (const route of ROOT_PAGES) {
    const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9-]/gi, '_');
    await writeJson(path.join(OUTPUT_ROOT, `${name}.json`), {
      type: 'root',
      route,
      generatedAt,
    });
  }
  console.log('✓ 根页面快照完成');

  // 2) 州页面（当前站点按 california）
  await writeJson(path.join(STATE_DIR, 'california.json'), {
    type: 'state',
    stateSlug: 'california',
    route: '/state/california',
    generatedAt,
  });
  console.log('✓ 州页面快照完成');

  // 3) 城市页面
  const cityRows = await pool.query(
    `SELECT DISTINCT city
     FROM company_pages
     WHERE state = 'CA'
       AND city IS NOT NULL
       AND trim(city) <> ''`
  );

  const citySet = new Set();
  for (const r of cityRows.rows) {
    const slug = citySlug(r.city);
    if (slug) citySet.add(slug);
  }

  for (const slug of citySet) {
    await writeJson(path.join(CITY_DIR, `${slug}.json`), {
      type: 'city',
      stateSlug: 'california',
      citySlug: slug,
      route: `/state/california/city/${slug}`,
      generatedAt,
    });
  }
  console.log(`✓ 城市页面快照完成 (${citySet.size})`);

  // 4) 筛选页面
  for (const slug of FILTER_SLUGS) {
    await writeJson(path.join(FILTER_DIR, `${slug}.json`), {
      type: 'filter',
      stateSlug: 'california',
      filterSlug: slug,
      route: `/state/california/filter/${slug}`,
      generatedAt,
    });
  }
  console.log(`✓ 筛选页面快照完成 (${FILTER_SLUGS.length})`);

  // 5) 公司页面
  const companyRows = await pool.query(
    `SELECT slug, company_name, state, city
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
     ORDER BY id ASC`
  );

  let i = 0;
  for (const row of companyRows.rows) {
    const slugPath = row.slug.startsWith('/company/') ? row.slug : `/company/${row.slug}`;
    const fileSlug = slugPath.replace(/^\/company\//, '');
    await writeJson(path.join(COMPANY_DIR, `${fileSlug}.json`), {
      type: 'company',
      slug: fileSlug,
      route: slugPath,
      companyName: row.company_name,
      state: row.state,
      city: row.city,
      generatedAt,
    });

    i += 1;
    if (i % 10000 === 0) process.stdout.write(`\r公司快照: ${i}/${companyRows.rows.length}`);
  }
  process.stdout.write(`\r公司快照: ${companyRows.rows.length}/${companyRows.rows.length}\n`);

  await writeJson(path.join(OUTPUT_ROOT, 'manifest.json'), {
    generatedAt,
    rootPages: ROOT_PAGES.length,
    statePages: 1,
    cityPages: citySet.size,
    filterPages: FILTER_SLUGS.length,
    companyPages: companyRows.rows.length,
    structure: {
      root: OUTPUT_ROOT,
      state: STATE_DIR,
      city: CITY_DIR,
      filter: FILTER_DIR,
      company: COMPANY_DIR,
    },
  });

  await pool.end();
  console.log('✓ 全部完成');
}

main().catch((e) => {
  console.error('失败:', e.message || e);
  process.exit(1);
});

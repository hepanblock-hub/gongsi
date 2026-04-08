import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getWorkspaceRoot, loadWorkspaceEnv } from './_env.mjs';

const { Pool } = pg;
const ROOT = getWorkspaceRoot(import.meta.url);
loadWorkspaceEnv(ROOT);

const BASE_URL = (process.env.SNAPSHOT_BASE_URL || 'http://localhost:39017').replace(/\/$/, '');
const OUTPUT_ROOT = path.join(ROOT, 'kuaizhao', 'data');
const STATE_DIR = path.join(OUTPUT_ROOT, 'state');
const CITY_DIR = path.join(OUTPUT_ROOT, 'city');
const FILTER_DIR = path.join(OUTPUT_ROOT, 'filter');
const COMPANY_DIR = path.join(OUTPUT_ROOT, 'company');
const CONCURRENCY = Number(process.env.SNAPSHOT_CONCURRENCY || 12);
const COMPANY_LIMIT = Number(process.env.SNAPSHOT_COMPANY_LIMIT || 0);

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

  if (isAddressLike || /^(-\s*select\s*-|select|unknown|n\/?a)$/i.test(normalized)) return null;
  return normalized.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function safeName(routePath) {
  if (routePath === '/') return 'home';
  return routePath.replace(/^\//, '').replace(/\//g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extractMeta(html, pattern) {
  const m = html.match(pattern);
  return m?.[1]?.trim() ?? '';
}

async function ensureStructure() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(CITY_DIR, { recursive: true });
  await fs.mkdir(FILTER_DIR, { recursive: true });
  await fs.mkdir(COMPANY_DIR, { recursive: true });
}

async function fetchPage(routePath) {
  const url = `${BASE_URL}${routePath}`;
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  const html = await res.text();

  const title = extractMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = extractMeta(html, /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const robots = extractMeta(html, /<meta[^>]*name=["']robots["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const canonical = extractMeta(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([\s\S]*?)["'][^>]*>/i);

  return {
    route: routePath,
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    status: res.status,
    ok: res.ok,
    seo: {
      title,
      description,
      robots,
      canonical,
      noindex: /noindex/i.test(robots),
      jsonLdCount: (html.match(/application\/ld\+json/gi) ?? []).length,
    },
    html,
  };
}

async function pMap(items, mapper, concurrency) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}

async function writeJson(targetPath, payload) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(payload), 'utf8');
}

async function probeSite() {
  try {
    const res = await fetch(`${BASE_URL}/`, { redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL 未设置');
  if (!isLocalDb(dbUrl)) throw new Error('DATABASE_URL 非本地数据库，已阻止执行');

  const siteUp = await probeSite();
  if (!siteUp) {
    throw new Error(`本地站点不可访问：${BASE_URL}。请先启动站点（npm run dev 或 npm run start）`);
  }

  await ensureStructure();
  const pool = new Pool({ connectionString: dbUrl, ssl: false });

  console.log('开始生成“完整渲染快照”...');
  console.log('Base URL:', BASE_URL);
  console.log('Output:', OUTPUT_ROOT);

  // Root pages
  await pMap(ROOT_PAGES, async (route) => {
    const data = await fetchPage(route);
    const fileName = `${safeName(route)}.json`;
    await writeJson(path.join(OUTPUT_ROOT, fileName), data);
  }, 4);
  console.log('✓ 根目录页面完成');

  // State page
  await writeJson(path.join(STATE_DIR, 'california.json'), await fetchPage('/state/california'));
  console.log('✓ 州页面完成');

  // City pages
  const cityRows = await pool.query(`
    SELECT DISTINCT city
    FROM company_pages
    WHERE state = 'CA'
      AND city IS NOT NULL
      AND trim(city) <> ''
  `);
  const citySlugs = Array.from(new Set(cityRows.rows.map((r) => citySlug(r.city)).filter(Boolean)));

  let cityDone = 0;
  await pMap(citySlugs, async (slug) => {
    const data = await fetchPage(`/state/california/city/${slug}`);
    await writeJson(path.join(CITY_DIR, `${slug}.json`), data);
    cityDone += 1;
    if (cityDone % 100 === 0 || cityDone === citySlugs.length) {
      process.stdout.write(`\r城市快照: ${cityDone}/${citySlugs.length}`);
    }
  }, CONCURRENCY);
  process.stdout.write('\n');
  console.log('✓ 城市页面完成');

  // Filter pages
  await pMap(FILTER_SLUGS, async (slug) => {
    const data = await fetchPage(`/state/california/filter/${slug}`);
    await writeJson(path.join(FILTER_DIR, `${slug}.json`), data);
  }, 4);
  console.log('✓ 筛选页面完成');

  // Company pages
  const companyRows = await pool.query(`
    SELECT slug
    FROM company_pages
    WHERE company_name ~* '[A-Za-z]'
      AND lower(trim(company_name)) <> '- select -'
    ORDER BY id ASC
  `);

  const companyItems = COMPANY_LIMIT > 0
    ? companyRows.rows.slice(0, COMPANY_LIMIT)
    : companyRows.rows;

  let done = 0;
  await pMap(companyItems, async (row) => {
    const slug = String(row.slug || '').replace(/^\/company\//, '');
    const route = `/company/${slug}`;
    const data = await fetchPage(route);
    await writeJson(path.join(COMPANY_DIR, `${slug}.json`), data);
    done += 1;
    if (done % 1000 === 0 || done === companyItems.length) {
      process.stdout.write(`\r公司快照: ${done}/${companyItems.length}`);
    }
  }, CONCURRENCY);
  process.stdout.write('\n');
  console.log('✓ 公司页面完成');

  await writeJson(path.join(OUTPUT_ROOT, 'manifest.json'), {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    rootPages: ROOT_PAGES.length,
    statePages: 1,
    cityPages: citySlugs.length,
    filterPages: FILTER_SLUGS.length,
    companyPages: companyItems.length,
    note: '每个 JSON 包含完整 HTML（html 字段）和 SEO 元数据，可直接用于页面渲染',
  });

  await pool.end();
  console.log('✓ 全部完成');
}

main().catch((e) => {
  console.error('失败:', e.message || e);
  process.exit(1);
});

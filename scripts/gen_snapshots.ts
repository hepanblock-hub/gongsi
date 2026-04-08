/**
 * gen_snapshots.ts — 批量高速快照生成脚本
 *
 * 性能对比：
 *   旧模式：每家公司 9 次 DB 查询 → 258K × 9 = 230万次 → 1小时/万家
 *   新模式：每 500 家公司 3 次批量查询 → 258K/500 × 3 ≈ 1500次 → 速度提升 ~150x
 *
 * 环境变量：
 *   SNAPSHOT_COMPANY_LIMIT=N     调试限制（0=不限制）
 *   SNAPSHOT_BATCH_SIZE=500      每批公司数量（默认500）
 *   SNAPSHOT_SKIP_HOME=true      跳过首页阶段
 *   SNAPSHOT_SKIP_COMPANY=true   跳过公司阶段
 *   SNAPSHOT_SKIP_STATE=true     跳过州级阶段
 *
 * 用法：
 *   npm run gen:snapshots:all      全量生成
 *   npm run gen:snapshots:company  仅公司快照
 *   npm run gen:snapshots:home     仅首页
 *   npm run gen:snapshots:state    仅州级
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { sanitizeSnapshotSlug } from '../lib/snapshotKey';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function isLocalDatabaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch { return false; }
}

function loadEnvFile(envPath: string) {
  if (!fsSync.existsSync(envPath)) return;
  const lines = fsSync.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let val = line.slice(sep + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

function normalizeCompanySlug(rawSlug: string): string {
  let slug = String(rawSlug ?? '').trim().replace(/^\/+/, '');
  while (slug.startsWith('company/')) slug = slug.slice('company/'.length);
  return sanitizeSnapshotSlug(slug);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) n += await countFiles(path.join(dir, entry.name));
      else n++;
    }
  } catch { /* ignore */ }
  return n;
}

function printProgress(batchDone: number, totalBatches: number, written: number, skipped: number, startMs: number) {
  const elapsedS = ((Date.now() - startMs) / 1000).toFixed(0);
  const pct = ((batchDone / totalBatches) * 100).toFixed(1);
  const eta = batchDone > 0 && batchDone < totalBatches
    ? (((Date.now() - startMs) / batchDone) * (totalBatches - batchDone) / 60000).toFixed(1)
    : '0';
  process.stdout.write(
    `\r  批次 ${batchDone}/${totalBatches} (${pct}%) | 写入: ${written} | 跳过: ${skipped} | ${elapsedS}s | 剩余~${eta}min   `
  );
}

// 简单的本地名称规范化（与 PG normalize_company_name 保持近似一致）
// 用于将 DB 返回的 normalized_name 与公司名称对应
function localNorm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(inc|llc|ltd|corp|co|company|the|and|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── 分阶段开关 ──────────────────────────────────────────────────────────────
const SKIP_HOME_PHASE    = (process.env.SNAPSHOT_SKIP_HOME    ?? 'false') === 'true';
const SKIP_COMPANY_PHASE = (process.env.SNAPSHOT_SKIP_COMPANY ?? 'false') === 'true';
const SKIP_STATE_PHASE   = (process.env.SNAPSHOT_SKIP_STATE   ?? 'false') === 'true';
const SNAPSHOT_STATE     = (process.env.SNAPSHOT_STATE ?? 'california').toLowerCase();

// ─── 主函数 ──────────────────────────────────────────────────────────────────
async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(scriptDir, '..');

  loadEnvFile(path.join(ROOT, '.env'));

  const DATA_ROOT   = path.join(ROOT, 'kuaizhao', 'data');
  const COMPANY_DIR = path.join(DATA_ROOT, 'company');
  const STATE_DIR   = path.join(DATA_ROOT, 'state');

  await fs.mkdir(COMPANY_DIR, { recursive: true });
  await fs.mkdir(STATE_DIR,   { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, 'city'),   { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, 'filter'), { recursive: true });

  const DB_URL = process.env.DATABASE_URL ?? '';
  if (!DB_URL) { console.error('❌ DATABASE_URL 未设置'); process.exit(1); }
  if (!isLocalDatabaseUrl(DB_URL)) { console.error('❌ DATABASE_URL 必须是本地数据库'); process.exit(1); }

  console.log('▶ 批量快照生成开始');
  console.log(`  DB : ${DB_URL.replace(/:[^@]+@/, ':***@')}`);
  console.log(`  Dir: ${DATA_ROOT}`);
  console.log(`  Skip: HOME=${SKIP_HOME_PHASE} COMPANY=${SKIP_COMPANY_PHASE} STATE=${SKIP_STATE_PHASE}`);

  // 直接用 pg Pool — 不走 Prisma，跳过额外开销
  const pool = new Pool({
    connectionString: DB_URL,
    max: Number(process.env.SNAPSHOT_DB_POOL_MAX ?? 8),
    connectionTimeoutMillis: 120_000,
    idleTimeoutMillis: 60_000,
    allowExitOnIdle: true,
  });

  const rawLimit   = Number(process.env.SNAPSHOT_COMPANY_LIMIT ?? 0);
  const rowLimit   = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 0;
  const BATCH_SIZE = Math.max(50, Number(process.env.SNAPSHOT_BATCH_SIZE ?? 500));
  const globalStart = Date.now();

  // ── [1/4] 查询全部公司 ──────────────────────────────────────────────────────
  console.log('\n[1/4] 查询全部 company_pages …');
  const stateFilter = SNAPSHOT_STATE === 'california'
    ? "(lower(trim(state)) IN ('ca','california') OR lower(regexp_replace(state, '\\s+', '-', 'g')) = 'california')"
    : "(lower(regexp_replace(state, '\\s+', '-', 'g')) = $1 OR lower(trim(state)) = $1)";

  const baseSql = `SELECT slug, company_name, lower(trim(state)) AS state, city
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
       AND ${stateFilter}
     ORDER BY id ASC`;

  const { rows: allRows } = SNAPSHOT_STATE === 'california'
    ? await pool.query<{
        slug: string; company_name: string; state: string; city: string | null;
      }>(baseSql)
    : await pool.query<{
        slug: string; company_name: string; state: string; city: string | null;
      }>(baseSql, [SNAPSHOT_STATE]);
  const rows = rowLimit > 0 ? allRows.slice(0, rowLimit) : allRows;
  console.log(`  州: ${SNAPSHOT_STATE}`);
  console.log(`  总计: ${allRows.length} | 执行: ${rows.length}${rowLimit > 0 ? '  ⚠ 调试限制' : ''}`);
  console.log(`  批次大小: ${BATCH_SIZE} | 预计批次数: ${Math.ceil(rows.length / BATCH_SIZE)}`);

  // ── [2/4] 公司快照（批量模式 — 每批 300 家公司一次 SQL 查询）────────────────────
  if (!SKIP_COMPANY_PHASE) {
    console.log(`\n[2/4] 公司快照（wangzhan 批量模式）…`);

    const batches = chunk(rows, BATCH_SIZE);
    let batchIdx = 0;
    let totalWritten = 0;
    let totalSkipped = 0;

    for (const batchRows of batches) {
      batchIdx++;

      // ① 先检查哪些文件已存在
      const needWrite: typeof batchRows = [];
      for (const row of batchRows) {
        const slug = normalizeCompanySlug(row.slug);
        const outFile = path.join(COMPANY_DIR, `${slug}.json`);
        if (await fileExists(outFile)) {
          totalSkipped++;
        } else {
          needWrite.push(row);
        }
      }

      if (needWrite.length > 0) {
        const companyNames = needWrite.map(r => r.company_name);
        const companySlugs = needWrite.map(r => normalizeCompanySlug(r.slug));

        // ② 一次查询拉回这批 300 个公司的全部 osha/license/registration 数据
        const [oshaRes, licenseRes, regRes, detailRes] = await Promise.all([
          pool.query<{
            normalized_name: string;
            inspection_date: string | null;
            inspection_type: string | null;
            violation_type: string | null;
            severity: string | null;
            penalty: string | null;
            open_case: boolean | null;
            source_url: string | null;
          }>(
            `SELECT normalized_name,
                    inspection_date::text,
                    inspection_type,
                    NULLIF(trim(violation_type), '') AS violation_type,
                    NULLIF(trim(severity), '') AS severity,
                    penalty::text,
                    open_case,
                    source_url
             FROM osha_inspections
             WHERE normalized_name = ANY(SELECT normalize_company_name(unnest($1::text[])))
               AND inspection_date IS NOT NULL
             ORDER BY inspection_date DESC`,
            [companyNames]
          ),
          pool.query<{
            normalized_name: string;
            license_number: string | null;
            license_type: string | null;
            status: string | null;
            issue_date: string | null;
            expiry_date: string | null;
            source_url: string | null;
          }>(
            `SELECT normalized_name, license_number, license_type, status,
                    issue_date::text, expiry_date::text, source_url
             FROM contractor_licenses
             WHERE normalized_name = ANY(SELECT normalize_company_name(unnest($1::text[])))
             ORDER BY issue_date DESC NULLS LAST`,
            [companyNames]
          ),
          pool.query<{
            normalized_name: string;
            registration_number: string | null;
            status: string | null;
            incorporation_date: string | null;
            registered_agent: string | null;
            source_url: string | null;
          }>(
            `SELECT normalized_name, registration_number, status,
                    incorporation_date::text, registered_agent, source_url
             FROM company_registrations
             WHERE normalized_name = ANY(SELECT normalize_company_name(unnest($1::text[])))
             ORDER BY incorporation_date DESC NULLS LAST`,
            [companyNames]
          ),
          pool.query<{
            slug: string; company_name: string; state: string; city: string | null; updated_at: string | null;
          }>(
            `SELECT slug, company_name, state, city, updated_at::text
             FROM company_pages
             WHERE slug = ANY($1::text[])`,
            [companySlugs]
          ),
        ]);

        // ③ 建内存索引 normalized_name → rows（用于快速 JOIN）
        const oshaByNorm    = new Map<string, typeof oshaRes.rows>();
        const licenseByNorm = new Map<string, typeof licenseRes.rows>();
        const regByNorm     = new Map<string, typeof regRes.rows>();
        const detailBySlug  = new Map<string, typeof detailRes.rows[number]>();

        for (const r of oshaRes.rows) {
          if (!oshaByNorm.has(r.normalized_name)) oshaByNorm.set(r.normalized_name, []);
          oshaByNorm.get(r.normalized_name)!.push(r);
        }
        for (const r of licenseRes.rows) {
          if (!licenseByNorm.has(r.normalized_name)) licenseByNorm.set(r.normalized_name, []);
          licenseByNorm.get(r.normalized_name)!.push(r);
        }
        for (const r of regRes.rows) {
          if (!regByNorm.has(r.normalized_name)) regByNorm.set(r.normalized_name, []);
          regByNorm.get(r.normalized_name)!.push(r);
        }
        for (const r of detailRes.rows) {
          detailBySlug.set(r.slug, r);
        }

        // ④ 为这批公司写 JSON 文件
        const normNameCache = new Map<string, string>();
        const findNormKey = (companyName: string, byNorm: Map<string, unknown[]>): string | null => {
          if (normNameCache.has(companyName)) return normNameCache.get(companyName)!;
          const local = localNorm(companyName);
          for (const key of byNorm.keys()) {
            if (localNorm(key) === local) {
              normNameCache.set(companyName, key);
              return key;
            }
          }
          for (const key of byNorm.keys()) {
            const kn = localNorm(key);
            if (kn.startsWith(local.slice(0, 8)) || local.startsWith(kn.slice(0, 8))) {
              normNameCache.set(companyName, key);
              return key;
            }
          }
          return null;
        };

        await Promise.all(needWrite.map(async (row) => {
          const slug    = normalizeCompanySlug(row.slug);
          const outFile = path.join(COMPANY_DIR, `${slug}.json`);
          const detail  = detailBySlug.get(slug) ?? null;
          const name    = detail?.company_name ?? row.company_name;

          const oshaKey    = findNormKey(name, oshaByNorm)    ?? '';
          const licKey     = findNormKey(name, licenseByNorm) ?? '';
          const regKey     = findNormKey(name, regByNorm)     ?? '';

          await writeJson(outFile, {
            generatedAt:   new Date().toISOString(),
            slug,
            routing:       detail,
            detail:        detail,
            osha:          oshaKey    ? (oshaByNorm.get(oshaKey)    ?? []) : [],
            licenses:      licKey     ? (licenseByNorm.get(licKey)  ?? []) : [],
            registrations: regKey     ? (regByNorm.get(regKey)      ?? []) : [],
            timeline:      null,
            related:       null,
            location:      null,
            benchmark:     null,
          });
          totalWritten++;
        }));
      }

      if (batchIdx % 2 === 0 || batchIdx === batches.length) {
        printProgress(batchIdx, batches.length, totalWritten, totalSkipped, globalStart);
      }
    }

    console.log(`\n  ✓ 写入: ${totalWritten}, 跳过: ${totalSkipped}`);
    const speed = totalWritten > 0
      ? (totalWritten / ((Date.now() - globalStart) / 60000)).toFixed(0)
      : '0';
    console.log(`  速度: ~${speed} 家/分钟`);
  } else {
    console.log('\n[2/4] 公司快照 (跳过)');
  }

  // ── [3/4] 州级快照 ──────────────────────────────────────────────────────────
  if (!SKIP_STATE_PHASE) {
    console.log('\n[3/4] 州级快照 …');

    process.env.SNAPSHOT_PRIORITY    = 'database';
    process.env.SNAPSHOT_DISABLE     = '1';
    process.env.SNAPSHOT_DATA_ROOT   = DATA_ROOT;
    process.env.RELEASE_CONTROL_MODE = 'all';

    const {
      getStateSummary,
      getStateCompanyPagesWithCategory,
      getStateCityCounts,
      getIndexedStateSlugs,
      getIndexedStateCitiesMap,
    } = await import('../lib/queries/state');

    let stateSlugs: string[];
    try {
      const raw = await getIndexedStateSlugs();
      stateSlugs = Array.isArray(raw) && raw.length > 0 ? (raw as string[]) : ['california'];
    } catch { stateSlugs = ['california']; }

    let citiesMap: unknown = null;
    try { citiesMap = await getIndexedStateCitiesMap(); } catch { /* ignore */ }

    for (const stateSlug of stateSlugs) {
      const outFile = path.join(STATE_DIR, `${stateSlug}.json`);
      if (await fileExists(outFile)) { process.stdout.write('.'); continue; }
      try {
        const [summary, companyPages, cityCounts] = await Promise.all([
          getStateSummary(stateSlug).catch(() => null),
          getStateCompanyPagesWithCategory(stateSlug, 5000).catch(() => null),
          getStateCityCounts(stateSlug).catch(() => null),
        ]);
        await writeJson(outFile, {
          generatedAt: new Date().toISOString(),
          state: stateSlug,
          summary, companyPages, cityCounts,
          citiesMap: citiesMap ?? null,
        });
        process.stdout.write('s');
      } catch (e) {
        process.stderr.write(`\n  ⚠ 州 ${stateSlug} 失败: ${String(e).slice(0, 80)}\n`);
      }
    }
    console.log('\n  ✓ 州级快照完成');
  } else {
    console.log('\n[3/4] 州级快照 (跳过)');
  }

  // ── [4/4] 首页（recent + sitemap）────────────────────────────────────────────
  if (!SKIP_HOME_PHASE) {
    console.log('\n[4/4] 首页文件 …');

    process.env.SNAPSHOT_PRIORITY    = 'database';
    process.env.SNAPSHOT_DISABLE     = '1';
    process.env.SNAPSHOT_DATA_ROOT   = DATA_ROOT;
    process.env.RELEASE_CONTROL_MODE = 'all';

    const { getRecentCompanyPages, countIndexableCompanies, getCompanySitemapBatch } =
      await import('../lib/queries/company');

    const recent = await getRecentCompanyPages(30).catch(() => []);
    await writeJson(path.join(DATA_ROOT, 'recent.json'), {
      generatedAt: new Date().toISOString(),
      data: recent,
    });

    const total    = Number(await countIndexableCompanies().catch(() => 0));
    await writeJson(path.join(DATA_ROOT, 'sitemap_count.json'), {
      generatedAt: new Date().toISOString(),
      total,
    });

    const batchSize = 5000;
    const sitemapBatches = Math.ceil(total / batchSize);
    for (let i = 0; i < sitemapBatches; i++) {
      const offset  = i * batchSize;
      const outFile = path.join(DATA_ROOT, `sitemap_${offset}.json`);
      if (await fileExists(outFile)) continue;
      const data = await getCompanySitemapBatch(offset, batchSize).catch(() => []);
      await writeJson(outFile, { generatedAt: new Date().toISOString(), offset, batchSize, data });
    }
    console.log('  ✓ 首页文件完成');
  } else {
    console.log('\n[4/4] 首页文件 (跳过)');
  }

  // ── 统计 ────────────────────────────────────────────────────────────────────
  const totalMin = ((Date.now() - globalStart) / 60000).toFixed(1);
  const totalFileCount = await countFiles(DATA_ROOT);
  console.log(`\n📊 共 ${totalFileCount} 个文件，总用时 ${totalMin} 分钟`);
  for (const sub of ['company', 'state', 'city', 'filter']) {
    const n = await countFiles(path.join(DATA_ROOT, sub));
    if (n > 0) console.log(`  ${sub}/: ${n} 文件`);
  }
  console.log('\n✅ 完成！');

  await pool.end();
}

main().catch((e) => { console.error('❌ 错误:', e); process.exit(1); });

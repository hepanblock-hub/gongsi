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

function firstToken(norm: string): string {
  return norm.split(' ').filter(Boolean)[0] ?? '';
}

function toCanonicalState(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (s === 'texas' || s === 'tx') return 'tx';
  if (s === 'florida' || s === 'fl') return 'fl';
  if (s === 'california' || s === 'ca') return 'ca';
  if (s === 'new-york' || s === 'new york' || s === 'ny') return 'ny';
  return s;
}

function toStateSlugForPath(raw: string): string {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}

function toCitySlugForPath(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s || null;
}

// ─── 分阶段开关 ──────────────────────────────────────────────────────────────
const SKIP_HOME_PHASE    = (process.env.SNAPSHOT_SKIP_HOME    ?? 'false') === 'true';
const SKIP_COMPANY_PHASE = (process.env.SNAPSHOT_SKIP_COMPANY ?? 'false') === 'true';
const SKIP_STATE_PHASE   = (process.env.SNAPSHOT_SKIP_STATE   ?? 'false') === 'true';
const SNAPSHOT_STATE     = (process.env.SNAPSHOT_STATE ?? 'california').toLowerCase();
const SNAPSHOT_STATES    = SNAPSHOT_STATE.split(',').map(s => s.trim()).filter(Boolean);

// ─── 主函数 ──────────────────────────────────────────────────────────────────
async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(scriptDir, '..');

  loadEnvFile(path.join(ROOT, '.env'));

  const DATA_ROOT   = process.env.SNAPSHOT_DATA_ROOT || path.join(ROOT, 'kuaizhao', 'data');
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
  const BATCH_CONCURRENCY = Math.max(1, Number(process.env.SNAPSHOT_BATCH_CONCURRENCY ?? 8));
  const globalStart = Date.now();

  // ── [1/4] 查询全部公司 ──────────────────────────────────────────────────────
  console.log('\n[1/4] 查询全部 company_pages …');
  
  // 构建多州过滤条件（支持州全称 + 缩写）
  const conditions: string[] = [];
  const params: string[][] = [];
  let paramIdx = 1;

  const STATE_ALIAS_MAP: Record<string, string[]> = {
    california: ['california', 'ca'],
    florida: ['florida', 'fl'],
    texas: ['texas', 'tx'],
    'new-york': ['new-york', 'new york', 'ny'],
  };
  
  for (const state of SNAPSHOT_STATES) {
    const aliases = Array.from(new Set([
      ...(STATE_ALIAS_MAP[state] ?? []),
      state,
      state.replace(/-/g, ' '),
    ].map((s) => s.toLowerCase().trim()).filter(Boolean)));

    conditions.push(`(lower(trim(state)) = ANY($${paramIdx}::text[]) OR lower(regexp_replace(state, '\\s+', '-', 'g')) = ANY($${paramIdx}::text[]))`);
    params.push(aliases);
    paramIdx++;
  }
  
  const stateFilter = conditions.join(' OR ');

  const baseSql = `SELECT slug, company_name, lower(trim(state)) AS state, city
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
       AND (${stateFilter})
     ORDER BY id ASC`;

  const { rows: allRows } = await pool.query<{
    slug: string; company_name: string; state: string; city: string | null;
  }>(baseSql, params);
  
  const rows = rowLimit > 0 ? allRows.slice(0, rowLimit) : allRows;
  console.log(`  州: ${SNAPSHOT_STATES.join(', ')}`);
  console.log(`  总计: ${allRows.length} | 执行: ${rows.length}${rowLimit > 0 ? '  ⚠ 调试限制' : ''}`);
  console.log(`  批次大小: ${BATCH_SIZE} | 预计批次数: ${Math.ceil(rows.length / BATCH_SIZE)}`);

  // ── [2/4] 公司快照（批量模式 — 每批 300 家公司一次 SQL 查询）────────────────────
  if (!SKIP_COMPANY_PHASE) {
    console.log(`\n[2/4] 公司快照（wangzhan 批量模式）…`);
    console.log(`  批次并发: ${BATCH_CONCURRENCY}`);

    // 预计算：Related companies（同名优先，不足10条时补相似名）
    type RelatedRow = {
      slug: string;
      company_name: string;
      state: string;
      city: string | null;
      updated_at: string | null;
      norm: string;
      token: string;
    };

    const exactRelatedMap = new Map<string, RelatedRow[]>();
    const tokenRelatedMap = new Map<string, RelatedRow[]>();

    console.log('  预计算 related candidates …');
    const { rows: relatedUniverse } = await pool.query<{
      slug: string;
      company_name: string;
      state: string;
      city: string | null;
      updated_at: string | null;
    }>(
      `SELECT slug, company_name, state, city, updated_at::text
       FROM company_pages
       WHERE company_name ~* '[A-Za-z]'
         AND lower(trim(company_name)) <> '- select -'`
    );

    for (const r of relatedUniverse) {
      const slug = normalizeCompanySlug(r.slug);
      const norm = localNorm(r.company_name || '');
      if (!slug || !norm) continue;
      const token = firstToken(norm);
      const row: RelatedRow = {
        slug,
        company_name: r.company_name,
        state: r.state,
        city: r.city,
        updated_at: r.updated_at,
        norm,
        token,
      };

      if (!exactRelatedMap.has(norm)) exactRelatedMap.set(norm, []);
      exactRelatedMap.get(norm)!.push(row);

      if (token) {
        if (!tokenRelatedMap.has(token)) tokenRelatedMap.set(token, []);
        tokenRelatedMap.get(token)!.push(row);
      }
    }

    const byUpdatedDesc = (a: RelatedRow, b: RelatedRow) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.company_name.localeCompare(b.company_name);
    };

    for (const arr of exactRelatedMap.values()) arr.sort(byUpdatedDesc);
    for (const arr of tokenRelatedMap.values()) arr.sort(byUpdatedDesc);

    const buildRelated = (slug: string, companyName: string, max = 10) => {
      const norm = localNorm(companyName || '');
      const token = firstToken(norm);
      const out: Array<{
        slug: string;
        company_name: string;
        state: string;
        city: string | null;
        updated_at: string | null;
        state_slug: string;
        city_slug: string | null;
        state_path: string;
        city_path: string | null;
      }> = [];
      const seen = new Set<string>([slug]);

      const exact = exactRelatedMap.get(norm) ?? [];
      for (const r of exact) {
        if (seen.has(r.slug)) continue;
        seen.add(r.slug);
        const stateSlug = toStateSlugForPath(r.state);
        const citySlug = toCitySlugForPath(r.city);
        out.push({
          slug: r.slug,
          company_name: r.company_name,
          state: r.state,
          city: r.city,
          updated_at: r.updated_at,
          state_slug: stateSlug,
          city_slug: citySlug,
          state_path: `/state/${stateSlug}`,
          city_path: citySlug ? `/state/${stateSlug}/city/${citySlug}` : null,
        });
        if (out.length >= max) return out;
      }

      // 同名不足时，用“同首词”补齐相似公司
      const similar = token ? (tokenRelatedMap.get(token) ?? []) : [];
      for (const r of similar) {
        if (seen.has(r.slug)) continue;
        if (r.norm === norm) continue;
        seen.add(r.slug);
        const stateSlug = toStateSlugForPath(r.state);
        const citySlug = toCitySlugForPath(r.city);
        out.push({
          slug: r.slug,
          company_name: r.company_name,
          state: r.state,
          city: r.city,
          updated_at: r.updated_at,
          state_slug: stateSlug,
          city_slug: citySlug,
          state_path: `/state/${stateSlug}`,
          city_path: citySlug ? `/state/${stateSlug}/city/${citySlug}` : null,
        });
        if (out.length >= max) break;
      }

      return out;
    };

    // 预计算：按州一次性生成 city benchmark（避免每批重算）
    const benchmarkByStateCity = new Map<string, { avgOshaRecords: number; activeLicensePct: number; cityCompanyCount: number }>();
    for (const stateSlug of SNAPSHOT_STATES) {
      const aliases = Array.from(new Set([
        ...(STATE_ALIAS_MAP[stateSlug] ?? []),
        stateSlug,
        stateSlug.replace(/-/g, ' '),
      ].map((s) => s.toLowerCase().trim()).filter(Boolean)));
      if (!aliases.length) continue;

      const canonicalState = toCanonicalState(stateSlug);
      const { rows: benchmarkRows } = await pool.query<{
        city: string;
        avg_osha_records: string;
        active_license_pct: string;
        city_company_count: string;
      }>(
        `WITH city_companies AS (
           SELECT
             lower(trim(cp.city)) AS city,
             normalize_company_name(cp.company_name) AS normalized_name
           FROM company_pages cp
           WHERE cp.company_name ~* '[A-Za-z]'
             AND lower(trim(cp.company_name)) <> '- select -'
             AND trim(coalesce(cp.city, '')) <> ''
             AND (
               lower(trim(cp.state)) = ANY($1::text[])
               OR lower(regexp_replace(cp.state, '\\s+', '-', 'g')) = ANY($1::text[])
             )
           GROUP BY lower(trim(cp.city)), normalize_company_name(cp.company_name)
         ),
         osha_counts AS (
           SELECT oi.normalized_name, COUNT(*)::int AS osha_count
           FROM osha_inspections oi
           WHERE (
             lower(trim(oi.state)) = ANY($1::text[])
             OR lower(regexp_replace(oi.state, '\\s+', '-', 'g')) = ANY($1::text[])
           )
           GROUP BY oi.normalized_name
         ),
         latest_license AS (
           SELECT DISTINCT ON (cl.normalized_name)
             cl.normalized_name,
             lower(coalesce(cl.status, 'unknown')) AS license_status
           FROM contractor_licenses cl
           WHERE (
             lower(trim(cl.state)) = ANY($1::text[])
             OR lower(regexp_replace(cl.state, '\\s+', '-', 'g')) = ANY($1::text[])
           )
           ORDER BY cl.normalized_name, cl.issue_date DESC NULLS LAST, cl.created_at DESC
         )
         SELECT
           cc.city,
           COALESCE(AVG(COALESCE(oc.osha_count, 0)), 0)::text AS avg_osha_records,
           COALESCE(AVG(CASE WHEN ll.license_status = 'active' THEN 100 ELSE 0 END), 0)::text AS active_license_pct,
           COUNT(*)::text AS city_company_count
         FROM city_companies cc
         LEFT JOIN osha_counts oc ON oc.normalized_name = cc.normalized_name
         LEFT JOIN latest_license ll ON ll.normalized_name = cc.normalized_name
         GROUP BY cc.city`,
        [aliases]
      );

      for (const r of benchmarkRows) {
        const city = (r.city ?? '').trim().toLowerCase();
        if (!city) continue;
        benchmarkByStateCity.set(`${canonicalState}|${city}`, {
          avgOshaRecords: Number(r.avg_osha_records || 0),
          activeLicensePct: Number(r.active_license_pct || 0),
          cityCompanyCount: Number(r.city_company_count || 0),
        });
      }
    }

    const batches = chunk(rows, BATCH_SIZE);
    let batchIdx = 0;
    let totalWritten = 0;
    let totalSkipped = 0;

    const processBatch = async (batchRows: typeof rows) => {
      let written = 0;
      let skipped = 0;

      // ① 先检查哪些文件已存在
      const needWrite: typeof batchRows = [];
      for (const row of batchRows) {
        const slug = normalizeCompanySlug(row.slug);
        const outFile = path.join(COMPANY_DIR, `${slug}.json`);
        if (await fileExists(outFile)) {
          skipped++;
        } else {
          needWrite.push(row);
        }
      }

      if (needWrite.length > 0) {
        const companyNames = needWrite.map((r) => r.company_name);
        const companySlugs = needWrite.map((r) => normalizeCompanySlug(r.slug));

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
            snapshot_slug: string; company_name: string; state: string; city: string | null; updated_at: string | null;
          }>(
            `SELECT
               replace(regexp_replace(cp.slug, '^/?company/', ''), '\\', '') AS snapshot_slug,
               cp.company_name,
               cp.state,
               cp.city,
               cp.updated_at::text
             FROM company_pages cp
             WHERE replace(regexp_replace(cp.slug, '^/?company/', ''), '\\', '') = ANY($1::text[])`,
            [companySlugs]
          ),
        ]);

        // ③ 建内存索引 normalized_name → rows（用于快速 JOIN）
        const oshaByNorm    = new Map<string, typeof oshaRes.rows>();
        const licenseByNorm = new Map<string, typeof licenseRes.rows>();
        const regByNorm     = new Map<string, typeof regRes.rows>();
        const detailBySlug  = new Map<string, {
          slug: string;
          company_name: string;
          state: string;
          city: string | null;
          updated_at: string | null;
        }>();

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
          detailBySlug.set(r.snapshot_slug, {
            slug: r.snapshot_slug,
            company_name: r.company_name,
            state: r.state,
            city: r.city,
            updated_at: r.updated_at,
          });
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

          const stateRaw = detail?.state ?? row.state;
          const cityRaw = detail?.city ?? row.city;
          const stateKey = toCanonicalState(stateRaw);
          const cityKey = (cityRaw ?? '').trim().toLowerCase();
          const locationText = cityRaw
            ? `${name} operates in ${cityRaw}, ${String(stateRaw).toUpperCase()}.`
            : `${name} operates in ${String(stateRaw).toUpperCase()}.`;
          const benchmark = cityKey
            ? (benchmarkByStateCity.get(`${stateKey}|${cityKey}`) ?? null)
            : null;

          await writeJson(outFile, {
            generatedAt:   new Date().toISOString(),
            slug,
            routing:       detail,
            detail:        detail,
            osha:          oshaKey    ? (oshaByNorm.get(oshaKey)    ?? []) : [],
            licenses:      licKey     ? (licenseByNorm.get(licKey)  ?? []) : [],
            registrations: regKey     ? (regByNorm.get(regKey)      ?? []) : [],
            timeline:      null,
            related:       buildRelated(slug, name, 10),
            location:      locationText,
            benchmark,
          });
          written++;
        }));
      }

      return { written, skipped };
    };

    let nextBatch = 0;
    const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, async () => {
      while (true) {
        const idx = nextBatch++;
        if (idx >= batches.length) return;
        const { written, skipped } = await processBatch(batches[idx]);
        totalWritten += written;
        totalSkipped += skipped;
        batchIdx++;
        if (batchIdx % 2 === 0 || batchIdx === batches.length) {
          printProgress(batchIdx, batches.length, totalWritten, totalSkipped, globalStart);
        }
      }
    });

    await Promise.all(workers);

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

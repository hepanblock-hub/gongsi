#!/usr/bin/env python3
"""Overwrites gen_snapshots.ts with a fixed version that uses async main()."""

content = r'''/**
 * gen_snapshots.ts — 全量快照生成脚本
 * 用法：npx tsx scripts/gen_snapshots.ts
 *
 * 功能：
 *  - 为全部 company_pages 预生成快照（不管城市是否已发布）
 *  - OSHA/license/registration 等无 releaseVersion 查询永久有效
 *  - 州级、sitemap 等共享查询也一并生成
 *  - 断点续传（已存在快照自动跳过）
 *  - 5 路并发 + 进度显示
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── 内联 env 加载（不依赖 dotenv）───────────────────────────────────────────
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── 并发控制 ─────────────────────────────────────────────────────────────────
async function pLimit(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ─── 安全调用 ─────────────────────────────────────────────────────────────────
async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`  ⚠ SKIP [${label}]: ${msg.slice(0, 100)}\n`);
  }
}

// ─── 统计文件数 ───────────────────────────────────────────────────────────────
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

// ─── 主函数 ───────────────────────────────────────────────────────────────────
async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(scriptDir, '..');

  // 加载 .env
  loadEnvFile(path.join(ROOT, '.env'));

  // 覆盖快照策略
  process.env.SNAPSHOT_PRIORITY = 'database';
  process.env.SNAPSHOT_DATA_ROOT = path.join(ROOT, 'kuaizhao', 'data');

  const SNAPSHOT_ROOT = process.env.SNAPSHOT_DATA_ROOT;
  await fs.mkdir(SNAPSHOT_ROOT, { recursive: true });

  console.log('▶ 快照生成开始');
  console.log(`  DB : ${(process.env.DATABASE_URL ?? '').replace(/:[^@]+@/, ':***@') || '(未设置)'}`);
  console.log(`  Dir: ${SNAPSHOT_ROOT}`);

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 未设置，请检查 .env');
    process.exit(1);
  }

  // 动态导入（env 已就绪）
  const { pool } = await import('../lib/db.js');
  const {
    getCompanyBySlugForRouting,
    getCompanyTimeline,
    getCompanyDetailedLocation,
    getCityComplianceBenchmark,
    getRecentCompanyPages,
    countIndexableCompanies,
    getCompanySitemapBatch,
  } = await import('../lib/queries/company.js');
  const { getOshaByCompany } = await import('../lib/queries/osha.js');
  const { getLicensesByCompany } = await import('../lib/queries/license.js');
  const { getRegistrationsByCompany } = await import('../lib/queries/registration.js');
  const {
    getStateSummary,
    getStateCompanyPagesWithCategory,
    getStateCityCounts,
    getIndexedStateSlugs,
    getIndexedStateCitiesMap,
  } = await import('../lib/queries/state.js');

  // — 1. 拉全部 company_pages ——————————————————————————————
  console.log('\n[1/4] 查询全部 company_pages …');
  const allRows = await pool.query<{
    slug: string; company_name: string; state: string; city: string | null;
  }>(
    `SELECT slug, company_name, state, city
     FROM company_pages
     WHERE company_name ~* '[A-Za-z]'
       AND lower(trim(company_name)) <> '- select -'
     ORDER BY id ASC`
  );
  const rows = allRows.rows;
  console.log(`  总计: ${rows.length} 条`);

  let done = 0;
  const startMs = Date.now();

  // — 2. 每家公司生成快照 ——————————————————————————————————
  const tasks = rows.map((row) => async () => {
    const { slug, company_name: name, state, city } = row;
    await safe(`routing:${slug}`, () => getCompanyBySlugForRouting(slug));
    await safe(`osha:${slug}`, () => getOshaByCompany(name, state, 200));
    await safe(`license:${slug}`, () => getLicensesByCompany(name, state, 200));
    await safe(`reg:${slug}`, () => getRegistrationsByCompany(name, state, 200));
    await safe(`timeline:${slug}`, () => getCompanyTimeline(name, state, 12));
    await safe(`loc:${slug}`, () => getCompanyDetailedLocation(name, state));
    if (city) await safe(`bench:${slug}`, () => getCityComplianceBenchmark(state, city));

    done++;
    if (done % 500 === 0 || done === rows.length) {
      const elapsedS = ((Date.now() - startMs) / 1000).toFixed(0);
      const pct = ((done / rows.length) * 100).toFixed(1);
      const etaMin = done < rows.length
        ? (((Date.now() - startMs) / done) * (rows.length - done) / 60000).toFixed(1)
        : '0';
      process.stdout.write(
        `\r  进度: ${done}/${rows.length} (${pct}%) | 已用 ${elapsedS}s | 剩余约 ${etaMin} 分钟   `
      );
    }
  });

  await pLimit(tasks, 5);
  console.log('\n\n  ✓ 公司查询快照完成');

  // — 3. 州级共享查询 —————————————————————————————————————
  console.log('\n[2/4] 州级查询快照 …');
  const STATE = 'california';
  await safe('getStateSummary', () => getStateSummary(STATE));
  await safe('getStateCompanyPagesWithCategory', () => getStateCompanyPagesWithCategory(STATE, 5000));
  await safe('getStateCityCounts', () => getStateCityCounts(STATE));
  await safe('getIndexedStateSlugs', () => getIndexedStateSlugs());
  await safe('getIndexedStateCitiesMap', () => getIndexedStateCitiesMap());
  console.log('  ✓ 州级查询完成');

  // — 4. 首页 & sitemap ——————————————————————————————————
  console.log('\n[3/4] 首页 & sitemap 快照 …');
  await safe('getRecentCompanyPages', () => getRecentCompanyPages(30));
  await safe('countIndexableCompanies', () => countIndexableCompanies());
  const total = await countIndexableCompanies();
  const batchSize = 5000;
  const batches = Math.ceil(total / batchSize);
  for (let i = 0; i < batches; i++) {
    await safe(`sitemapBatch-${i}`, () => getCompanySitemapBatch(i * batchSize, batchSize));
  }
  console.log('  ✓ sitemap 快照完成');

  // — 5. 统计 ——————————————————————————————————————————
  console.log('\n[4/4] 统计快照文件 …');
  const fileCount = await countFiles(SNAPSHOT_ROOT);
  const totalMin = ((Date.now() - startMs) / 60000).toFixed(1);
  console.log(`  ✓ 共 ${fileCount} 个快照文件，总用时 ${totalMin} 分钟`);
  console.log('\n▶ 完成！运行以下命令上传：');
  console.log('  git add kuaizhao/');
  console.log('  git commit -m "chore: add full query snapshots"');
  console.log('  git push origin main');

  await pool.end();
}

main().catch((e) => {
  console.error('❌ 脚本异常:', e);
  process.exit(1);
});
'''

with open('D:/gongsihegui/scripts/gen_snapshots.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('gen_snapshots.ts written successfully')

/**
 * upload-snapshots.ts
 * 把 kuaizhao/data/ 下的快照 JSON 批量上传到 Supabase Storage
 * 参照 wangzhan 的 upload-snapshots-to-supabase.ts，并发 32，断点续传
 *
 * 使用方法：
 *   npm run upload:snapshots          # 上传 company/ 目录
 *   npm run upload:snapshots:all      # 上传全部（company + state + 首页）
 *   SNAPSHOT_UPLOAD_UPSERT=true ... npm run upload:snapshots  # 强制覆盖已存在文件
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import { sanitizeSnapshotPath } from '../lib/snapshotKey';

// ─── 配置 ────────────────────────────────────────────────────────────────────
const PROJECT_REF      = process.env.SUPABASE_PROJECT_REF || 'ioclagkqoytlqqacrese';
const SUPABASE_URL     = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvY2xhZ2txb3l0bGxxYWNyZXNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQzOTc5OCwiZXhwIjoyMDkxMDE1Nzk4fQ.dH5tNv_GTrKLlUz3ojD7kng1dZ7304xnW6jlC4J3eGA';
const BUCKET           = process.env.SNAPSHOT_BUCKET || 'gongsihegui';

const scriptDir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(scriptDir, '..');
const DATA_ROOT  = process.env.SNAPSHOT_DATA_ROOT || path.join(ROOT, 'kuaizhao', 'data');

// 默认更稳：并发 8，失败自动重试
const CONCURRENCY     = Number(process.env.SNAPSHOT_UPLOAD_CONCURRENCY || 8);
const MAX_RETRIES     = Number(process.env.SNAPSHOT_UPLOAD_MAX_RETRIES  || 12);
const LOG_EVERY       = Number(process.env.SNAPSHOT_UPLOAD_LOG_EVERY    || 5000);
const CHECKPOINT_EVERY = Number(process.env.SNAPSHOT_UPLOAD_CHECKPOINT_EVERY || 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.SNAPSHOT_UPLOAD_TIMEOUT_MS || 30000);
// upsert=false 时，已存在的文件不覆盖（加速；重新全量上传时设 UPSERT=true）
const UPSERT          = (process.env.SNAPSHOT_UPLOAD_UPSERT || 'false') === 'true';
const RESUME          = (process.env.SNAPSHOT_UPLOAD_RESUME || 'true')  === 'true';
const ONLY_LIST_FILE  = (process.env.SNAPSHOT_UPLOAD_ONLY_LIST_FILE || '').trim();

// 要上传的子目录，逗号分隔；不设则只传 company
const RAW_SUBDIRS = process.env.SNAPSHOT_UPLOAD_SUBDIRS;
const SUBDIRS = (RAW_SUBDIRS ?? 'company')
  .split(',').map(s => s.trim()).filter(Boolean);
const SHOULD_UPLOAD_ROOT = SUBDIRS.includes('root');

const CHECKPOINT_FILE = path.join(DATA_ROOT, '_checkpoint', 'upload-done.txt');
const FAILED_FILE     = path.join(DATA_ROOT, '_checkpoint', 'upload-failed.txt');

// ─── 工具 ─────────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function walkFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('_')) continue; // 跳过 _checkpoint 等内部目录
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkFiles(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

async function listRootFiles(): Promise<string[]> {
  const out: string[] = [];
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try { entries = await fs.readdir(DATA_ROOT, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    out.push(e.name);
  }
  return out;
}

async function readPathList(filePathRaw: string): Promise<string[]> {
  const fp = path.isAbsolute(filePathRaw) ? filePathRaw : path.join(process.cwd(), filePathRaw);
  const txt = await fs.readFile(fp, 'utf8');
  return [...new Set(txt.split(/[\n\r]+/).map((x) => x.trim().replace(/^\/+/, '')).filter(Boolean))];
}

async function loadCheckpoint(): Promise<Set<string>> {
  try {
    const txt = await fs.readFile(CHECKPOINT_FILE, 'utf8');
    const set = new Set(txt.split(/\r?\n/).map(x => x.trim()).filter(Boolean));
    if (set.size > 0) console.log(`[upload] 断点续传：已完成 ${set.size} 个文件`);
    return set;
  } catch { return new Set(); }
}

let _cpBuf: string[] = [];
async function appendCheckpoint(paths: string[]) {
  _cpBuf.push(...paths);
  if (_cpBuf.length < CHECKPOINT_EVERY) return;
  await flushCheckpoint();
}
async function flushCheckpoint() {
  if (_cpBuf.length === 0) return;
  const toWrite = _cpBuf.splice(0);
  await fs.mkdir(path.dirname(CHECKPOINT_FILE), { recursive: true });
  await fs.appendFile(CHECKPOINT_FILE, toWrite.join('\n') + '\n', 'utf8');
}
async function clearCheckpoint() {
  try { await fs.unlink(CHECKPOINT_FILE); } catch {}
}

function cacheControl(rel: string): string {
  if (rel === 'recent.json' || rel === 'sitemap_count.json' || rel.startsWith('sitemap_')) {
    return 'public, max-age=3600';
  }
  return 'public, max-age=31536000, immutable';
}

async function uploadOne(relativePath: string): Promise<void> {
  const localPath = path.join(DATA_ROOT, ...relativePath.split('/'));
  const content   = await fs.readFile(localPath, 'utf8');
  const storagePath = sanitizeSnapshotPath(relativePath);
  const url       = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(storagePath)}`;
  const headers: Record<string, string> = {
    apikey:          SERVICE_ROLE_KEY,
    Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
    'cache-control': cacheControl(relativePath),
    'x-upsert':      String(UPSERT),
  };

  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { res = await fetch(url, { method: 'POST', headers, body: content, signal: controller.signal }); }
    catch (e) {
      const err = e as Error & { cause?: unknown };
      lastErr = `${err?.name ?? 'Error'}: ${err?.message ?? String(e)}${err?.cause ? ` | cause=${String(err.cause)}` : ''}`;
      clearTimeout(t);
      if (attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 300);
        await sleep(Math.min(10_000, attempt * attempt * 200 + jitter));
        continue;
      }
      throw new Error(`网络错误: ${relativePath} => ${storagePath} → ${lastErr}`);
    }
    clearTimeout(t);
    if (res.ok) return;
    const txt = await res.text();
    lastErr = `${res.status} ${txt}`;
    if (!UPSERT && /already exists|Duplicate|exists/i.test(txt)) return; // 已存在算成功
    if (attempt < MAX_RETRIES) {
      const jitter = Math.floor(Math.random() * 300);
      await sleep(Math.min(10_000, attempt * attempt * 200 + jitter));
      continue;
    }
    throw new Error(`上传失败: ${relativePath} => ${storagePath} → ${lastErr}`);
  }
}

async function uploadWithPool(files: string[], doneSet: Set<string>) {
  const pending = doneSet.size > 0 ? files.filter(f => !doneSet.has(f)) : files;
  if (pending.length < files.length) {
    console.log(`[upload] 跳过已完成: ${files.length - pending.length}，剩余: ${pending.length}`);
  }
  if (pending.length === 0) return { failed: 0, failedPaths: [] };

  let idx = 0;
  let done = 0;
  let failed = 0;
  const failedPaths: string[] = [];
  const cpBatch: string[] = [];
  const startMs = Date.now();

  async function worker() {
    while (true) {
      const cur = idx++;
      if (cur >= pending.length) return;
      const rel = pending[cur];
      try {
        await uploadOne(rel);
        cpBatch.push(rel);
      } catch (e) {
        failed++;
        failedPaths.push(rel);
        process.stderr.write(`\n  ✗ ${rel}: ${String(e).slice(0, 100)}\n`);
      } finally {
        done++;
        if (done % LOG_EVERY === 0 || done === pending.length) {
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
          const speed = Math.round(done / ((Date.now() - startMs) / 1000));
          process.stdout.write(
            `\r  进度: ${done}/${pending.length} (${((done/pending.length)*100).toFixed(1)}%)` +
            ` | 失败: ${failed} | ${elapsed}s | ~${speed}/s   `
          );
        }
        if (RESUME && cpBatch.length >= CHECKPOINT_EVERY) {
          await appendCheckpoint(cpBatch.splice(0));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flushCheckpoint();
  return { failed, failedPaths };
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────
async function main() {
  let host = '';
  try {
    host = new URL(SUPABASE_URL).hostname;
    await dns.lookup(host);
  } catch {
    throw new Error(`SUPABASE_URL 无法解析 DNS：${SUPABASE_URL}。请在 Supabase 控制台复制 Project Settings -> API -> URL，设置环境变量 SUPABASE_URL 后重试。`);
  }

  console.log('▶ 快照上传到 Supabase Storage');
  console.log(`  Bucket : ${BUCKET} (${SUPABASE_URL})`);
  console.log(`  Host   : ${host}`);
  console.log(`  数据目录: ${DATA_ROOT}`);
  console.log(`  上传目录: ${SUBDIRS.join(', ')}`);
  console.log(`  并发   : ${CONCURRENCY} | UPSERT: ${UPSERT} | 断点续传: ${RESUME}`);
  if (ONLY_LIST_FILE) console.log(`  仅上传列表: ${ONLY_LIST_FILE}`);

  const doneSet = RESUME ? await loadCheckpoint() : new Set<string>();
  let totalFailed = 0;
  const allFailedPaths: string[] = [];
  const globalStart = Date.now();

  if (ONLY_LIST_FILE) {
    const list = await readPathList(ONLY_LIST_FILE);
    console.log(`\n  列表文件共 ${list.length} 条`);
    const { failed, failedPaths } = await uploadWithPool(list, doneSet);
    totalFailed += failed;
    allFailedPaths.push(...failedPaths);
  } else {

    for (const dir of SUBDIRS) {
      if (dir === 'root') continue;
      const absDir = path.join(DATA_ROOT, dir);
      if (!fsSync.existsSync(absDir)) {
        console.log(`\n  ⚠ 目录不存在，跳过: ${dir}`);
        continue;
      }
      console.log(`\n  扫描 ${dir}/ …`);
      const files = await walkFiles(absDir, DATA_ROOT);
      console.log(`  共 ${files.length} 个文件`);
      if (files.length === 0) continue;

      const { failed, failedPaths } = await uploadWithPool(files, doneSet);
      totalFailed += failed;
      allFailedPaths.push(...failedPaths);
      console.log(`\n  ✓ ${dir}/ 完成`);
    }

    if (SHOULD_UPLOAD_ROOT) {
      const rootFiles = await listRootFiles();
      console.log(`\n  root/: ${rootFiles.length} 个文件`);
      if (rootFiles.length > 0) {
        const { failed, failedPaths } = await uploadWithPool(rootFiles, doneSet);
        totalFailed += failed;
        allFailedPaths.push(...failedPaths);
        console.log(`\n  ✓ root/ 完成`);
      }
    }
  }

  const totalMin = ((Date.now() - globalStart) / 60000).toFixed(1);
  console.log(`\n📊 总用时: ${totalMin} 分钟 | 失败: ${totalFailed}`);

  if (totalFailed > 0) {
    await fs.mkdir(path.dirname(FAILED_FILE), { recursive: true });
    await fs.writeFile(FAILED_FILE, allFailedPaths.join('\n') + '\n', 'utf8');
    console.log(`  ✗ 失败文件列表: ${FAILED_FILE}`);
    process.exit(1);
  }

  if (RESUME) await clearCheckpoint();

  console.log('✅ 全部上传完成！');
}

main().catch(e => { console.error('❌ 错误:', e); process.exit(1); });

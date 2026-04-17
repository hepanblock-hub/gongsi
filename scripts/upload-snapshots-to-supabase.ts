import fs from 'fs/promises';
import path from 'path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'ioclagkqoytllqacrese';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SNAPSHOT_BUCKET || 'gongsihegui';
const SNAPSHOT_ROOT = process.env.SNAPSHOT_ROOT || path.join(process.cwd(), 'kuaizhao', 'data');

const CONCURRENCY = Number(process.env.SNAPSHOT_UPLOAD_CONCURRENCY || 4);
const MAX_RETRIES = Number(process.env.SNAPSHOT_UPLOAD_MAX_RETRIES || 5);
const LOG_EVERY = Number(process.env.SNAPSHOT_UPLOAD_LOG_EVERY || 1000);
const UPSERT = (process.env.SNAPSHOT_UPLOAD_UPSERT || 'false') === 'true';
const ONLY_LIST_FILE = (process.env.SNAPSHOT_UPLOAD_ONLY_LIST_FILE || '').trim();
const FAILED_LIST_FILE = (process.env.SNAPSHOT_UPLOAD_FAILED_LIST_FILE || '').trim();

// 断点续传：记录已成功上传的文件路径
const CHECKPOINT_FILE = process.env.SNAPSHOT_UPLOAD_CHECKPOINT_FILE
  || path.join(SNAPSHOT_ROOT, '_checkpoint', 'upload-done.txt');
const CHECKPOINT_EVERY = Number(process.env.SNAPSHOT_UPLOAD_CHECKPOINT_EVERY || 500);
const RESUME = (process.env.SNAPSHOT_UPLOAD_RESUME || 'true') === 'true';

const RAW_SUBDIRS = process.env.SNAPSHOT_UPLOAD_SUBDIRS;
const SUBDIRS = (RAW_SUBDIRS === undefined ? 'company,state,city,filter' : RAW_SUBDIRS)
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

// 仅在全量上传或显式包含 root 时上传根级文件
const SHOULD_UPLOAD_ROOT_FILES = RAW_SUBDIRS === undefined || SUBDIRS.includes('root');

const ROOT_FILES = ['recent.json', 'sitemap_count.json'];

function assertEnv() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function walkFiles(dir: string, baseDir = dir): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(full, baseDir));
    } else {
      out.push(path.relative(baseDir, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function getCacheControlByPath(relativePath: string): string {
  if (relativePath === 'recent.json' || relativePath === 'sitemap_count.json' || relativePath.startsWith('sitemap_')) {
    return 'public, max-age=3600';
  }
  return 'public, max-age=31536000, immutable';
}

function resolveFilePath(rawPath: string): string {
  if (!rawPath) return '';
  return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

async function readPathList(filePathRaw: string): Promise<string[]> {
  const filePath = resolveFilePath(filePathRaw);
  const txt = await fs.readFile(filePath, 'utf8');
  return [...new Set(
    txt
      .split(/[\n\r]+/)
      .map((x) => x.trim().replace(/^\/+/, ''))
      .filter(Boolean)
  )];
}

async function writeFailedList(paths: string[]): Promise<string> {
  const defaultPath = path.join(SNAPSHOT_ROOT, '_failed', 'upload-failed.txt');
  const target = resolveFilePath(FAILED_LIST_FILE || defaultPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${paths.join('\n')}${paths.length ? '\n' : ''}`, 'utf8');
  return target;
}

// ── 断点续传 ───────────────────────────────────────────────────────────────

async function loadCheckpoint(): Promise<Set<string>> {
  const target = resolveFilePath(CHECKPOINT_FILE);
  try {
    const txt = await fs.readFile(target, 'utf8');
    const set = new Set(
      txt.split(/[\n\r]+/).map((x) => x.trim()).filter(Boolean)
    );
    console.log(`[upload] checkpoint loaded: ${set.size} already done`);
    return set;
  } catch {
    return new Set();
  }
}

let _checkpointBuffer: string[] = [];
let _checkpointFlushing = false;

async function appendCheckpoint(paths: string[]): Promise<void> {
  _checkpointBuffer.push(...paths);
  if (_checkpointFlushing) return;
  _checkpointFlushing = true;
  const target = resolveFilePath(CHECKPOINT_FILE);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const toWrite = _checkpointBuffer.splice(0);
  await fs.appendFile(target, `${toWrite.join('\n')}\n`, 'utf8');
  _checkpointFlushing = false;
}

async function clearCheckpoint(): Promise<void> {
  const target = resolveFilePath(CHECKPOINT_FILE);
  try { await fs.unlink(target); } catch {}
}

async function uploadOne(relativePath: string): Promise<void> {
  const localPath = path.join(SNAPSHOT_ROOT, ...relativePath.split('/'));
  const content = await fs.readFile(localPath);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(relativePath)}`;
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'cache-control': getCacheControlByPath(relativePath),
    'x-upsert': String(UPSERT),
  };

  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: content });
    if (res.ok) return;

    const txt = await res.text();
    lastErr = `${res.status} ${txt}`;

    // upsert=false 时，已存在视为成功（便于断点重跑）
    if (!UPSERT && /already exists|Duplicate|exists/i.test(txt)) {
      return;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(attempt * 1000);
      continue;
    }
  }

  throw new Error(`Upload failed: ${relativePath} -> ${lastErr}`);
}

async function uploadWithPool(files: string[], doneSet?: Set<string>) {
  // 跳过已完成的文件（断点续传）
  const pending = doneSet && doneSet.size > 0
    ? files.filter((f) => !doneSet.has(f))
    : files;

  if (pending.length < files.length) {
    console.log(`[upload] resume: skipping ${files.length - pending.length} already done, ${pending.length} remaining`);
  }

  let idx = 0;
  let done = 0;
  let failed = 0;
  const failedPaths: string[] = [];
  const checkpointBatch: string[] = [];

  async function worker(workerId: number) {
    while (true) {
      const cur = idx;
      idx += 1;
      if (cur >= pending.length) return;

      const relativePath = pending[cur];
      try {
        await uploadOne(relativePath);
        checkpointBatch.push(relativePath);
      } catch (e) {
        failed += 1;
        failedPaths.push(relativePath);
        console.error(`[upload] worker=${workerId} failed: ${relativePath}`, e);
      } finally {
        done += 1;
        if (done % LOG_EVERY === 0 || done === pending.length) {
          console.log(`[upload] progress ${done}/${pending.length}, failed=${failed}`);
        }
        // 每 CHECKPOINT_EVERY 次写一次 checkpoint
        if (RESUME && checkpointBatch.length >= CHECKPOINT_EVERY) {
          const batch = checkpointBatch.splice(0);
          appendCheckpoint(batch).catch(() => {});
        }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // 写入剩余 checkpoint
  if (RESUME && checkpointBatch.length > 0) {
    await appendCheckpoint(checkpointBatch.splice(0));
  }

  return { failed, failedPaths };
}

async function main() {
  assertEnv();

  console.log(`[upload] bucket=${BUCKET}, root=${SNAPSHOT_ROOT}`);
  console.log(`[upload] subdirs=${SUBDIRS.join(', ')}, concurrency=${CONCURRENCY}, upsert=${UPSERT}`);
  if (ONLY_LIST_FILE) {
    console.log(`[upload] only-list mode: ${ONLY_LIST_FILE}`);
  }

  // 加载断点（无论哪种模式都支持续传）
  const doneSet = RESUME ? await loadCheckpoint() : new Set<string>();

  let totalFailed = 0;
  const failedPathsAll: string[] = [];

  if (ONLY_LIST_FILE) {
    const files = await readPathList(ONLY_LIST_FILE);
    console.log(`[upload] list mode files: ${files.length}`);
    if (files.length === 0) {
      console.log('[upload] list is empty, nothing to upload');
      return;
    }

    const res = await uploadWithPool(files, doneSet);
    totalFailed += res.failed;
    failedPathsAll.push(...res.failedPaths);

    if (totalFailed > 0) {
      const out = await writeFailedList(failedPathsAll);
      throw new Error(`Upload finished with failures: ${totalFailed}. Failed list: ${out}`);
    }

    if (RESUME) await clearCheckpoint();
    console.log('[upload] all done');
    return;
  }

  if (SHOULD_UPLOAD_ROOT_FILES) {
    for (const file of ROOT_FILES) {
      try {
        await fs.access(path.join(SNAPSHOT_ROOT, file));
        console.log(`[upload] root file: ${file}`);
        const res = await uploadWithPool([file], doneSet);
        totalFailed += res.failed;
        failedPathsAll.push(...res.failedPaths);
      } catch {}
    }
  } else {
    console.log('[upload] skip root files due to SNAPSHOT_UPLOAD_SUBDIRS');
  }

  for (const dir of SUBDIRS) {
    const absDir = path.join(SNAPSHOT_ROOT, dir);
    try {
      await fs.access(absDir);
    } catch {
      console.log(`[upload] skip missing dir: ${dir}`);
      continue;
    }

    console.log(`[upload] scanning ${dir}...`);
    const files = await walkFiles(absDir, SNAPSHOT_ROOT);
    console.log(`[upload] ${dir}: ${files.length} files`);

    if (files.length === 0) continue;
    const res = await uploadWithPool(files, doneSet);
    totalFailed += res.failed;
    failedPathsAll.push(...res.failedPaths);
    console.log(`[upload] done ${dir}`);
  }

  if (totalFailed > 0) {
    const out = await writeFailedList(failedPathsAll);
    throw new Error(`Upload finished with failures: ${totalFailed}. Failed list: ${out}`);
  }

  if (RESUME) await clearCheckpoint();
  console.log('[upload] all done');
}

main().catch((e) => {
  console.error('[upload] fatal', e);
  process.exit(1);
});

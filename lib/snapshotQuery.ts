import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

type SnapshotEnvelope<T> = {
  generatedAt: string;
  namespace: string;
  payload: unknown;
  data: T;
};

function snapshotRoot(): string {
  return process.env.SNAPSHOT_DATA_ROOT ?? path.join(process.cwd(), 'kuaizhao', 'data');
}

function snapshotsDisabled(): boolean {
  const v = (process.env.SNAPSHOT_DISABLE ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function sanitizeNamespace(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function hashPayload(payload: unknown): string {
  const raw = JSON.stringify(payload ?? null);
  return crypto.createHash('sha1').update(raw).digest('hex');
}

async function readSnapshotFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotEnvelope<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

async function writeSnapshotFile<T>(filePath: string, envelope: SnapshotEnvelope<T>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(envelope), 'utf8');
  } catch {
    // ignore snapshot write errors to avoid impacting request flow
  }
}

export async function queryWithSnapshot<T>(
  namespace: string,
  payload: unknown,
  dbFetcher: () => Promise<T>
): Promise<T> {
  if (snapshotsDisabled()) {
    return dbFetcher();
  }

  const root = snapshotRoot();
  const safeNamespace = sanitizeNamespace(namespace);
  const payloadHash = hashPayload(payload);
  const filePath = path.join(root, safeNamespace, `${payloadHash}.json`);

  const snapshotFirst = (process.env.SNAPSHOT_PRIORITY ?? 'snapshot').toLowerCase() !== 'database';

  if (snapshotFirst) {
    const cached = await readSnapshotFile<T>(filePath);
    if (cached !== null) return cached;
  }

  try {
    const fresh = await dbFetcher();
    await writeSnapshotFile(filePath, {
      generatedAt: new Date().toISOString(),
      namespace,
      payload,
      data: fresh,
    });
    return fresh;
  } catch (error) {
    const fallback = await readSnapshotFile<T>(filePath);
    if (fallback !== null) return fallback;
    throw error;
  }
}

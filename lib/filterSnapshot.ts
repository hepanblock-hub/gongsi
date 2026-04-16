/**
 * lib/filterSnapshot.ts
 * 从 Supabase Storage 读取筛选快照
 */

export interface FilterSnapshot {
  generatedAt: string;
  stateSlug: string;
  filterSlug: string;
  summary?: {
    total_count: number;
    shown_count: number;
    categoryCount?: Record<string, number>;
  };
  companies: Array<{
    slug: string;
    company_name: string;
    state: string;
    city: string | null;
    updated_at: string | null;
    has_osha: boolean;
    has_license: boolean;
    has_registration: boolean;
    osha_count: number;
    injury_count: number;
    license_status: string | null;
    latest_inspection_date: string | null;
  }>;
}

function getBaseUrl(): string | null {
  return process.env.FILTER_SNAPSHOT_BASE_URL?.replace(/\/$/, '') ?? null;
}

function snapshotsDisabled(): boolean {
  const v = (process.env.SNAPSHOT_DISABLE ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getSnapshotToken(): string | null {
  return (
    process.env.SNAPSHOT_STORAGE_TOKEN ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    null
  );
}

function buildSnapshotCandidates(url: string, token: string | null): string[] {
  if (!token) return [url];
  if (!url.includes('/storage/v1/object/public/')) return [url];
  return [url, url.replace('/storage/v1/object/public/', '/storage/v1/object/authenticated/')];
}

function buildSnapshotHeaders(token: string | null): HeadersInit | undefined {
  if (!token) return undefined;
  return {
    Authorization: `Bearer ${token}`,
    apikey: token,
  };
}

const SNAPSHOT_DEBUG = process.env.SNAPSHOT_DEBUG === 'true';

/**
 * 从 Supabase Storage 读取筛选快照
 */
export async function fetchFilterSnapshot(
  stateSlug: string,
  filterSlug: string
): Promise<FilterSnapshot | null> {
  if (snapshotsDisabled()) return null;
  const base = getBaseUrl();
  if (!base) return null;
  const token = getSnapshotToken();
  const headers = buildSnapshotHeaders(token);

  const url = `${base}/${encodeURIComponent(stateSlug)}/${encodeURIComponent(filterSlug)}.json`;
  for (const requestUrl of buildSnapshotCandidates(url, token)) {
    try {
      const res = await fetch(requestUrl, {
        headers,
        next: { revalidate: 86400 },
      });
      if (!res.ok) {
        if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] filter/${stateSlug}/${filterSlug}.json status=${res.status}`);
        continue;
      }
      if (SNAPSHOT_DEBUG) console.info(`[snapshot-hit] filter/${stateSlug}/${filterSlug}.json`);
      return (await res.json()) as FilterSnapshot;
    } catch {
      if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] filter/${stateSlug}/${filterSlug}.json error`);
      continue;
    }
  }
  return null;
}

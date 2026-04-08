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

const SNAPSHOT_DEBUG = process.env.SNAPSHOT_DEBUG === 'true';

/**
 * 从 Supabase Storage 读取筛选快照
 */
export async function fetchFilterSnapshot(
  stateSlug: string,
  filterSlug: string
): Promise<FilterSnapshot | null> {
  const base = getBaseUrl();
  if (!base) return null;

  const url = `${base}/${encodeURIComponent(stateSlug)}/${encodeURIComponent(filterSlug)}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] filter/${stateSlug}/${filterSlug}.json status=${res.status}`);
      return null;
    }
    if (SNAPSHOT_DEBUG) console.info(`[snapshot-hit] filter/${stateSlug}/${filterSlug}.json`);
    return (await res.json()) as FilterSnapshot;
  } catch {
    if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] filter/${stateSlug}/${filterSlug}.json error`);
    return null;
  }
}

/**
 * lib/stateSnapshot.ts
 * 从 Supabase Storage 读取州快照
 */

export interface StateSnapshot {
  generatedAt: string;
  state: string;
  summary: {
    state: string;
    company_count: number;
    osha_count: number;
    license_count: number;
    registration_count: number;
  };
  companyPages: Array<{
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
  }>;
  cityCounts: Array<{
    city: string;
    company_count: number;
  }>;
  stats: {
    analyzed_company_count: number;
    categoryCount: {
      full: number;
      partial: number;
      oshaOnly: number;
      licenseOnly: number;
      registrationOnly: number;
      basic: number;
    };
    oshaCoveragePct: number;
    licenseCoveragePct: number;
    registrationCoveragePct: number;
  };
}

function getBaseUrl(): string | null {
  return process.env.STATE_SNAPSHOT_BASE_URL?.replace(/\/$/, '') ?? null;
}

/**
 * 从 Supabase Storage 读取州快照
 */
export async function fetchStateSnapshot(stateSlug: string): Promise<StateSnapshot | null> {
  const base = getBaseUrl();
  if (!base) return null;

  const url = `${base}/${encodeURIComponent(stateSlug)}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as StateSnapshot;
  } catch {
    return null;
  }
}

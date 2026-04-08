/**
 * lib/citySnapshot.ts
 * 从 Supabase Storage 读取城市快照
 */

export interface CitySnapshot {
  generatedAt: string;
  stateSlug: string;
  citySlug: string;
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
  return process.env.CITY_SNAPSHOT_BASE_URL?.replace(/\/$/, '') ?? null;
}

/**
 * 从 Supabase Storage 读取城市快照
 */
export async function fetchCitySnapshot(
  stateSlug: string,
  citySlug: string
): Promise<CitySnapshot | null> {
  const base = getBaseUrl();
  if (!base) return null;

  const url = `${base}/${encodeURIComponent(stateSlug)}/${encodeURIComponent(citySlug)}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as CitySnapshot;
  } catch {
    return null;
  }
}

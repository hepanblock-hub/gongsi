/**
 * lib/rootSnapshot.ts
 * 从 Supabase Storage 读取首页相关快照（recent.json）
 */

type RecentCompany = {
  slug: string;
  company_name: string;
  state: string;
  city: string | null;
  updated_at: string | null;
  has_osha: boolean;
  has_license: boolean;
  has_registration: boolean;
};

export type RecentSnapshot = {
  generatedAt: string;
  data: RecentCompany[];
};

function getBaseUrl(): string | null {
  return process.env.ROOT_SNAPSHOT_BASE_URL?.replace(/\/$/, '') ?? null;
}

export async function fetchRecentSnapshot(): Promise<RecentSnapshot | null> {
  const base = getBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/recent.json`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as RecentSnapshot;
  } catch {
    return null;
  }
}

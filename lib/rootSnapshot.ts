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

export async function fetchRecentSnapshot(): Promise<RecentSnapshot | null> {
  if (snapshotsDisabled()) return null;
  const base = getBaseUrl();
  if (!base) return null;
  const token = getSnapshotToken();
  const headers = buildSnapshotHeaders(token);

  const url = `${base}/recent.json`;
  for (const requestUrl of buildSnapshotCandidates(url, token)) {
    try {
      const res = await fetch(requestUrl, {
        headers,
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      return (await res.json()) as RecentSnapshot;
    } catch {
      continue;
    }
  }

  return null;
}

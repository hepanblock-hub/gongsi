/**
 * lib/companySnapshot.ts
 * 从 Supabase Storage 读取公司快照 JSON
 *
 * 线上 Vercel 配置以下环境变量后自动从 Storage 读，无需连 DB：
 *   COMPANY_SNAPSHOT_BASE_URL=https://ioclagkqoytlqqacrese.supabase.co/storage/v1/object/public/gongsihegui/company
 *
 * 不设该变量则返回 null，调用方回退到 DB 查询。
 */

import { sanitizeSnapshotSlug } from './snapshotKey';

export interface CompanySnapshot {
  generatedAt: string;
  slug: string;
  routing: null | {
    company_name: string;
    state: string;
    city: string | null;
    slug: string;
    updated_at: string | null;
  };
  detail: null | {
    company_name: string;
    state: string;
    city: string | null;
    slug: string;
    updated_at: string | null;
  };
  osha: Array<{
    normalized_name: string;
    inspection_date: string | null;
    inspection_type: string | null;
    violation_type: string | null;
    severity: string | null;
    penalty: string | null;
    open_case: boolean | null;
    source_url: string | null;
  }>;
  licenses: Array<{
    normalized_name: string;
    license_number: string | null;
    license_type: string | null;
    status: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    source_url: string | null;
  }>;
  registrations: Array<{
    normalized_name: string;
    registration_number: string | null;
    status: string | null;
    incorporation_date: string | null;
    registered_agent: string | null;
    source_url: string | null;
  }>;
  timeline: Array<{
    event_date: string | null;
    event_type: string;
    detail: string | null;
  }> | null;
  related: Array<{
    slug: string;
    company_name: string;
    state: string;
    city: string | null;
    updated_at: string | null;
  }> | null;
  location: string | null;
  benchmark: {
    avgOshaRecords: number;
    activeLicensePct: number;
    cityCompanyCount: number;
  } | null;
}

function getBaseUrl(): string | null {
  return process.env.COMPANY_SNAPSHOT_BASE_URL?.replace(/\/$/, '') ?? null;
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
 * 从 Supabase Storage 读取公司快照
 * @returns 快照数据，若未找到或未配置则返回 null
 */
export async function fetchCompanySnapshot(slug: string): Promise<CompanySnapshot | null> {
  if (snapshotsDisabled()) return null;
  const base = getBaseUrl();
  if (!base) return null;
  const token = getSnapshotToken();
  const headers = buildSnapshotHeaders(token);

  // slug 可能带 /company/ 前缀，去掉后直接用
  const cleanSlug = slug.replace(/^\/?(company\/)?/, '');
  const candidates = [...new Set([cleanSlug, sanitizeSnapshotSlug(cleanSlug)])];

  for (const candidate of candidates) {
    const url = `${base}/${encodeURIComponent(candidate)}.json`;
    for (const requestUrl of buildSnapshotCandidates(url, token)) {
      try {
        const res = await fetch(requestUrl, {
          headers,
          next: { revalidate: 86400 },
        });
        if (!res.ok) {
          if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] company/${candidate}.json status=${res.status}`);
          continue;
        }
        if (SNAPSHOT_DEBUG) console.info(`[snapshot-hit] company/${candidate}.json`);
        return (await res.json()) as CompanySnapshot;
      } catch {
        continue;
      }
    }
  }

  if (SNAPSHOT_DEBUG) console.info(`[snapshot-miss] company/${cleanSlug}.json`);

  return null;
}

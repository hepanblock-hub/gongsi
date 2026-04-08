import { pool } from './db';
import { normalizeStateSlug } from './site';

type ReleasedCityEntry = {
  slug: string;
  name: string;
};

type ReleasedCityMap = Record<string, ReleasedCityEntry[]>;
type ReleasedCityRow = {
  state_slug: string;
  city_slug: string;
  city_name: string;
};

const STATE_CODE_TO_SLUG: Record<string, string> = {
  CA: 'california',
};

const RELEASE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS city_release_control (
  state_slug text NOT NULL,
  city_slug text NOT NULL,
  city_name text NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state_slug, city_slug)
);
`;

function releaseControlDisabled(): boolean {
  const raw = (process.env.RELEASE_CONTROL_MODE ?? process.env.RELEASE_IGNORE ?? '').toLowerCase().trim();
  return raw === 'all' || raw === 'disabled' || raw === 'off' || raw === '1' || raw === 'true';
}

let ensured = false;
let ensurePromise: Promise<void> | null = null;

async function ensureReleaseTable(): Promise<void> {
  if (ensured) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await pool.query(RELEASE_TABLE_SQL);
      } finally {
        ensured = true;
      }
    })();
  }
  await ensurePromise;
}

async function loadReleasedCityMap(): Promise<ReleasedCityMap> {
  await ensureReleaseTable();
  try {
    const { rows } = await pool.query<ReleasedCityRow>(
      `SELECT state_slug, city_slug, city_name
       FROM city_release_control
       ORDER BY state_slug ASC, released_at ASC, city_name ASC`
    );

    const map: ReleasedCityMap = {};
    for (const row of rows) {
      const stateSlug = normalizeStateSlug(row.state_slug);
      if (!map[stateSlug]) {
        map[stateSlug] = [];
      }
      map[stateSlug].push({ slug: row.city_slug, name: row.city_name });
    }

    return map;
  } catch {
    return {};
  }
}

export async function getReleaseVisibilityVersion(): Promise<string> {
  if (releaseControlDisabled()) return 'release-control:disabled';
  return JSON.stringify(await loadReleasedCityMap());
}

export async function getReleasedCityEntries(stateSlug: string): Promise<ReleasedCityEntry[]> {
  if (releaseControlDisabled()) return [];
  const map = await loadReleasedCityMap();
  return map[normalizeStateSlug(stateSlug)] ?? [];
}

export async function hasReleasedCityControl(stateSlug: string): Promise<boolean> {
  return (await getReleasedCityEntries(stateSlug)).length > 0;
}

export async function releasedCitySlugSet(stateSlug: string): Promise<Set<string>> {
  return new Set((await getReleasedCityEntries(stateSlug)).map((entry) => entry.slug));
}

export function toReleasedCitySlug(value: string | null): string | null {
  const raw = (value ?? '').trim().replace(/^"+|"+$/g, '');
  if (!raw) return null;

  const normalized = raw
    .replace(/,\s*(ca|california)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const isAddressLike =
    /^\d+\b/.test(normalized) ||
    /\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|suite|ste|apt|unit|hwy|highway)\b/i.test(normalized) ||
    normalized.length > 40;

  if (isAddressLike || /^(-\s*select\s*-|select|unknown|n\/?a)$/i.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function normalizeReleaseStateSlug(rawState: string): string {
  const trimmed = rawState.trim();
  const upper = trimmed.toUpperCase();
  if (STATE_CODE_TO_SLUG[upper]) {
    return STATE_CODE_TO_SLUG[upper];
  }
  return normalizeStateSlug(trimmed);
}

export async function isReleasedCity(stateSlug: string, citySlug: string): Promise<boolean> {
  if (!(await hasReleasedCityControl(stateSlug))) return true;
  return (await releasedCitySlugSet(stateSlug)).has(citySlug);
}

export async function isReleasedCityName(stateSlug: string, city: string | null): Promise<boolean> {
  if (!(await hasReleasedCityControl(stateSlug))) return true;
  const slug = toReleasedCitySlug(city);
  if (!slug) return false;
  return (await releasedCitySlugSet(stateSlug)).has(slug);
}

export async function isReleasedCompanyLocation(state: string, city: string | null): Promise<boolean> {
  const stateSlug = normalizeReleaseStateSlug(state);
  return isReleasedCityName(stateSlug, city);
}

export function isReleasedCityBySet(
  citySet: Set<string>,
  hasControl: boolean,
  citySlug: string | null
): boolean {
  if (!hasControl) return true;
  if (!citySlug) return false;
  return citySet.has(citySlug);
}
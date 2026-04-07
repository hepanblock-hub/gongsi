import releasedCitySitemap from '../data/released-city-sitemap.json';
import { normalizeStateSlug } from './site';

type ReleasedCityEntry = {
  slug: string;
  name: string;
};

type ReleasedCityMap = Record<string, ReleasedCityEntry[]>;

const STATE_CODE_TO_SLUG: Record<string, string> = {
  CA: 'california',
};

const RELEASED_CITY_MAP = releasedCitySitemap as ReleasedCityMap;
const RELEASE_VISIBILITY_VERSION = JSON.stringify(RELEASED_CITY_MAP);

export function getReleaseVisibilityVersion(): string {
  return RELEASE_VISIBILITY_VERSION;
}

export function getReleasedCityEntries(stateSlug: string): ReleasedCityEntry[] {
  return RELEASED_CITY_MAP[normalizeStateSlug(stateSlug)] ?? [];
}

export function hasReleasedCityControl(stateSlug: string): boolean {
  return getReleasedCityEntries(stateSlug).length > 0;
}

export function releasedCitySlugSet(stateSlug: string): Set<string> {
  return new Set(getReleasedCityEntries(stateSlug).map((entry) => entry.slug));
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

export function isReleasedCity(stateSlug: string, citySlug: string): boolean {
  if (!hasReleasedCityControl(stateSlug)) return true;
  return releasedCitySlugSet(stateSlug).has(citySlug);
}

export function isReleasedCityName(stateSlug: string, city: string | null): boolean {
  if (!hasReleasedCityControl(stateSlug)) return true;
  const slug = toReleasedCitySlug(city);
  if (!slug) return false;
  return releasedCitySlugSet(stateSlug).has(slug);
}

export function isReleasedCompanyLocation(state: string, city: string | null): boolean {
  const stateSlug = normalizeReleaseStateSlug(state);
  return isReleasedCityName(stateSlug, city);
}
import { SITE_URL } from './site';

export const FILTER_CANONICAL_MAP = {
  quality: 'quality',
  osha: 'osha-violations',
  recent: 'recently-updated',
  'active-license': 'active-licenses',
  full: 'full-profiles',
  partial: 'partial-profiles',
  'osha-only': 'osha-only',
  'license-only': 'license-only',
  'registration-only': 'registration-only',
  basic: 'basic-listings',
  'osha-violations': 'osha-violations',
  'contractor-licenses': 'contractor-licenses',
  'business-registration': 'business-registration',
  'active-licenses': 'active-licenses',
  'expired-licenses': 'expired-licenses',
  'suspended-licenses': 'suspended-licenses',
  'recently-updated': 'recently-updated',
  'full-profiles': 'full-profiles',
  'partial-profiles': 'partial-profiles',
  'basic-listings': 'basic-listings',
} as const;

export type KnownFilterSlug = keyof typeof FILTER_CANONICAL_MAP;
export type PrimaryFilterSlug = (typeof FILTER_CANONICAL_MAP)[KnownFilterSlug];

export const PRIMARY_FILTER_SLUGS: PrimaryFilterSlug[] = [
  'quality',
  'osha-violations',
  'recently-updated',
  'active-licenses',
  'full-profiles',
  'partial-profiles',
  'osha-only',
  'license-only',
  'registration-only',
  'basic-listings',
  'contractor-licenses',
  'business-registration',
  'expired-licenses',
  'suspended-licenses',
];

export const STATIC_INDEXABLE_PAGES = [
  '/',
  '/about',
  '/editorial-policy',
  '/faq',
  '/methodology',
  '/privacy',
  '/terms',
  '/sources',
] as const;

export function canonicalFilterSlug(filterSlug: string): string {
  return FILTER_CANONICAL_MAP[filterSlug as KnownFilterSlug] ?? filterSlug;
}

export function isPrimaryFilterSlug(filterSlug: string): filterSlug is PrimaryFilterSlug {
  return PRIMARY_FILTER_SLUGS.includes(filterSlug as PrimaryFilterSlug);
}

export function canonicalFilterPath(stateSlug: string, filterSlug: string): string {
  return `/state/${stateSlug}/filter/${canonicalFilterSlug(filterSlug)}`;
}

export function canonicalCityPath(stateSlug: string, citySlug: string): string {
  return `/state/${stateSlug}/city/${citySlug}`;
}

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname}`;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

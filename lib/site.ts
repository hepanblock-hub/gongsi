export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:39017';

const STATE_CODE_TO_FULL_SLUG: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new-hampshire', NJ: 'new-jersey',
  NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina',
  SD: 'south-dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
};

/**
 * 将任意州字符串（2字母缩写 or 全称）转为路由用的 full slug，如 "NY" → "new-york"。
 */
export function stateToFullSlug(raw: string): string {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && STATE_CODE_TO_FULL_SLUG[upper]) {
    return STATE_CODE_TO_FULL_SLUG[upper];
  }
  return trimmed.toLowerCase().replace(/\s+/g, '-');
}

export function normalizeStateSlug(state: string): string {
  return state.trim().toLowerCase().replace(/\s+/g, '-');
}

export function stateSlugToName(stateSlug: string): string {
  return stateSlug
    .split('-')
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(' ');
}

export function companyPathFromSlug(fullSlug: string): string {
  const trimmed = fullSlug.trim();
  if (!trimmed) return '/company';

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const [pathOnly] = withoutOrigin.split(/[?#]/, 1);
  let normalized = pathOnly.replace(/^\/+/, '');

  while (/^company\/+?/i.test(normalized)) {
    normalized = normalized.replace(/^company\/+?/i, '');
  }

  normalized = normalized.replace(/^\/+/, '');
  return normalized ? `/company/${normalized}` : '/company';
}

export function formatDate(value: string | null): string {
  if (!value) return '-';
  return value;
}

export function formatMoney(value: string | null): string {
  if (!value) return '-';
  return `$${Number(value).toLocaleString()}`;
}

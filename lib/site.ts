export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:39017';

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

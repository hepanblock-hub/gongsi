import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const CATEGORY_ALLOW = new Set([
  'full', 'partial', 'osha-only', 'license-only', 'registration-only', 'basic',
]);

const SORT_ALLOW = new Set(['quality', 'osha', 'recent', 'active-license']);

const STATE_CODE_TO_SLUG: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut',
  DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan',
  MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new-hampshire',
  NJ: 'new-jersey', NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio', OK: 'oklahoma',
  OR: 'oregon', PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina', SD: 'south-dakota', TN: 'tennessee',
  TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
};

const TOP_LEVEL_RESERVED = new Set([
  '', 'about', 'api', 'company', 'contact', 'editorial-policy', 'faq', 'methodology', 'privacy',
  'search', 'sources', 'state', 'terms', 'sitemap.xml', 'sitemap-index.xml', 'sitemaps', 'robots.txt',
  'favicon.ico', '_next', 'assets', 'images', 'fonts',
]);

function sanitizeLegacyCompanySlug(value: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  return decoded
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // 1) 历史公司URL兼容：/foo-bar-ca => /company/foo-bar-ca
  const topLevel = pathname.match(/^\/([^/]+)\/?$/);
  if (topLevel) {
    const legacySlug = topLevel[1];
    if (!TOP_LEVEL_RESERVED.has(legacySlug)) {
      const normalizedSlug = sanitizeLegacyCompanySlug(legacySlug);
      if (normalizedSlug) {
        const target = new URL(`/company/${normalizedSlug}`, nextUrl.origin);
        return NextResponse.redirect(target, 301);
      }
    }
  }

  // 2) 历史州缩写URL兼容：/state/fl/city/miami => /state/florida/city/miami
  const legacyStateCityMatch = pathname.match(/^\/state\/([a-z]{2})\/city\/([^/]+)\/?$/i);
  if (legacyStateCityMatch) {
    const stateCode = legacyStateCityMatch[1].toUpperCase();
    const citySlug = legacyStateCityMatch[2];
    const fullStateSlug = STATE_CODE_TO_SLUG[stateCode];
    if (fullStateSlug) {
      const target = new URL(`/state/${fullStateSlug}/city/${citySlug}`, nextUrl.origin);
      return NextResponse.redirect(target, 301);
    }
  }

  // 3) 历史州缩写URL兼容：/state/fl => /state/florida
  const legacyStateMatch = pathname.match(/^\/state\/([a-z]{2})\/?$/i);
  if (legacyStateMatch) {
    const stateCode = legacyStateMatch[1].toUpperCase();
    const fullStateSlug = STATE_CODE_TO_SLUG[stateCode];
    if (fullStateSlug) {
      const target = new URL(`/state/${fullStateSlug}`, nextUrl.origin);
      return NextResponse.redirect(target, 301);
    }
  }

  const stateMatch = pathname.match(/^\/state\/([^/]+)$/);
  if (!stateMatch) return NextResponse.next();

  const stateSlug = stateMatch[1];
  const city = nextUrl.searchParams.get('city');
  const category = nextUrl.searchParams.get('category');
  const sort = nextUrl.searchParams.get('sort');

  if (city && city.trim()) {
    const target = new URL(`/state/${stateSlug}/city/${slugify(city)}`, nextUrl.origin);
    return NextResponse.redirect(target, 308);
  }

  if (category && CATEGORY_ALLOW.has(category)) {
    const target = new URL(`/state/${stateSlug}/filter/${category}`, nextUrl.origin);
    return NextResponse.redirect(target, 308);
  }

  if (sort && SORT_ALLOW.has(sort)) {
    const target = new URL(`/state/${stateSlug}/filter/${sort}`, nextUrl.origin);
    return NextResponse.redirect(target, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};

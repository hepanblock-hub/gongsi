import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const CATEGORY_ALLOW = new Set([
  'full', 'partial', 'osha-only', 'license-only', 'registration-only', 'basic',
]);

const SORT_ALLOW = new Set(['quality', 'osha', 'recent', 'active-license']);

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

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
  matcher: ['/state/:path*'],
};

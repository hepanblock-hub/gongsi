import { absoluteUrl, canonicalCityPath, canonicalFilterPath, chunkArray, PRIMARY_FILTER_SLUGS, STATIC_INDEXABLE_PAGES, xmlEscape } from '../../../lib/indexing';
import { countIndexableCompanies, getCompanySitemapBatch, getIndexedStateCitiesMap, getIndexedStates } from '../../../lib/queries';
import { companyPathFromSlug } from '../../../lib/site';

const CITY_CHUNK_SIZE = 5000;
const FILTER_CHUNK_SIZE = 5000;
const COMPANY_CHUNK_SIZE = 5000;

function xml(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

function buildUrlset(entries: Array<{ loc: string; lastmod?: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(({ loc, lastmod }) => `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>`;
}

function normalizeSlug(raw: string): string {
  return raw.replace(/\.xml$/i, '');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const normalizedSlug = normalizeSlug(slug);

  if (normalizedSlug === 'core') {
    const entries = STATIC_INDEXABLE_PAGES.map((pathname) => ({ loc: absoluteUrl(pathname) }));
    return xml(buildUrlset(entries));
  }

  if (normalizedSlug === 'states') {
    const states = await getIndexedStates();
    const entries = states.flatMap((state) => ([
      { loc: absoluteUrl(`/state/${state.slug}`) },
      { loc: absoluteUrl(`/state/${state.slug}/cities`) },
    ]));
    return xml(buildUrlset(entries));
  }

  if (normalizedSlug.startsWith('cities-')) {
    const chunkIndex = Number(normalizedSlug.replace('cities-', ''));
    const cityMap = await getIndexedStateCitiesMap();
    const allCities = Object.entries(cityMap)
      .flatMap(([stateSlug, cities]) => cities.map((citySlug) => ({ stateSlug, citySlug })))
      .sort((a, b) => a.stateSlug.localeCompare(b.stateSlug) || a.citySlug.localeCompare(b.citySlug));
    const chunk = chunkArray(allCities, CITY_CHUNK_SIZE)[chunkIndex] ?? [];
    const entries = chunk.map(({ stateSlug, citySlug }) => ({
      loc: absoluteUrl(canonicalCityPath(stateSlug, citySlug)),
    }));
    return xml(buildUrlset(entries));
  }

  if (normalizedSlug.startsWith('filters-')) {
    const chunkIndex = Number(normalizedSlug.replace('filters-', ''));
    const states = await getIndexedStates();
    const allFilters = states.flatMap((state) =>
      PRIMARY_FILTER_SLUGS.map((filterSlug) => ({ stateSlug: state.slug, filterSlug }))
    );
    const chunk = chunkArray(allFilters, FILTER_CHUNK_SIZE)[chunkIndex] ?? [];
    const entries = chunk.map(({ stateSlug, filterSlug }) => ({
      loc: absoluteUrl(canonicalFilterPath(stateSlug, filterSlug)),
    }));
    return xml(buildUrlset(entries));
  }

  if (normalizedSlug.startsWith('companies-')) {
    const chunkIndex = Number(normalizedSlug.replace('companies-', ''));
    const companyCount = await countIndexableCompanies();
    const maxChunkIndex = Math.max(0, Math.ceil(companyCount / COMPANY_CHUNK_SIZE) - 1);
    if (chunkIndex > maxChunkIndex) {
      return new Response('Not Found', { status: 404 });
    }

    const rows = await getCompanySitemapBatch(chunkIndex * COMPANY_CHUNK_SIZE, COMPANY_CHUNK_SIZE);
    const entries = rows.map((row) => ({
      loc: absoluteUrl(companyPathFromSlug(row.slug)),
      lastmod: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    }));
    return xml(buildUrlset(entries));
  }

  return new Response('Not Found', { status: 404 });
}

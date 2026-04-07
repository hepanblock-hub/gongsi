import { absoluteUrl, chunkArray, PRIMARY_FILTER_SLUGS, xmlEscape } from '../../lib/indexing';
import { countIndexableCompanies, getIndexedStateCitiesMap, getIndexedStates, hasReleasedCityControl } from '../../lib/queries';

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

export async function GET() {
  const [states, cityMap, companyCount] = await Promise.all([
    getIndexedStates(),
    getIndexedStateCitiesMap(),
    countIndexableCompanies(),
  ]);

  const cityEntries = Object.entries(cityMap).flatMap(([stateSlug, cities]) =>
    cities.map((citySlug) => ({ stateSlug, citySlug }))
  );
  const filterEntries = states.flatMap((state) =>
    PRIMARY_FILTER_SLUGS.map((filterSlug) => ({ stateSlug: state.slug, filterSlug }))
  );

  const sitemapUrls = [
    absoluteUrl('/sitemaps/core.xml'),
    absoluteUrl('/sitemaps/states.xml'),
    ...chunkArray(cityEntries, CITY_CHUNK_SIZE).map((_, index) => absoluteUrl(`/sitemaps/cities-${index}.xml`)),
    ...chunkArray(filterEntries, FILTER_CHUNK_SIZE).map((_, index) => absoluteUrl(`/sitemaps/filters-${index}.xml`)),
    ...Array.from({ length: Math.ceil(companyCount / COMPANY_CHUNK_SIZE) }, (_, index) => absoluteUrl(`/sitemaps/companies-${index}.xml`)),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <sitemap><loc>${xmlEscape(url)}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

  return xml(body);
}

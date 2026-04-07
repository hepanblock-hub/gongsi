import type { MetadataRoute } from 'next';
import { STATIC_INDEXABLE_PAGES } from '../lib/indexing';
import { getIndexedStates } from '../lib/queries';
import { SITE_URL } from '../lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;

  const indexedStates = await getIndexedStates();

  const staticPages: MetadataRoute.Sitemap = STATIC_INDEXABLE_PAGES.map((pathname) => ({
    url: `${base}${pathname}`,
    changeFrequency: pathname === '/' ? 'daily' : 'weekly',
    priority: pathname === '/' ? 1 : pathname === '/sources' || pathname === '/methodology' ? 0.7 : 0.5,
  }));

  const statePages: MetadataRoute.Sitemap = indexedStates.flatMap((state) => ([
    { url: `${base}/state/${state.slug}`, changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${base}/state/${state.slug}/cities`, changeFrequency: 'weekly' as const, priority: 0.7 },
  ]));

  return [...staticPages, ...statePages];
}

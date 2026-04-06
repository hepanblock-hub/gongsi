import type { MetadataRoute } from 'next';
import { getRecentCompanyPages } from '../lib/queries';
import { SITE_URL } from '../lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/state/california`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/state/california/osha`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/state/california/licenses`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/state/california/registrations`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/state/texas`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/sources`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/methodology`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/faq`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Include top company pages in sitemap for crawler discovery
  let companyPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await getRecentCompanyPages(500);
    companyPages = rows.map((r) => ({
      url: `${base}${r.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
    }));
  } catch {
    // Sitemap company section unavailable — skip gracefully
  }

  return [...staticPages, ...companyPages];
}

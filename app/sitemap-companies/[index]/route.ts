export async function GET() {
  return new Response('Deprecated sitemap endpoint. Use /sitemap-index.xml and /sitemaps/companies-*.xml.', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.SNAPSHOT_BASE_URL ?? 'http://localhost:39030';
const ROOT = path.resolve(process.cwd());
const OUTPUT_DIR = path.join(ROOT, 'kuaizhao', 'pages');

const FIXED_PAGES = [
  '/',
  '/about',
  '/editorial-policy',
  '/faq',
  '/methodology',
  '/privacy',
  '/terms',
  '/sources',
  '/search',
  '/state/california',
];

const CITY_SLUGS = [
  'los-angeles',
  'san-diego',
  'san-jose',
  'sacramento',
  'san-francisco',
];

const FILTER_SLUGS = [
  'quality', 'osha-violations', 'recently-updated', 'active-licenses',
  'full-profiles', 'partial-profiles', 'osha-only', 'license-only', 'registration-only', 'basic-listings',
  'contractor-licenses', 'business-registration', 'expired-licenses', 'suspended-licenses',
];

const COMPANY_SLUGS = [
  'saf-flc-ca',
  'v-t-tooling-ca',
  'wellah-aesthetics-med-spa-ca',
  'wunder-bar-ca',
  'xbp-global-holdings-ca',
  'swim-care-pool-services-ca',
  'r-r-heating-air-conditioning-ca',
  'guevara-s-painting-ca',
  'bear-fence-enterprises-ca',
  'wesco-ca',
];

function buildTargets() {
  const cityPages = CITY_SLUGS.map((city) => `/state/california/city/${city}`);
  const filterPages = FILTER_SLUGS.map((filter) => `/state/california/filter/${filter}`);
  const companyPages = COMPANY_SLUGS.map((slug) => `/company/${slug}`);
  return [...FIXED_PAGES, ...cityPages, ...filterPages, ...companyPages];
}

function safeName(routePath) {
  if (routePath === '/') return 'home';
  return routePath
    .replace(/^\//, '')
    .replace(/\//g, '__')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function pickMeta(html, pattern) {
  const m = html.match(pattern);
  return m?.[1]?.trim() ?? '';
}

function stripTags(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRelativePath(value, fallbackPath = '/') {
  const raw = (value ?? '').trim();
  if (!raw) return fallbackPath;
  if (raw.startsWith('/')) return raw;

  try {
    const u = new URL(raw, BASE_URL);
    return `${u.pathname || '/'}${u.search}${u.hash}`;
  } catch {
    return fallbackPath;
  }
}

async function fetchSnapshot(routePath) {
  const requestUrl = `${BASE_URL}${routePath}`;
  const startedAt = Date.now();
  const res = await fetch(requestUrl, { redirect: 'follow' });
  const html = await res.text();
  const durationMs = Date.now() - startedAt;

  const title = pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pickMeta(html, /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const robots = pickMeta(html, /<meta[^>]*name=["']robots["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const canonicalRaw = pickMeta(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([\s\S]*?)["'][^>]*>/i);
  const canonical = toRelativePath(canonicalRaw, routePath);
  const h1 = pickMeta(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim();
  const text = stripTags(html);
  const wordCount = text ? text.split(/\s+/).length : 0;

  const snapshot = {
    routePath,
    url: toRelativePath(routePath, '/'),
    sourceUrl: requestUrl,
    generatedAt: new Date().toISOString(),
    status: res.status,
    durationMs,
    seo: {
      title,
      description,
      robots,
      canonical,
      noindex: /noindex/i.test(robots),
      h1,
      jsonLdCount: (html.match(/application\/ld\+json/gi) ?? []).length,
    },
    content: {
      htmlBytes: Buffer.byteLength(html, 'utf8'),
      wordCount,
      textPreview: text.slice(0, 300),
    },
    html,
  };

  return snapshot;
}

async function main() {
  const targets = buildTargets();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: '/',
    sourceBaseUrl: BASE_URL,
    total: targets.length,
    items: [],
  };

  for (const routePath of targets) {
    try {
      const snapshot = await fetchSnapshot(routePath);
      const fileName = `${safeName(routePath)}.json`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      await fs.writeFile(filePath, JSON.stringify(snapshot));

      manifest.items.push({
        routePath,
        file: `kuaizhao/pages/${fileName}`,
        status: snapshot.status,
        noindex: snapshot.seo.noindex,
        titleLength: snapshot.seo.title.length,
        descriptionLength: snapshot.seo.description.length,
        wordCount: snapshot.content.wordCount,
      });

      console.log(`OK ${routePath} -> ${fileName}`);
    } catch (error) {
      manifest.items.push({
        routePath,
        error: String(error?.message ?? error),
      });
      console.log(`ERR ${routePath} -> ${error?.message ?? error}`);
    }
  }

  await fs.writeFile(path.join(ROOT, 'kuaizhao', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Manifest: ${path.join(ROOT, 'kuaizhao', 'manifest.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

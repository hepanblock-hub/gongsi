import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const PAGES_DIR = path.join(ROOT, 'kuaizhao', 'pages');

function routeType(routePath) {
  if (routePath === '/') return 'home';
  if (routePath.startsWith('/company/')) return 'company';
  if (routePath.startsWith('/state/california/city/')) return 'city';
  if (routePath.startsWith('/state/california/filter/')) return 'filter';
  if (routePath === '/state/california') return 'state';
  if (routePath === '/search') return 'search';
  return 'fixed';
}

function minWordsByType(type) {
  if (type === 'company') return 450;
  if (type === 'state') return 500;
  if (type === 'city') return 500;
  if (type === 'filter') return 320;
  if (type === 'home') return 250;
  if (type === 'fixed') return 120;
  return 0;
}

const files = (await fs.readdir(PAGES_DIR)).filter((f) => f.endsWith('.json'));
const rows = [];

for (const file of files) {
  const full = path.join(PAGES_DIR, file);
  const raw = await fs.readFile(full, 'utf8');
  const j = JSON.parse(raw);
  const type = routeType(j.routePath);
  const titleLen = (j.seo?.title ?? '').length;
  const descLen = (j.seo?.description ?? '').length;
  const noindex = Boolean(j.seo?.noindex);
  const words = Number(j.content?.wordCount ?? 0);
  const jsonLdCount = Number(j.seo?.jsonLdCount ?? 0);

  const errs = [];
  if (j.status !== 200) errs.push('status!=200');
  if (titleLen === 0 || titleLen > 60) errs.push('title');
  if (descLen === 0 || descLen > 160) errs.push('description');

  // Search page is intentionally noindex in many SEO setups.
  const shouldIndex = type !== 'search';
  if (shouldIndex && noindex) errs.push('noindex');

  if (words < minWordsByType(type)) errs.push('thin');

  if (['state', 'city', 'filter', 'company'].includes(type) && jsonLdCount < 2) {
    errs.push('jsonld');
  }

  rows.push({
    file,
    routePath: j.routePath,
    type,
    status: j.status,
    titleLen,
    descLen,
    noindex,
    words,
    jsonLdCount,
    pass: errs.length === 0,
    errors: errs,
  });
}

const passCount = rows.filter((r) => r.pass).length;
const failRows = rows.filter((r) => !r.pass);

console.log(`Total: ${rows.length}`);
console.log(`Pass: ${passCount}`);
console.log(`Fail: ${failRows.length}`);

if (failRows.length) {
  console.log('\nFailed pages:');
  for (const r of failRows) {
    console.log(`${r.routePath} | type:${r.type} | errors:${r.errors.join(',')}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  pass: passCount,
  fail: failRows.length,
  failed: failRows,
};

await fs.writeFile(path.join(ROOT, 'kuaizhao', 'audit_report.json'), JSON.stringify(summary, null, 2));
console.log(`\nReport: ${path.join(ROOT, 'kuaizhao', 'audit_report.json')}`);

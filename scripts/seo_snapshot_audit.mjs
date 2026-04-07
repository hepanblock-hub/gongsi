import fs from 'node:fs';

const baseUrl = (process.env.SNAPSHOT_BASE_URL || 'http://localhost:39017').replace(/\/$/, '');

const pages = [
  { name: '01_state_california', type: 'state', url: `${baseUrl}/state/california` },
  { name: '02_city_los_angeles', type: 'city', url: `${baseUrl}/state/california/city/los-angeles` },
  { name: '03_filter_quality', type: 'filter', url: `${baseUrl}/state/california/filter/quality` },
  { name: '04_filter_osha', type: 'filter', url: `${baseUrl}/state/california/filter/osha` },
  { name: '05_filter_contractor_licenses', type: 'filter', url: `${baseUrl}/state/california/filter/contractor-licenses` },
  { name: '06_company_1', type: 'company', url: `${baseUrl}/company/vale-care-center-ca` },
  { name: '07_company_2', type: 'company', url: `${baseUrl}/company/tci-obispo-ca` },
  { name: '08_company_3', type: 'company', url: `${baseUrl}/company/starpoint-property-manangement-ca` },
  { name: '09_company_4', type: 'company', url: `${baseUrl}/company/sparr-heights-estates-senior-living-ca` },
  { name: '10_company_5', type: 'company', url: `${baseUrl}/company/serrano-post-acute-ca` },
  { name: '11_company_6', type: 'company', url: `${baseUrl}/company/point-loma-estates-memory-care-ca` },
  { name: '12_company_7', type: 'company', url: `${baseUrl}/company/ocvibe-private-street-package-1-ca` },
  { name: '13_company_8', type: 'company', url: `${baseUrl}/company/nbbj-san-francisco-ca` },
  { name: '14_company_9', type: 'company', url: `${baseUrl}/company/mutual-wholesale-liquor-ca` },
  { name: '15_company_10', type: 'company', url: `${baseUrl}/company/maritime-warehouse-ca` },
];

function pick(re, s) {
  const m = s.match(re);
  return m?.[1]?.trim() ?? '';
}

const out = [];
for (const p of pages) {
  try {
    const res = await fetch(p.url);
    const html = await res.text();

    const title = pick(/<title>([\s\S]*?)<\/title>/i, html);
    const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html)
      || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i, html);
    const robots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i, html);
    const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i, html);

    const h1Count = (html.match(/<h1\b/gi) || []).length;
    const h2Count = (html.match(/<h2\b/gi) || []).length;
    const jsonLdCount = (html.match(/application\/ld\+json/gi) || []).length;
    const externalLinkCount = (html.match(/href=["']https?:\/\//gi) || []).length;
    const govLinkCount = (html.match(/https?:\/\/[^"'\s>]+\.(gov|ca\.gov)/gi) || []).length;

    out.push({
      page: p.name,
      type: p.type,
      url: p.url,
      status: res.status,
      title,
      titleLength: title.length,
      hasDescription: Boolean(description),
      descriptionLength: description.length,
      canonical,
      hasCanonical: Boolean(canonical),
      robots,
      noindex: /noindex/i.test(robots),
      h1Count,
      h2Count,
      jsonLdCount,
      externalLinkCount,
      govLinkCount,
    });
  } catch (e) {
    out.push({ page: p.name, type: p.type, url: p.url, status: 0, error: String(e) });
  }
}

const outPath = 'D:/gongsihegui/public/page_snapshots/seo_audit_report.json';
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`SEO audit saved: ${outPath}`);
for (const r of out) {
  console.log(`${r.page} | ${r.status} | title:${r.titleLength} | desc:${r.descriptionLength} | noindex:${r.noindex} | jsonld:${r.jsonLdCount} | govLinks:${r.govLinkCount}`);
}

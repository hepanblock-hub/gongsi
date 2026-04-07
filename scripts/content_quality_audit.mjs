const baseUrl = (process.env.SNAPSHOT_BASE_URL || 'http://localhost:39017').replace(/\/$/, '');

const targets = [
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

const decode = (s) => s
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

function extractMainText(html) {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const src = mainMatch?.[1] ?? html;
  // Focus on narrative blocks only, avoid table-cell repetition noise
  const narrativeBlocks = [...src.matchAll(/<(p|li|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => m[2])
    .join(' ');
  const chosen = narrativeBlocks || src;
  return decode(
    chosen
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 55)
    .map((s) => s.replace(/\s+/g, ' '));
}

function normSentence(s) {
  return s
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\b/g, '#')
    .replace(/\b(california|los angeles|san pablo|long beach|beverly hills|montrose|san diego|anaheim|san francisco|commerce|oakland)\b/g, '<loc>')
    .replace(/\b([a-z][a-z0-9&'\-]{2,})\b/g, '$1')
    .replace(/[^a-z0-9#<>'\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contradictionFlags(text) {
  const t = text.toLowerCase();
  const flags = [];
  if (/no contractor license records were found/.test(t) && /contractor license records are available/.test(t)) {
    flags.push('license_presence_conflict');
  }
  if (/no business registration records were found/.test(t) && /business registration records are available/.test(t)) {
    flags.push('registration_presence_conflict');
  }
  if (/no osha inspection records were found/.test(t) && /has osha inspection records/.test(t)) {
    flags.push('osha_presence_conflict');
  }
  return flags;
}

function typeThreshold(type) {
  if (type === 'company') return 450;
  if (type === 'state' || type === 'city') return 500;
  return 320;
}

const results = [];

for (const t of targets) {
  try {
    const res = await fetch(t.url);
    const html = await res.text();
    const mainText = extractMainText(html);
    const wordCount = mainText.split(/\s+/).filter(Boolean).length;
    const sentences = splitSentences(mainText);

    const freq = new Map();
    for (const s of sentences) {
      const n = normSentence(s);
      if (!n) continue;
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }

    const repeatedEntries = [...freq.entries()].filter(([, c]) => c >= 2);
    const repeatedSentenceCount = repeatedEntries.reduce((acc, [, c]) => acc + c, 0);
    const duplicateSentenceRatio = sentences.length ? Number((repeatedSentenceCount / sentences.length).toFixed(3)) : 0;
    const maxRepeat = repeatedEntries.length ? Math.max(...repeatedEntries.map(([, c]) => c)) : 1;

    const contradictions = contradictionFlags(mainText);
    const thin = wordCount < typeThreshold(t.type);
    const templated = duplicateSentenceRatio > 0.62 || maxRepeat >= 6;

    results.push({
      page: t.name,
      type: t.type,
      url: t.url,
      status: res.status,
      wordCount,
      sentenceCount: sentences.length,
      duplicateSentenceRatio,
      maxRepeat,
      repeatedPatternCount: repeatedEntries.length,
      thin,
      templated,
      contradictions,
      qualityPass: res.status === 200 && !thin && !templated && contradictions.length === 0,
    });
  } catch (e) {
    results.push({
      page: t.name,
      type: t.type,
      url: t.url,
      status: 0,
      error: String(e?.message ?? e),
      qualityPass: false,
    });
  }
}

const outPath = new URL('../public/page_snapshots/content_quality_report.json', import.meta.url);
const fs = await import('node:fs/promises');
await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');

for (const r of results) {
  console.log(`${r.page} | status:${r.status} | words:${r.wordCount ?? '-'} | dup:${r.duplicateSentenceRatio ?? '-'} | thin:${r.thin ?? '-'} | templated:${r.templated ?? '-'} | contradictions:${(r.contradictions ?? []).length}`);
}

const pass = results.filter((r) => r.qualityPass).length;
console.log(`Quality pass: ${pass}/${results.length}`);

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../components/common/Breadcrumbs';
import PageTitle from '../../../components/common/PageTitle';
import SectionCard from '../../../components/common/SectionCard';
import BreadcrumbJsonLd from '../../../components/seo/BreadcrumbJsonLd';
import JsonLd from '../../../components/seo/JsonLd';
import { canonicalCityPath, canonicalFilterPath } from '../../../lib/indexing';
import { getStateCityCounts, getStateCompanyPagesWithCategory, getStateSummary, type StateCompanyCategoryRow } from '../../../lib/queries';
import { companyPathFromSlug, SITE_URL, stateSlugToName } from '../../../lib/site';
import { fetchStateSnapshot } from '../../../lib/stateSnapshot';
import { assessCollectionPageQuality } from '../../../lib/pageQuality';

export const revalidate = 86400;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  // 参考 wangzhan：构建期不预渲染，全部按需 ISR
  return [];
}

function shouldAllowStateDbFallback(): boolean {
  const raw = (process.env.STATE_SNAPSHOT_DB_FALLBACK ?? 'false').toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(raw);
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

function stateCodeOf(stateName: string): string {
  return STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? stateName;
}

function inferIndustryTag(companyName: string): string {
  const n = companyName.toLowerCase();
  if (/(roof|roofing)/.test(n)) return 'Roofing';
  if (/(electrical|electric)/.test(n)) return 'Electrical';
  if (/(plumb|plumbing)/.test(n)) return 'Plumbing';
  if (/(hvac|heating|air\s?conditioning|cooling)/.test(n)) return 'HVAC';
  if (/(concrete|cement|masonry)/.test(n)) return 'Concrete/Masonry';
  if (/(landscape|landscaping|tree\s?service)/.test(n)) return 'Landscaping';
  if (/(paint|painting)/.test(n)) return 'Painting';
  if (/(construction|builders|contractor)/.test(n)) return 'General Construction';
  return 'Other';
}

function officialLinksForState(stateSlug: string): {
  licenseAgency: string;
  licenseLookup: string;
  registrationAgency: string;
  registrationLookup: string;
} {
  if (stateSlug === 'texas') {
    return {
      licenseAgency: 'Texas Department of Licensing and Regulation (TDLR)',
      licenseLookup: 'https://www.tdlr.texas.gov/LicenseSearch/',
      registrationAgency: 'Texas Secretary of State',
      registrationLookup: 'https://direct.sos.state.tx.us/acct/acct-login.asp',
    };
  }
  if (stateSlug === 'california') {
    return {
      licenseAgency: 'California CSLB',
      licenseLookup: 'https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx',
      registrationAgency: 'California Secretary of State',
      registrationLookup: 'https://bizfileonline.sos.ca.gov/search/business',
    };
  }
  if (stateSlug === 'florida') {
    return {
      licenseAgency: 'Florida DBPR',
      licenseLookup: 'https://www.myfloridalicense.com/wl11.asp?mode=0&SID=',
      registrationAgency: 'Florida Division of Corporations',
      registrationLookup: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    };
  }

  const stateName = stateSlugToName(stateSlug);
  const encodedState = encodeURIComponent(stateName);
  return {
    licenseAgency: `${stateName} state licensing agency`,
    licenseLookup: `https://www.google.com/search?q=${encodedState}+contractor+license+lookup+official`,
    registrationAgency: `${stateName} Secretary of State`,
    registrationLookup: `https://www.google.com/search?q=${encodedState}+secretary+of+state+business+search`,
  };
}

function citySlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function normalizeCityName(value: string | null): string {
  const raw = (value ?? 'Unknown').trim();
  if (!raw) return 'Unknown';
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEncodedCompanyName(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return /^[0-9]/.test(name) || /^[A-Z0-9-]{10,}$/.test(compact) || /\d{3,}/.test(compact);
}

function profileLabel(category: string): string {
  switch (category) {
    case 'full': return 'Full profile';
    case 'partial': return 'Partial profile';
    case 'osha-only': return 'OSHA only';
    case 'license-only': return 'License only';
    case 'registration-only': return 'Registration only';
    default: return 'Basic listing';
  }
}

function companyQualityScore(company: StateCompanyCategoryRow): number {
  let score = 0;
  score += Math.min(company.osha_count || 0, 10) * 10;
  score += Math.min(company.injury_count || 0, 5) * 20;
  score += company.has_license ? 15 : 0;
  score += company.has_registration ? 10 : 0;
  score += (company.license_status ?? '').toLowerCase() === 'active' ? 20 : 0;
  score += isEncodedCompanyName(company.company_name) ? 0 : 25;
  return score;
}

function compareCompanies(a: StateCompanyCategoryRow, b: StateCompanyCategoryRow): number {
  const scoreDiff = companyQualityScore(b) - companyQualityScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const oshaDiff = (b.osha_count || 0) - (a.osha_count || 0);
  if (oshaDiff !== 0) return oshaDiff;
  const injuryDiff = (b.injury_count || 0) - (a.injury_count || 0);
  if (injuryDiff !== 0) return injuryDiff;
  const recentA = a.latest_inspection_date ? new Date(a.latest_inspection_date).getTime() : 0;
  const recentB = b.latest_inspection_date ? new Date(b.latest_inspection_date).getTime() : 0;
  if (recentB !== recentA) return recentB - recentA;
  return a.company_name.localeCompare(b.company_name);
}

function categoryOfCompany(c: StateCompanyCategoryRow): string {
  const sources = [c.has_osha, c.has_license, c.has_registration].filter(Boolean).length;
  if (sources === 3) return 'full';
  if (c.has_osha && !c.has_license && !c.has_registration) return 'osha-only';
  if (!c.has_osha && c.has_license && !c.has_registration) return 'license-only';
  if (!c.has_osha && !c.has_license && c.has_registration) return 'registration-only';
  if (sources === 2) return 'partial';
  return 'basic';
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string }> }): Promise<Metadata> {
  const { stateSlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const stateCode = stateCodeOf(stateName);
  const allowDbFallback = shouldAllowStateDbFallback();
  const snapshot = await fetchStateSnapshot(stateSlug);
  const dbSummary = !snapshot && allowDbFallback ? await getStateSummary(stateSlug) : null;
  const indexable = (snapshot?.summary.company_count ?? dbSummary?.company_count ?? 0) >= 100;

  return {
    title: { absolute: `${stateName} Contractor License Lookup & OSHA Violations | Company Compliance` },
    description: `Search ${stateName} (${stateCode}) contractors and companies by OSHA violations, license status, and registration records. Compare profiles before hiring decisions.`,
    robots: { index: indexable, follow: true },
    alternates: {
      canonical: `/state/${stateSlug}`,
    },
    authors: [{ name: 'Compliance Lookup Editorial Team' }],
    creator: 'Compliance Lookup Data Team',
    publisher: 'Compliance Lookup',
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ stateSlug: string }>;
}) {
  const { stateSlug } = await params;
  const officialLinks = officialLinksForState(stateSlug);
  const allowDbFallback = shouldAllowStateDbFallback();

  const snapshot = await fetchStateSnapshot(stateSlug);
  if (!snapshot && !allowDbFallback) notFound();
  const summary = snapshot
    ? {
      state: stateSlugToName(stateSlug),
      company_count: snapshot.summary.company_count,
      osha_count: snapshot.summary.osha_count,
      license_count: snapshot.summary.license_count,
      registration_count: snapshot.summary.registration_count,
    }
    : await getStateSummary(stateSlug);

  const allCompanies: StateCompanyCategoryRow[] = snapshot
    ? snapshot.companyPages.map((c) => ({
      ...c,
      injury_count: c.injury_count ?? 0,
      latest_inspection_date: c.latest_inspection_date ?? null,
      license_status: c.license_status ?? null,
    }))
    : await getStateCompanyPagesWithCategory(stateSlug, 5000);

  const cityCounts = snapshot
    ? snapshot.cityCounts
    : await getStateCityCounts(stateSlug);

  const companiesBySearch = allCompanies;
  const companies = companiesBySearch;

  const cityMap = new Map<string, StateCompanyCategoryRow[]>();
  for (const c of companiesBySearch) {
    const key = normalizeCityName(c.city);
    if (!cityMap.has(key)) cityMap.set(key, []);
    cityMap.get(key)?.push(c);
  }
  const cityGroups = Array.from(cityMap.entries())
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  const indexableCityCounts = cityCounts.filter((row) => row.company_count >= 20);
  const topCityTotal = cityCounts.slice(0, 30).reduce((acc, row) => acc + row.company_count, 0);

  const categoryCount = snapshot?.stats?.categoryCount
    ? snapshot.stats.categoryCount
    : {
      full: companiesBySearch.filter((c) => categoryOfCompany(c) === 'full').length,
      partial: companiesBySearch.filter((c) => categoryOfCompany(c) === 'partial').length,
      oshaOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'osha-only').length,
      licenseOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'license-only').length,
      registrationOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'registration-only').length,
      basic: companiesBySearch.filter((c) => categoryOfCompany(c) === 'basic').length,
    };

  const analyzedBase = snapshot?.stats?.analyzed_company_count ?? Math.max(1, companiesBySearch.length);
  const oshaCoveragePct = snapshot?.stats?.oshaCoveragePct?.toFixed(1)
    ?? ((companiesBySearch.filter((c) => c.has_osha).length / analyzedBase) * 100).toFixed(1);
  const licenseCoveragePct = snapshot?.stats?.licenseCoveragePct?.toFixed(1)
    ?? ((companiesBySearch.filter((c) => c.has_license).length / analyzedBase) * 100).toFixed(1);
  const registrationCoveragePct = snapshot?.stats?.registrationCoveragePct?.toFixed(1)
    ?? ((companiesBySearch.filter((c) => c.has_registration).length / analyzedBase) * 100).toFixed(1);
  const fullProfilePct = ((categoryCount.full / Math.max(1, analyzedBase)) * 100).toFixed(1);
  const partialProfilePct = ((categoryCount.partial / Math.max(1, analyzedBase)) * 100).toFixed(1);
  const stateCode = stateCodeOf(summary.state);
  const collectionQuality = assessCollectionPageQuality({
    companyCount: companiesBySearch.length,
    evidenceCompanyCount: companiesBySearch.filter((c) => c.has_osha || c.has_license || c.has_registration).length,
    minCompanies: 100,
    minEvidenceRatio: 0.45,
    minEvidenceCompanies: 50,
  });

  const industryCounts = new Map<string, number>();
  for (const c of companiesBySearch) {
    const tag = inferIndustryTag(c.company_name);
    industryCounts.set(tag, (industryCounts.get(tag) ?? 0) + 1);
  }
  const topIndustries = Array.from(industryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topHighRiskReview = [...companiesBySearch]
    .filter((c) => (c.injury_count ?? 0) > 0 || (c.license_status ?? '').toLowerCase() === 'suspended' || (c.license_status ?? '').toLowerCase() === 'revoked')
    .sort((a, b) => (b.injury_count || 0) - (a.injury_count || 0) || (b.osha_count || 0) - (a.osha_count || 0) || compareCompanies(a, b))
    .slice(0, 10);

  const topVerifiedProfiles = [...companiesBySearch]
    .filter((c) => (c.license_status ?? '').toLowerCase() === 'active' && c.has_registration)
    .sort(compareCompanies)
    .slice(0, 10);

  const top3CitySharePct = ((cityCounts.slice(0, 3).reduce((acc, row) => acc + row.company_count, 0) / Math.max(1, summary.company_count)) * 100).toFixed(1);
  const stateUrl = `${SITE_URL}/state/${stateSlug}`;
  const organizationJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${stateUrl}#organization`,
    name: 'Compliance Lookup',
    url: SITE_URL,
    areaServed: summary.state,
  };
  const datasetJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${stateUrl}#dataset`,
    name: `${summary.state} Company Compliance Dataset`,
    description: `State-level public dataset for ${summary.state} including OSHA records, contractor license records, and business registration records.`,
    url: stateUrl,
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    creator: { '@type': 'Organization', '@id': `${stateUrl}#organization` },
    publisher: { '@type': 'Organization', '@id': `${stateUrl}#organization` },
    keywords: [summary.state, 'OSHA', 'contractor license', 'business registration', 'company compliance'],
    variableMeasured: ['OSHA records', 'license status', 'registration status'],
    spatialCoverage: summary.state,
  };

  if (!companies.length) {
    notFound();
  }

  const sortedCompanies = [...companies].sort(compareCompanies);
  const pagedCompanies = sortedCompanies.slice(0, 100);

  return (
    <main className="container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', item: `${SITE_URL}/` },
          { name: summary.state, item: `${SITE_URL}/state/${stateSlug}` },
        ]}
      />
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={datasetJsonLd} />

      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: summary.state }]} />
      <PageTitle
        title={`Contractor License Lookup in ${summary.state}, ${stateCode} + OSHA Violations Records`}
        description={`State-level snapshot for ${summary.state}: company counts, OSHA records, license records, registration records, and linked source portals.`}
      />

      <SectionCard title={`${summary.state} data snapshot`}>
        <p>
          Coverage in current indexed cycle: <strong>{summary.company_count}</strong> companies, <strong>{summary.osha_count}</strong> OSHA records,
          <strong> {summary.license_count}</strong> license records, <strong>{summary.registration_count}</strong> registration records observed.
        </p>
        {!collectionQuality.indexable && (
          <p>
            Quality note: this state page stays available for navigation, but it should not be treated as a complete statewide index until more evidence-backed profiles are released.
          </p>
        )}
      </SectionCard>

      <section className="cards">
        <SectionCard title="Total companies indexed">
          <p className="metric">{summary.company_count}</p>
        </SectionCard>
        <SectionCard title="OSHA records observed">
          <p className="metric">{summary.osha_count}</p>
        </SectionCard>
        <SectionCard title="License records observed">
          <p className="metric">{summary.license_count}</p>
        </SectionCard>
        <SectionCard title="Registration records observed">
          <p className="metric">{summary.registration_count}</p>
        </SectionCard>
      </section>

      <SectionCard title={`${summary.state} evidence snapshot`}>
        <p>
          City concentration signal: top 3 cities contribute <strong>{top3CitySharePct}%</strong> of indexed companies.
          Evidence-backed profiles account for <strong>{collectionQuality.evidenceCompanyCount}</strong> companies
          ({(collectionQuality.evidenceRatio * 100).toFixed(1)}% of the current state sample).
        </p>
        <p>
          Industry pattern (name-based signals): {topIndustries.length
            ? topIndustries.map(([industry, count], idx) => (
              <span key={industry}>{industry} ({count}){idx < topIndustries.length - 1 ? ' · ' : ''}</span>
            ))
            : 'No dominant industry pattern detected in current sample.'}
        </p>
      </SectionCard>

      <SectionCard title={`Top companies by record signals in ${summary.state}`}>

        <h3>High-risk review queue (top 10)</h3>
        {topHighRiskReview.length > 0 ? (
          <ol>
            {topHighRiskReview.map((c) => (
              <li key={`risk-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}· OSHA {c.osha_count || 0} · Injury {c.injury_count || 0}
              </li>
            ))}
          </ol>
        ) : (
          <p>No high-risk entities in current state sample.</p>
        )}

        <h3>Verified-profile shortlist (top 10)</h3>
        {topVerifiedProfiles.length > 0 ? (
          <ol>
            {topVerifiedProfiles.map((c) => (
              <li key={`verified-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}· {normalizeCityName(c.city)}
              </li>
            ))}
          </ol>
        ) : (
          <p>No active-license + registration overlap in current state sample.</p>
        )}
      </SectionCard>

      <SectionCard title="State filters">
        <p>
          <a href={canonicalFilterPath(stateSlug, 'quality')}>Best quality first</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'osha-violations')}>Most OSHA records</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'recently-updated')}>Recently inspected</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'active-licenses')}>Active licenses first</a>
        </p>
        <p>
          <a href={canonicalFilterPath(stateSlug, 'full-profiles')}>Full profile</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'partial-profiles')}>Partial profile</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'osha-only')}>OSHA only</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'contractor-licenses')}>License only</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'business-registration')}>Registration only</a> ·{' '}
          <a href={canonicalFilterPath(stateSlug, 'basic-listings')}>Basic listing</a>
        </p>
      </SectionCard>

      <SectionCard title="Company classification">
        <p>Full profile (OSHA + License + Registration): {categoryCount.full}</p>
        <p>Partial profile (any 2 sources): {categoryCount.partial}</p>
        <p>OSHA only: {categoryCount.oshaOnly}</p>
        <p>License only: {categoryCount.licenseOnly}</p>
        <p>Registration only: {categoryCount.registrationOnly}</p>
        <p>Basic listing only: {categoryCount.basic}</p>
      </SectionCard>

      <SectionCard title={`${summary.state} compliance analysis`}>
        <p>
          In the current indexed dataset for {summary.state}, OSHA-linked companies account for {oshaCoveragePct}% of analyzed companies,
          license-linked companies account for {licenseCoveragePct}%, and registration-linked companies account for {registrationCoveragePct}%.
        </p>
        <p>
          Full profiles represent {fullProfilePct}% of indexed companies, while partial profiles represent {partialProfilePct}%.
          This section reports ratio statistics only.
        </p>
      </SectionCard>

      <SectionCard title="Top cities">
        <p>Top cities by indexed company count in {summary.state} (showing top 30):</p>
        <p>
          {indexableCityCounts.slice(0, 30).map((g, idx) => (
            <span key={g.city}>
              <a href={`${canonicalCityPath(stateSlug, citySlug(g.city))}#company-list`}>{g.city}</a> ({g.company_count})
              {idx < Math.min(indexableCityCounts.length, 30) - 1 ? ' · ' : ''}
            </span>
          ))}
          {' · '}<a href={`/state/${stateSlug}/cities`}>more</a>
        </p>
        <p className="muted">Top 30 cities total: {topCityTotal} · State total indexed companies: {summary.company_count}</p>
      </SectionCard>

      <div id="company-list" />
      <SectionCard title="Company list">
        <p>Browse top 100 companies with OSHA records and compliance data in {summary.state} (best quality first).</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>City</th>
              <th>Profile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedCompanies.map((c) => (
              <tr key={c.slug}>
                <td><a href={companyPathFromSlug(c.slug)}>{c.company_name}</a></td>
                <td>{normalizeCityName(c.city)}</td>
                <td>{profileLabel(categoryOfCompany(c))}</td>
                <td>
                  <a href={`${companyPathFromSlug(c.slug)}#osha-records`}>OSHA</a> · <a href={`${companyPathFromSlug(c.slug)}#license-records`}>License</a> ·{' '}
                  <a href={`${companyPathFromSlug(c.slug)}#registration-records`}>Registration</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Companies by city">
        {cityGroups.slice(0, 20).map((g) => (
          <details key={g.name} id={`city-${citySlug(g.name)}`}>
            <summary>{g.name} ({g.items.length})</summary>
            <ul>
              {g.items.sort(compareCompanies).slice(0, 100).map((c) => (
                <li key={`city-${g.name}-${c.slug}`}>
                  <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a> ·{' '}
                  {profileLabel(categoryOfCompany(c))}
                </li>
              ))}
              {g.items.length >= 20
                ? <li><a href={`${canonicalCityPath(stateSlug, citySlug(g.name))}#company-list`}>View all companies in {g.name} →</a></li>
                : null}
            </ul>
          </details>
        ))}
      </SectionCard>

      <SectionCard title="Sources">
        <p>Source: <a href="https://www.osha.gov/establishment-search" rel="nofollow noopener" target="_blank">OSHA official records</a></p>
        <p>Source: <a href={officialLinks.licenseLookup} rel="nofollow noopener" target="_blank">{officialLinks.licenseAgency}</a></p>
        <p>Source: <a href={officialLinks.registrationLookup} rel="nofollow noopener" target="_blank">{officialLinks.registrationAgency}</a></p>
      </SectionCard>
    </main>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../../components/common/PageTitle';
import SectionCard from '../../../../../components/common/SectionCard';
import JsonLd from '../../../../../components/seo/JsonLd';
import { type StateCompanyCategoryRow } from '../../../../../lib/queries';
import { companyPathFromSlug, SITE_URL, stateSlugToName } from '../../../../../lib/site';
import { fetchCitySnapshot } from '../../../../../lib/citySnapshot';

export const revalidate = 86400;
export const dynamic = 'force-static';
export const dynamicParams = true; // 新发布城市走 ISR

export async function generateStaticParams() {
  // 构建期不预渲染城市页，全部按需 ISR
  return [];
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

function normalizeCityName(value: string | null): string {
  const raw = (value ?? 'Unknown').trim();
  if (!raw) return 'Unknown';
  return raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function citySlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function categoryOfCompany(c: StateCompanyCategoryRow): string {
  const sources = [c.has_osha, c.has_license, c.has_registration].filter(Boolean).length;
  if (sources === 3) return 'Full profile';
  if (c.has_osha && !c.has_license && !c.has_registration) return 'OSHA only';
  if (!c.has_osha && c.has_license && !c.has_registration) return 'License only';
  if (!c.has_osha && !c.has_license && c.has_registration) return 'Registration only';
  if (sources === 2) return 'Partial profile';
  return 'Basic listing';
}

function isEncodedCompanyName(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return /^[0-9]/.test(name) || /^[A-Z0-9-]{10,}$/.test(compact) || /\d{3,}/.test(compact);
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
  return a.company_name.localeCompare(b.company_name);
}

type DecisionSignal = 'Lower review risk' | 'Needs manual review' | 'Higher review risk';

function getDecisionSignal(c: StateCompanyCategoryRow): DecisionSignal {
  const license = (c.license_status ?? 'unknown').toLowerCase();
  if (license === 'suspended' || license === 'revoked') return 'Higher review risk';
  if ((c.injury_count ?? 0) >= 1 && (c.osha_count ?? 0) >= 5) return 'Higher review risk';
  if (license === 'expired' || license === 'unknown') return 'Needs manual review';
  if (license === 'active' && c.has_registration) return 'Lower review risk';
  return 'Needs manual review';
}

function getDecisionNote(c: StateCompanyCategoryRow, stateName: string): string {
  const license = (c.license_status ?? 'unknown').toLowerCase();
  if (license === 'active' && c.has_registration && (c.injury_count ?? 0) === 0) {
    return `Active-license signal. Confirm current standing through ${stateName} official systems.`;
  }
  if (license === 'suspended' || license === 'revoked') {
    return `Suspended/revoked signal. Verify with ${stateName} licensing board before hiring.`;
  }
  if ((c.injury_count ?? 0) >= 1) {
    return 'Injury-related OSHA records present. Review inspection details before contracting.';
  }
  if (license === 'expired') {
    return 'Expired-license signal. Check whether renewal has been completed.';
  }
  return 'Incomplete public records. Manual verification is recommended.';
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

function toPct(numerator: number, denominator: number): string {
  return ((numerator / Math.max(1, denominator)) * 100).toFixed(1);
}

function pctDeltaLabel(cityPct: number, statePct: number): string {
  const delta = cityPct - statePct;
  if (Math.abs(delta) < 0.1) return 'about the same as state sample';
  return delta > 0
    ? `${delta.toFixed(1)} pts higher than state sample`
    : `${Math.abs(delta).toFixed(1)} pts lower than state sample`;
}

function companyTags(c: StateCompanyCategoryRow): string[] {
  const tags: string[] = [];
  const license = (c.license_status ?? 'unknown').toLowerCase();

  if ((c.osha_count ?? 0) >= 5 || (c.injury_count ?? 0) > 0) tags.push('High OSHA');
  if (!c.has_license || !license || license === 'unknown' || license === 'expired' || license === 'suspended' || license === 'revoked') {
    tags.push('No license / verify');
  }
  if (license === 'active' && c.has_registration) tags.push('Verified signal');

  return tags.length ? tags : ['Review'];
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

function citySpecificContext(targetCitySlug: string, stateCode: string): string {
  const k = targetCitySlug.toLowerCase();
  if (k === 'los-angeles') return 'Los Angeles often shows elevated OSHA exposure due to dense construction pipelines, industrial service vendors, and large subcontractor networks.';
  if (k === 'san-diego') return 'San Diego frequently reflects mixed compliance signals across construction, facility services, and multi-site commercial contractors.';
  if (k === 'san-jose') return 'San Jose commonly shows contractor mix around commercial retrofit and infrastructure support, which can increase inspection visibility.';
  if (k === 'houston') return 'Houston is typically construction and logistics heavy, which can raise OSHA record volume compared with smaller city samples.';
  if (k === 'dallas') return 'Dallas often has broad subcontractor activity and fast project turnover, so license validation timing matters before contract award.';
  if (k === 'austin') return 'Austin frequently combines rapid development with specialty trades growth, making license freshness checks especially important.';
  if (k === 'san-antonio') return 'San Antonio can show mixed profile completeness by trade segment, so cross-checking registration and license status is recommended.';
  if (k === 'miami') return 'Miami often includes high contractor churn and mixed-profile entities, so source-by-source verification is essential before hiring.';
  if (k === 'orlando') return 'Orlando commonly reflects strong service-sector contractor demand, where profile completeness may vary across smaller vendors.';
  if (k === 'tampa') return 'Tampa tends to show active construction-service overlap, so OSHA context should be reviewed with current license standing.';
  if (k === 'jacksonville') return 'Jacksonville frequently includes broad industrial and service coverage, increasing variance in available public records by company.';
  return `This ${stateCode} city has its own local contractor mix and inspection footprint; city-level decisions should prioritize companies with stronger profile completeness.`;
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string; citySlug: string }> }): Promise<Metadata> {
  const { stateSlug, citySlug: targetCitySlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const stateCode = stateCodeOf(stateName);
  const cityName = targetCitySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const citySnapshot = await fetchCitySnapshot(stateSlug, targetCitySlug);
  const thinCityCount = citySnapshot?.cityCompanyCount ?? citySnapshot?.companies?.length ?? 0;
  return {
    title: { absolute: `Contractor License Lookup in ${cityName}, ${stateCode} (2026) + OSHA Violations Check` },
    description: `${cityName} ${stateCode} contractor license lookup and OSHA violations check. Compare company risk signals, license status, and shortlist vendors to review first.`,
    alternates: { canonical: `/state/${stateSlug}/city/${targetCitySlug}` },
    robots: { index: thinCityCount >= 20, follow: true },
    authors: [{ name: 'Compliance Lookup Editorial Team' }],
    creator: 'Compliance Lookup Data Team',
    publisher: 'Compliance Lookup',
  };
}

export default async function StateCityPage({ params }: { params: Promise<{ stateSlug: string; citySlug: string }> }) {
  const { stateSlug, citySlug: targetCitySlug } = await params;
  const citySnapshot = await fetchCitySnapshot(stateSlug, targetCitySlug);
  const stateName = stateSlugToName(stateSlug);
  const stateCode = stateCodeOf(stateName);
  const officialLinks = officialLinksForState(stateSlug);

  const companies: StateCompanyCategoryRow[] = citySnapshot?.companies?.length
    ? citySnapshot.companies
      .map((c) => ({
        ...c,
        injury_count: c.injury_count ?? 0,
        latest_inspection_date: c.latest_inspection_date ?? null,
        license_status: c.license_status ?? null,
      }))
      .sort(compareCompanies)
    : [];

  if (!companies.length) notFound();

  const cityName = normalizeCityName(companies[0]?.city ?? targetCitySlug);
  const base = Math.max(1, companies.length);
  const oshaCount = companies.filter((c) => c.has_osha).length;
  const licenseCount = companies.filter((c) => c.has_license).length;
  const registrationCount = companies.filter((c) => c.has_registration).length;
  const fullCount = companies.filter((c) => categoryOfCompany(c) === 'Full profile').length;
  const partialCount = companies.filter((c) => categoryOfCompany(c) === 'Partial profile').length;
  const oshaPct = ((oshaCount / base) * 100).toFixed(1);
  const licensePct = ((licenseCount / base) * 100).toFixed(1);
  const registrationPct = ((registrationCount / base) * 100).toFixed(1);
  const activeLicenseCount = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'active').length;
  const suspendedLicenseCount = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'suspended').length;
  const expiredLicenseCount = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'expired').length;
  const unknownLicenseCount = companies.filter((c) => {
    const s = (c.license_status ?? 'unknown').toLowerCase();
    return !s || s === 'unknown' || s === '-';
  }).length;
  const injuryLinkedCount = companies.filter((c) => (c.injury_count ?? 0) > 0).length;

  const stateBase = Math.max(1, citySnapshot?.stateStats?.stateCompanyCount ?? companies.length);
  const stateOshaPctNum = citySnapshot?.stateStats?.oshaCoveragePct ?? Number(toPct(oshaCount, base));
  const stateLicensePctNum = citySnapshot?.stateStats?.licenseCoveragePct ?? Number(toPct(licenseCount, base));
  const stateRegistrationPctNum = citySnapshot?.stateStats?.registrationCoveragePct ?? Number(toPct(registrationCount, base));
  const cityCoveragePctOfState = Number(toPct(companies.length, stateBase));
  const cityOshaPctNum = Number(oshaPct);
  const cityLicensePctNum = Number(licensePct);
  const cityRegistrationPctNum = Number(registrationPct);
  const lowCoverage = companies.length < 50 || cityCoveragePctOfState < 1;

  const topCompanies = companies.slice(0, 200);
  const decisionStats = topCompanies.reduce(
    (acc, c) => {
      const signal = getDecisionSignal(c);
      if (signal === 'Lower review risk') acc.lower += 1;
      else if (signal === 'Needs manual review') acc.manual += 1;
      else acc.higher += 1;
      return acc;
    },
    { lower: 0, manual: 0, higher: 0 }
  );

  const industryCounts = new Map<string, number>();
  for (const c of topCompanies) {
    const tag = inferIndustryTag(c.company_name);
    industryCounts.set(tag, (industryCounts.get(tag) ?? 0) + 1);
  }
  const topIndustries = Array.from(industryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topHighRiskReview = [...companies]
    .filter((c) => getDecisionSignal(c) === 'Higher review risk')
    .sort((a, b) => (b.injury_count || 0) - (a.injury_count || 0) || (b.osha_count || 0) - (a.osha_count || 0))
    .slice(0, 10);
  const topLicensed = [...companies]
    .filter((c) => (c.license_status ?? '').toLowerCase() === 'active')
    .sort(compareCompanies)
    .slice(0, 10);
  const topSaferProfiles = [...companies]
    .filter((c) => getDecisionSignal(c) === 'Lower review risk')
    .sort(compareCompanies)
    .slice(0, 10);
  const topRiskCompanies = [...companies]
    .sort((a, b) => (b.osha_count || 0) - (a.osha_count || 0) || (b.injury_count || 0) - (a.injury_count || 0))
    .slice(0, 5);
  const cityUrl = `${SITE_URL}/state/${stateSlug}/city/${targetCitySlug}`;
  const organizationJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${cityUrl}#organization`,
    name: 'Compliance Lookup',
    url: SITE_URL,
    areaServed: `${cityName}, ${stateName}`,
  };
  const datasetJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${cityUrl}#dataset`,
    name: `${cityName}, ${stateCode} Company Compliance Dataset`,
    description: `City-level public dataset for ${cityName}, ${stateName} with OSHA records, contractor license status, and business registration status.`,
    url: cityUrl,
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    creator: { '@type': 'Organization', '@id': `${cityUrl}#organization` },
    publisher: { '@type': 'Organization', '@id': `${cityUrl}#organization` },
    keywords: [cityName, stateName, 'OSHA', 'contractor license', 'business registration', 'company compliance'],
    variableMeasured: ['OSHA records', 'license status', 'registration status'],
    spatialCoverage: `${cityName}, ${stateName}`,
  };

  return (
    <main className="container">
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={datasetJsonLd} />

      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: stateName, href: `/state/${stateSlug}` },
          { label: 'Cities', href: `/state/${stateSlug}/cities` },
          { label: cityName },
        ]}
      />

      <PageTitle
        title={`Contractor License Lookup in ${cityName}, ${stateCode} (2026) + OSHA Violations Check`}
        description={`Tool-style city lookup for "is this company licensed in ${cityName}?" Compare OSHA violations, license signals, and risk tags before hiring.`}
      />

      <SectionCard title={`${cityName} company risk answer (quick view)`}>
        <p>
          In {cityName}, this indexed sample contains <strong>{companies.length}</strong> companies
          (about <strong>{cityCoveragePctOfState.toFixed(1)}%</strong> of current {stateName} indexed sample: {stateBase}).
          OSHA-linked profiles appear in <strong>{oshaPct}%</strong> of companies,
          license-linked profiles appear in <strong>{licensePct}%</strong>,
          and registration-linked profiles appear in <strong>{registrationPct}%</strong>.
        </p>
        <p>
          Immediate hiring signal: <strong>{activeLicenseCount}</strong> companies show active-license signals,
          while <strong>{suspendedLicenseCount + expiredLicenseCount}</strong> show suspended/expired signals and
          <strong> {unknownLicenseCount}</strong> require manual verification.
          If you are shortlisting vendors in {cityName}, prioritize companies with active-license + registration signals first.
        </p>
        {lowCoverage && (
          <p>
            Coverage note: this city view is a decision-support index, not a full legal registry.
            Use official state systems for complete legal verification.
          </p>
        )}
      </SectionCard>

      <SectionCard title={`Direct lookup and high-intent shortcuts for ${cityName}`}>
        <p>
          Search intent shortcuts: "contractor license {cityName} {stateCode}", "OSHA violations {cityName} companies",
          and "is [company] licensed in {cityName}".
        </p>
        <p>
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}`}>Search companies in {cityName}</a>
          {' '}·{' '}
          <a href={`/state/${stateSlug}/filter/active-licenses`}>View active-license shortlist</a>
          {' '}·{' '}
          <a href={`/state/${stateSlug}/filter/osha-violations`}>View OSHA-focused shortlist</a>
        </p>
      </SectionCard>

      <SectionCard title={`Company license check shortcuts in ${cityName}`}>
        <p>
          One-click checks for the most visible local entities in this dataset:
        </p>
        <ul>
          {topCompanies.slice(0, 8).map((c) => (
            <li key={`quick-check-${c.slug}`}>
              <a href={companyPathFromSlug(c.slug)}>
                Is {c.company_name} licensed in {cityName}, {stateCode}?
              </a>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={`${cityName} vs ${stateName} sample comparison`}>
        <p>
          OSHA coverage: <strong>{cityOshaPctNum.toFixed(1)}%</strong> in {cityName} vs <strong>{stateOshaPctNum.toFixed(1)}%</strong> state sample
          ({pctDeltaLabel(cityOshaPctNum, stateOshaPctNum)}).
        </p>
        <p>
          License coverage: <strong>{cityLicensePctNum.toFixed(1)}%</strong> in {cityName} vs <strong>{stateLicensePctNum.toFixed(1)}%</strong> state sample
          ({pctDeltaLabel(cityLicensePctNum, stateLicensePctNum)}).
        </p>
        <p>
          Registration coverage: <strong>{cityRegistrationPctNum.toFixed(1)}%</strong> in {cityName} vs <strong>{stateRegistrationPctNum.toFixed(1)}%</strong> state sample
          ({pctDeltaLabel(cityRegistrationPctNum, stateRegistrationPctNum)}).
        </p>
      </SectionCard>

      <SectionCard title={`Local compliance patterns in ${cityName}`}>
        <p>
          In the indexed dataset for {cityName}, {oshaPct}% of companies show OSHA inspection history, {licensePct}% show contractor license records,
          and {registrationPct}% show business registration references.
        </p>
        <p>
          Active license signals appear in {activeLicenseCount} companies, while suspended/expired signals appear in {suspendedLicenseCount + expiredLicenseCount} companies.
          Injury-linked OSHA records appear in {injuryLinkedCount} companies and should be prioritized for manual review.
        </p>
        {topIndustries.length > 0 && (
          <p>
            Common business categories in this city dataset: {topIndustries.map(([name, count], idx) => (
              <span key={name}>
                {name} ({count}){idx < topIndustries.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        )}
      </SectionCard>

      <SectionCard title={`${cityName} risk fingerprint (city-unique)`}>
        <p>{citySpecificContext(targetCitySlug, stateCode)}</p>
        <p>
          Top OSHA-exposed companies in this city sample:
          {' '}
          {topRiskCompanies.length > 0
            ? topRiskCompanies.map((c, idx) => (
              <span key={`risk-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}({c.osha_count || 0}){idx < topRiskCompanies.length - 1 ? ' · ' : ''}
              </span>
            ))
            : 'No OSHA-heavy entities detected in current sample.'}
        </p>
        <p>
          This fingerprint section is city-specific and designed to reduce template repetition by surfacing unique local distribution.
        </p>
      </SectionCard>

      <SectionCard title={`Top companies to review first in ${cityName}`}>
        <p>
          This ranking block is decision-oriented, not a raw dump: start with high-risk review, then compare active-license profiles, then check safer complete profiles.
        </p>

        <h3>High OSHA risk first (top 10)</h3>
        {topHighRiskReview.length > 0 ? (
          <ol>
            {topHighRiskReview.map((c) => (
              <li key={`risk-top-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}· OSHA {c.osha_count || 0} · Injury {c.injury_count || 0}
              </li>
            ))}
          </ol>
        ) : (
          <p>No high-risk bucket in current city sample.</p>
        )}

        <h3>Active-license profiles (top 10)</h3>
        {topLicensed.length > 0 ? (
          <ol>
            {topLicensed.map((c) => (
              <li key={`licensed-top-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}· {categoryOfCompany(c)}
              </li>
            ))}
          </ol>
        ) : (
          <p>No active-license signals in current city sample.</p>
        )}

        <h3>Safer complete profiles (top 10)</h3>
        {topSaferProfiles.length > 0 ? (
          <ol>
            {topSaferProfiles.map((c) => (
              <li key={`safer-top-${c.slug}`}>
                <a href={companyPathFromSlug(c.slug)}>{c.company_name}</a>
                {' '}· {companyTags(c).join(' / ')}
              </li>
            ))}
          </ol>
        ) : (
          <p>No lower-risk bucket in current city sample.</p>
        )}
      </SectionCard>

      <SectionCard title="City-level risk distribution and interpretation">
        <p>
          This {cityName} dataset includes <strong>{companies.length}</strong> indexed companies. Active-license signals appear in
          <strong> {activeLicenseCount}</strong> entities, while suspended or expired signals appear in
          <strong> {suspendedLicenseCount + expiredLicenseCount}</strong> entities, and
          <strong> {unknownLicenseCount}</strong> entities have unknown or missing license status in currently available public records.
        </p>
        <p>
          A higher OSHA count does not automatically mean a company is unsafe; it can also reflect business scale,
          project volume, or inspection intensity in the local industry. For procurement and hiring decisions,
          the practical approach is to combine OSHA history with current license standing and registration confirmation.
        </p>
        <p>
          In this city view, injury-linked records are present in <strong>{injuryLinkedCount}</strong> companies.
          Those records should be prioritized for manual due diligence, especially when paired with suspended,
          revoked, expired, or unknown license signals.
        </p>
      </SectionCard>

      <SectionCard title="Data gaps and real-world interpretation">
        <p>
          If license coverage appears low in this city, it can mean either (1) source systems publish partial records for this business segment,
          or (2) matching quality is incomplete for certain local entities. It does not automatically mean every company is unlicensed.
        </p>
        <p>
          Best practice for vendor decisions: combine OSHA history + latest license signal + registration signal, then confirm in official
          {stateName} systems for final legal standing.
        </p>
      </SectionCard>

      <SectionCard title="Official sources and verification links">
        <p>
          Federal OSHA source: <a href="https://www.osha.gov/establishment-search" rel="nofollow noopener" target="_blank">OSHA Establishment Search</a>
        </p>
        <p>
          License verification ({officialLinks.licenseAgency}): <a href={officialLinks.licenseLookup} rel="nofollow noopener" target="_blank">Official license lookup</a>
        </p>
        <p>
          Registration verification ({officialLinks.registrationAgency}): <a href={officialLinks.registrationLookup} rel="nofollow noopener" target="_blank">Official business registry search</a>
        </p>
      </SectionCard>

      <SectionCard title="Method transparency (scoring logic)">
        <p>
          Risk tags are generated from public signals only: OSHA record volume/injury indicators, latest observed license status,
          and whether registration evidence exists. These tags are prioritization cues, not legal conclusions.
        </p>
        <p>
          Ranking in the table is based on profile completeness and risk-screening utility, then tie-broken by company name.
        </p>
      </SectionCard>

      <SectionCard title="Decision support summary (top 200)">
        <p>
          Lower review risk: <strong>{decisionStats.lower}</strong> ·
          Needs manual review: <strong>{decisionStats.manual}</strong> ·
          Higher review risk: <strong>{decisionStats.higher}</strong>
        </p>
        <p>
          These are screening signals for prioritization only. Always verify final license and legal status through official {stateName} agencies.
        </p>
      </SectionCard>

      <div id="company-list" />
      <SectionCard title={`Company list and risk tags in ${cityName}`}>
        <p>{cityName} · {topCompanies.length} companies shown (from {companies.length} indexed companies)</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Profile</th>
              <th>OSHA Records</th>
              <th>License Status</th>
              <th>Risk Tags</th>
              <th>Screening Signal</th>
              <th>Screening Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topCompanies.map((c) => (
              <tr key={c.slug}>
                <td><a href={companyPathFromSlug(c.slug)}>{c.company_name}</a></td>
                <td>{categoryOfCompany(c)}</td>
                <td>{c.osha_count || 0}</td>
                <td>{c.license_status ?? 'Unknown'}</td>
                <td>{companyTags(c).join(' · ')}</td>
                <td>{getDecisionSignal(c)}</td>
                <td>{getDecisionNote(c, stateName)}</td>
                <td>
                  <a href={`${companyPathFromSlug(c.slug)}#osha-records`}>OSHA</a> · <a href={`${companyPathFromSlug(c.slug)}#license-records`}>License</a> ·{' '}
                  <a href={`${companyPathFromSlug(c.slug)}#registration-records`}>Registration</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={`${cityName} compliance overview`}>
        <p>
          Full profiles (OSHA + License + Registration): {fullCount} · Partial profiles: {partialCount}.
          This distribution helps identify which companies have enough data for stronger due diligence decisions.
        </p>
        <p>
          For high-value contracts, prioritize companies with active license signals and complete profile coverage,
          then validate with official state records before final selection.
        </p>
      </SectionCard>

      <SectionCard title={`Industry lookup pages for ${cityName}`}>
        <p>
          Jump to industry-style lookups for local demand terms:
          {' '}<a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=roofing`}>roofing companies</a>
          {' '}·{' '}
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=electrical`}>electrical contractors</a>
          {' '}·{' '}
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=plumbing`}>plumbing contractors</a>
          {' '}·{' '}
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=hvac`}>HVAC contractors</a>
        </p>
      </SectionCard>

      <SectionCard title={`Next action in ${cityName}`}>
        <p>
          Check another company in {cityName}: 
          {' '}<a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=contractor`}>contractor lookup</a>
          {' '}·{' '}
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=license`}>license-focused search</a>
          {' '}·{' '}
          <a href={`/search?state=${encodeURIComponent(stateName)}&city=${encodeURIComponent(cityName)}&q=osha`}>OSHA-focused search</a>
        </p>
      </SectionCard>

      <SectionCard title="Explore related pages">
        <ul>
          <li><a href={`/state/${stateSlug}`}>{stateName} contractor license lookup</a></li>
          <li><a href={`/state/${stateSlug}`}>{stateName} OSHA inspection records</a></li>
          <li><a href={`/state/${stateSlug}/cities`}>Browse all cities in {stateName}</a></li>
          <li><a href={`/state/${stateSlug}/filter/quality`}>{stateName} best-quality company profiles</a></li>
        </ul>
      </SectionCard>
    </main>
  );
}

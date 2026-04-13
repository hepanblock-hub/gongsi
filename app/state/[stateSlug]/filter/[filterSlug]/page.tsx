import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../../components/common/PageTitle';
import SectionCard from '../../../../../components/common/SectionCard';
import { FILTER_CANONICAL_MAP, canonicalFilterPath, canonicalFilterSlug, isPrimaryFilterSlug, PRIMARY_FILTER_SLUGS } from '../../../../../lib/indexing';
import { getStateCompanyPagesWithCategory, type StateCompanyCategoryRow } from '../../../../../lib/queries';
import { companyPathFromSlug, stateSlugToName } from '../../../../../lib/site';

export const revalidate = 86400;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  // 构建期不预渲染筛选页，全部按需 ISR
  return [];
}

const FILTERS = Object.keys(FILTER_CANONICAL_MAP) as Array<keyof typeof FILTER_CANONICAL_MAP>;

type FilterSlug = (typeof FILTERS)[number];

function isFilterSlug(value: string): value is FilterSlug {
  return FILTERS.includes(value as FilterSlug);
}

function isEncodedCompanyName(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return /^[0-9]/.test(name) || /^[A-Z0-9-]{10,}$/.test(compact) || /\d{3,}/.test(compact);
}

function categoryOfCompany(c: StateCompanyCategoryRow): string {
  const sources = [c.has_osha, c.has_license, c.has_registration].filter(Boolean).length;
  if (sources === 3) return 'full';
  if (c.has_osha && !c.has_license && !c.has_registration) return 'osha-only';
  if (!c.has_osha && c.has_license && !c.has_registration) return 'license-only';
  if (!c.has_osha && !c.has_license && c.has_registration) return 'registration-only';
  if (sources === 2) return 'partial';
  if (sources === 0) return 'basic';
  return 'other';
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
    return `License appears active. Confirm current standing with ${stateName} official agencies before hiring.`;
  }
  if (license === 'suspended' || license === 'revoked') {
    return `Suspended/revoked license signal. Verify immediately with ${stateName} licensing board.`;
  }
  if ((c.injury_count ?? 0) >= 1) {
    return 'Injury-related OSHA records found. Review inspection details before contracting.';
  }
  if (license === 'expired') {
    return `Expired license signal. Confirm whether renewal is completed with ${stateName} authorities.`;
  }
  return 'Insufficient public data. Perform manual verification before decisions.';
}

function filterIntentCopy(filterSlug: string, stateName: string): { title: string; intro: string; bullets: string[] } {
  switch (filterSlug) {
    case 'quality':
      return {
        title: `How to use this ${stateName} quality list`,
        intro: `This ranking is designed for vendor screening and hiring decisions, not just browsing. Companies are sorted by public-record completeness, licensing visibility, and safety record evidence.`,
        bullets: [
          'Start with companies marked as Lower review risk, then verify state licensing directly.',
          'Treat Needs manual review as a verification queue before contracting.',
          'Treat Higher review risk as priority for deeper due diligence.',
        ],
      };
    case 'osha':
    case 'osha-violations':
    case 'osha-only':
      return {
        title: `How to interpret OSHA-focused results in ${stateName}`,
        intro: 'Higher OSHA record counts indicate more documented inspection activity, but do not automatically prove current safety non-compliance. Use this list to identify where deeper review is needed.',
        bullets: [
          'Check injury-related records first for screening priority.',
          'Cross-check license status before hiring decisions.',
          'Review the company profile timeline for context and recency.',
        ],
      };
    case 'active-license':
    case 'active-licenses':
    case 'contractor-licenses':
    case 'license-only':
      return {
        title: `How to use contractor license results in ${stateName}`,
        intro: 'This page is intended for license-first verification. Active status is a positive signal, but users should still validate the license number and current standing through official state systems.',
        bullets: [
          'Prioritize Active license entries for initial shortlist.',
          'Move Unknown/Expired entries to manual verification.',
          'Use OSHA and registration links for additional risk context.',
        ],
      };
    default:
      return {
        title: `How to use this filtered list in ${stateName}`,
        intro: 'This filtered view supports preliminary compliance screening. Use it to narrow candidates, then confirm legal status with official agencies before hiring or contracting.',
        bullets: [
          'Shortlist candidates with stronger compliance visibility.',
          'Review OSHA, License, and Registration sections per company.',
          `Verify final eligibility directly with ${stateName} official sources.`,
        ],
      };
  }
}

function filterTitle(filterSlug: string, stateName: string): string {
  switch (filterSlug) {
    case 'osha':
    case 'osha-violations':
      return `${stateName} OSHA Violations & Inspection Records`;
    case 'license-only':
    case 'contractor-licenses':
      return `${stateName} Contractor License Lookup & Verification`;
    case 'registration-only':
    case 'business-registration':
      return `${stateName} Business Registration Records`;
    case 'active-license':
    case 'active-licenses':
      return `${stateName} Active Contractor License Records`;
    case 'expired-licenses':
      return `${stateName} Expired Contractor License Records`;
    case 'suspended-licenses':
      return `${stateName} Suspended Contractor License Records`;
    case 'recent':
    case 'recently-updated':
      return `${stateName} Recently Updated Company Compliance Records`;
    case 'full':
    case 'full-profiles':
      return `${stateName} Full Company Compliance Profiles`;
    case 'partial':
    case 'partial-profiles':
      return `${stateName} Partial Compliance Profiles`;
    case 'basic':
    case 'basic-listings':
      return `${stateName} Basic Company Records`;
    case 'quality':
      return `Top ${stateName} Companies with Quality Compliance Profiles`;
    case 'osha-only':
      return `${stateName} OSHA Inspection Records`;
    default: return `${stateName} company records`;
  }
}

function filterDescription(filterSlug: string, stateName: string): string {
  switch (filterSlug) {
    case 'osha':
    case 'osha-violations':
      return `Browse companies in ${stateName} with OSHA inspection history, reported workplace injuries, and public safety records from official sources.`;
    case 'license-only':
    case 'contractor-licenses':
      return `Check contractor license status in ${stateName}. View active, expired, or suspended license records from official public sources.`;
    case 'registration-only':
    case 'business-registration':
      return `Review business registration status in ${stateName}. Search public entity records for active, inactive, or dissolved companies.`;
    case 'active-license':
    case 'active-licenses':
      return `Browse companies in ${stateName} with active contractor license records from official state licensing sources.`;
    case 'expired-licenses':
      return `Find companies in ${stateName} with expired contractor licenses and review public licensing status from official records.`;
    case 'suspended-licenses':
      return `Browse companies in ${stateName} with suspended contractor license records and verify status using official public sources.`;
    case 'recent':
    case 'recently-updated':
      return `View recently updated public company compliance records in ${stateName}, including OSHA, license, and registration data.`;
    case 'full':
    case 'full-profiles':
      return `Browse companies in ${stateName} with OSHA, contractor license, and registration records combined into a full compliance profile.`;
    case 'partial':
    case 'partial-profiles':
      return `Find companies in ${stateName} with two public compliance record types available, including OSHA, license, or registration data.`;
    case 'basic':
    case 'basic-listings':
      return `Browse basic public company listings in ${stateName} and review available compliance data from official government sources.`;
    case 'quality':
      return `Top ${stateName} companies ranked by compliance data quality. Includes OSHA records, contractor licenses, and registration data from public government sources.`;
    case 'osha-only':
      return `View companies in ${stateName} with OSHA inspection records available from official public sources.`;
    default:
      return `Browse public company compliance records in ${stateName}.`;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string; filterSlug: string }> }): Promise<Metadata> {
  const { stateSlug, filterSlug } = await params;
  const normalizedFilterSlug = canonicalFilterSlug(filterSlug);
  const stateName = stateSlugToName(stateSlug);
  const title = isPrimaryFilterSlug(normalizedFilterSlug) ? filterTitle(normalizedFilterSlug, stateName) : `${stateName} company records`;
  const description = isPrimaryFilterSlug(normalizedFilterSlug) ? filterDescription(normalizedFilterSlug, stateName) : `Browse public company compliance records in ${stateName}.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalFilterPath(stateSlug, normalizedFilterSlug) },
    authors: [{ name: 'Compliance Lookup Editorial Team' }],
    creator: 'Compliance Lookup Data Team',
    publisher: 'Compliance Lookup',
  };
}

export default async function StateFilterPage({ params }: { params: Promise<{ stateSlug: string; filterSlug: string }> }) {
  const { stateSlug, filterSlug } = await params;
  const normalizedFilterSlug = canonicalFilterSlug(filterSlug);
  if (!isPrimaryFilterSlug(normalizedFilterSlug)) notFound();
  if (normalizedFilterSlug !== filterSlug) {
    permanentRedirect(canonicalFilterPath(stateSlug, normalizedFilterSlug) as never);
  }

  const stateName = stateSlugToName(stateSlug);
  
  // 优先尝试从快照读取筛选数据
  const { fetchFilterSnapshot } = await import('../../../../../lib/filterSnapshot');
  const filterSnapshot = await fetchFilterSnapshot(stateSlug, normalizedFilterSlug);
  let companies = filterSnapshot?.companies ?? await getStateCompanyPagesWithCategory(stateSlug, 5000);

  if (normalizedFilterSlug === 'full-profiles' || normalizedFilterSlug === 'partial-profiles' || normalizedFilterSlug === 'osha-only' || normalizedFilterSlug === 'license-only' || normalizedFilterSlug === 'registration-only' || normalizedFilterSlug === 'basic-listings') {
    const categoryTarget = normalizedFilterSlug === 'full-profiles'
      ? 'full'
      : normalizedFilterSlug === 'partial-profiles'
        ? 'partial'
        : normalizedFilterSlug === 'basic-listings'
          ? 'basic'
          : normalizedFilterSlug;
    companies = companies.filter((c) => categoryOfCompany(c) === categoryTarget);
  }

  if (normalizedFilterSlug === 'contractor-licenses') {
    companies = companies.filter((c) => c.has_license);
  }

  if (normalizedFilterSlug === 'business-registration') {
    companies = companies.filter((c) => c.has_registration);
  }

  if (normalizedFilterSlug === 'osha-violations') {
    companies = companies.filter((c) => c.has_osha);
  }

  if (normalizedFilterSlug === 'active-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'active');
  }

  if (normalizedFilterSlug === 'expired-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'expired');
  }

  if (normalizedFilterSlug === 'suspended-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'suspended');
  }

  if (normalizedFilterSlug === 'osha-violations') {
    companies = companies.sort((a, b) => (b.osha_count || 0) - (a.osha_count || 0) || compareCompanies(a, b));
  } else if (normalizedFilterSlug === 'recently-updated') {
    companies = companies.sort((a, b) => {
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return dateB - dateA || compareCompanies(a, b);
    });
  } else {
    companies = companies.sort(compareCompanies);
  }

  const isEmptyResult = companies.length === 0;

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

  const activeCount = topCompanies.filter((c) => (c.license_status ?? '').toLowerCase() === 'active').length;
  const suspendedOrRevokedCount = topCompanies.filter((c) => {
    const s = (c.license_status ?? '').toLowerCase();
    return s === 'suspended' || s === 'revoked';
  }).length;
  const injuryLinkedCount = topCompanies.filter((c) => (c.injury_count ?? 0) > 0).length;
  const withOshaCount = topCompanies.filter((c) => c.has_osha).length;
  const withLicenseCount = topCompanies.filter((c) => c.has_license).length;
  const withRegistrationCount = topCompanies.filter((c) => c.has_registration).length;

  const intentCopy = filterIntentCopy(normalizedFilterSlug, stateName);

  return (
    <main className="container">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: stateName, href: `/state/${stateSlug}` },
          { label: 'Filter' },
        ]}
      />

      <PageTitle
        title={filterTitle(normalizedFilterSlug, stateName)}
        description={(() => {
          const descriptions: Record<string, string> = {
            'quality': 'Companies ranked by compliance data completeness and recency',
            'osha': 'Browse by OSHA inspection frequency and severity',
            'osha-violations': 'Browse by OSHA inspection frequency and severity',
            'license-only': 'Contractor license records only',
            'contractor-licenses': 'Contractor license records available',
            'registration-only': 'Business registration records only',
            'business-registration': 'Business registration records available',
            'active-license': 'Companies with active contractor licenses',
            'active-licenses': 'Companies with active contractor licenses',
            'expired-licenses': 'Companies with expired contractor licenses',
            'suspended-licenses': 'Companies with suspended contractor licenses',
            'recent': 'Most recently inspected and updated',
            'recently-updated': 'Most recently updated compliance records',
            'full': 'OSHA + License + Registration combined',
            'full-profiles': 'OSHA + License + Registration combined',
            'partial': 'Two data types available',
            'partial-profiles': 'Two compliance data types available',
            'basic': 'Basic company listings',
            'basic-listings': 'Basic company records',
            'osha-only': 'OSHA inspection records only',
          };
          return descriptions[normalizedFilterSlug as string] || 'Filtered company records';
        })()}
      />

      <SectionCard title="Direct search first, filter second">
        <p>
          Best workflow: if you know a company name, search directly first; if not, use this filtered list for shortlist and triage.
        </p>
        <p>
          <a href={`/search?state=${encodeURIComponent(stateName)}`}>Search in {stateName}</a>
          {' '}·{' '}
          <a href={canonicalFilterPath(stateSlug, 'quality')}>Quality ranking</a>
          {' '}·{' '}
          <a href={canonicalFilterPath(stateSlug, 'active-licenses')}>Active licenses</a>
          {' '}·{' '}
          <a href={canonicalFilterPath(stateSlug, 'osha-violations')}>OSHA-focused</a>
        </p>
      </SectionCard>


      <SectionCard title={intentCopy.title}>
        <p>{intentCopy.intro}</p>
        <ul>
          {intentCopy.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Decision support summary (top 200)">
        <p>
          Lower review risk: <strong>{decisionStats.lower}</strong> ·
          Needs manual review: <strong>{decisionStats.manual}</strong> ·
          Higher review risk: <strong>{decisionStats.higher}</strong>
        </p>
        <p>
          These signals are screening aids based on public records and should not be treated as legal conclusions.
          Always confirm final status with official {stateName} agencies.
        </p>
      </SectionCard>

      <SectionCard title="Filter data profile and evidence coverage">
        <p>
          Current view: <strong>{companies.length}</strong> matched companies, with <strong>{topCompanies.length}</strong> shown in this page table.
          Within the displayed set, OSHA coverage appears in <strong>{withOshaCount}</strong> companies,
          contractor-license coverage in <strong>{withLicenseCount}</strong>, and business-registration coverage in
          <strong> {withRegistrationCount}</strong>.
        </p>
        <p>
          Active-license signals appear in <strong>{activeCount}</strong> companies, while suspended/revoked signals appear in
          <strong> {suspendedOrRevokedCount}</strong>. Injury-linked OSHA records appear in <strong>{injuryLinkedCount}</strong> companies.
          These are practical prioritization indicators for manual due diligence.
        </p>
        <p>
          Interpretation note: this page is a structured public-record snapshot. Missing records in one source should be read as
          "not observed in current dataset" rather than definitive legal absence. For contract decisions, cross-check final standing with
          official state portals and source links shown on each company page.
        </p>
      </SectionCard>

      {isEmptyResult && (
        <SectionCard title="No matching companies in current snapshot">
          <p>
            No companies currently match this filter in the latest indexed California dataset snapshot.
            This does not prove legal absence in the real world; it only indicates no matching record in current public-source ingestion.
          </p>
          <p>
            Recommended next step: use broader filters such as quality, contractor-licenses, or osha,
            then verify final status in official California agency portals before operational decisions.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Recommended verification workflow">
        <ol>
          <li>Start from screening signal and open the company detail page.</li>
          <li>Review OSHA timeline context and incident severity fields.</li>
          <li>Validate contractor license status and registration status.</li>
          <li>Confirm legal standing with official {stateName} agency systems before final selection.</li>
        </ol>
      </SectionCard>

      <SectionCard title="How to interpret this filtered page correctly">
        <p>
          This filtered list is designed for decision support and triage. It helps teams narrow a large set of companies into
          a practical shortlist, but it should not be treated as a final legal judgment. Public-record coverage can vary by source,
          publication lag, and agency update cycles.
        </p>
        <p>
          A strong profile in this view means better evidence visibility, not guaranteed suitability for every project.
          Likewise, a weaker profile often means more manual verification is needed. For best outcomes, combine this filter result
          with company-level timeline review and direct checks against official {stateName} licensing and registration systems.
        </p>
      </SectionCard>

      <SectionCard title="Editorial method and source trust model">
        <p>
          This page is curated by the Compliance Lookup Editorial Team and generated from official public records.
          It is intended for preliminary due diligence, not final legal determination.
        </p>
        <p>
          We recommend a two-step check for YMYL decisions: (1) shortlist using this view, (2) confirm final standing directly with official state agencies.
        </p>
      </SectionCard>

      <div id="company-list" />
      <SectionCard title="Company list">
        <p>Showing top {topCompanies.length} companies</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>City</th>
              <th>OSHA Records</th>
              <th>License Status</th>
              <th>Screening Signal</th>
              <th>Screening Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topCompanies.map((c) => (
              <tr key={c.slug}>
                <td><a href={companyPathFromSlug(c.slug)}>{c.company_name}</a></td>
                <td>{(c.city ?? 'Unknown').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())}</td>
                <td>{c.osha_count || 0}</td>
                <td>{c.license_status ?? 'Unknown'}</td>
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
    </main>
  );
}

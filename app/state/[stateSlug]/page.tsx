import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../components/common/Breadcrumbs';
import PageTitle from '../../../components/common/PageTitle';
import SectionCard from '../../../components/common/SectionCard';
import BreadcrumbJsonLd from '../../../components/seo/BreadcrumbJsonLd';
import { getIndexedStateSlugs, getStateCityCounts, getStateCompanyPagesWithCategory, getStateSummary, type StateCompanyCategoryRow } from '../../../lib/queries';
import { SITE_URL, stateSlugToName } from '../../../lib/site';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const slugs = await getIndexedStateSlugs();
  return slugs.map((stateSlug) => ({ stateSlug }));
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

  return {
    title: { absolute: `${stateName} Contractor License Lookup, OSHA Violations & Company Records` },
    description: `Browse public company compliance records in ${stateName}. Search OSHA inspection history, contractor licenses, and registration status from official sources.`,
    alternates: {
      canonical: `/state/${stateSlug}`,
    },
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ stateSlug: string }>;
}) {
  const { stateSlug } = await params;

  const summary = await getStateSummary(stateSlug);
  const allCompanies = await getStateCompanyPagesWithCategory(stateSlug, 5000);
  const cityCounts = await getStateCityCounts(stateSlug);

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
  const topCityTotal = cityCounts.slice(0, 30).reduce((acc, row) => acc + row.company_count, 0);

  const categoryCount = {
    full: companiesBySearch.filter((c) => categoryOfCompany(c) === 'full').length,
    partial: companiesBySearch.filter((c) => categoryOfCompany(c) === 'partial').length,
    oshaOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'osha-only').length,
    licenseOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'license-only').length,
    registrationOnly: companiesBySearch.filter((c) => categoryOfCompany(c) === 'registration-only').length,
    basic: companiesBySearch.filter((c) => categoryOfCompany(c) === 'basic').length,
  };

  const analyzedBase = Math.max(1, companiesBySearch.length);
  const oshaCoveragePct = ((companiesBySearch.filter((c) => c.has_osha).length / analyzedBase) * 100).toFixed(1);
  const licenseCoveragePct = ((companiesBySearch.filter((c) => c.has_license).length / analyzedBase) * 100).toFixed(1);
  const registrationCoveragePct = ((companiesBySearch.filter((c) => c.has_registration).length / analyzedBase) * 100).toFixed(1);
  const fullProfilePct = ((categoryCount.full / analyzedBase) * 100).toFixed(1);
  const partialProfilePct = ((categoryCount.partial / analyzedBase) * 100).toFixed(1);

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

      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: summary.state }]} />
      <PageTitle
        title={`${summary.state} Contractor License Lookup, OSHA Violations & Company Records`}
        description={`${summary.state} state compliance page for company license lookup, OSHA inspection history, and registration verification.`}
      />

      <SectionCard title={`${summary.state} compliance records overview`}>
        <p>
          This page provides access to public compliance records for companies and contractors in {summary.state}.
        </p>
        <p>
          Users can search contractor license status, review OSHA inspection records, and verify business registration details
          using official government data sources.
        </p>
        <p>
          The {summary.state} contractor license lookup and OSHA records database help users check whether a company has active
          licenses, workplace safety violations, or valid registration status.
        </p>
        <p>
          Search terms covered on this page include OSHA violations {summary.state}, check contractor license {summary.state},
          company safety record {summary.state}, and verify business license {summary.state}.
        </p>
      </SectionCard>

      <SectionCard title="What you can check">
        <ul>
          <li>Check contractor license status in {summary.state}</li>
          <li>Search OSHA inspection records and workplace safety history</li>
          <li>Verify company registration status</li>
          <li>Review public compliance data from official sources</li>
        </ul>
      </SectionCard>

      <section className="cards">
        <SectionCard title="Total companies indexed">
          <p className="metric">{summary.company_count}</p>
        </SectionCard>
        <SectionCard title="OSHA inspection records">
          <p className="metric">{summary.osha_count}</p>
        </SectionCard>
        <SectionCard title="Contractor license records">
          <p className="metric">{summary.license_count}</p>
        </SectionCard>
        <SectionCard title="Business registration records">
          <p className="metric">{summary.registration_count}</p>
        </SectionCard>
      </section>

      <SectionCard title={`${summary.state} compliance data overview`}>
        <p>Total companies indexed: {summary.company_count}</p>
        <p>OSHA inspection records: {summary.osha_count}</p>
        <p>Contractor license records: {summary.license_count > 0 ? 'Available' : 'Not available in current dataset'}</p>
        <p>Business registration records: {summary.registration_count > 0 ? 'Available' : 'Not available in current dataset'}</p>
        <p>
          The large number of OSHA inspection records in {summary.state} reflects extensive workplace safety reporting across industries.
          Users can use this data to identify companies with inspection history, verify licensing status, and better understand compliance patterns within the state.
        </p>
      </SectionCard>

      <SectionCard title="State filters">
        <p>
          <a href={`/state/${stateSlug}/quality`}>Best quality first</a> ·{' '}
          <a href={`/state/${stateSlug}/osha-violations`}>Most OSHA records</a> ·{' '}
          <a href={`/state/${stateSlug}/recently-updated`}>Recently inspected</a> ·{' '}
          <a href={`/state/${stateSlug}/active-licenses`}>Active licenses first</a>
        </p>
        <p>
          <a href={`/state/${stateSlug}/full-profiles`}>Full profile</a> ·{' '}
          <a href={`/state/${stateSlug}/partial-profiles`}>Partial profile</a> ·{' '}
          <a href={`/state/${stateSlug}/osha-only`}>OSHA only</a> ·{' '}
          <a href={`/state/${stateSlug}/contractor-licenses`}>License only</a> ·{' '}
          <a href={`/state/${stateSlug}/business-registration`}>Registration only</a> ·{' '}
          <a href={`/state/${stateSlug}/basic-listings`}>Basic listing</a>
        </p>
      </SectionCard>

      <SectionCard title="Browse by category">
        <p>
          <a href={`/state/${stateSlug}/osha-violations#company-list`}>Top companies with OSHA violations in {summary.state}</a> ·{' '}
          <a href={`/state/${stateSlug}/recently-updated#company-list`}>Recently inspected companies in {summary.state}</a> ·{' '}
          <a href={`/state/${stateSlug}/active-licenses#company-list`}>Contractors with active licenses in {summary.state}</a>
        </p>
        <p>
          <a href={`/state/${stateSlug}/full-profiles#company-list`}>View all OSHA company records →</a> ·{' '}
          <a href={`/state/${stateSlug}/contractor-licenses#company-list`}>View all contractor license records →</a> ·{' '}
          <a href={`/state/${stateSlug}/business-registration#company-list`}>View all business registration records →</a>
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
          This helps distinguish companies with broader public-record visibility from entities with limited published records.
        </p>
        <p>
          These metrics are intended for preliminary compliance screening and should be verified against the corresponding official agency records before making legal, hiring, or contracting decisions.
        </p>
      </SectionCard>

      <SectionCard title="Top cities">
        <p>Top cities by indexed company count in {summary.state} (showing top 30):</p>
        <p>
          {cityCounts.slice(0, 30).map((g, idx) => (
            <span key={g.city}>
              <a href={`/state/${stateSlug}/cities/${citySlug(g.city)}#company-list`}>{g.city}</a> ({g.company_count})
              {idx < Math.min(cityCounts.length, 30) - 1 ? ' · ' : ''}
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
                <td><a href={c.slug}>{c.company_name}</a></td>
                <td>{normalizeCityName(c.city)}</td>
                <td>{profileLabel(categoryOfCompany(c))}</td>
                <td>
                  <a href={`${c.slug}#osha-records`}>OSHA</a> · <a href={`${c.slug}#license-records`}>License</a> ·{' '}
                  <a href={`${c.slug}#registration-records`}>Registration</a>
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
                  <a href={c.slug}>{c.company_name}</a> ·{' '}
                  {profileLabel(categoryOfCompany(c))}
                </li>
              ))}
              <li><a href={`/state/${stateSlug}/cities/${citySlug(g.name)}#company-list`}>View all companies in {g.name} →</a></li>
            </ul>
          </details>
        ))}
      </SectionCard>

      <SectionCard title="Data coverage">
        <p>This state page includes public OSHA, contractor license, and registration references where available.</p>
        <p>Update frequency varies by source system and publication cycle.</p>
      </SectionCard>

      <SectionCard title="Sources">
        <p>Source: OSHA official records</p>
        <p>Source: State contractor license boards</p>
        <p>Source: Secretary of State business records</p>
      </SectionCard>

      <SectionCard title="FAQ">
        <p><strong>Do you cover all companies in this state?</strong><br />Coverage is expanding and depends on available public records.</p>
        <p><strong>How often is this state updated?</strong><br />On periodic refresh schedules by data category.</p>
        <p><strong>Can I check contractor license California and OSHA violations California on this page?</strong><br />Yes. This page helps users check contractor license California records, OSHA violations California coverage, company safety record California results, and verify business license California references from public datasets.</p>
      </SectionCard>
    </main>
  );
}

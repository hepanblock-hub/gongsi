import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../../components/common/PageTitle';
import SectionCard from '../../../../../components/common/SectionCard';
import { getStateCompanyPagesWithCategory, type StateCompanyCategoryRow } from '../../../../../lib/queries';
import { stateSlugToName } from '../../../../../lib/site';

export const dynamic = 'force-dynamic';

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

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string; citySlug: string }> }): Promise<Metadata> {
  const { stateSlug, citySlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const cityName = citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: { absolute: `${cityName} Contractor License Lookup, OSHA Records & Company Compliance Data` },
    description: `Decision-focused company compliance guide for ${cityName}, ${stateName}. Review OSHA inspection patterns, contractor license status signals, and verification workflow before hiring or vendor selection.`,
    alternates: { canonical: `/state/${stateSlug}/city/${citySlug}` },
  };
}

export default async function StateCityPage({ params }: { params: Promise<{ stateSlug: string; citySlug: string }> }) {
  const { stateSlug, citySlug: targetCitySlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const allCompanies = await getStateCompanyPagesWithCategory(stateSlug, 5000);
  const companies = allCompanies
    .filter((c) => citySlug(normalizeCityName(c.city)) === targetCitySlug)
    .sort(compareCompanies);

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
  const injuryLinkedCount = companies.filter((c) => (c.injury_count ?? 0) > 0).length;

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

  return (
    <main className="container">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: stateName, href: `/state/${stateSlug}` },
          { label: 'Cities', href: `/state/${stateSlug}/cities` },
          { label: cityName },
        ]}
      />

      <PageTitle
        title={`${cityName}, ${stateName} Contractor License Lookup & OSHA Records`}
        description={`Decision-focused screening page for contractor compliance checks in ${cityName}, ${stateName}`}
      />

      <SectionCard title={`Compliance records in ${cityName}, ${stateName}`}>
        <p>
          This page provides access to company compliance records in {cityName}, {stateName}, including contractor license status,
          OSHA inspection history, and business registration data where available.
        </p>
        <p>
          Users can search and review public records to verify company credentials, check workplace safety history,
          and assess compliance risk before hiring or working with a business.
        </p>
        <p>
          This is a preliminary screening page (not a real-time official license API). Final legal verification should be completed through official {stateName} government systems.
        </p>
      </SectionCard>

      <SectionCard title={`How to check a company in ${cityName}`}>
        <ol>
          <li>Search for the company name using the search bar on this page</li>
          <li>Review OSHA inspection records and safety history</li>
          <li>Check contractor license status if available</li>
          <li>Verify license and registration through official {stateName} state sources before hiring</li>
        </ol>
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

      <SectionCard title="Why checking company compliance matters">
        <p>
          Reviewing company compliance records helps reduce risk when hiring contractors or evaluating businesses.
          OSHA inspection history and licensing status can provide insight into safety practices and regulatory compliance.
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
      <SectionCard title="Company list">
        <p>{cityName} · {topCompanies.length} companies shown (from {companies.length} indexed companies)</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Profile</th>
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
                <td><a href={c.slug}>{c.company_name}</a></td>
                <td>{categoryOfCompany(c)}</td>
                <td>{c.osha_count || 0}</td>
                <td>{c.license_status ?? 'Unknown'}</td>
                <td>{getDecisionSignal(c)}</td>
                <td>{getDecisionNote(c, stateName)}</td>
                <td>
                  <a href={`${c.slug}#osha-records`}>OSHA</a> · <a href={`${c.slug}#license-records`}>License</a> ·{' '}
                  <a href={`${c.slug}#registration-records`}>Registration</a>
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

      <SectionCard title="Explore related pages">
        <ul>
          <li><a href={`/state/${stateSlug}`}>{stateName} contractor license lookup</a></li>
          <li><a href={`/state/${stateSlug}`}>{stateName} OSHA inspection records</a></li>
          <li><a href={`/state/${stateSlug}/cities`}>Browse all cities in {stateName}</a></li>
        </ul>
      </SectionCard>
    </main>
  );
}

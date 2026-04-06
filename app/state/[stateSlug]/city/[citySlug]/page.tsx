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

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string; citySlug: string }> }): Promise<Metadata> {
  const { stateSlug, citySlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const cityName = citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: { absolute: `${cityName} Contractor License Lookup, OSHA Records & Company Compliance Data` },
    description: `Search and review public company compliance records in ${cityName}, ${stateName}. Check contractor license status, OSHA inspection history, and business registration data from official government sources.`,
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
        description={`Public compliance records and business verification for ${cityName}, ${stateName}`}
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
      </SectionCard>

      <SectionCard title={`How to check a company in ${cityName}`}>
        <ol>
          <li>Search for the company name using the search bar on this page</li>
          <li>Review OSHA inspection records and safety history</li>
          <li>Check contractor license status if available</li>
          <li>Verify business registration through official {stateName} state sources</li>
        </ol>
      </SectionCard>

      <SectionCard title="Why checking company compliance matters">
        <p>
          Reviewing company compliance records helps reduce risk when hiring contractors or evaluating businesses.
          OSHA inspection history and licensing status can provide insight into safety practices and regulatory compliance.
        </p>
      </SectionCard>

      <div id="company-list" />
      <SectionCard title="Company list">
        <p>{cityName} · {companies.length} indexed companies</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Profile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.slug}>
                <td><a href={c.slug}>{c.company_name}</a></td>
                <td>{categoryOfCompany(c)}</td>
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
          <strong>Compliance distribution for {cityName}, {stateName}</strong>
        </p>
        <p>
          Within the indexed companies for {cityName}, {oshaPct}% have OSHA inspection records, {licensePct}% have contractor license records,
          and {registrationPct}% have business registration records.
        </p>
        <p>
          This distribution indicates that most companies in {cityName} have licensing data available, while a smaller portion have recorded workplace safety inspections.
          Companies with full profiles provide access to all three data types, while others may have partial or limited public records available.
        </p>
        <p>
          Full profiles (all three records): {fullCount} · Partial profiles (any two records): {partialCount}.
          This breakdown helps prioritize deeper review for vendors or employers with broader public compliance visibility.
        </p>
        <p>
          City-level results are based on currently indexed public datasets and should be cross-checked with official {stateName} state sources for final verification.
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

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
    title: { absolute: `${cityName}, ${stateName} OSHA Violations, License & Company Records` },
    description: `View public compliance records for companies in ${cityName}, ${stateName}, including OSHA inspections, contractor license status, and registration details.`,
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
        title={`${cityName}, ${stateName} company list`}
        description="Static city page with company compliance records."
      />

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

      <SectionCard title={`${cityName} compliance analysis`}>
        <p>
          Within the indexed companies for {cityName}, {oshaPct}% have OSHA-linked records, {licensePct}% have license-linked records,
          and {registrationPct}% have registration-linked records.
        </p>
        <p>
          Full profiles: {fullCount} · Partial profiles: {partialCount}. This distribution can help prioritize deeper review for vendors
          or employers with broader public compliance visibility.
        </p>
        <p>
          City-level results are based on currently indexed public datasets and should be cross-checked with official source systems for final verification.
        </p>
      </SectionCard>
    </main>
  );
}

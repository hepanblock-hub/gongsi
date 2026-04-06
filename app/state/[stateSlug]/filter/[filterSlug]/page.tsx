import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Breadcrumbs from '../../../../../components/common/Breadcrumbs';
import PageTitle from '../../../../../components/common/PageTitle';
import SectionCard from '../../../../../components/common/SectionCard';
import { getStateCompanyPagesWithCategory, type StateCompanyCategoryRow } from '../../../../../lib/queries';
import { stateSlugToName } from '../../../../../lib/site';

export const dynamic = 'force-dynamic';

const FILTERS = [
  'quality', 'osha', 'recent', 'active-license',
  'full', 'partial', 'osha-only', 'license-only', 'registration-only', 'basic',
  'osha-violations', 'contractor-licenses', 'business-registration',
  'active-licenses', 'expired-licenses', 'suspended-licenses',
  'recently-updated', 'full-profiles', 'partial-profiles', 'basic-listings',
] as const;

type FilterSlug = (typeof FILTERS)[number];

function isFilterSlug(value: string): value is FilterSlug {
  return FILTERS.includes(value as FilterSlug);
}

function isEncodedCompanyName(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return /^[0-9]/.test(name) || /^[A-Z0-9-]{10,}$/.test(compact) || /\d{3,}/.test(compact);
}

function categoryOfCompany(c: StateCompanyCategoryRow): FilterSlug | 'other' {
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

function filterTitle(filterSlug: FilterSlug, stateName: string): string {
  switch (filterSlug) {
    case 'osha':
    case 'osha-violations':
      return `${stateName} OSHA Violations by Company`;
    case 'license-only':
    case 'contractor-licenses':
      return `${stateName} Contractor License Lookup`;
    case 'registration-only':
    case 'business-registration':
      return `${stateName} Business Registration Records`;
    case 'active-license':
    case 'active-licenses':
      return `${stateName} Active Contractor Licenses`;
    case 'expired-licenses':
      return `${stateName} Expired Contractor Licenses`;
    case 'suspended-licenses':
      return `${stateName} Suspended Contractor Licenses`;
    case 'recent':
    case 'recently-updated':
      return `${stateName} Recently Updated Company Records`;
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
      return `Top Companies with Quality Compliance Profiles in ${stateName} (2026 Data)`;
    case 'osha-only':
      return `${stateName} OSHA Inspection Records`;
    default: return `${stateName} company records`;
  }
}

function filterDescription(filterSlug: FilterSlug, stateName: string): string {
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
      return `Browse top companies in ${stateName} ranked by compliance data quality and completeness. Companies are prioritized based on OSHA records, contractor license availability, and registration data coverage from official public sources.`;
    case 'osha-only':
      return `View companies in ${stateName} with OSHA inspection records available from official public sources.`;
    default:
      return `Browse public company compliance records in ${stateName}.`;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ stateSlug: string; filterSlug: string }> }): Promise<Metadata> {
  const { stateSlug, filterSlug } = await params;
  const stateName = stateSlugToName(stateSlug);
  const title = isFilterSlug(filterSlug) ? filterTitle(filterSlug, stateName) : `${stateName} company records`;
  const description = isFilterSlug(filterSlug) ? filterDescription(filterSlug, stateName) : `Browse public company compliance records in ${stateName}.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/state/${stateSlug}/filter/${filterSlug}` },
  };
}

export default async function StateFilterPage({ params }: { params: Promise<{ stateSlug: string; filterSlug: string }> }) {
  const { stateSlug, filterSlug } = await params;
  if (!isFilterSlug(filterSlug)) notFound();

  const stateName = stateSlugToName(stateSlug);
  let companies = await getStateCompanyPagesWithCategory(stateSlug, 5000);

  if (filterSlug === 'full' || filterSlug === 'partial' || filterSlug === 'osha-only' || filterSlug === 'license-only' || filterSlug === 'registration-only' || filterSlug === 'basic') {
    companies = companies.filter((c) => categoryOfCompany(c) === filterSlug);
  }

  if (filterSlug === 'full-profiles') {
    companies = companies.filter((c) => categoryOfCompany(c) === 'full');
  }

  if (filterSlug === 'partial-profiles') {
    companies = companies.filter((c) => categoryOfCompany(c) === 'partial');
  }

  if (filterSlug === 'basic-listings') {
    companies = companies.filter((c) => categoryOfCompany(c) === 'basic');
  }

  if (filterSlug === 'contractor-licenses') {
    companies = companies.filter((c) => c.has_license);
  }

  if (filterSlug === 'business-registration') {
    companies = companies.filter((c) => c.has_registration);
  }

  if (filterSlug === 'osha-violations') {
    companies = companies.filter((c) => c.has_osha);
  }

  if (filterSlug === 'active-license') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'active');
  }

  if (filterSlug === 'active-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'active');
  }

  if (filterSlug === 'expired-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'expired');
  }

  if (filterSlug === 'suspended-licenses') {
    companies = companies.filter((c) => (c.license_status ?? '').toLowerCase() === 'suspended');
  }

  if (filterSlug === 'osha') {
    companies = companies.sort((a, b) => (b.osha_count || 0) - (a.osha_count || 0) || compareCompanies(a, b));
  } else if (filterSlug === 'osha-violations') {
    companies = companies.sort((a, b) => (b.osha_count || 0) - (a.osha_count || 0) || compareCompanies(a, b));
  } else if (filterSlug === 'recent') {
    companies = companies.sort((a, b) => {
      const recentA = a.latest_inspection_date ? new Date(a.latest_inspection_date).getTime() : 0;
      const recentB = b.latest_inspection_date ? new Date(b.latest_inspection_date).getTime() : 0;
      return recentB - recentA || compareCompanies(a, b);
    });
  } else if (filterSlug === 'recently-updated') {
    companies = companies.sort((a, b) => {
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return dateB - dateA || compareCompanies(a, b);
    });
  } else {
    companies = companies.sort(compareCompanies);
  }

  if (!companies.length) notFound();

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
        title={filterTitle(filterSlug, stateName)}
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
          return descriptions[filterSlug as string] || 'Filtered company records';
        })()}
      />


      {filterSlug === 'quality' && (
        <SectionCard title={`Top ${stateName} Companies by Compliance Quality`}>
          <p>
            This page lists companies in {stateName} ranked by the quality and completeness of their publicly available compliance data.
            Companies are sorted based on OSHA inspection records, contractor license availability, business registration status, and data freshness.
          </p>
          <p><strong>Ranking methodology:</strong></p>
          <ul>
            <li>Number of OSHA inspection records (higher indicates more documented workplace safety activity)</li>
            <li>Availability of contractor license data (presence indicates regulatory compliance tracking)</li>
            <li>Business registration records (indicates formal business entity documentation)</li>
            <li>Data freshness and recency of compliance records</li>
            <li>Completeness of public record visibility across all three data types</li>
          </ul>
          <p><strong>This list is commonly used for:</strong></p>
          <ul>
            <li>Contractor screening and vendor risk assessment</li>
            <li>Evaluating company compliance history before hiring</li>
            <li>Workplace safety research and compliance pattern analysis</li>
            <li>Verifying regulatory status before business partnerships</li>
          </ul>
        </SectionCard>
      )}

      {(filterSlug === 'osha' || filterSlug === 'osha-violations') && (
        <SectionCard title={`${stateName} Companies by OSHA Inspection Activity`}>
          <p>
            This page lists companies in {stateName} with the highest number of OSHA inspection records.
            A higher number of inspections typically indicates greater operational activity or prior workplace safety incidents.
          </p>
          <p>Companies are ranked by total OSHA inspection count, helping identify patterns of workplace safety oversight.</p>
        </SectionCard>
      )}

      <div id="company-list" />
      <SectionCard title="Company list">
        <p>Showing top {Math.min(companies.length, 200)} companies</p>
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>City</th>
              <th>OSHA Records</th>
              <th>License Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.slice(0, 200).map((c) => (
              <tr key={c.slug}>
                <td><a href={c.slug}>{c.company_name}</a></td>
                <td>{(c.city ?? 'Unknown').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())}</td>
                <td>{c.osha_count || 0}</td>
                <td>{c.license_status ?? 'Unknown'}</td>
                <td>
                  <a href={`${c.slug}#osha-records`}>OSHA</a> · <a href={`${c.slug}#license-records`}>License</a> ·{' '}
                  <a href={`${c.slug}#registration-records`}>Registration</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </main>
  );
}

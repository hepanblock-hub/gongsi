import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumbs from '../../../components/common/Breadcrumbs';
import PageTitle from '../../../components/common/PageTitle';
import SectionCard from '../../../components/common/SectionCard';
import StatusBadge from '../../../components/common/StatusBadge';
import BreadcrumbJsonLd from '../../../components/seo/BreadcrumbJsonLd';
import {
  getCompanyDetailedLocation,
  getCompanyBySlug,
  getCompanyTimeline,
  getLicensesByCompany,
  getOshaByCompany,
  getRelatedCompanies,
  getRegistrationsByCompany,
} from '../../../lib/queries';
import { companyPathFromSlug, formatDate, formatMoney, normalizeStateSlug, SITE_URL } from '../../../lib/site';

const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function humanizeToken(value: string | null): string {
  if (!value) return '-';
  return value
    .replace(/_/g, ' ')
    .replace(/\|/g, ' / ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSeverity(value: string | null): string {
  if (!value) return '-';

  const injury = value.match(/^injury_count:(\d+)$/i);
  if (injury) return `Reported ${injury[1]} workplace injuries`;

  const fatality = value.match(/^fatality:(\d+)$/i);
  if (fatality) return `Reported ${fatality[1]} workplace fatalities`;

  return humanizeToken(value);
}

function getOshaRecordLabel(violationType: string | null, inspectionType: string | null): string {
  if (violationType && violationType.trim() && !/^\d+$/.test(violationType.trim())) return violationType;
  if (inspectionType && inspectionType.trim()) return humanizeToken(inspectionType);
  return 'OSHA summary record';
}

function pickVariant(seed: string, options: string[]): string {
  const hash = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return options[hash % options.length];
}

function fullStateName(state: string): string {
  const code = state.trim().toUpperCase();
  return STATE_CODE_TO_NAME[code] ?? state;
}

function formatMonthYear(value: string | null): string {
  const dt = value ? new Date(value) : new Date();
  if (Number.isNaN(dt.getTime())) return 'the latest refresh cycle';
  return dt.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatInspectionNarrative(date: string | null, severity: string | null): string {
  const dateText = formatDate(date);
  if (!date) return 'the inspection date is not listed in the current dataset';

  const injury = severity?.match(/^injury_count:(\d+)$/i);
  if (injury) {
    return `the most recent inspection was conducted on ${dateText}, reporting ${injury[1]} workplace injuries`;
  }

  const fatality = severity?.match(/^fatality:(\d+)$/i);
  if (fatality) {
    return `the most recent inspection was conducted on ${dateText}, reporting ${fatality[1]} workplace fatalities`;
  }

  return `the most recent inspection was conducted on ${dateText}`;
}

function getRiskConclusion(oshaCount: number): string {
  if (oshaCount >= 10) {
    return 'A higher number of OSHA inspection records may indicate increased operational or safety-related activity.';
  }
  if (oshaCount >= 1) {
    return 'The current OSHA inspection history suggests observable workplace safety activity in public records.';
  }
  return 'No OSHA inspection history was found in the current public dataset.';
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);
  const page = await getCompanyBySlug(fullSlug);

  if (!page) return { title: 'Company not found' };
  const stateName = fullStateName(page.state);
  const [osha, licenses, registrations] = await Promise.all([
    getOshaByCompany(page.company_name, page.state, 1),
    getLicensesByCompany(page.company_name, page.state, 1),
    getRegistrationsByCompany(page.company_name, page.state, 1),
  ]);

  const hasOsha = osha.length > 0;
  const hasLicense = licenses.length > 0;
  const hasRegistration = registrations.length > 0;
  const sourceCount = [hasOsha, hasLicense, hasRegistration].filter(Boolean).length;
  const location = page.city ? `${page.city}, ${stateName}` : stateName;

  const cityPart = page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`;

  let title = `${page.company_name} – Public Compliance Record${cityPart}`;
  let description = `View public compliance records for ${page.company_name}${cityPart}. Includes OSHA inspection history, contractor license status, and business registration details from official government sources.`;

  if (hasOsha && hasLicense && hasRegistration) {
    title = `${page.company_name} OSHA Violations & License Status${cityPart}`;
    description = `${page.company_name} OSHA inspection history, contractor license status, and business registration records${cityPart}. Compliance data from official public sources.`;
  } else if (hasOsha && !hasLicense && !hasRegistration) {
    title = `${page.company_name} OSHA Inspection Records & Violations${cityPart}`;
    description = `${page.company_name} OSHA inspection records and workplace safety violation history${cityPart}. View reported incidents and workplace safety compliance data.`;
  } else if (!hasOsha && hasLicense && !hasRegistration) {
    title = `${page.company_name} Contractor License Status${cityPart}`;
    description = `Check contractor license status for ${page.company_name}${cityPart}. Active, expired, or suspended license records from official state sources.`;
  } else if (!hasOsha && !hasLicense && hasRegistration) {
    title = `${page.company_name} Business Registration Status${cityPart}`;
    description = `${page.company_name} business registration status and entity filing records${cityPart}. Public record data from official state sources.`;
  } else if (sourceCount === 2) {
    title = `${page.company_name} OSHA & License Compliance Records${cityPart}`;
    description = `View OSHA inspection history, contractor license status, and compliance records for ${page.company_name}${cityPart}. Data from official public government sources.`;
  }

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: page.slug,
    },
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);
  const page = await getCompanyBySlug(fullSlug);

  if (!page) notFound();

  const [osha, licenses, registrations] = await Promise.all([
    getOshaByCompany(page.company_name, page.state, 200),
    getLicensesByCompany(page.company_name, page.state, 200),
    getRegistrationsByCompany(page.company_name, page.state, 200),
  ]);

  const [timeline, related] = await Promise.all([
    getCompanyTimeline(page.company_name, page.state, 12),
    getRelatedCompanies(page.company_name, page.state, page.city, 6, page.slug),
  ]);

  const detailedLocation = await getCompanyDetailedLocation(page.company_name, page.state);

  const latestInspection = osha[0]?.inspection_date ?? null;
  const latestLicenseStatus = licenses[0]?.status ?? 'unknown';
  const latestRegistrationStatus = registrations[0]?.status ?? 'unknown';
  const stateName = fullStateName(page.state);
  const freshnessLine = `Data on this page was last updated in ${formatMonthYear(page.updated_at)}.`;

  const locationLine = page.city
    ? pickVariant(`${page.company_name}:location`, [
      `${page.company_name} is a registered business entity based in ${page.city}, ${stateName}.`,
      `${page.company_name} is a company headquartered in ${page.city}, ${stateName}.`,
      `${page.company_name} operates as a business entity in ${page.city}, ${stateName}.`,
    ])
    : pickVariant(`${page.company_name}:location`, [
      `${page.company_name} is a registered business entity based in ${stateName}.`,
      `${page.company_name} is a company operating in ${stateName}.`,
      `${page.company_name} is listed as a business entity in ${stateName}.`,
    ]);

  const oshaLine = osha.length > 0
    ? `According to publicly available records, the company has ${osha.length} OSHA inspection records, and ${formatInspectionNarrative(osha[0]?.inspection_date ?? null, osha[0]?.severity ?? null)}.`
    : 'According to publicly available records, no OSHA inspection records were found in the current dataset.';

  const recordsLine = licenses.length === 0 && registrations.length === 0
    ? 'No contractor license or business registration records were found in the current datasets for this company.'
    : `${licenses.length === 0 ? 'No contractor license records were found.' : `Contractor license records are available (${licenses.length} record${licenses.length > 1 ? 's' : ''}).`} ${registrations.length === 0 ? 'No business registration records were found.' : `Business registration records are available (${registrations.length} record${registrations.length > 1 ? 's' : ''}).`}`;

  const riskIntro = pickVariant(page.company_name, [
    'Based on available public records, this company has recorded OSHA inspections, indicating past workplace safety activity.',
    'Publicly available compliance data shows OSHA inspection activity for this company, indicating prior workplace safety oversight.',
    'Available government records indicate that this company has OSHA inspection history, reflecting prior workplace safety review.',
  ]);

  const riskFollowUp = licenses.length === 0 && registrations.length === 0
    ? 'However, no active contractor license or confirmed business registration status was found in the current data, which may require further verification through official sources.'
    : `Current records show contractor license status as ${latestLicenseStatus} and business registration status as ${latestRegistrationStatus}; users should still verify current standing through official sources.`;

  const riskConclusion = getRiskConclusion(osha.length);

  const locationCityState = page.city
    ? `${page.city}, ${stateName}`
    : stateName;
  const mapQuery = detailedLocation
    ? `${page.company_name} ${detailedLocation}`
    : null;
  const mapEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : null;
  const mapOpenUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;

  const oshaFaqAnswer = osha.length > 0
    ? (() => {
      const injury = osha[0]?.severity?.match(/^injury_count:(\d+)$/i);
      if (injury) {
        return `Public records show that the company has OSHA inspection records, including incidents reporting ${injury[1]} workplace injuries.`;
      }
      return 'Public records show that the company has OSHA inspection records, indicating past workplace safety activity.';
    })()
    : 'No OSHA inspection records were found in the current dataset for this company.';

  return (
    <main className="container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', item: `${SITE_URL}/` },
          { name: page.state, item: `${SITE_URL}/state/${normalizeStateSlug(page.state)}` },
          { name: page.company_name, item: `${SITE_URL}${page.slug}` },
        ]}
      />

      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: page.state, href: `/state/${page.state.toLowerCase().replace(/\s+/g, '-')}` },
          { label: page.company_name },
        ]}
      />
      <PageTitle
        title={page.city
          ? `${page.company_name} OSHA Violations & License Status in ${page.city}, ${stateName}`
          : `${page.company_name} OSHA Violations & License Status in ${stateName}`
        }
        description={`Public compliance records for ${page.company_name}${page.city ? ` · ${page.city}, ${stateName}` : ` · ${stateName}`}`}
      />

      <SectionCard title="Company description">
        <p>{locationLine}</p>
        <p>{oshaLine}</p>
        <p>
          {licenses.length > 0
            ? `Contractor license records are available for ${page.company_name} in ${stateName}, showing license status as ${latestLicenseStatus}.`
            : `No active contractor license records were found in the current datasets for ${page.company_name} in ${stateName}.`}
          {registrations.length > 0
            ? ` Business registration records are on file, showing registration status as ${latestRegistrationStatus}.`
            : ' No verified business registration records were identified in the available public data.'}
        </p>
        <p>
          This page provides a detailed overview of OSHA violation history, contractor license status, and compliance records for {page.company_name}
          {page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}.
        </p>
        <p className="muted">{freshnessLine}</p>
      </SectionCard>

      {detailedLocation && mapEmbedUrl && mapOpenUrl && (
        <SectionCard title="Location">
          <p>This company is located in {locationCityState}.</p>
          <p><strong>Address reference:</strong> {detailedLocation}</p>
          <iframe
            src={mapEmbedUrl}
            title={`${page.company_name} map`}
            className="location-map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <p><a href={mapOpenUrl} target="_blank" rel="noopener noreferrer">View on Google Maps</a></p>
        </SectionCard>
      )}

      <section className="company-layout">
        <div className="company-main">
          <SectionCard title="Summary">
            <div className="summary-grid">
              <p><strong>OSHA records</strong><br />{osha.length}</p>
              <p><strong>License records</strong><br />{licenses.length}</p>
              <p><strong>Registration records</strong><br />{registrations.length}</p>
              <p><strong>License status</strong><br />{latestLicenseStatus}</p>
              <p><strong>Registration status</strong><br />{latestRegistrationStatus}</p>
              <p><strong>Last inspection</strong><br />{formatDate(latestInspection)}</p>
              <p><strong>City</strong><br />{page.city ?? '-'}</p>
              <p><strong>Last updated</strong><br />{formatDate(page.updated_at)}</p>
            </div>
          </SectionCard>

          <SectionCard title="Risk overview">
            <p>{riskIntro}</p>
            <p>{riskFollowUp}</p>
            <p>{riskConclusion}</p>
            <p><StatusBadge label={osha.length ? 'OSHA inspections present' : 'No OSHA inspections found'} tone={osha.length ? 'warn' : 'good'} /></p>
            <p><StatusBadge label={`Contractor license: ${latestLicenseStatus}`} tone={latestLicenseStatus === 'active' ? 'good' : 'neutral'} /></p>
            <p><StatusBadge label={`Business registration: ${latestRegistrationStatus}`} tone={latestRegistrationStatus === 'active' ? 'good' : 'neutral'} /></p>
          </SectionCard>

          <div id="osha-records" />
          <SectionCard title="OSHA records">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Record</th>
                  <th>Severity / Outcome</th>
                  <th>Penalty</th>
                </tr>
              </thead>
              <tbody>
                {osha.map((r, idx) => (
                  <tr key={`${r.inspection_date}-${r.violation_type}-${idx}`}>
                    <td>{formatDate(r.inspection_date)}</td>
                    <td>{getOshaRecordLabel(r.violation_type, r.inspection_type)}</td>
                    <td>{formatSeverity(r.severity)}</td>
                    <td>{formatMoney(r.penalty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <div id="license-records" />
          <SectionCard title="Contractor license records">
            <table>
              <thead>
                <tr>
                  <th>License number</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Issue date</th>
                  <th>Expiry date</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((r, i) => (
                  <tr key={`${r.license_number}-${i}`}>
                    <td>{r.license_number ?? '-'}</td>
                    <td>{r.license_type ?? '-'}</td>
                    <td>{r.status ?? 'unknown'}</td>
                    <td>{formatDate(r.issue_date)}</td>
                    <td>{formatDate(r.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!licenses.length && <p>No license records found for this company/state combination.</p>}
          </SectionCard>

          <div id="registration-records" />
          <SectionCard title="Business registration records">
            <table>
              <thead>
                <tr>
                  <th>Registration number</th>
                  <th>Status</th>
                  <th>Incorporation date</th>
                  <th>Registered agent</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r, i) => (
                  <tr key={`${r.registration_number}-${i}`}>
                    <td>{r.registration_number ?? '-'}</td>
                    <td>{r.status ?? 'unknown'}</td>
                    <td>{formatDate(r.incorporation_date)}</td>
                    <td>{r.registered_agent ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!registrations.length && <p>No registration records found for this company/state combination.</p>}
          </SectionCard>

          <SectionCard title="Compliance Summary">
            <ul>
              <li>{osha.length > 0 ? `OSHA inspection records present (${osha.length} records)` : 'No OSHA inspection records found in current data'}</li>
              <li>{licenses.length > 0 ? `Contractor license records found (${licenses.length}) – status: ${latestLicenseStatus}` : 'No contractor license records found'}</li>
              <li>{registrations.length > 0 ? `Business registration records found (${registrations.length}) – status: ${latestRegistrationStatus}` : 'No business registration record found'}</li>
            </ul>
            <p>Users should verify the company&#39;s current licensing and registration status through official state agencies before making decisions.</p>
          </SectionCard>

          <SectionCard title="Compliance conclusion">
            {osha.length > 0 ? (
              <p>
                {page.company_name} has {osha.length} recorded OSHA inspection{osha.length > 1 ? 's' : ''}, indicating workplace safety activity
                {page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}.
                {osha.length >= 10 ? ' The volume of inspections may indicate significant operational activity or prior safety incidents.' : ''}
              </p>
            ) : (
              <p>No OSHA inspection records were found in the current public dataset for {page.company_name}.</p>
            )}
            {licenses.length === 0 && registrations.length === 0 ? (
              <p>
                No confirmed contractor license or business registration was identified in the available records.
                Users are advised to verify the company&#39;s license status directly with {stateName} state authorities if needed.
              </p>
            ) : (
              <p>
                Current records indicate contractor license status as <strong>{latestLicenseStatus}</strong> and
                business registration status as <strong>{latestRegistrationStatus}</strong>.
                Users are advised to confirm current standing directly with official {stateName} state sources.
              </p>
            )}
          </SectionCard>

          <SectionCard title="About OSHA records and license status">
            <p>
              OSHA inspection records reflect workplace safety reviews conducted by federal authorities under the
              Occupational Safety and Health Administration. A higher number of OSHA inspections may indicate
              increased operational activity or prior workplace safety incidents at a company.
            </p>
            <p>
              Contractor license status is an important compliance factor when evaluating companies in {stateName},
              especially for construction and other regulated industries. An active license indicates the company
              meets current state licensing requirements. Expired or suspended license status should be verified
              through official {stateName} state licensing authorities.
            </p>
            <p>
              Missing or unknown license records in this dataset do not necessarily mean a company is unlicensed.
              Users are encouraged to cross-reference with the official {stateName} contractor license lookup portal
              for the most current compliance record information.
            </p>
          </SectionCard>

          <SectionCard title="Timeline">
            <ul className="timeline-list">
              {timeline.map((item, idx) => (
                <li key={`${item.event_type}-${item.event_date}-${idx}`}>
                  <strong>{formatDate(item.event_date)}</strong> · {item.event_type}
                  {item.detail && item.detail !== 'Inspection record' ? ` · ${item.detail}` : ''}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Sources">
            <p>Source: OSHA public records</p>
            <p>Source: State contractor license records</p>
            <p>Source: Secretary of State records</p>
          </SectionCard>
        </div>

        <aside className="company-side">
          <SectionCard title="On this page">
            <p><a href="#osha-records">OSHA records</a></p>
            <p><a href="#license-records">License records</a></p>
            <p><a href="#registration-records">Registration records</a></p>
          </SectionCard>

          <SectionCard title="Related companies">
            <ul>
              {related.map((c) => (
                <li key={c.slug}><a href={c.slug}>{c.company_name}</a></li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="FAQ">
            <p><strong>What does this page show?</strong><br />A combined view of public OSHA inspection history, contractor license status, and business registration compliance records for {page.company_name}{page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}.</p>
            <p><strong>Does {page.company_name} have OSHA violations?</strong><br />{oshaFaqAnswer}</p>
            <p><strong>What is the contractor license status for {page.company_name}?</strong><br />
              {licenses.length > 0
                ? `Contractor license records are on file showing status: ${latestLicenseStatus}. Verify current standing through official ${stateName} state sources.`
                : `No contractor license records were found in the current dataset for ${page.company_name} in ${stateName}. Check the official state licensing portal for the most current information.`
              }
            </p>
            <p><strong>Is {page.company_name} registered as a business in {stateName}?</strong><br />
              {registrations.length > 0
                ? `Business registration records are available, showing status: ${latestRegistrationStatus}.`
                : `No business registration records were found in the current dataset. Verify through the ${stateName} Secretary of State directly.`
              }
            </p>
            <p><strong>How often is this compliance data updated?</strong><br />Records are refreshed on periodic cycles based on source availability from official government agencies including OSHA and state licensing bodies.</p>
            <p><strong>Is this data from official sources?</strong><br />Yes. All OSHA inspection data, contractor license records, and business registration information is sourced from official public government agencies.</p>
          </SectionCard>
        </aside>
      </section>
    </main>
  );
}

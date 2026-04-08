import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Breadcrumbs from '../../../components/common/Breadcrumbs';
import DecisionSupportLayers, { buildBottomLineAssessment } from '../../../components/company/DecisionSupportLayers';
import PageTitle from '../../../components/common/PageTitle';
import SectionCard from '../../../components/common/SectionCard';
import StatusBadge from '../../../components/common/StatusBadge';
import BreadcrumbJsonLd from '../../../components/seo/BreadcrumbJsonLd';
import { canonicalFilterPath } from '../../../lib/indexing';
import { isReleasedCompanyLocation } from '../../../lib/release';
import {
  getCityComplianceBenchmark,
  getCompanyDetailedLocation,
  getCompanyBySlug,
  getCompanyBySlugForRouting,
  getCompanyTimeline,
  getLicensesByCompany,
  getOshaByCompany,
  getRelatedCompanies,
  getRegistrationsByCompany,
} from '../../../lib/queries';
import { companyPathFromSlug, formatDate, formatMoney, normalizeStateSlug, SITE_URL } from '../../../lib/site';
import { fetchCompanySnapshot } from '../../../lib/companySnapshot';

export const revalidate = 86400;
export const dynamicParams = true; // 未预渲染的页面按需渲染（ISR）

export async function generateStaticParams() {
  // 参考 wangzhan：避免构建期生成过多动态路由，全部改为按需 ISR
  return [];
}

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

function isLikelyRealCompanyName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^-?\s*select\s*-?$/i.test(trimmed)) return false;
  if (/^\d+[\w\s-]*$/.test(trimmed)) return false;
  // Only reject actual street addresses that begin with a house number
  if (/^\d+\s+\w+.*\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr)\b/i.test(trimmed)) return false;
  // Only reject code-like strings with no spaces (e.g. "ABCD1234XYZ")
  if (/^[A-Z0-9-]{10,}$/.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRiskScore(input: {
  oshaCount: number;
  injuryEvents: number;
  fatalityEvents: number;
  licenseStatus: string;
  hasRegistration: boolean;
  isEntityLikelyReal: boolean;
}): { score: number; level: 'Low Risk' | 'Moderate Risk' | 'High Risk'; factors: string[] } {
  let score = 100;
  const factors: string[] = [];
  const license = input.licenseStatus.toLowerCase();

  if (!input.isEntityLikelyReal) {
    score -= 18;
    factors.push('Entity name pattern appears low-confidence and requires manual verification');
  }

  if (input.oshaCount >= 10) {
    score -= 18;
    factors.push(`High OSHA inspection count (${input.oshaCount})`);
  } else if (input.oshaCount >= 3) {
    score -= 10;
    factors.push(`Moderate OSHA inspection activity (${input.oshaCount})`);
  }

  if (input.injuryEvents > 0) {
    score -= 12;
    factors.push(`Injury-linked OSHA records (${input.injuryEvents})`);
  }

  if (input.fatalityEvents > 0) {
    score -= 20;
    factors.push(`Fatality-linked OSHA records (${input.fatalityEvents})`);
  }

  if (license === 'active') {
    score += 8;
    factors.push('Active contractor license signal');
  } else if (license === 'expired') {
    score -= 14;
    factors.push('Expired contractor license signal');
  } else if (license === 'suspended' || license === 'revoked') {
    score -= 24;
    factors.push('Suspended or revoked license signal');
  } else {
    score -= 10;
    factors.push('License status missing or unknown in current dataset');
  }

  if (!input.hasRegistration) {
    score -= 8;
    factors.push('Business registration status not verified in current dataset');
  }

  score = clamp(score, 1, 100);

  const level = score >= 75 ? 'Low Risk' : score >= 50 ? 'Moderate Risk' : 'High Risk';
  return { score, level, factors };
}

function getOfficialVerificationLinks(stateName: string): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [
    { label: 'OSHA Establishment Search', url: 'https://www.osha.gov/establishment-search' },
  ];

  if (stateName.toLowerCase() === 'california') {
    links.push(
      { label: 'California Contractor License Lookup (CSLB)', url: 'https://www2.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx' },
      { label: 'California Secretary of State Business Search', url: 'https://bizfileonline.sos.ca.gov/search/business' }
    );
  } else {
    links.push(
      { label: `${stateName} Secretary of State Business Search`, url: 'https://www.nass.org/business-services' },
      { label: `${stateName} License Verification (State Portal Index)`, url: 'https://www.nascla.org/' }
    );
  }

  return links;
}

function toCitySlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);

  // ── 优先读快照（Supabase Storage），快照不存在时降级查 DB ──
  const snapshot = await fetchCompanySnapshot(slug);
  const routePage = snapshot?.routing ?? await getCompanyBySlugForRouting(fullSlug);

  if (!routePage) return { title: 'Company not found' };
  if (!snapshot && !(await isReleasedCompanyLocation(routePage.state, routePage.city))) {
    return {
      title: { absolute: 'Company records | Compliance Lookup' },
      robots: { index: false, follow: false },
      alternates: { canonical: `/state/${normalizeStateSlug(routePage.state)}` },
    };
  }

  const page = snapshot?.detail ?? await getCompanyBySlug(fullSlug);
  if (!page) return { title: 'Company not found' };
  const entityLooksReal = isLikelyRealCompanyName(page.company_name);
  const stateName = fullStateName(page.state);
  const stateCode = Object.entries(STATE_CODE_TO_NAME).find(([, v]) => v === stateName)?.[0] ?? stateName;
  const [osha, licenses, registrations] = snapshot
    ? [snapshot.osha, snapshot.licenses, snapshot.registrations]
    : await Promise.all([
        getOshaByCompany(page.company_name, page.state, 200),
        getLicensesByCompany(page.company_name, page.state, 200),
        getRegistrationsByCompany(page.company_name, page.state, 200),
      ]);

  const hasOsha = osha.length > 0;
  const hasLicense = licenses.length > 0;
  const hasRegistration = registrations.length > 0;
  const sourceCount = [hasOsha, hasLicense, hasRegistration].filter(Boolean).length;
  const location = page.city ? `${page.city}, ${stateName}` : stateName;
  const companyName = page.company_name;

  // Use state abbreviation to keep titles concise
  const cityPart = page.city ? ` – ${page.city}, ${stateCode}` : ` – ${stateCode}`;
  const MAX_TITLE_LENGTH = 60;
  const MAX_NAME_IN_DESCRIPTION = 52;
  const nameForDescription = companyName.length > MAX_NAME_IN_DESCRIPTION
    ? companyName.substring(0, MAX_NAME_IN_DESCRIPTION - 1).trim() + '\u2026'
    : companyName;

  function composeCompactTitle(suffix: string): string {
    const reserved = suffix.length;
    const maxNameLength = Math.max(12, MAX_TITLE_LENGTH - reserved);
    const compactName = companyName.length > maxNameLength
      ? companyName.substring(0, maxNameLength - 1).trim() + '\u2026'
      : companyName;
    return `${compactName}${suffix}`;
  }

  let title = composeCompactTitle(` – Public Compliance${cityPart}`);
  let description = `${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}: OSHA, contractor license, and registration data from official public sources.`;

  if (hasOsha && hasLicense && hasRegistration) {
    title = composeCompactTitle(` OSHA & License Records${cityPart}`);
    description = `${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}: OSHA records, contractor license status, and registration data from official sources.`;
  } else if (hasOsha && !hasLicense && !hasRegistration) {
    title = composeCompactTitle(` OSHA Inspection Records${cityPart}`);
    description = `${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}: OSHA inspection records and workplace safety history from official sources.`;
  } else if (!hasOsha && hasLicense && !hasRegistration) {
    title = composeCompactTitle(` Contractor License Status${cityPart}`);
    description = `Contractor license status for ${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}. Active, expired, or suspended records from official sources.`;
  } else if (!hasOsha && !hasLicense && hasRegistration) {
    title = composeCompactTitle(` Business Registration${cityPart}`);
    description = `${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}: business registration status and entity filing records from official sources.`;
  } else if (sourceCount === 2) {
    title = composeCompactTitle(` OSHA & Compliance Records${cityPart}`);
    description = `${nameForDescription}${page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}: OSHA inspection history and compliance records from official public data.`;
  }

  return {
    title: { absolute: title },
    description,
    robots: entityLooksReal ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: page.slug,
    },
    authors: [{ name: 'Compliance Lookup Editorial Team' }],
    creator: 'Compliance Lookup Data Team',
    publisher: 'Compliance Lookup',
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fullSlug = companyPathFromSlug(slug);

  // ── 优先读快照（Supabase Storage），快照不存在时降级查 DB ──
  const snapshot = await fetchCompanySnapshot(slug);
  const routePage = snapshot?.routing ?? await getCompanyBySlugForRouting(fullSlug);

  if (!routePage) notFound();
  if (!snapshot && !(await isReleasedCompanyLocation(routePage.state, routePage.city))) {
    redirect(`/state/${normalizeStateSlug(routePage.state)}`);
  }

  const page = snapshot?.detail ?? await getCompanyBySlug(fullSlug);
  if (!page) notFound();

  const [osha, licenses, registrations] = snapshot
    ? [snapshot.osha, snapshot.licenses, snapshot.registrations]
    : await Promise.all([
        getOshaByCompany(page.company_name, page.state, 200),
        getLicensesByCompany(page.company_name, page.state, 200),
        getRegistrationsByCompany(page.company_name, page.state, 200),
      ]);

  const [timeline, related] = snapshot
    ? [snapshot.timeline, snapshot.related]
    : await Promise.all([
        getCompanyTimeline(page.company_name, page.state, 12),
        getRelatedCompanies(page.company_name, page.state, page.city, 6, page.slug),
      ]);

  const [detailedLocation, cityBenchmark] = snapshot
    ? [snapshot.location, snapshot.benchmark]
    : await Promise.all([
        getCompanyDetailedLocation(page.company_name, page.state),
        getCityComplianceBenchmark(page.state, page.city),
      ]);

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
    ? 'No contractor license or business registration records were observed in current datasets.'
    : `Observed records: ${licenses.length} license record${licenses.length > 1 ? 's' : ''} and ${registrations.length} registration record${registrations.length > 1 ? 's' : ''}.`;

  const riskIntro = pickVariant(page.company_name, [
    'Based on available public records, this company has recorded OSHA inspections, indicating past workplace safety activity.',
    'Publicly available compliance data shows OSHA inspection activity for this company, indicating prior workplace safety oversight.',
    'Available government records indicate that this company has OSHA inspection history, reflecting prior workplace safety review.',
  ]);

  const riskFollowUp = licenses.length === 0 && registrations.length === 0
    ? 'However, no active contractor license or confirmed business registration status was found in the current data, which may require further verification through official sources.'
    : `Current records show contractor license status as ${latestLicenseStatus} and business registration status as ${latestRegistrationStatus}; users should still verify current standing through official sources.`;

  const riskConclusion = getRiskConclusion(osha.length);
  const entityLooksReal = isLikelyRealCompanyName(page.company_name);

  const injuryEvents = osha.reduce((acc, row) => {
    const m = row.severity?.match(/^injury_count:(\d+)$/i);
    return acc + Number(m?.[1] ?? 0);
  }, 0);

  const fatalityEvents = osha.reduce((acc, row) => {
    const m = row.severity?.match(/^fatality:(\d+)$/i);
    return acc + Number(m?.[1] ?? 0);
  }, 0);

  const riskScoreResult = getRiskScore({
    oshaCount: osha.length,
    injuryEvents,
    fatalityEvents,
    licenseStatus: latestLicenseStatus,
    hasRegistration: registrations.length > 0,
    isEntityLikelyReal: entityLooksReal,
  });

  const officialVerificationLinks = getOfficialVerificationLinks(stateName);
  const bottomLine = buildBottomLineAssessment({
    riskLevel: riskScoreResult.level,
    score: riskScoreResult.score,
    hasLicense: licenses.length > 0,
    hasRegistration: registrations.length > 0,
    licenseStatus: latestLicenseStatus,
    registrationStatus: latestRegistrationStatus,
    entityLooksReal,
    fatalityEvents,
  });

  const sourceLinks = Array.from(new Set([
    ...osha.map((r) => r.source_url).filter(Boolean),
    ...licenses.map((r) => r.source_url).filter(Boolean),
    ...registrations.map((r) => r.source_url).filter(Boolean),
  ])) as string[];

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

      <SectionCard title="Official verification quick actions">
        <p>
          Use this page for screening, then validate with agency portals before any legal, hiring, or procurement decision.
        </p>
        <ul>
          {officialVerificationLinks.map((item) => (
            <li key={`quick-${item.url}`}><a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{item.label}</a></li>
          ))}
        </ul>
      </SectionCard>

      {!entityLooksReal && (
        <SectionCard title="Entity quality notice">
          <p>
            The entity name on this page appears atypical for a registered business name and may reflect a source formatting artifact.
            Users should confirm legal entity identity directly via official government systems before using this record for decisions.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Company description">
        <p>{locationLine}</p>
        <p>{oshaLine}</p>
        <p>{recordsLine}</p>
        <p>Screening snapshot: OSHA {osha.length} · License {licenses.length} · Registration {registrations.length}.</p>
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
          <p><a href={mapOpenUrl} target="_blank" rel="noopener noreferrer nofollow">View on Google Maps</a></p>
        </SectionCard>
      )}

      <section className="company-layout">
        <div className="company-main">
          <SectionCard title="Compliance Risk Score">
            <p><strong>Compliance Risk Score:</strong> {riskScoreResult.score} / 100 ({riskScoreResult.level})</p>
            <p>This score is a screening signal generated from public records and should be combined with official verification.</p>
            <ul>
              {riskScoreResult.factors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </SectionCard>

          <DecisionSupportLayers
            companyName={page.company_name}
            stateName={stateName}
            bottomLine={bottomLine}
          />

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

          {cityBenchmark && cityBenchmark.cityCompanyCount >= 20 && (
            <SectionCard title={`Benchmark in ${locationCityState}`}>
              <p>
                Average OSHA records in this city dataset: <strong>{cityBenchmark.avgOshaRecords.toFixed(1)}</strong>.
                This company: <strong>{osha.length}</strong>.
              </p>
              <p>
                Active license ratio in local dataset: <strong>{cityBenchmark.activeLicensePct.toFixed(1)}%</strong>.
                This company license status: <strong>{latestLicenseStatus}</strong>.
              </p>
            </SectionCard>
          )}

          <SectionCard title="Decision guidance">
            <p>{riskIntro}</p>
            <p>{riskFollowUp}</p>
            <p>{riskConclusion}</p>
            <p>
              Recommended next step:{' '}
              {latestLicenseStatus.toLowerCase() === 'active' && registrations.length > 0
                ? `Complete agency-portal verification and keep ${page.company_name} in shortlist.`
                : `Run manual verification first using ${stateName} licensing and business registries.`}
            </p>
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
            {!licenses.length && <p>No contractor license entry was observed for this company/state combination.</p>}
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
            {!registrations.length && <p>No business registration entry was observed for this company/state combination.</p>}
          </SectionCard>

          <SectionCard title="Record interpretation">
            <ul>
              <li>{osha.length > 0 ? `OSHA inspection records present (${osha.length})` : 'No OSHA inspection records found in current dataset'}</li>
              <li>{licenses.length > 0 ? `Contractor license status: ${latestLicenseStatus}` : 'No contractor license record found in current dataset'}</li>
              <li>{registrations.length > 0 ? `Business registration status: ${latestRegistrationStatus}` : 'No business registration record found in current dataset'}</li>
            </ul>
            <p>Missing records here should be treated as "not yet observed" and trigger targeted manual verification.</p>
          </SectionCard>

          <SectionCard title="Timeline">
            <ul className="timeline-list">
              {(timeline ?? []).map((item, idx) => (
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
            {sourceLinks.length > 0 && (
              <p>
                Raw source URLs:{' '}
                {sourceLinks.slice(0, 5).map((url, idx) => (
                  <span key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow">Source {idx + 1}</a>
                    {idx < Math.min(sourceLinks.length, 5) - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            )}
            <p><strong>Verify this record on government source portals:</strong></p>
            <ul>
              {officialVerificationLinks.map((item) => (
                <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{item.label}</a></li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Editorial and methodology note">
            <p>
              Maintained by the Compliance Lookup Editorial Team. Data is aggregated from official public sources and normalized for screening use.
            </p>
            <p>
              For high-stakes decisions, official agency records remain the authoritative source of truth.
            </p>
          </SectionCard>

          <SectionCard title="Explore related index views">
            <p>
              <a href={`/state/${normalizeStateSlug(page.state)}`}>State overview</a>
              {page.city ? ` · ` : ''}
              {page.city ? <a href={`/state/${normalizeStateSlug(page.state)}/city/${toCitySlug(page.city)}`}>City screening page</a> : null}
              {' '}· <a href={canonicalFilterPath(normalizeStateSlug(page.state), 'quality')}>Quality ranking</a>
              {' '}· <a href={canonicalFilterPath(normalizeStateSlug(page.state), 'active-licenses')}>Active licenses</a>
              {' '}· <a href={canonicalFilterPath(normalizeStateSlug(page.state), 'osha-violations')}>OSHA records</a>
            </p>
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
              {(related ?? []).map((c) => (
                <li key={c.slug}><a href={c.slug}>{c.company_name}</a></li>
              ))}
            </ul>
            <p>
              <a href={`/state/${normalizeStateSlug(page.state)}`}>State page</a> ·{' '}
              {page.city ? <a href={`/state/${normalizeStateSlug(page.state)}/city/${toCitySlug(page.city)}`}>City page</a> : null}
            </p>
          </SectionCard>

          <SectionCard title="FAQ">
            <p><strong>What does this page show?</strong><br />A combined view of public OSHA inspection history, contractor license status, and business registration compliance records for {page.company_name}{page.city ? ` in ${page.city}, ${stateName}` : ` in ${stateName}`}.</p>
            <p><strong>Does {page.company_name} have OSHA violations?</strong><br />{oshaFaqAnswer}</p>
            <p><strong>Is {page.company_name} legit based on current public data?</strong><br />{bottomLine.plainAnswer}</p>
            <p><strong>What is the contractor license status for {page.company_name}?</strong><br />
              {licenses.length > 0
                ? `Contractor license records are on file showing status: ${latestLicenseStatus}. Verify current standing through ${stateName} state sources.`
                : `No contractor license records were observed in the current dataset for ${page.company_name} in ${stateName}. Check the state licensing portal for the most current information.`
              }
            </p>
            <p><strong>Is {page.company_name} registered as a business in {stateName}?</strong><br />
              {registrations.length > 0
                ? `Business registration records are available, showing status: ${latestRegistrationStatus}.`
                : `No business registration records were observed in the current dataset. Verify through the ${stateName} Secretary of State directly.`
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

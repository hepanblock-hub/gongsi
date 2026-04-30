import type { Metadata } from 'next';
import PageTitle from '../components/common/PageTitle';
import SectionCard from '../components/common/SectionCard';
import JsonLd from '../components/seo/JsonLd';
import { getRecentCompanyPages } from '../lib/queries';
import { fetchRecentSnapshot } from '../lib/rootSnapshot';
import { companyPathFromSlug, SITE_URL } from '../lib/site';

function recordTypeLabel(hasOsha: boolean, hasLicense: boolean, hasRegistration: boolean): string {
  const count = [hasOsha, hasLicense, hasRegistration].filter(Boolean).length;
  if (count === 3) return 'OSHA + License + Registration';
  if (count === 2) return 'Partial (2 sources)';
  if (hasOsha) return 'OSHA only';
  if (hasLicense) return 'License only';
  if (hasRegistration) return 'Registration only';
  return 'Basic listing';
}

export const metadata: Metadata = {
  title: { absolute: 'Compliance Lookup | OSHA, License & Registration Records' },
  description: 'Search public compliance records for companies and contractors. Browse OSHA inspections, contractor licenses, and registration status from official sources.',
  alternates: { canonical: '/' },
};

function shouldAllowRootDbFallback(): boolean {
  const raw = (process.env.ROOT_SNAPSHOT_DB_FALLBACK ?? 'false').toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(raw);
}

export default async function HomePage() {
  let rows = [] as Awaited<ReturnType<typeof getRecentCompanyPages>>;
  const allowDbFallback = shouldAllowRootDbFallback();
  try {
    const snapshot = await fetchRecentSnapshot();
    if (snapshot?.data?.length) {
      rows = snapshot.data;
    } else if (allowDbFallback) {
      rows = await getRecentCompanyPages(30);
    }
  } catch {
    rows = [];
  }
  const popularStates = ['california', 'new-york', 'texas', 'florida'];
  const stateSeoText: Record<string, string> = {
    california: 'California contractor license and OSHA records lookup',
    'new-york': 'New York contractor license and OSHA records lookup',
    texas: 'Texas contractor license and OSHA records lookup',
    florida: 'Florida contractor license and OSHA records lookup',
  };

  const homeUrl = `${SITE_URL}/`;
  const organizationJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${homeUrl}#organization`,
    name: 'Compliance Lookup',
    url: SITE_URL,
    areaServed: 'United States',
  };

  const datasetJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${homeUrl}#dataset`,
    name: 'Compliance Lookup Public Company Compliance Dataset',
    description: 'Aggregated public OSHA inspections, contractor licenses, and business registration records used for company compliance lookup.',
    url: homeUrl,
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    creator: { '@type': 'Organization', '@id': `${homeUrl}#organization` },
    publisher: { '@type': 'Organization', '@id': `${homeUrl}#organization` },
    keywords: ['OSHA', 'contractor license', 'business registration', 'company compliance', 'public records'],
  };

  return (
    <main className="container">
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={datasetJsonLd} />

      <section className="hero-grid">
        <div>
          <PageTitle
            title="Search public compliance records for contractors and companies"
            description="OSHA inspections, contractor licenses, and registration status from official sources."
          />
          <p>
            Compliance Lookup provides access to public compliance records for companies and contractors across the United States.
          </p>
          <p>
            Users can search OSHA inspection records, contractor license status, and company registration data from official government sources.
            This includes workplace safety history, licensing status, and business registration details.
          </p>
          <p>
            The platform helps users verify whether a company has OSHA violations, active licenses, or valid registration records before
            making business or hiring decisions.
          </p>
          <p className="hero-actions">
            <a href="/state/california">Browse states</a> · <a href="/methodology">View methodology</a>
          </p>
        </div>
        <div className="cards cards-hero-right">
          <SectionCard title="OSHA Records">
            <p className="metric">{rows.length} recently updated companies</p>
            <p className="muted">Inspection and violation visibility.</p>
          </SectionCard>
          <SectionCard title="License Status">
            <p className="metric">Active / Expired / Suspended</p>
            <p className="muted">Current licensing snapshot by company.</p>
          </SectionCard>
          <SectionCard title="Registration Status">
            <p className="metric">Active / Inactive / Dissolved</p>
            <p className="muted">Public entity status from state records.</p>
          </SectionCard>
        </div>
      </section>

      <section>
        <SectionCard title="What are OSHA violations and why they matter">
          <p>
            OSHA violations are official records of workplace safety inspections conducted by the Occupational Safety and Health Administration.
            These records can include citations, penalties, and injury-linked inspection outcomes.
          </p>
          <p>
            Checking OSHA history before hiring a contractor, subcontractor, or vendor helps buyers evaluate safety performance and compliance behavior.
            Many users search these records to compare companies, reduce operational risk, and document due diligence in procurement workflows.
          </p>
          <p>
            Compliance Lookup combines OSHA inspection visibility with contractor license and business registration records,
            so users can run a unified company compliance check instead of reviewing disconnected portals one by one.
          </p>
          <ul>
            <li>Verify contractor safety performance before contract award</li>
            <li>Assess risk before hiring by reviewing inspection history</li>
            <li>Compare companies with the same city/state scope</li>
          </ul>
        </SectionCard>
      </section>

      <section className="cards">
        <SectionCard title="OSHA violations lookup tool">
          <p>
            Use this entry when your primary search intent is workplace safety history. It helps you find OSHA-focused company records,
            review inspection counts, and identify injury-linked patterns where available in public datasets.
            This is the fastest route for users searching terms like “OSHA violations lookup” or “OSHA violations by company”.
          </p>
          <p>
            Start here: <a href="/state/california/filter/osha">OSHA violations by company</a>
          </p>
        </SectionCard>
        <SectionCard title="Contractor license lookup by state">
          <p>
            Use this entry when you need license standing validation before hiring. You can quickly review active, expired, suspended,
            or unknown license signals, then continue to official state board verification for final legal status.
            This section supports high-intent queries such as “contractor license lookup” and state-specific checks.
          </p>
          <p>
            Start here: <a href="/state/california/filter/license-only">California contractor license lookup</a> ·{' '}
            <a href="/state/new-york/filter/license-only">New York contractor license lookup</a> ·{' '}
            <a href="/state/texas/filter/license-only">Texas contractor license lookup</a>
          </p>
        </SectionCard>
        <SectionCard title="Business registration verification">
          <p>
            Use this entry to validate whether a company appears with active, inactive, or dissolved registration signals.
            Registration checks are critical for vendor onboarding, procurement compliance, and entity verification workflows,
            especially when multiple similarly named companies exist in the same market.
          </p>
          <p>
            Start here: <a href="/state/california/filter/registration-only">Business registration verification</a>
          </p>
        </SectionCard>
      </section>

      <section>
        <h2>Popular states</h2>
        <div className="state-grid">
          {popularStates.map((state) => (
            <SectionCard key={state}>
              <h3><a href={`/state/${state}`}>{state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</a></h3>
              <p className="muted">{stateSeoText[state] ?? 'Company compliance records lookup by state'}</p>
            </SectionCard>
          ))}
        </div>
      </section>

      <section>
        <h2>Recently updated company records</h2>
        <p className="muted">
          Recently updated company compliance records from public OSHA, licensing, and registration databases.
        </p>
        <table className="recent-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>State</th>
              <th>Record Type</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={r.slug}>
                <td><a href={companyPathFromSlug(r.slug)}>{r.company_name}</a></td>
                <td>{r.state}</td>
                <td>{recordTypeLabel(r.has_osha, r.has_license, r.has_registration)}</td>
                <td>{r.updated_at ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Methodology summary</h2>
        <p>
          This site shows public records only. Data is aggregated from official sources and updated periodically.
          No subjective company ratings are provided.
        </p>
      </section>

      <section className="cards">
        <SectionCard title="Data sources and verification model">
          <p>
            All compliance records on this platform are sourced from official government systems, including OSHA inspection datasets,
            state contractor licensing boards, and Secretary of State business registries.
          </p>
          <p>
            Data is normalized for name matching and updated in periodic ingestion cycles to reflect the latest publicly available records.
            For high-stakes legal or procurement decisions, users should verify final status directly on official agency portals.
          </p>
          <p>
            See: <a href="/methodology">Methodology</a> · <a href="/sources">Official sources</a>
          </p>
        </SectionCard>
        <SectionCard title="Who uses compliance lookup tools">
          <ul>
            <li>Homeowners verifying contractors before hiring</li>
            <li>Businesses screening vendors and subcontractors</li>
            <li>Job seekers reviewing employer safety records</li>
            <li>Procurement teams conducting due diligence</li>
          </ul>
          <p>
            High-intent shortcuts: <a href="/state/california">California contractor license lookup</a> ·{' '}
            <a href="/state/new-york">New York contractor license lookup</a> ·{' '}
            <a href="/state/florida">Florida contractor license lookup</a> ·{' '}
            <a href="/state/new-york/filter/osha">New York OSHA violations by company</a>
          </p>
        </SectionCard>
      </section>

      <section className="cards">
        <SectionCard title="How it works">
          <ol>
            <li>Search a company</li>
            <li>Review public records</li>
            <li>Check official sources</li>
          </ol>
        </SectionCard>
        <SectionCard title="Trust & Sources">
          <p>Official government sources</p>
          <p>Public records only</p>
          <p>Regularly updated</p>
        </SectionCard>
      </section>
    </main>
  );
}

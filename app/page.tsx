import type { Metadata } from 'next';
import PageTitle from '../components/common/PageTitle';
import SectionCard from '../components/common/SectionCard';
import { getRecentCompanyPages } from '../lib/queries';
import { fetchRecentSnapshot } from '../lib/rootSnapshot';

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

export default async function HomePage() {
  let rows = [] as Awaited<ReturnType<typeof getRecentCompanyPages>>;
  try {
    const snapshot = await fetchRecentSnapshot();
    if (snapshot?.data?.length) {
      rows = snapshot.data;
    } else {
      rows = await getRecentCompanyPages(30);
    }
  } catch {
    rows = [];
  }
  const popularStates = ['california'];
  const stateSeoText: Record<string, string> = {
    california: 'California contractor license and OSHA records lookup',
  };

  return (
    <main className="container">
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

      <section className="cards">
        <SectionCard title="Popular searches">
          <ul>
            <li>Search OSHA violations by company name</li>
            <li>Check contractor license status online</li>
            <li>Verify company registration status</li>
            <li>Look up workplace safety records</li>
          </ul>
        </SectionCard>
        <SectionCard title="OSHA Violations">
          <p>Find inspection records, violation types, and penalties.</p>
          <a href="/state/california/filter/osha">Browse OSHA records</a>
        </SectionCard>
        <SectionCard title="Contractor License Status">
          <p>Check active, expired, suspended, or unknown license states.</p>
          <a href="/state/california/filter/license-only">Browse license records</a>
        </SectionCard>
        <SectionCard title="Company Registration Status">
          <p>Review active, inactive, or dissolved registration status.</p>
          <a href="/state/california/filter/registration-only">Browse registration records</a>
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
                <td><a href={r.slug}>{r.company_name}</a></td>
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

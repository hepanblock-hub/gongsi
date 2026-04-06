import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Sources | Official Public Records Used on Compliance Lookup' },
  description: 'View the official government sources used for OSHA inspections, contractor licenses, and business registration records.',
  alternates: {
    canonical: '/sources',
  },
};

export default function SourcesPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Sources' }]} />
      <PageTitle
        title="Data Sources"
        description="Official public records used across the site."
      />

      <section className="source-grid">
        <SectionCard title="OSHA Public Records">
          <p><strong>Agency:</strong> U.S. Department of Labor / OSHA</p>
          <p><strong>Coverage:</strong> inspections, violations, penalties</p>
          <p><strong>Update target:</strong> quarterly</p>
          <p><a href="https://www.osha.gov/data" target="_blank" rel="noopener noreferrer">Official source</a></p>
        </SectionCard>

        <SectionCard title="State Contractor License Boards">
          <p><strong>Agency:</strong> State licensing authorities</p>
          <p><strong>Coverage:</strong> license number, type, status, dates</p>
          <p><strong>Update target:</strong> 6 months</p>
          <p>Official links vary by state.</p>
        </SectionCard>

        <SectionCard title="Secretary of State Registries">
          <p><strong>Agency:</strong> State business registry offices</p>
          <p><strong>Coverage:</strong> registration status, dates, agent</p>
          <p><strong>Update target:</strong> 6–12 months</p>
          <p>Official links vary by state.</p>
        </SectionCard>
      </section>

      <SectionCard title="Update policy">
        <p>We refresh data based on source publication cadence. Some records may lag behind source systems.</p>
        <p>Always verify final decisions with official agency websites.</p>
      </SectionCard>

      <SectionCard title="Coverage notes">
        <p>Coverage is expanding by state and source. If a record is missing, it may not yet be ingested.</p>
      </SectionCard>
    </main>
  );
}

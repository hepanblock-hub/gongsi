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
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function SourcesPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Sources' }]} />
      <PageTitle
        title="Data Sources"
        description="Official public records used across the site."
      />

      <SectionCard title="Ownership consistency">
        <p><strong>Operating team:</strong> HEPANBLOCK</p>
        <p><strong>Responsible person:</strong> QI CHEN</p>
        <p>For correction workflow and official contact details, see <a href="/contact">Contact</a>.</p>
      </SectionCard>

      <section className="source-grid">
        <SectionCard title="OSHA Public Records">
          <p><strong>Agency:</strong> U.S. Department of Labor / OSHA</p>
          <p><strong>Coverage:</strong> inspections, violations, penalties</p>
          <p><strong>Update target:</strong> quarterly</p>
          <p><a href="https://www.osha.gov/data" target="_blank" rel="dofollow noopener noreferrer">Official source</a></p>
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

      <SectionCard title="State source links (California, Texas, Florida)">
        <p>Official state-level sources used for contractor license and business registration verification:</p>
        <ul>
          <li>
            <strong>California:</strong>{' '}
            <a href="https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx" target="_blank" rel="dofollow noopener noreferrer">
              CSLB License Check
            </a>
            {' '}·{' '}
            <a href="https://bizfileonline.sos.ca.gov/search/business" target="_blank" rel="dofollow noopener noreferrer">
              California Secretary of State Business Search
            </a>
          </li>
          <li>
            <strong>Texas:</strong>{' '}
            <a href="https://www.sos.state.tx.us/corp/sosda/index.shtml" target="_blank" rel="dofollow noopener noreferrer">
              Texas Secretary of State SOSDirect / Business Filings
            </a>
          </li>
          <li>
            <strong>Florida:</strong>{' '}
            <a href="https://search.sunbiz.org/Inquiry/CorporationSearch/ByName" target="_blank" rel="dofollow noopener noreferrer">
              Florida Sunbiz (Division of Corporations)
            </a>
            {' '}·{' '}
            <a href="https://www.myfloridalicense.com/wl11.asp?mode=0&SID=" target="_blank" rel="dofollow noopener noreferrer">
              Florida DBPR License Lookup
            </a>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Update policy">
        <p>We refresh data based on source publication cadence. Some records may lag behind source systems.</p>
        <p>Always verify final decisions with official agency websites.</p>
      </SectionCard>

      <SectionCard title="Coverage notes">
        <p>Coverage is expanding by state and source. If a record is missing, it may not yet be ingested.</p>
        <p>For data review, authorship, and corrections standards, see <a href="/editorial-policy">Editorial Policy</a>.</p>
      </SectionCard>
    </main>
  );
}

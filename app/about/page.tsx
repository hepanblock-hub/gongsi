import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'About Compliance Lookup | Public Company Records' },
  description: 'Learn what Compliance Lookup does, which public records are included, and how company compliance data is organized and displayed.',
  alternates: { canonical: '/about' },
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function AboutPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <PageTitle
        title="About Compliance Lookup"
        description="Public compliance records search for OSHA, licenses, and registrations."
      />
      <SectionCard title="What is this site?">
        <p>Compliance Lookup is a public records search website for OSHA, contractor license, and company registration status.</p>
        <p>
          Example searches we support include “ABC Roofing LLC license status Florida” and
          “OSHA violations company lookup Texas”.
        </p>
      </SectionCard>
      <SectionCard title="Who is this for?">
        <p>Employers, contractors, researchers, and anyone who needs to verify public compliance history for a company.</p>
      </SectionCard>
      <SectionCard title="Data sources">
        <p>
          Records are aggregated from official sources including{' '}
          <a href="https://www.osha.gov/data" target="_blank" rel="dofollow noopener noreferrer">OSHA</a>,
          {' '}state contractor licensing authorities, and Secretary of State business registries.
        </p>
        <ul>
          <li>
            <strong>Secretary of State examples:</strong>{' '}
            <a href="https://bizfileonline.sos.ca.gov/search/business" target="_blank" rel="dofollow noopener noreferrer">California SOS</a>,{' '}
            <a href="https://www.sos.state.tx.us/corp/sosda/index.shtml" target="_blank" rel="dofollow noopener noreferrer">Texas SOS</a>,{' '}
            <a href="https://search.sunbiz.org/Inquiry/CorporationSearch/ByName" target="_blank" rel="dofollow noopener noreferrer">Florida Sunbiz</a>
          </li>
          <li>
            <strong>State licensing board examples:</strong>{' '}
            <a href="https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx" target="_blank" rel="dofollow noopener noreferrer">California CSLB</a>,{' '}
            <a href="https://www.myfloridalicense.com/wl11.asp?mode=0&SID=" target="_blank" rel="dofollow noopener noreferrer">Florida DBPR</a>,{' '}
            <a href="https://data.ny.gov/resource/ucu3-8265.json" target="_blank" rel="dofollow noopener noreferrer">New York DOS (Appearance & Barber)</a>,{' '}
            <a href="https://data.ny.gov/resource/q35v-e8qb.json" target="_blank" rel="dofollow noopener noreferrer">New York DOS (Manufactured Housing)</a>,{' '}
            <a href="https://data.cityofnewyork.us/resource/ipu4-2q9a.json" target="_blank" rel="dofollow noopener noreferrer">NYC DOB Permit Issuance</a>
          </li>
        </ul>
        <p>See <a href="/sources">Sources</a> for full details.</p>
      </SectionCard>

      <SectionCard title="Who maintains this site">
        <p>Compliance Lookup is operated by a data operations team focused on structured public records aggregation.</p>
        <p><strong>Team:</strong> HEPANBLOCK</p>
        <p><strong>Responsible person:</strong> QI CHEN</p>
        <p>Source links, update cadence, and record limitations are documented publicly so users can verify critical details at the issuing agency.</p>
        <p><strong>Official contact:</strong> <a href="mailto:contact@licensestatuslookup.com">contact@licensestatuslookup.com</a> (full address and response policy on <a href="/contact">Contact</a> page)</p>
      </SectionCard>

      <SectionCard title="How records are displayed">
        <p>
          Each company profile aggregates multiple record types into a structured view,
          including OSHA inspection history, license status, and registration status.
        </p>
        <ul>
          <li><strong>Freshness model:</strong> this is not a real-time mirror of every agency system; publication delay depends on each source cadence.</li>
          <li><strong>Update latency:</strong> some records may appear later than agency portals due to ingestion and validation windows.</li>
          <li><strong>Coverage scope:</strong> not all states and not all record types have equal completeness at all times.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Data boundaries and non-coverage scenarios">
        <ul>
          <li>Some state portals do not expose full historical data or provide unstable query interfaces.</li>
          <li>Certain local-only licenses or municipal permits may be outside current ingestion scope.</li>
          <li>When source identifiers are missing or conflicting, records may be withheld from merged profiles to avoid false attribution.</li>
          <li>Coverage may differ by state and period; absence on this site is not proof that a record does not exist.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Data responsibility and correction process">
        <p><strong>Update responsibility:</strong> We are responsible for scheduled ingestion, normalization checks, and display integrity for indexed records.</p>
        <p><strong>Correction workflow:</strong> When users report a suspected issue, we require source references, validate against official records, and then update or annotate the affected page.</p>
        <p><strong>Final authority:</strong> Official agency records always override this site when differences exist.</p>
        <p><strong>Important:</strong> This site does not provide legal, financial, or employment advice.</p>
        <p>See <a href="/editorial-policy">Editorial Policy</a> for authorship, review, and correction standards.</p>
      </SectionCard>
    </main>
  );
}

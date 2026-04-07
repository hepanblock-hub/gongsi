import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Editorial Policy | Compliance Lookup' },
  description: 'See authorship, review standards, source precedence, corrections handling, and trust policies for Compliance Lookup.',
  alternates: { canonical: '/editorial-policy' },
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function EditorialPolicyPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Editorial Policy' }]} />
      <PageTitle
        title="Editorial Policy"
        description="Authorship, review, corrections, and source trust standards."
      />

      <SectionCard title="Who writes and maintains this site">
        <p>Compliance Lookup pages are maintained by the Compliance Lookup Editorial Team with support from a data operations workflow that ingests and normalizes official public records.</p>
      </SectionCard>

      <SectionCard title="What we publish">
        <p>We publish structured summaries of public OSHA records, contractor license records, and business registration records. We do not publish subjective ratings, legal conclusions, or private personal data.</p>
      </SectionCard>

      <SectionCard title="Source precedence">
        <p>Official agency records always take precedence over this site when differences exist. This site is intended as a screening and research aid, not as a substitute for real-time agency systems.</p>
      </SectionCard>

      <SectionCard title="Review and correction policy">
        <p>Suspected errors are reviewed against the issuing source. When a mismatch is confirmed, the page is corrected, annotated, or reprocessed in the next data refresh cycle.</p>
        <p>Correction requests should include the source record or official link used for verification.</p>
      </SectionCard>

      <SectionCard title="YMYL and decision use">
        <p>Because compliance and licensing records can affect hiring, vendor selection, and legal risk, users should verify final status directly with official agencies before acting.</p>
      </SectionCard>
    </main>
  );
}

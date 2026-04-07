import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Methodology | How Compliance Records Are Collected' },
  description: 'See how public OSHA, contractor license, and registration records are collected, normalized, and updated across our database.',
  alternates: {
    canonical: '/methodology',
  },
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function MethodologyPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Methodology' }]} />
      <PageTitle
        title="Methodology"
        description="How data is collected, normalized, matched, and presented."
      />

      <SectionCard title="How data is collected">
        <p>Data is collected from official public record sources such as OSHA, state license boards, and Secretary of State registries.</p>
      </SectionCard>

      <SectionCard title="How data is normalized">
        <p>Company names are normalized (case/punctuation/legal suffix handling) to support soft matching across datasets.</p>
      </SectionCard>

      <SectionCard title="How matching works">
        <p>Matching is based on normalized company names and state-level context. Results are aggregated conservatively to avoid false precision.</p>
      </SectionCard>

      <SectionCard title="What is not included">
        <p>No subjective ratings, legal opinions, or private personal data are provided.</p>
      </SectionCard>

      <SectionCard title="Update frequency and limitations">
        <p>Refresh intervals vary by source and may introduce delays. Verify critical details directly with the source agency.</p>
      </SectionCard>

      <SectionCard title="Editorial and update accountability">
        <p>Each dataset has an assigned refresh cadence and validation checks before publication.</p>
        <p>When source systems change schema or publication format, ingestion rules are reviewed and adjusted before the next release.</p>
      </SectionCard>

      <SectionCard title="Quality control and correction handling">
        <p>Quality checks include duplicate control, date validity checks, null-value handling, and normalization consistency.</p>
        <p>Reported issues are triaged, source-verified, and resolved through a tracked correction process with data re-run when required.</p>
        <p>Related trust documents: <a href="/sources">Sources</a> · <a href="/editorial-policy">Editorial Policy</a></p>
      </SectionCard>
    </main>
  );
}

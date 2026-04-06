import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'About Compliance Lookup | Public Company Records' },
  description: 'Learn what Compliance Lookup does, which public records are included, and how company compliance data is organized and displayed.',
  alternates: { canonical: '/about' },
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
      </SectionCard>
      <SectionCard title="Who is this for?">
        <p>Employers, contractors, researchers, and anyone who needs to verify public compliance history for a company.</p>
      </SectionCard>
      <SectionCard title="Data sources">
        <p>Records are aggregated from official sources: OSHA, state contractor license boards, and Secretary of State registries.
          See <a href="/sources">Sources</a> for full details.</p>
      </SectionCard>

      <SectionCard title="Who maintains this site">
        <p>Compliance Lookup is maintained by a data operations and editorial review workflow focused on public compliance records.</p>
        <p>Source links, update cadence, and record limitations are documented publicly so users can verify critical details at the issuing agency.</p>
      </SectionCard>

      <SectionCard title="Data responsibility and correction process">
        <p><strong>Update responsibility:</strong> We are responsible for scheduled ingestion, normalization checks, and display integrity for indexed records.</p>
        <p><strong>Correction workflow:</strong> When users report a suspected issue, we require source references, validate against official records, and then update or annotate the affected page.</p>
        <p><strong>Final authority:</strong> Official agency records always override this site when differences exist.</p>
      </SectionCard>
    </main>
  );
}

import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Privacy Policy | Compliance Lookup' },
  description: 'Read how we handle site usage data, public records, and privacy-related information on Compliance Lookup.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Privacy' }]} />
      <PageTitle title="Privacy Policy" description="How this site handles public records and user privacy." />

      <SectionCard title="Public records scope">
        <p>This site displays public records and does not publish private personal data beyond source disclosures.</p>
      </SectionCard>

      <SectionCard title="Data usage">
        <p>Information is used for search, aggregation, and display of public compliance records.</p>
      </SectionCard>

      <SectionCard title="Contact and correction requests">
        <p>If you identify an issue, contact us with official source references for review.</p>
      </SectionCard>
    </main>
  );
}

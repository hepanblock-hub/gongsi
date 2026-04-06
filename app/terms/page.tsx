import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Terms of Service | Compliance Lookup' },
  description: 'Review the terms for using Compliance Lookup, including public records usage, limitations, and site access conditions.',
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Terms' }]} />
      <PageTitle title="Terms" description="Usage terms for this public records search website." />

      <SectionCard title="Reference-only information">
        <p>Information is provided for reference. Verify key details with official sources.</p>
      </SectionCard>

      <SectionCard title="No legal advice">
        <p>Content does not constitute legal, regulatory, or professional advice.</p>
      </SectionCard>

      <SectionCard title="Source priority">
        <p>When conflicts occur, official source records prevail over this site display.</p>
      </SectionCard>
    </main>
  );
}

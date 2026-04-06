import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';
import BreadcrumbJsonLd from '../../components/seo/BreadcrumbJsonLd';
import FaqJsonLd from '../../components/seo/FaqJsonLd';

export const metadata: Metadata = {
  title: { absolute: 'FAQ | Company Compliance Records, OSHA & Licenses' },
  description: 'Find answers about public OSHA inspections, contractor license lookup, business registration status, and how this site works.',
  alternates: {
    canonical: '/faq',
  },
};

export default function FAQPage() {
  const faqItems = [
    {
      question: 'Is this official?',
      answer: 'Records are sourced from official public agencies. Always verify final details at source websites.',
    },
    {
      question: 'How often is data updated?',
      answer: 'OSHA targets quarterly refreshes. License and registration updates run on slower schedules.',
    },
    {
      question: 'Do you cover all states?',
      answer: 'Coverage is expanding. Some states and record types may still be partial.',
    },
    {
      question: 'Is this a rating site?',
      answer: 'No. This site presents public records and source links, not subjective ratings.',
    },
    {
      question: 'How can I request correction?',
      answer: 'Use the contact channel and provide source references. Corrections follow source verification.',
    },
  ];

  return (
    <main className="container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', item: 'http://localhost:39017/' },
          { name: 'FAQ', item: 'http://localhost:39017/faq' },
        ]}
      />
      <FaqJsonLd items={faqItems} />

      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />
      <PageTitle
        title="Frequently Asked Questions"
        description="Common questions about public records, coverage, and updates."
      />

      <SectionCard title="Is this official?">
        <p>Records are sourced from official public agencies. Always verify final details at source websites.</p>
      </SectionCard>

      <SectionCard title="How often is data updated?">
        <p>OSHA targets quarterly refreshes. License and registration updates run on slower schedules.</p>
      </SectionCard>

      <SectionCard title="Do you cover all states?">
        <p>Coverage is expanding. Some states and record types may still be partial.</p>
      </SectionCard>

      <SectionCard title="Is this a rating site?">
        <p>No. This site presents public records and source links, not subjective ratings.</p>
      </SectionCard>

      <SectionCard title="How can I request correction?">
        <p>Use the contact channel and provide source references. Corrections follow source verification.</p>
      </SectionCard>
    </main>
  );
}

import type { Metadata } from 'next';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import PageTitle from '../../components/common/PageTitle';
import SectionCard from '../../components/common/SectionCard';

export const metadata: Metadata = {
  title: { absolute: 'Contact | Compliance Lookup' },
  description: 'Contact Compliance Lookup for correction requests, source verification questions, and data coverage feedback.',
  alternates: {
    canonical: '/contact',
  },
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
};

export default function ContactPage() {
  return (
    <main className="container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
      <PageTitle
        title="Contact"
        description="Correction requests, source verification questions, and compliance-data feedback."
      />

      <SectionCard title="Official contact channel">
        <p><strong>Email:</strong> <a href="mailto:contact@licensestatuslookup.com">contact@licensestatuslookup.com</a></p>
        <p><strong>Operations address:</strong> 134 E Meadowlake Pkwy, Suite B, Swainsboro, GA 30401</p>
        <p><strong>Response target:</strong> 2–5 business days for standard requests.</p>
      </SectionCard>

      <SectionCard title="How to request a correction">
        <p>
          Include the company name, state, and the specific field you believe is incorrect.
          Please attach or cite the relevant official source link used for verification.
        </p>
        <p>
          All correction requests are reviewed against the issuing authority. If a mismatch is confirmed,
          records are corrected, annotated, or queued for reprocessing.
        </p>
      </SectionCard>

      <SectionCard title="Before you submit">
        <p>
          For legal, hiring, vendor approval, or regulatory decisions, always verify final status directly
          on official agency systems.
        </p>
        <p>
          Related trust pages: <a href="/sources">Sources</a> · <a href="/methodology">Methodology</a> · <a href="/editorial-policy">Editorial Policy</a>
        </p>
      </SectionCard>
    </main>
  );
}

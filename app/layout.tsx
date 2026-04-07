import type { Metadata } from 'next';
import AppShell from '../components/layout/AppShell';
import JsonLd from '../components/seo/JsonLd';
import { SITE_URL } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Compliance Lookup – Public Company Records',
    template: '%s',
  },
  description: 'Search public company compliance records: OSHA inspections, contractor license status, and business registration status from official government sources.',
  authors: [{ name: 'Compliance Lookup Editorial Team' }],
  creator: 'Compliance Lookup Data Team',
  publisher: 'Compliance Lookup',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Compliance Lookup',
    locale: 'en_US',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
    },
  },
  category: 'business compliance records',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Compliance Lookup',
            url: SITE_URL,
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

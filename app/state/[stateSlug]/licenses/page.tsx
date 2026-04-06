import { permanentRedirect } from 'next/navigation';

export default async function StateLicensesPage({ params }: { params: Promise<{ stateSlug: string }> }) {
  const { stateSlug } = await params;
  permanentRedirect(`/state/${stateSlug}#license-records`);
}

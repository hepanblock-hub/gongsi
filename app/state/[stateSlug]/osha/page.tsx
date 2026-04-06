import { permanentRedirect } from 'next/navigation';

export default async function StateOshaPage({ params }: { params: Promise<{ stateSlug: string }> }) {
  const { stateSlug } = await params;
  permanentRedirect(`/state/${stateSlug}#osha-records`);
}

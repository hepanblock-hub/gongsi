import { permanentRedirect } from 'next/navigation';

export default async function StateRegistrationsPage({ params }: { params: Promise<{ stateSlug: string }> }) {
  const { stateSlug } = await params;
  permanentRedirect(`/state/${stateSlug}#registration-records`);
}

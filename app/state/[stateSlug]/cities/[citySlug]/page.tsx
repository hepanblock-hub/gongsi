import { permanentRedirect } from 'next/navigation';
import { canonicalCityPath } from '../../../../../lib/indexing';

export const dynamic = 'force-dynamic';

export default async function LegacyStateCityAliasPage({
	params,
}: {
	params: Promise<{ stateSlug: string; citySlug: string }>;
}) {
	const { stateSlug, citySlug } = await params;
	permanentRedirect(canonicalCityPath(stateSlug, citySlug) as never);
}

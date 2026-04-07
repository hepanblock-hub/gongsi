import { permanentRedirect } from 'next/navigation';
import { canonicalFilterPath } from '../../../../lib/indexing';

export const dynamic = 'force-dynamic';

export default async function LegacyStateFilterAliasPage({
	params,
}: {
	params: Promise<{ stateSlug: string; filterSlug: string }>;
}) {
	const { stateSlug, filterSlug } = await params;
	permanentRedirect(canonicalFilterPath(stateSlug, filterSlug) as never);
}

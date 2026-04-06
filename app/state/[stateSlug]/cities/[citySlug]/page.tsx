import StateCityPage, { generateMetadata as generateStateCityMetadata } from '../../city/[citySlug]/page';

export const dynamic = 'force-dynamic';

export const generateMetadata = generateStateCityMetadata;

export default StateCityPage;

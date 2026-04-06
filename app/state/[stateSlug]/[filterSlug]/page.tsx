import StateFilterPage, { generateMetadata as generateStateFilterMetadata } from '../filter/[filterSlug]/page';

export const dynamic = 'force-dynamic';

export const generateMetadata = generateStateFilterMetadata;

export default StateFilterPage;

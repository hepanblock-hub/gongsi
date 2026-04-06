import MobileNav from './MobileNav';
import HeaderSearch from './HeaderSearch';
import { getIndexedStateCitiesMap } from '../../lib/queries';
import { stateSlugToName } from '../../lib/site';

export default async function Header() {
  let citiesByState: Record<string, string[]> = {};
  try {
    citiesByState = await getIndexedStateCitiesMap();
  } catch {
    citiesByState = { california: [] };
  }

  const states = Object.keys(citiesByState)
    .sort()
    .map((slug) => ({ slug, name: stateSlugToName(slug) }));

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="brand">Compliance Lookup</a>

        <HeaderSearch states={states} citiesByState={citiesByState} />

        <nav className="desktop-nav" aria-label="Primary">
          <ul className="nav-list">
            <li><a href="/state/california">States</a></li>
            <li><a href="/state/california/filter/osha">OSHA</a></li>
            <li><a href="/state/california/filter/license-only">Licenses</a></li>
            <li><a href="/sources">Sources</a></li>
            <li><a href="/methodology">Methodology</a></li>
          </ul>
        </nav>

        <div className="mobile-only">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

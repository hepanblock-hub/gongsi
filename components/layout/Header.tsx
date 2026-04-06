import MobileNav from './MobileNav';
import HeaderSearch from './HeaderSearch';
import { getIndexedStateCitiesMap, getIndexedStates } from '../../lib/queries';

export default async function Header() {
  const states = await getIndexedStates();
  const citiesByState = await getIndexedStateCitiesMap();

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

import { Suspense } from 'react';
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
        <a href="/" className="brand" aria-label="Compliance Lookup home">
          <img
            src="/logo-compliance-lookup.svg"
            alt="Compliance Lookup"
            className="brand-logo"
            width={220}
            height={44}
          />
        </a>

        <Suspense fallback={<div className="header-search" aria-hidden="true" />}>
          <HeaderSearch states={states} citiesByState={citiesByState} />
        </Suspense>

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

export default function MobileNav() {
  return (
    <details className="mobile-nav" role="navigation">
      <summary className="mobile-nav-trigger">Menu</summary>
      <div className="mobile-nav-drawer">
        <a href="/search">Search</a>
        <a href="/state/california">States</a>
        <a href="/state/california/filter/osha">OSHA</a>
        <a href="/state/california/filter/license-only">Licenses</a>
        <a href="/sources">Sources</a>
        <a href="/methodology">Methodology</a>
        <a href="/contact">Contact</a>
        <a href="/faq">FAQ</a>
      </div>
    </details>
  );
}

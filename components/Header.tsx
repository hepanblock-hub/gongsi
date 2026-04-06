export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="brand">Compliance Lookup</a>
        <nav>
          <ul className="nav-list">
            <li><a href="/search">Search</a></li>
            <li><a href="/state/california">States</a></li>
            <li><a href="/sources">Sources</a></li>
            <li><a href="/faq">FAQ</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

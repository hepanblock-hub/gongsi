import releasedCitySitemap from '../../data/released-city-sitemap.json';

export default function Footer() {
  const lastDatabaseSync = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const californiaCities = releasedCitySitemap.california ?? [];

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <strong>Compliance Lookup</strong>
          <p className="footer-note">Public records only · Official source links included</p>
          <p className="footer-note">Maintained with documented update responsibility and correction workflow.</p>
          <p className="footer-note">📍 U.S. Data Operations: 134 E Meadowlake Pkwy, Suite B, Swainsboro, GA 30401</p>
          <p className="footer-note">📧 contact@licensestatuslookup.com</p>
          <p className="footer-note">📅 Last Database Sync: {lastDatabaseSync}</p>
        </div>

        <div className="footer-links" aria-label="Footer links">
          <a href="/about">About</a>
          <a href="/sources">Sources</a>
          <a href="/methodology">Methodology</a>
          <a href="/faq">Corrections</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/faq">FAQ</a>
        </div>
      </div>

      <div className="container">
        <p className="footer-note"><strong>City sitemap (released pages only)</strong></p>
        <p className="footer-note">
          {californiaCities.length} California city pages currently released. New city pages are added in controlled batches.
        </p>
        <div className="footer-links" aria-label="City sitemap links">
          {californiaCities.map((city) => (
            <a key={city.slug} href={`/state/california/city/${city.slug}`}>{city.name}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

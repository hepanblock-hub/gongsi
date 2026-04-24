export default function Footer() {
  const lastDatabaseSync = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

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
          <a href="/sitemap-index.xml">Sitemap</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/sources">Sources</a>
          <a href="/methodology">Methodology</a>
          <a href="/contact">Corrections</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/faq">FAQ</a>
        </div>
      </div>
    </footer>
  );
}

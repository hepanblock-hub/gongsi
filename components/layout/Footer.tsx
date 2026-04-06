export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <strong>Compliance Lookup</strong>
          <p className="footer-note">Public records only · Official source links included</p>
          <p className="footer-note">Maintained with documented update responsibility and correction workflow.</p>
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
    </footer>
  );
}

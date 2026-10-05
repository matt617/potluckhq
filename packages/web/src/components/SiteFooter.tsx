import { Link } from 'react-router-dom';

/** Footer for public pages: brand, tagline and legal links. */
export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <Link to="/" className="brand" aria-label="Potluck home">
        <img src="/icon.svg" alt="" width={22} height={22} />
        <span>Potluck</span>
      </Link>
      <nav className="legal-links small" aria-label="Legal">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href="mailto:support@potluckhq.app">Support</a>
      </nav>
    </footer>
  );
}

/** One-line consent notice shown near sign-up calls to action. */
export function ConsentNote() {
  return (
    <p className="small muted consent-note">
      By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
    </p>
  );
}

import { Link } from 'react-router-dom';
import { brandClasses } from '../lib/styles';

/** Footer for public pages: brand, tagline and legal links. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-(--lp-max) flex-wrap items-center justify-between gap-3 border-t border-border px-4 pt-7 pb-10">
      <Link to="/" className={brandClasses} aria-label="Potluck home">
        <img src="/icon.svg" alt="" width={22} height={22} className="rounded-[9px] shadow-paper transition-transform duration-300 ease-spring group-hover:-rotate-8 group-hover:scale-105" />
        <span>Potluck</span>
      </Link>
      <nav className="flex flex-wrap gap-x-[18px] gap-y-1 text-[0.875rem]" aria-label="Legal">
        <FooterLinks />
      </nav>
    </footer>
  );
}

/** One-line consent notice shown near sign-up calls to action. */
export function ConsentNote() {
  return (
    <p className="text-[0.875rem] text-muted-foreground [&_a]:text-inherit">
      By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
    </p>
  );
}

export function FooterLinks() {
  const link = 'text-muted-foreground no-underline hover:text-foreground hover:underline';
  return (
    <>
      <Link to="/privacy" className={link}>
        Privacy
      </Link>
      <Link to="/terms" className={link}>
        Terms
      </Link>
      <a href="mailto:support@potluckhq.app" className={link}>
        Support
      </a>
    </>
  );
}

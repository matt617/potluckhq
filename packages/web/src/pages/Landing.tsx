import { useEffect, useRef, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ChatText, Check, TelegramLogo, WhatsappLogo } from '@phosphor-icons/react';
import { TIER_ORDER, TIERS, formatUsd } from '@potluck/core';
import { ConsentNote, SiteFooter } from '../components/SiteFooter';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { cents } from '../lib/util';

/** Fade-and-rise content into view once, using IntersectionObserver (never scroll listeners). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return root;
}

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

const SAMPLE_INGREDIENTS = [
  { amount: '6', name: 'eggs' },
  { amount: '800 g', name: 'crushed tomatoes' },
  { amount: '1', name: 'red onion, sliced' },
  { amount: '1½ tsp', name: 'smoked paprika', estimated: true },
];

const CONSTRAINTS = [
  { label: 'Travel', on: false },
  { label: 'Long work days', on: true },
  { label: 'Long weekend', on: false },
  { label: 'GLP-1', on: true },
  { label: 'Workout routine', on: false },
  { label: 'Batch cooking', on: true },
];

export function Landing() {
  const { signedIn, publicConfig } = useSession();
  const root = useReveal();
  if (signedIn) return <Navigate to="/book" replace />;

  const tiers = publicConfig?.tiers ?? TIER_ORDER.map((id) => TIERS[id]);
  const start = () => void login('/book');

  return (
    <div className="lp" ref={root}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="lp-nav">
        <a href="/" className="brand" aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Potluck</span>
        </a>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button type="button" className="btn btn-small" onClick={start}>
          Sign in
        </button>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <h1>
              <span>Cooking videos in.</span> <span>Dinner plans out.</span>
            </h1>
            <p className="lp-sub">
              Send a recipe video to the Potluck bot. It writes the recipe, plans the week and builds the shopping list.
            </p>
            <div className="row wrap lp-ctas">
              <button type="button" className="btn btn-primary btn-large" onClick={start}>
                Start free
              </button>
              <a className="lp-textlink" href="#how">
                See how it works <ArrowRight size={16} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
          <div className="lp-hero-media">
            <img
              className="lp-hero-img"
              src="/images/shakshuka.jpg"
              alt="Shakshuka with basil in a cast iron pan, with bread and a fork on a dark table"
              width={1400}
              height={929}
              fetchPriority="high"
            />
            <article className="lp-recipe" aria-label="Example recipe card">
              <h2 className="lp-recipe-title">Shakshuka with basil</h2>
              <p className="muted small num">35 min, serves 4, 21 g protein per serving</p>
              <ul className="ingredients lp-recipe-list">
                {SAMPLE_INGREDIENTS.map((i) => (
                  <li key={i.name}>
                    <span className="amount">{i.amount}</span>
                    <span>
                      {i.name}
                      {i.estimated && <span className="badge badge-warn">estimated</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section id="how" className="lp-section lp-how" aria-labelledby="how-title">
          <h2 id="how-title" className="lp-h2 reveal">
            From a link in a group chat to a plan on the fridge.
          </h2>
          <ol className="lp-steps">
            <li className="reveal" style={stagger(0)}>
              <h3>Send</h3>
              <p>Share a TikTok, Reel, YouTube Short or recipe site, or snap a cookbook page. Use the chat you already have open.</p>
              <div className="lp-channels" aria-label="Works with">
                <span>
                  <TelegramLogo size={18} weight="fill" aria-hidden /> Telegram
                </span>
                <span>
                  <WhatsappLogo size={18} weight="fill" aria-hidden /> WhatsApp
                </span>
                <span>
                  <ChatText size={18} weight="fill" aria-hidden /> Text message
                </span>
              </div>
            </li>
            <li className="reveal" style={stagger(1)}>
              <h3>Read</h3>
              <p>Gemini watches the whole video, captions included, and writes exact amounts and steps. Anything the creator skipped is estimated and flagged.</p>
            </li>
            <li className="reveal" style={stagger(2)}>
              <h3>Plan</h3>
              <p>Add recipes to the week with the people you cook for. Every ingredient merges into one list, sorted by aisle.</p>
            </li>
          </ol>
        </section>

        <section className="lp-section" aria-labelledby="bento-title">
          <h2 id="bento-title" className="lp-h2 reveal">
            Built for the week you actually have.
          </h2>
          <div className="lp-bento">
            <div className="lp-tile lp-tile-plan reveal" style={stagger(0)}>
              <h3>Plans that work around your schedule</h3>
              <p>Tell Potluck what the week looks like. It builds a plan from your own recipe book and explains why.</p>
              <div className="chips" aria-label="Example planning constraints">
                {CONSTRAINTS.map((c) => (
                  <span key={c.label} className={`chip${c.on ? ' chip-on' : ''}`}>
                    {c.on && <Check size={14} weight="bold" aria-hidden />} {c.label}
                  </span>
                ))}
              </div>
              <p className="small muted">GLP-1 suggestions are general guidance, not medical advice.</p>
            </div>

            <div className="lp-tile lp-tile-list reveal" style={stagger(1)}>
              <img src="/images/prep.jpg" alt="Halved red onion, parsley and peppercorns on a wooden cutting board" width={960} height={636} loading="lazy" />
              <div className="lp-tile-body">
                <h3>One list, sorted by aisle</h3>
                <ul className="lp-mini-list" aria-label="Example shopping list">
                  <li>
                    <span className="lp-box lp-box-on" aria-hidden>
                      <Check size={12} weight="bold" />
                    </span>
                    <s>Red onions</s>
                    <span className="num muted">3</span>
                  </li>
                  <li>
                    <span className="lp-box" aria-hidden />
                    Flat-leaf parsley<span className="num muted">1 bunch</span>
                  </li>
                  <li>
                    <span className="lp-box" aria-hidden />
                    Feta<span className="num muted">200 g</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="lp-tile lp-tile-people reveal" style={stagger(2)}>
              <h3>One book for your people</h3>
              <p>A household, an office kitchen, a group of friends. Everyone adds recipes and edits the same plan.</p>
            </div>

            <div className="lp-tile lp-tile-leftovers reveal" style={stagger(3)}>
              <h3>Leftovers, planned on purpose</h3>
              <p>Cook a big pot on Sunday and eat it again Tuesday. Potluck buys for both meals once.</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="lp-section" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="lp-h2 reveal">
            Free for two. Room to grow.
          </h2>
          <div className="lp-pricing">
            {tiers.map((t, i) => {
              const featured = t.id === 'plus';
              return (
                <div key={t.id} className={`lp-price reveal${featured ? ' lp-price-featured' : ''}`} style={stagger(i)}>
                  <div className="lp-price-head">
                    <h3>
                      {t.name}
                      {featured && <span className="badge badge-ok">most households</span>}
                    </h3>
                    <p className="lp-price-amount num">
                      {t.priceCents ? cents(t.priceCents) : '$0'}
                      <span className="muted small">/month</span>
                    </p>
                  </div>
                  <ul className="lp-price-features">
                    <li>
                      {t.maxCommunities} {t.maxCommunities === 1 ? 'community' : 'communities'}
                    </li>
                    <li>Up to {t.maxMembersPerCommunity} people in each</li>
                    <li>{t.importsPerMonth} recipe imports a month</li>
                    <li>{t.aiFeatures ? `AI meal planning, ${formatUsd(t.aiAllowanceMicros)} of AI use included` : 'Plan and shop by hand'}</li>
                  </ul>
                  <button
                    type="button"
                    className={`btn ${featured ? 'btn-primary' : ''}`}
                    onClick={() => void login(t.priceCents ? '/account#billing' : '/book')}
                  >
                    {t.priceCents ? `Choose ${t.name}` : 'Start free'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="reveal stack">
            <p className="muted small">Used your AI allowance early? Add credits from $5 any time. Paid plans renew monthly until you cancel.</p>
            <ConsentNote />
          </div>
        </section>

        <section className="lp-section lp-final reveal">
          <h2 className="lp-h2">Start with tonight's dinner.</h2>
          <div className="stack lp-final-cta">
            <button type="button" className="btn btn-primary btn-large" onClick={start}>
              Start free
            </button>
            <ConsentNote />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

import { useEffect, useRef, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ChatText, Check, TelegramLogo, WhatsappLogo } from '@phosphor-icons/react';
import { TIER_ORDER, TIERS, formatUsd } from '@potluck/core';
import { ConsentNote, SiteFooter } from '../components/SiteFooter';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { cents } from '../lib/util';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  { label: 'Quick meals', on: true },
  { label: 'Budget', on: false },
  { label: 'Batch cooking', on: true },
];

export function Landing() {
  const { signedIn, publicConfig } = useSession();
  const root = useReveal();
  if (signedIn) return <Navigate to="/week" replace />;

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
        <button type="button" className={cn(buttonVariants({ size: 'sm' }), 'ml-auto min-[720px]:ml-0')} onClick={start}>
          Sign in
        </button>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <h1>
              <span>The recipes you save.</span>{' '}
              <span>
                The meals you <em>share.</em>
              </span>
            </h1>
            <p className="lp-sub">Save recipes from videos, websites or photos. Plan meals and share a shopping list with your household.</p>
            <div className="flex items-center flex-wrap lp-ctas">
              <button type="button" className={buttonVariants({ variant: 'default', size: 'lg' })} onClick={start}>
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
              <p className="text-muted-foreground text-[0.875rem] tabular-nums">35 min, serves 4, 21 g protein per serving</p>
              <ul className="mx-0 mt-2.5 mb-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[4.5em_1fr] [&_li]:gap-2.5 [&_li]:px-0 [&_li]:py-2.5 [&_li]:text-[0.92rem] [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
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
            From a saved recipe to dinner together.
          </h2>
          <ol className="lp-steps">
            <li className="reveal" style={stagger(0)}>
              <h3>Send</h3>
              <p>Paste a recipe link or upload a cookbook photo. Optionally link a private chat with the Potluck bot for easy forwarding.</p>
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
              <p>Potluck reads the recipe and organizes the ingredients and steps. Estimated amounts are flagged for you to review.</p>
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
              <div className="mt-auto flex flex-wrap gap-2 pt-2" aria-label="Example planning constraints">
                {CONSTRAINTS.map((c) => (
                  <span key={c.label} className={`chip${c.on ? ' chip-on' : ''}`}>
                    {c.on && <Check size={14} weight="bold" aria-hidden />} {c.label}
                  </span>
                ))}
              </div>
              <p className="text-[0.875rem] text-muted-foreground">Choose who’s eating, then review the suggested meals before saving.</p>
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
                    <span className="tabular-nums text-muted-foreground">3</span>
                  </li>
                  <li>
                    <span className="lp-box" aria-hidden />
                    Flat-leaf parsley<span className="tabular-nums text-muted-foreground">1 bunch</span>
                  </li>
                  <li>
                    <span className="lp-box" aria-hidden />
                    Feta<span className="tabular-nums text-muted-foreground">200 g</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="lp-tile lp-tile-people reveal" style={stagger(2)}>
              <h3>One book for your people</h3>
              <p>
                Save recipes, choose meals and shop with your household. Separate recipe circles let friends exchange ideas while keeping their own kitchens.
              </p>
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
                    <p className="lp-price-amount tabular-nums">
                      {t.priceCents ? cents(t.priceCents) : '$0'}
                      <span className="text-muted-foreground text-[0.875rem]">/month</span>
                    </p>
                  </div>
                  <ul className="lp-price-features">
                    <li>
                      {t.maxCommunities} {t.maxCommunities === 1 ? 'kitchen you own' : 'kitchens you own'}
                    </li>
                    <li>Up to {t.maxMembersPerCommunity} people in each</li>
                    <li>{t.importsPerMonth} imports a month across your kitchens and circles</li>
                    <li>{t.aiFeatures ? 'AI meal planning for your kitchens' : 'Manual planning and shared shopping'}</li>
                    <li>3 recipe circles, up to 20 members each</li>
                  </ul>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: featured ? 'default' : 'outline' }), 'w-full')}
                    onClick={() => void login(t.priceCents ? '/account#billing' : '/book')}
                  >
                    {t.priceCents ? `Choose ${t.name}` : 'Start free'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="reveal flex flex-col gap-3">
            <p className="text-muted-foreground text-[0.875rem]">
              Each owner’s paid plan includes $2 of monthly AI usage across their kitchens and circles. Imports and AI planning share that allowance; additional
              credits start at $5. Paid plans renew monthly until cancelled.
            </p>
            <ConsentNote />
          </div>
        </section>

        <section className="lp-section lp-final reveal">
          <h2 className="lp-h2">Start with tonight's dinner.</h2>
          <div className="flex flex-col lp-final-cta">
            <button type="button" className={buttonVariants({ variant: 'default', size: 'lg' })} onClick={start}>
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

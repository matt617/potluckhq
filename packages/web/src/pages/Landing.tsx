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
import { brandClasses, metaBadge } from '../lib/styles';

/** Fade-and-rise content into view once, using IntersectionObserver (never scroll listeners). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [];
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => (el.dataset.revealed = ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.revealed = '';
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
    <div
      className="min-h-[100dvh] [overflow-x:clip] [--lp-max:1180px] [&_main]:mx-auto [&_main]:max-w-[var(--lp-max)] [&_main]:px-[var(--gutter)] [&_main]:py-0"
      ref={root}
    >
      <a
        className="absolute -top-[60px] left-3 z-[var(--z-skip)] rounded-full bg-ink px-4 py-2.5 font-medium text-ink-foreground focus:top-3 focus:text-ink-foreground"
        href="#main"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center gap-6 border-b border-transparent px-[max(var(--gutter),_calc((100vw_-_var(--lp-max))_/_2))] py-0 [backdrop-filter:blur(12px)] [background:color-mix(in_srgb,_var(--bg)_86%,_transparent)]">
        <a href="/" className={cn(brandClasses, 'text-[1.5rem]')} aria-label="Potluck home">
          <img
            src="/icon.svg"
            alt=""
            width={28}
            height={28}
            className="rounded-[9px] shadow-paper transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:-rotate-8"
          />
          <span className="max-[420px]:hidden">Potluck</span>
        </a>
        <nav
          className="ml-[auto] hidden gap-1 min-[720px]:flex [&_a]:rounded-md [&_a]:px-3 [&_a]:py-2 [&_a]:text-[0.94rem] [&_a]:text-muted-foreground [&_a]:no-underline [&_a:hover]:bg-surface-2 [&_a:hover]:text-foreground"
          aria-label="Sections"
        >
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button type="button" className={cn(buttonVariants({ size: 'sm' }), 'ml-auto min-[720px]:ml-0')} onClick={start}>
          Sign in
        </button>
      </header>

      <main id="main">
        <section className="relative grid items-center gap-10 px-0 pt-8 pb-[72px] before:pointer-events-none before:absolute before:top-[-10%] before:right-[-20%] before:z-[-1] before:aspect-square before:w-[70%] before:rounded-full before:[filter:blur(40px)] before:[content:''] before:[background:radial-gradient(closest-side,_color-mix(in_srgb,_var(--accent)_22%,_transparent),_transparent)] min-[960px]:grid-cols-[minmax(0,_0.95fr)_minmax(0,_1.05fr)] min-[960px]:gap-14 min-[960px]:px-0 min-[960px]:pt-14 min-[960px]:pb-[120px] [&_h1]:font-serif [&_h1]:text-[clamp(2.8rem,_6vw,_5rem)] [&_h1]:leading-[0.98] [&_h1]:font-[520] [&_h1]:tracking-[-0.035em] [&_h1]:[font-variation-settings:'SOFT'_50,_'WONK'_0] [&_h1_em]:font-[450] [&_h1_em]:[font-variation-settings:'SOFT'_100,_'WONK'_1] min-[560px]:[&_h1_span]:block min-[560px]:[&_h1_span]:whitespace-nowrap">
          <div className="[&>*]:[animation:lp-enter_800ms_var(--ease)_both] [&>:nth-child(2)]:[animation-delay:80ms] [&>:nth-child(3)]:[animation-delay:160ms]">
            <h1>
              <span>The recipes you save.</span>{' '}
              <span>
                The meals you <em>share.</em>
              </span>
            </h1>
            <p className="mt-[22px] max-w-[40ch] text-[clamp(1.05rem,_1.6vw,_1.2rem)] leading-[1.55] text-foreground-2">
              Save recipes from videos, websites or photos. Plan meals and share a shopping list with your household.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button type="button" className={buttonVariants({ variant: 'default', size: 'lg' })} onClick={start}>
                Start free
              </button>
              <a
                className="inline-flex items-center gap-1.5 font-medium text-foreground no-underline [&_svg]:[transition:transform_200ms_var(--ease)] [&:hover_svg]:[transform:translateX(3px)]"
                href="#how"
              >
                See how it works <ArrowRight size={16} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
          <div className="relative [animation:lp-enter_900ms_var(--ease)_120ms_both]">
            <img
              className="aspect-[4/3] h-[calc(100dvh_-_260px)] max-h-[calc(100dvh_-_260px)] min-h-[300px] w-full rounded-xl object-cover [object-position:62%_60%] shadow-float"
              src="/images/shakshuka.jpg"
              alt="Shakshuka with basil in a cast iron pan, with bread and a fork on a dark table"
              width={1400}
              height={929}
              fetchPriority="high"
            />
            <article
              className="relative mt-[-64px] mr-4 mb-0 ml-[auto] w-[min(340px,_calc(100%_-_32px))] [transform:rotate(-1.5deg)] rounded-lg border border-border bg-card px-[22px] pt-5 pb-2.5 shadow-float [transition:transform_500ms_var(--spring)] hover:[transform:rotate(0deg)_translateY(-4px)] min-[960px]:absolute min-[960px]:-bottom-10 min-[960px]:-left-12 min-[960px]:m-0"
              aria-label="Example recipe card"
            >
              <h2 className="mb-0.5 text-[1.35rem]">Shakshuka with basil</h2>
              <p className="text-[0.875rem] text-muted-foreground tabular-nums">35 min, serves 4, 21 g protein per serving</p>
              <ul className="mx-0 mt-2.5 mb-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[4.5em_1fr] [&_li]:gap-2.5 [&_li]:px-0 [&_li]:py-2.5 [&_li]:text-[0.92rem] [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
                {SAMPLE_INGREDIENTS.map((i) => (
                  <li key={i.name}>
                    <span className="pt-[1px] font-mono text-[0.88rem] font-medium text-accent-foreground tabular-nums">{i.amount}</span>
                    <span>
                      {i.name}
                      {i.estimated && <span className={cn(metaBadge, 'ml-1 bg-warning-soft text-warning-foreground')}>estimated</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section
          id="how"
          className="px-0 py-[72px] [border-top:1px_dashed_var(--border-strong)] min-[960px]:px-0 min-[960px]:pt-[112px] min-[960px]:pb-[120px]"
          aria-labelledby="how-title"
        >
          <h2
            id="how-title"
            data-reveal
            className="mb-12 max-w-[20ch] [transform:translateY(12px)] text-[clamp(2rem,_4.4vw,_3.4rem)] leading-[1.02] font-[520] tracking-[-0.03em] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
          >
            From a saved recipe to dinner together.
          </h2>
          <ol className="m-0 grid list-none gap-9 p-0 [counter-reset:lp-step] wide:grid-cols-[1.25fr_1fr_1fr] wide:gap-12 [&_h3]:font-serif [&_h3]:text-[2rem] [&_h3]:font-[550] [&_h3]:tracking-[-0.03em] [&_li]:flex [&_li]:flex-col [&_li]:gap-2.5 [&_li]:pt-0 [&_li]:[border-top:0] [&_li]:[counter-increment:lp-step] [&_li::before]:mb-1.5 [&_li::before]:border-b-[2px] [&_li::before]:border-foreground [&_li::before]:pb-3.5 [&_li::before]:font-serif [&_li::before]:text-[1.1rem] [&_li::before]:text-accent-foreground [&_li::before]:italic [&_li::before]:[content:'0'_counter(lp-step)] [&_p]:max-w-[42ch] [&_p]:text-foreground-2">
            <li
              data-reveal
              className="[transform:translateY(12px)] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
              style={stagger(0)}
            >
              <h3>Send</h3>
              <p>Paste a recipe link or upload a cookbook photo. Optionally link a private chat with the Potluck bot for easy forwarding.</p>
              <div
                className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2 text-[0.9rem] text-muted-foreground [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5"
                aria-label="Works with"
              >
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
            <li
              data-reveal
              className="[transform:translateY(12px)] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
              style={stagger(1)}
            >
              <h3>Read</h3>
              <p>Potluck reads the recipe and organizes the ingredients and steps. Estimated amounts are flagged for you to review.</p>
            </li>
            <li
              data-reveal
              className="[transform:translateY(12px)] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
              style={stagger(2)}
            >
              <h3>Plan</h3>
              <p>Add recipes to the week with the people you cook for. Every ingredient merges into one list, sorted by aisle.</p>
            </li>
          </ol>
        </section>

        <section
          className="px-0 py-[72px] [border-top:1px_dashed_var(--border-strong)] min-[960px]:px-0 min-[960px]:pt-[112px] min-[960px]:pb-[120px]"
          aria-labelledby="bento-title"
        >
          <h2
            id="bento-title"
            data-reveal
            className="mb-12 max-w-[20ch] [transform:translateY(12px)] text-[clamp(2rem,_4.4vw,_3.4rem)] leading-[1.02] font-[520] tracking-[-0.03em] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
          >
            Built for the week you actually have.
          </h2>
          <div className="grid gap-4 wide:[grid-auto-rows:minmax(200px,_auto)] wide:grid-cols-[repeat(6,_1fr)]">
            <div
              data-reveal
              className="flex [transform:translateY(12px)] flex-col gap-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,_var(--accent)_18%,_transparent)] p-7 opacity-0 shadow-paper [transition-delay:calc(var(--i,0)*80ms)] [background:radial-gradient(90%_120%_at_100%_0%,_color-mix(in_srgb,_var(--accent)_16%,_transparent),_transparent_60%),_var(--accent-soft)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100 wide:col-[span_4] [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550] [&_h3]:tracking-[-0.02em] [&_p]:max-w-[46ch] [&_p]:text-foreground-2"
              style={stagger(0)}
            >
              <h3>Plans that work around your schedule</h3>
              <p>Tell Potluck what the week looks like. It builds a plan from your own recipe book and explains why.</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2" aria-label="Example planning constraints">
                {CONSTRAINTS.map((c) => (
                  <span
                    key={c.label}
                    className={cn(
                      'inline-flex min-h-9 cursor-default items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-transparent px-3.5 py-1.5 [font-family:inherit] text-[0.86rem] font-medium text-foreground-2 normal-case [transition:background-color_200ms_var(--ease),_border-color_200ms_var(--ease),_color_200ms_var(--ease),_transform_300ms_var(--spring)] hover:border-foreground-2 hover:text-foreground active:[transform:scale(0.95)]',
                      c.on && 'border-ink bg-ink text-ink-foreground hover:border-ink hover:bg-ink hover:text-ink-foreground',
                    )}
                  >
                    {c.on && <Check size={14} weight="bold" aria-hidden />} {c.label}
                  </span>
                ))}
              </div>
              <p className="text-[0.875rem] text-muted-foreground">Choose who’s eating, then review the suggested meals before saving.</p>
            </div>

            <div
              data-reveal
              className="flex [transform:translateY(12px)] flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-0 opacity-0 shadow-paper [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100 wide:col-[span_2] wide:row-[span_2] [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550] [&_h3]:tracking-[-0.02em] [&_img]:min-h-[200px] [&_img]:w-full [&_img]:flex-[1_1_0] [&_img]:object-cover [&_img]:[object-position:50%_65%] [&_p]:max-w-[46ch] [&_p]:text-foreground-2"
              style={stagger(1)}
            >
              <img src="/images/prep.jpg" alt="Halved red onion, parsley and peppercorns on a wooden cutting board" width={960} height={636} loading="lazy" />
              <div className="flex flex-col gap-3 px-6 pt-[22px] pb-[26px]">
                <h3>One list, sorted by aisle</h3>
                <ul
                  className="m-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[auto_1fr_auto] [&_li]:items-center [&_li]:gap-2.5 [&_li]:border-b [&_li]:border-border [&_li]:px-0 [&_li]:py-[9px] [&_li]:text-[0.94rem] [&_li:last-child]:[border-bottom:0] [&_s]:text-muted-foreground"
                  aria-label="Example shopping list"
                >
                  <li>
                    <span
                      className="grid h-[18px] w-[18px] [place-items:center] rounded-[5px] border-[1.5px] border-primary bg-primary text-primary-foreground"
                      aria-hidden
                    >
                      <Check size={12} weight="bold" />
                    </span>
                    <s>Red onions</s>
                    <span className="text-muted-foreground tabular-nums">3</span>
                  </li>
                  <li>
                    <span className="grid h-[18px] w-[18px] [place-items:center] rounded-[5px] border-[1.5px] border-border-strong" aria-hidden />
                    Flat-leaf parsley<span className="text-muted-foreground tabular-nums">1 bunch</span>
                  </li>
                  <li>
                    <span className="grid h-[18px] w-[18px] [place-items:center] rounded-[5px] border-[1.5px] border-border-strong" aria-hidden />
                    Feta<span className="text-muted-foreground tabular-nums">200 g</span>
                  </li>
                </ul>
              </div>
            </div>

            <div
              data-reveal
              className="flex [transform:translateY(12px)] flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface-2 p-7 opacity-0 shadow-paper [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100 wide:col-[span_2] [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550] [&_h3]:tracking-[-0.02em] [&_p]:max-w-[46ch] [&_p]:text-foreground-2"
              style={stagger(2)}
            >
              <h3>One book for your people</h3>
              <p>
                Save recipes, choose meals and shop with your household. Separate recipe circles let friends exchange ideas while keeping their own kitchens.
              </p>
            </div>

            <div
              data-reveal
              className="flex [transform:translateY(12px)] flex-col gap-3 overflow-hidden rounded-xl border border-transparent bg-warning-soft p-7 opacity-0 shadow-paper [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100 wide:col-[span_2] [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550] [&_h3]:tracking-[-0.02em] [&_p]:max-w-[46ch] [&_p]:text-foreground-2"
              style={stagger(3)}
            >
              <h3>Leftovers, planned on purpose</h3>
              <p>Cook a big pot on Sunday and eat it again Tuesday. Potluck buys for both meals once.</p>
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="px-0 py-[72px] [border-top:1px_dashed_var(--border-strong)] min-[960px]:px-0 min-[960px]:pt-[112px] min-[960px]:pb-[120px]"
          aria-labelledby="pricing-title"
        >
          <h2
            id="pricing-title"
            data-reveal
            className="mb-12 max-w-[20ch] [transform:translateY(12px)] text-[clamp(2rem,_4.4vw,_3.4rem)] leading-[1.02] font-[520] tracking-[-0.03em] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
          >
            Free for two. Room to grow.
          </h2>
          <div className="mb-5 grid gap-4 wide:grid-cols-[repeat(3,_1fr)]">
            {tiers.map((t, i) => {
              const featured = t.id === 'plus';
              return (
                <div
                  key={t.id}
                  data-reveal
                  className={cn(
                    featured
                      ? 'grid grid-rows-[auto_1fr_auto] gap-5 rounded-xl border border-[color-mix(in_srgb,_var(--accent)_65%,_transparent)] p-7 shadow-paper [background:radial-gradient(100%_70%_at_100%_0%,_color-mix(in_srgb,_var(--accent-soft)_90%,_transparent),_transparent_70%),_var(--surface)]'
                      : 'grid grid-rows-[auto_1fr_auto] gap-5 rounded-xl border border-border bg-card p-7 shadow-paper',
                    '[transform:translateY(12px)] opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100',
                  )}
                  style={stagger(i)}
                >
                  <div className="[&_h3]:flex [&_h3]:items-center [&_h3]:gap-1.5 [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550]">
                    <h3>
                      {t.name}
                      {featured && <span className={cn(metaBadge, 'bg-accent text-accent-foreground')}>most households</span>}
                    </h3>
                    <p className="mt-2.5 font-serif text-[3.2rem] leading-[1] font-medium tracking-[-0.04em] tabular-nums [&_span]:ml-1 [&_span]:font-sans [&_span]:font-normal [&_span]:tracking-[0]">
                      {t.priceCents ? cents(t.priceCents) : '$0'}
                      <span className="text-[0.875rem] text-muted-foreground">/month</span>
                    </p>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-2.5 border-t border-border px-0 pt-[18px] pb-0 text-[0.95rem] text-foreground-2">
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
          <div
            data-reveal
            className="flex [transform:translateY(12px)] flex-col gap-3 opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100"
          >
            <p className="text-[0.875rem] text-muted-foreground">
              Each owner’s paid plan includes $2 of monthly AI usage across their kitchens and circles. Imports and AI planning share that allowance; additional
              credits start at $5. Paid plans renew monthly until cancelled.
            </p>
            <ConsentNote />
          </div>
        </section>

        <section
          data-reveal
          className="mx-0 mt-12 mb-20 flex [transform:translateY(12px)] flex-wrap items-center justify-between gap-6 rounded-xl border-0 px-8 py-12 opacity-0 [transition-delay:calc(var(--i,0)*80ms)] [background:radial-gradient(80%_140%_at_100%_100%,_color-mix(in_srgb,_var(--accent)_22%,_transparent),_transparent_60%),_var(--accent-soft)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] data-revealed:[transform:none] data-revealed:opacity-100 motion-reduce:[transform:none] motion-reduce:opacity-100 min-[960px]:px-16 min-[960px]:py-[72px]"
        >
          <h2 className="m-0 max-w-[20ch] text-[clamp(2rem,_4.4vw,_3.4rem)] leading-[1.02] font-[520] tracking-[-0.03em]">Start with tonight's dinner.</h2>
          <div className="flex flex-col items-start gap-2.5">
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

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
import { brandClasses } from '../components/Layout';
import { metaBadge } from '../components/ui';

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
    <div className="[--lp-max:1180px] min-h-[100dvh] [overflow-x:clip] [&_main]:max-w-[var(--lp-max)] [&_main]:mx-auto [&_main]:py-0 [&_main]:px-[var(--gutter)]" ref={root}>
      <a className="absolute left-3 -top-[60px] z-[var(--z-skip)] bg-ink text-ink-foreground py-2.5 px-4 rounded-full font-medium focus:top-3 focus:text-ink-foreground" href="#main">
        Skip to content
      </a>
      <header className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-6 h-16 py-0 px-[max(var(--gutter),_calc((100vw_-_var(--lp-max))_/_2))] [background:color-mix(in_srgb,_var(--bg)_86%,_transparent)] [backdrop-filter:blur(12px)] border-b border-transparent">
        <a href="/" className={cn(brandClasses, 'text-[1.5rem]')} aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-[9px] shadow-paper transition-transform duration-300 ease-spring group-hover:-rotate-8 group-hover:scale-105" />
          <span className="max-[420px]:hidden">Potluck</span>
        </a>
        <nav className="hidden gap-1 ml-[auto] [&_a]:text-muted-foreground [&_a]:no-underline [&_a]:text-[0.94rem] [&_a]:py-2 [&_a]:px-3 [&_a]:rounded-md [&_a:hover]:text-foreground [&_a:hover]:bg-surface-2 min-[720px]:flex" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button type="button" className={cn(buttonVariants({ size: 'sm' }), 'ml-auto min-[720px]:ml-0')} onClick={start}>
          Sign in
        </button>
      </header>

      <main id="main">
        <section className="grid grid-cols-none gap-10 pt-8 px-0 pb-[72px] items-center min-[960px]:grid-cols-[minmax(0,_0.95fr)_minmax(0,_1.05fr)] min-[960px]:gap-14 min-[960px]:pt-14 min-[960px]:px-0 min-[960px]:pb-[120px] min-[560px]:[&_h1_span]:block min-[560px]:[&_h1_span]:whitespace-nowrap relative before:[content:''] before:absolute before:z-[-1] before:top-[-10%] before:right-[-20%] before:w-[70%] before:aspect-square before:rounded-full before:[background:radial-gradient(closest-side,_color-mix(in_srgb,_var(--accent)_22%,_transparent),_transparent)] before:[filter:blur(40px)] before:pointer-events-none [&_h1]:font-serif [&_h1]:[font-variation-settings:'SOFT'_50,_'WONK'_0] [&_h1]:text-[clamp(2.8rem,_6vw,_5rem)] [&_h1]:font-[520] [&_h1]:leading-[0.98] [&_h1]:tracking-[-0.035em] [&_h1_em]:font-[450] [&_h1_em]:[font-variation-settings:'SOFT'_100,_'WONK'_1]">
          <div className="[&>*]:[animation:lp-enter_800ms_var(--ease)_both] [&>:nth-child(2)]:[animation-delay:80ms] [&>:nth-child(3)]:[animation-delay:160ms]">
            <h1>
              <span>The recipes you save.</span>{' '}
              <span>
                The meals you <em>share.</em>
              </span>
            </h1>
            <p className="mt-[22px] text-[clamp(1.05rem,_1.6vw,_1.2rem)] text-foreground-2 max-w-[40ch] leading-[1.55]">Save recipes from videos, websites or photos. Plan meals and share a shopping list with your household.</p>
            <div className="flex items-center flex-wrap mt-8 gap-5">
              <button type="button" className={buttonVariants({ variant: 'default', size: 'lg' })} onClick={start}>
                Start free
              </button>
              <a className="inline-flex items-center gap-1.5 font-medium text-foreground no-underline [&_svg]:[transition:transform_200ms_var(--ease)] [&:hover_svg]:[transform:translateX(3px)]" href="#how">
                See how it works <ArrowRight size={16} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
          <div className="relative [animation:lp-enter_900ms_var(--ease)_120ms_both]">
            <img
              className="w-full aspect-[4/3] max-h-[calc(100dvh_-_260px)] min-h-[300px] object-cover [object-position:62%_60%] rounded-xl shadow-float"
              src="/images/shakshuka.jpg"
              alt="Shakshuka with basil in a cast iron pan, with bread and a fork on a dark table"
              width={1400}
              height={929}
              fetchPriority="high"
            />
            <article className="relative mt-[-64px] mb-0 mr-4 ml-[auto] w-[min(340px,_calc(100%_-_32px))] bg-card border border-border shadow-float min-[960px]:absolute min-[960px]:-left-12 min-[960px]:-bottom-10 min-[960px]:m-0 rounded-lg pt-5 px-[22px] pb-2.5 [transform:rotate(-1.5deg)] [transition:transform_500ms_var(--spring)] hover:[transform:rotate(0deg)_translateY(-4px)]" aria-label="Example recipe card">
              <h2 className="mb-0.5 text-[1.35rem]">Shakshuka with basil</h2>
              <p className="text-muted-foreground text-[0.875rem] tabular-nums">35 min, serves 4, 21 g protein per serving</p>
              <ul className="mx-0 mt-2.5 mb-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[4.5em_1fr] [&_li]:gap-2.5 [&_li]:px-0 [&_li]:py-2.5 [&_li]:text-[0.92rem] [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
                {SAMPLE_INGREDIENTS.map((i) => (
                  <li key={i.name}>
                    <span className="font-medium font-mono text-[0.88rem] tabular-nums text-accent-foreground pt-[1px]">{i.amount}</span>
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

        <section id="how" className="lp-how py-[72px] px-0 min-[960px]:pt-[112px] min-[960px]:px-0 min-[960px]:pb-[120px] [border-top:1px_dashed_var(--border-strong)]" aria-labelledby="how-title">
          <h2 id="how-title" data-reveal className="max-w-[20ch] mb-12 text-[clamp(2rem,_4.4vw,_3.4rem)] font-[520] tracking-[-0.03em] leading-[1.02] opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]">
            From a saved recipe to dinner together.
          </h2>
          <ol className="list-none m-0 p-0 grid grid-cols-none gap-9 wide:grid-cols-[1.25fr_1fr_1fr] wide:gap-12 [&_li]:flex [&_li]:flex-col [&_li]:gap-2.5 [&_h3]:tracking-[-0.03em] [&_p]:text-foreground-2 [&_p]:max-w-[42ch] [&_li]:[border-top:0] [&_li]:pt-0 [&_li]:[counter-increment:lp-step] [counter-reset:lp-step] [&_li::before]:[content:'0'_counter(lp-step)] [&_li::before]:font-serif [&_li::before]:italic [&_li::before]:text-[1.1rem] [&_li::before]:text-accent-foreground [&_li::before]:pb-3.5 [&_li::before]:border-b-[2px] [&_li::before]:border-foreground [&_li::before]:mb-1.5 [&_h3]:font-serif [&_h3]:font-[550] [&_h3]:text-[2rem]">
            <li data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]" style={stagger(0)}>
              <h3>Send</h3>
              <p>Paste a recipe link or upload a cookbook photo. Optionally link a private chat with the Potluck bot for easy forwarding.</p>
              <div className="flex flex-wrap gap-y-2 gap-x-4 mt-1.5 text-muted-foreground text-[0.9rem] [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5" aria-label="Works with">
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
            <li data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]" style={stagger(1)}>
              <h3>Read</h3>
              <p>Potluck reads the recipe and organizes the ingredients and steps. Estimated amounts are flagged for you to review.</p>
            </li>
            <li data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]" style={stagger(2)}>
              <h3>Plan</h3>
              <p>Add recipes to the week with the people you cook for. Every ingredient merges into one list, sorted by aisle.</p>
            </li>
          </ol>
        </section>

        <section className="py-[72px] px-0 min-[960px]:pt-[112px] min-[960px]:px-0 min-[960px]:pb-[120px] [border-top:1px_dashed_var(--border-strong)]" aria-labelledby="bento-title">
          <h2 id="bento-title" data-reveal className="max-w-[20ch] mb-12 text-[clamp(2rem,_4.4vw,_3.4rem)] font-[520] tracking-[-0.03em] leading-[1.02] opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]">
            Built for the week you actually have.
          </h2>
          <div className="grid grid-cols-none gap-4 wide:grid-cols-[repeat(6,_1fr)] wide:[grid-auto-rows:minmax(200px,_auto)]">
            <div data-reveal className="wide:col-[span_4] border p-7 flex flex-col gap-3 overflow-hidden [&_p]:text-foreground-2 [&_p]:max-w-[46ch] border-[color-mix(in_srgb,_var(--accent)_18%,_transparent)] [&_h3]:font-serif [&_h3]:font-[550] rounded-xl shadow-paper [&_h3]:text-[1.5rem] [&_h3]:tracking-[-0.02em] [background:radial-gradient(90%_120%_at_100%_0%,_color-mix(in_srgb,_var(--accent)_16%,_transparent),_transparent_60%),_var(--accent-soft)] opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]" style={stagger(0)}>
              <h3>Plans that work around your schedule</h3>
              <p>Tell Potluck what the week looks like. It builds a plan from your own recipe book and explains why.</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2" aria-label="Example planning constraints">
                {CONSTRAINTS.map((c) => (
                  <span key={c.label} className={cn('inline-flex items-center border bg-transparent text-foreground-2 rounded-full py-1.5 px-3.5 [font-family:inherit] text-[0.86rem] font-medium min-h-9 [transition:background-color_200ms_var(--ease),_border-color_200ms_var(--ease),_color_200ms_var(--ease),_transform_300ms_var(--spring)] hover:border-foreground-2 hover:text-foreground active:[transform:scale(0.95)] normal-case cursor-default gap-1 border-[color-mix(in_srgb,var(--accent)_30%,transparent)]', c.on && 'border-ink bg-ink text-ink-foreground hover:border-ink hover:bg-ink hover:text-ink-foreground')}>
                    {c.on && <Check size={14} weight="bold" aria-hidden />} {c.label}
                  </span>
                ))}
              </div>
              <p className="text-[0.875rem] text-muted-foreground">Choose who’s eating, then review the suggested meals before saving.</p>
            </div>

            <div data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none] wide:col-[span_2] wide:row-[span_2] border border-border flex flex-col gap-3 bg-card overflow-hidden [&_p]:text-foreground-2 [&_p]:max-w-[46ch] p-0 [&_img]:w-full [&_img]:flex-[1_1_0] [&_img]:min-h-[200px] [&_img]:object-cover [&_img]:[object-position:50%_65%] [&_h3]:font-serif [&_h3]:font-[550] rounded-xl shadow-paper [&_h3]:text-[1.5rem] [&_h3]:tracking-[-0.02em]" style={stagger(1)}>
              <img src="/images/prep.jpg" alt="Halved red onion, parsley and peppercorns on a wooden cutting board" width={960} height={636} loading="lazy" />
              <div className="pt-[22px] px-6 pb-[26px] flex flex-col gap-3">
                <h3>One list, sorted by aisle</h3>
                <ul className="list-none m-0 p-0 [&_li]:grid [&_li]:grid-cols-[auto_1fr_auto] [&_li]:items-center [&_li]:gap-2.5 [&_li]:py-[9px] [&_li]:px-0 [&_li]:border-b [&_li]:border-border [&_li]:text-[0.94rem] [&_li:last-child]:[border-bottom:0] [&_s]:text-muted-foreground" aria-label="Example shopping list">
                  <li>
                    <span className="grid grid-cols-none gap-0 [place-items:center] w-[18px] h-[18px] border-[1.5px] rounded-[5px] bg-primary border-primary text-primary-foreground" aria-hidden>
                      <Check size={12} weight="bold" />
                    </span>
                    <s>Red onions</s>
                    <span className="tabular-nums text-muted-foreground">3</span>
                  </li>
                  <li>
                    <span className="grid grid-cols-none gap-0 [place-items:center] w-[18px] h-[18px] border-[1.5px] border-border-strong rounded-[5px]" aria-hidden />
                    Flat-leaf parsley<span className="tabular-nums text-muted-foreground">1 bunch</span>
                  </li>
                  <li>
                    <span className="grid grid-cols-none gap-0 [place-items:center] w-[18px] h-[18px] border-[1.5px] border-border-strong rounded-[5px]" aria-hidden />
                    Feta<span className="tabular-nums text-muted-foreground">200 g</span>
                  </li>
                </ul>
              </div>
            </div>

            <div data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none] wide:col-[span_2] border border-border p-7 flex flex-col gap-3 overflow-hidden [&_p]:text-foreground-2 [&_p]:max-w-[46ch] bg-surface-2 [&_h3]:font-serif [&_h3]:font-[550] rounded-xl shadow-paper [&_h3]:text-[1.5rem] [&_h3]:tracking-[-0.02em]" style={stagger(2)}>
              <h3>One book for your people</h3>
              <p>
                Save recipes, choose meals and shop with your household. Separate recipe circles let friends exchange ideas while keeping their own kitchens.
              </p>
            </div>

            <div data-reveal className="opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none] wide:col-[span_2] border p-7 flex flex-col gap-3 overflow-hidden [&_p]:max-w-[46ch] bg-warning-soft border-transparent [&_p]:text-foreground-2 [&_h3]:font-serif [&_h3]:font-[550] rounded-xl shadow-paper [&_h3]:text-[1.5rem] [&_h3]:tracking-[-0.02em]" style={stagger(3)}>
              <h3>Leftovers, planned on purpose</h3>
              <p>Cook a big pot on Sunday and eat it again Tuesday. Potluck buys for both meals once.</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-[72px] px-0 min-[960px]:pt-[112px] min-[960px]:px-0 min-[960px]:pb-[120px] [border-top:1px_dashed_var(--border-strong)]" aria-labelledby="pricing-title">
          <h2 id="pricing-title" data-reveal className="max-w-[20ch] mb-12 text-[clamp(2rem,_4.4vw,_3.4rem)] font-[520] tracking-[-0.03em] leading-[1.02] opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]">
            Free for two. Room to grow.
          </h2>
          <div className="grid grid-cols-none gap-4 mb-5 wide:grid-cols-[repeat(3,_1fr)]">
            {tiers.map((t, i) => {
              const featured = t.id === 'plus';
              return (
                <div key={t.id} data-reveal className={cn(featured ? 'grid grid-cols-none grid-rows-[auto_1fr_auto] gap-5 p-7 border border-[color-mix(in_srgb,_var(--accent)_65%,_transparent)] rounded-xl shadow-paper [background:radial-gradient(100%_70%_at_100%_0%,_color-mix(in_srgb,_var(--accent-soft)_90%,_transparent),_transparent_70%),_var(--surface)]' : 'grid grid-cols-none grid-rows-[auto_1fr_auto] gap-5 p-7 border border-border bg-card rounded-xl shadow-paper', 'opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]')} style={stagger(i)}>
                  <div className="[&_h3]:flex [&_h3]:items-center [&_h3]:gap-1.5 [&_h3]:font-serif [&_h3]:text-[1.5rem] [&_h3]:font-[550]">
                    <h3>
                      {t.name}
                      {featured && <span className={cn(metaBadge, 'bg-accent text-accent-foreground')}>most households</span>}
                    </h3>
                    <p className="tabular-nums mt-2.5 tracking-[-0.04em] leading-[1] [&_span]:ml-1 [&_span]:tracking-[0] [&_span]:font-normal font-serif text-[3.2rem] font-medium [&_span]:font-sans">
                      {t.priceCents ? cents(t.priceCents) : '$0'}
                      <span className="text-muted-foreground text-[0.875rem]">/month</span>
                    </p>
                  </div>
                  <ul className="list-none m-0 pt-[18px] px-0 pb-0 border-t border-border flex flex-col gap-2.5 text-foreground-2 text-[0.95rem]">
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
          <div data-reveal className="flex flex-col gap-3 opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]">
            <p className="text-muted-foreground text-[0.875rem]">
              Each owner’s paid plan includes $2 of monthly AI usage across their kitchens and circles. Imports and AI planning share that allowance; additional
              credits start at $5. Paid plans renew monthly until cancelled.
            </p>
            <ConsentNote />
          </div>
        </section>

        <section data-reveal className="flex flex-wrap items-center justify-between gap-6 mt-12 mx-0 mb-20 py-12 px-8 border-0 rounded-xl [background:radial-gradient(80%_140%_at_100%_100%,_color-mix(in_srgb,_var(--accent)_22%,_transparent),_transparent_60%),_var(--accent-soft)] min-[960px]:py-[72px] min-[960px]:px-16 opacity-0 [transform:translateY(12px)] [transition:opacity_600ms_var(--ease),transform_600ms_var(--ease)] [transition-delay:calc(var(--i,0)*80ms)] data-revealed:opacity-100 data-revealed:[transform:none] motion-reduce:opacity-100 motion-reduce:[transform:none]">
          <h2 className="max-w-[20ch] text-[clamp(2rem,_4.4vw,_3.4rem)] font-[520] tracking-[-0.03em] leading-[1.02] m-0">Start with tonight's dinner.</h2>
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

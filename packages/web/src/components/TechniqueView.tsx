import { useEffect, useRef } from 'react';
import { Play, Warning } from '@phosphor-icons/react';
import { formatAmount, type Recipe, type RecipeMedia } from '@potluck/core';
import { clock, youtubeAt } from '../lib/util';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { metaBadge } from '../lib/styles';

/** Play a muted loop only while it is on screen, so a long list of clips stays light. */
function LoopClip({ src, poster, label, onError }: { src: string; poster?: string; label: string; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return (
    <video
      ref={ref}
      className="block h-full w-full bg-[#0d0a07] object-cover"
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      controls={false}
      aria-label={label}
      onError={onError}
    />
  );
}

export function TechniqueView({ recipe, media, thumb, onMediaExpired }: { recipe: Recipe; media?: RecipeMedia; thumb?: string; onMediaExpired: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const t = recipe.technique;
  const clipFor = (sec: number | null | undefined) => (typeof sec === 'number' ? media?.clips.find((c) => c.startSec === sec) : undefined);

  function watchFrom(sec: number) {
    const v = player.current;
    if (!v) return;
    v.currentTime = sec;
    void v.play().catch(() => undefined);
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <header className="grid [animation:rise_700ms_var(--ease)_both] gap-6 min-[760px]:grid-cols-[minmax(260px,_0.8fr)_minmax(0,_1.2fr)] min-[760px]:items-start min-[760px]:gap-12 [&_h1]:text-[clamp(2.2rem,_5vw,_3.6rem)] [&_h1]:tracking-[-0.03em]">
        {media ? (
          <video
            ref={player}
            className="aspect-[9/16] max-h-[min(78dvh,_720px)] w-full rounded-xl bg-[#0d0a07] object-contain shadow-lift min-[760px]:sticky min-[760px]:top-[88px]"
            src={media.videoUrl}
            poster={thumb}
            controls
            playsInline
            preload="metadata"
            aria-label={`${recipe.title} full video`}
            onError={onMediaExpired}
          />
        ) : (
          thumb && <img className="aspect-[4/3] max-h-[460px] w-full rounded-xl object-cover shadow-lift" src={thumb} alt={recipe.title} />
        )}
        <div className="flex flex-col gap-[14px] min-[760px]:pt-6">
          <p className="font-serif text-[1.05rem] font-[450] tracking-[-0.005em] text-accent-foreground italic [font-variation-settings:'SOFT'_100]">
            Cooking technique
          </p>
          <h1>{recipe.title}</h1>
          {(t?.summary || recipe.description) && (
            <p className="max-w-[58ch] text-[1.12rem] leading-[1.55] text-foreground-2">{t?.summary || recipe.description}</p>
          )}
          {t && t.appliesTo.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Use it for</span>
              <div className="flex flex-wrap gap-1">
                {t.appliesTo.map((a) => (
                  <span key={a} className={metaBadge}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recipe.source.url && (
            <p className="text-[0.875rem]">
              Source:{' '}
              <a href={recipe.source.url} target="_blank" rel="noreferrer">
                {recipe.source.author ? `${recipe.source.author} on ${recipe.source.platform}` : recipe.source.platform}
              </a>
            </p>
          )}
        </div>
      </header>

      {t?.whyItWorks && (
        <section
          className="rounded-xl px-7 py-6 [background:radial-gradient(100%_140%_at_0%_0%,_color-mix(in_srgb,_var(--accent)_14%,_transparent),_transparent_60%),_var(--accent-soft)] [&_h2]:mb-2 [&_p]:max-w-[68ch] [&_p]:text-[1.04rem] [&_p]:text-foreground-2"
          aria-labelledby="why-title"
        >
          <h2 id="why-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
            Why it works
          </h2>
          <p>{t.whyItWorks}</p>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="tsteps-title">
        <h2 id="tsteps-title">How to do it</h2>
        <ol className="m-0 grid list-none gap-4 p-0 min-[700px]:grid-cols-[repeat(2,_minmax(0,_1fr))] min-[1040px]:grid-cols-[repeat(3,_minmax(0,_1fr))]">
          {recipe.steps.map((s, idx) => {
            const clip = clipFor(s.timestampSec);
            return (
              <li key={idx} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-paper">
                <div className="relative grid aspect-[4/5] [place-items:center] [background:var(--tone-0)]">
                  {clip ? (
                    <LoopClip src={clip.url} poster={clip.posterUrl} label={`Step ${idx + 1} clip`} onError={onMediaExpired} />
                  ) : (
                    <span className="font-serif text-[4rem] font-medium text-(color:--tone-ink) italic" aria-hidden>
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1.5 px-[18px] pt-4 pb-[18px]">
                  <span className="font-serif text-[0.98rem] text-accent-foreground italic">Step {idx + 1}</span>
                  <p>{s.text}</p>
                  {typeof s.timestampSec === 'number' &&
                    (media ? (
                      <button
                        type="button"
                        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2.5 text-accent-foreground')}
                        onClick={() => watchFrom(s.timestampSec!)}
                      >
                        <Play size={14} weight="fill" aria-hidden /> Watch from {clock(s.timestampSec)}
                      </button>
                    ) : (
                      recipe.source.url && (
                        <a className="text-[0.875rem]" href={youtubeAt(recipe.source.url, s.timestampSec)} target="_blank" rel="noreferrer">
                          ▶ {clock(s.timestampSec)} in video
                        </a>
                      )
                    ))}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-5 wide:grid-cols-[minmax(300px,2fr)_3fr] wide:items-start wide:gap-6 wide:[&>:first-child]:sticky wide:[&>:first-child]:top-[88px]">
        {recipe.ingredients.length > 0 && (
          <section
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
            aria-labelledby="tused-title"
          >
            <h2 id="tused-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
              What you need
            </h2>
            <ul className="m-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[6.5em_1fr] [&_li]:gap-2.5 [&_li]:px-0 [&_li]:py-2.5 [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
              {recipe.ingredients.map((i, idx) => (
                <li key={`${i.name}-${idx}`}>
                  <span className="pt-[1px] font-mono text-[0.88rem] font-medium text-accent-foreground tabular-nums">{formatAmount(i.quantity, i.unit)}</span>
                  <span>
                    {i.name}
                    {i.note && <span className="text-muted-foreground">, {i.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {recipe.equipment && recipe.equipment.length > 0 && (
              <p className="text-[0.875rem]">
                <strong>Equipment:</strong> {recipe.equipment.join(', ')}
              </p>
            )}
          </section>
        )}
        {((t && t.mistakes.length > 0) || (recipe.tips && recipe.tips.length > 0)) && (
          <section
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
            aria-labelledby="tmistakes-title"
          >
            {t && t.mistakes.length > 0 && (
              <>
                <h2 id="tmistakes-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
                  Common mistakes
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 [&_li]:grid [&_li]:grid-cols-[auto_1fr] [&_li]:items-start [&_li]:gap-2.5 [&_li]:text-foreground-2 [&_svg]:mt-[3px] [&_svg]:text-destructive">
                  {t.mistakes.map((m, idx) => (
                    <li key={idx}>
                      <Warning size={16} weight="fill" aria-hidden />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {recipe.tips && recipe.tips.length > 0 && (
              <>
                <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Tips</h3>
                <ul className="m-0 rounded-md bg-warning-soft py-3.5 pr-[18px] pl-[34px] text-foreground-2">
                  {recipe.tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}

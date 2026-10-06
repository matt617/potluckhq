import { useEffect, useRef } from 'react';
import { Play, Warning } from '@phosphor-icons/react';
import { formatAmount, type Recipe, type RecipeMedia } from '@potluck/core';
import { clock, youtubeAt } from '../lib/util';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { metaBadge } from './ui';

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
      className="w-full h-full object-cover block bg-[#0d0a07]"
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

export function TechniqueView({
  recipe,
  media,
  thumb,
  onMediaExpired,
}: {
  recipe: Recipe;
  media?: RecipeMedia;
  thumb?: string;
  onMediaExpired: () => void;
}) {
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
      <header className="grid grid-cols-none gap-6 [animation:rise_700ms_var(--ease)_both] [&_h1]:text-[clamp(2.2rem,_5vw,_3.6rem)] [&_h1]:tracking-[-0.03em] min-[760px]:grid-cols-[minmax(0,_1.05fr)_minmax(0,_1fr)] min-[760px]:items-center min-[760px]:gap-12 min-[760px]:grid-cols-[minmax(260px,_0.8fr)_minmax(0,_1.2fr)] min-[760px]:items-start">
        {media ? (
          <video
            ref={player}
            className="w-full aspect-[9/16] max-h-[min(78dvh,_720px)] object-contain bg-[#0d0a07] rounded-xl shadow-lift min-[760px]:sticky min-[760px]:top-[88px]"
            src={media.videoUrl}
            poster={thumb}
            controls
            playsInline
            preload="metadata"
            aria-label={`${recipe.title} full video`}
            onError={onMediaExpired}
          />
        ) : (
          thumb && <img className="w-full aspect-[4/3] max-h-[460px] object-cover rounded-xl shadow-lift" src={thumb} alt={recipe.title} />
        )}
        <div className="flex flex-col gap-[14px] min-[760px]:pt-6">
          <p className="eyebrow">Cooking technique</p>
          <h1>{recipe.title}</h1>
          {(t?.summary || recipe.description) && <p className="max-w-[58ch] text-[1.12rem] leading-[1.55] text-foreground-2">{t?.summary || recipe.description}</p>}
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
        <section className="py-6 px-7 rounded-xl [background:radial-gradient(100%_140%_at_0%_0%,_color-mix(in_srgb,_var(--accent)_14%,_transparent),_transparent_60%),_var(--accent-soft)] [&_h2]:mb-2 [&_p]:max-w-[68ch] [&_p]:text-foreground-2 [&_p]:text-[1.04rem]" aria-labelledby="why-title">
          <h2 id="why-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
            Why it works
          </h2>
          <p>{t.whyItWorks}</p>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="tsteps-title">
        <h2 id="tsteps-title">How to do it</h2>
        <ol className="list-none m-0 p-0 grid grid-cols-none gap-4 min-[700px]:grid-cols-[repeat(2,_minmax(0,_1fr))] min-[1040px]:grid-cols-[repeat(3,_minmax(0,_1fr))]">
          {recipe.steps.map((s, idx) => {
            const clip = clipFor(s.timestampSec);
            return (
              <li key={idx} className="flex flex-col bg-card border border-border rounded-lg overflow-hidden shadow-card">
                <div className="relative aspect-[4/5] [background:var(--tone-0)] grid grid-cols-none gap-0 [place-items:center]">
                  {clip ? (
                    <LoopClip src={clip.url} poster={clip.posterUrl} label={`Step ${idx + 1} clip`} onError={onMediaExpired} />
                  ) : (
                    <span className="font-serif italic font-medium text-[4rem] text-(color:--tone-ink)" aria-hidden>
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="pt-4 px-[18px] pb-[18px] flex flex-col gap-1.5 items-start">
                  <span className="font-serif italic text-[0.98rem] text-accent-foreground">Step {idx + 1}</span>
                  <p>{s.text}</p>
                  {typeof s.timestampSec === 'number' &&
                    (media ? (
                      <button type="button" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'technique-seek text-accent-foreground')} onClick={() => watchFrom(s.timestampSec!)}>
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

      <div className="grid grid-cols-none gap-5 wide:grid-cols-[minmax(300px,2fr)_3fr] wide:items-start wide:gap-6 wide:[&>:first-child]:sticky wide:[&>:first-child]:top-[88px]">
        {recipe.ingredients.length > 0 && (
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="tused-title">
            <h2 id="tused-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
              What you need
            </h2>
            <ul className="list-none m-0 p-0 [&_li]:grid [&_li]:grid-cols-[6.5em_1fr] [&_li]:gap-2.5 [&_li]:py-2.5 [&_li]:px-0 [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
              {recipe.ingredients.map((i, idx) => (
                <li key={`${i.name}-${idx}`}>
                  <span className="amount">{formatAmount(i.quantity, i.unit)}</span>
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
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="tmistakes-title">
            {t && t.mistakes.length > 0 && (
              <>
                <h2 id="tmistakes-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
                  Common mistakes
                </h2>
                <ul className="list-none m-0 p-0 flex flex-col gap-2.5 [&_li]:grid [&_li]:grid-cols-[auto_1fr] [&_li]:gap-2.5 [&_li]:items-start [&_li]:text-foreground-2 [&_svg]:text-destructive [&_svg]:mt-[3px]">
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
                <ul className="m-0 py-3.5 pr-[18px] pl-[34px] rounded-md bg-warning-soft text-foreground-2">
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

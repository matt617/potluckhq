import { useEffect, useRef } from 'react';
import { Play, Warning } from '@phosphor-icons/react';
import { formatAmount, type Recipe, type RecipeMedia } from '@potluck/core';
import { clock, youtubeAt } from '../lib/util';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
      className="technique-clip"
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
      <header className="recipe-head technique-head">
        {media ? (
          <video
            ref={player}
            className="technique-player"
            src={media.videoUrl}
            poster={thumb}
            controls
            playsInline
            preload="metadata"
            aria-label={`${recipe.title} full video`}
            onError={onMediaExpired}
          />
        ) : (
          thumb && <img className="recipe-hero" src={thumb} alt={recipe.title} />
        )}
        <div className="flex flex-col gap-[14px] min-[760px]:pt-6">
          <p className="eyebrow">Cooking technique</p>
          <h1>{recipe.title}</h1>
          {(t?.summary || recipe.description) && <p className="max-w-[58ch] text-[1.12rem] leading-[1.55] text-foreground-2">{t?.summary || recipe.description}</p>}
          {t && t.appliesTo.length > 0 && (
            <div className="flex flex-col technique-uses">
              <span className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Use it for</span>
              <div className="tags">
                {t.appliesTo.map((a) => (
                  <span key={a} className="badge">
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
        <section className="technique-why" aria-labelledby="why-title">
          <h2 id="why-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
            Why it works
          </h2>
          <p>{t.whyItWorks}</p>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="tsteps-title">
        <h2 id="tsteps-title">How to do it</h2>
        <ol className="technique-steps">
          {recipe.steps.map((s, idx) => {
            const clip = clipFor(s.timestampSec);
            return (
              <li key={idx} className="technique-step">
                <div className="technique-step-media">
                  {clip ? (
                    <LoopClip src={clip.url} poster={clip.posterUrl} label={`Step ${idx + 1} clip`} onError={onMediaExpired} />
                  ) : (
                    <span className="technique-step-num" aria-hidden>
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="technique-step-text">
                  <span className="technique-step-label">Step {idx + 1}</span>
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

      <div className="recipe-cols wide:[&>:first-child]:sticky wide:[&>:first-child]:top-[88px]">
        {recipe.ingredients.length > 0 && (
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="tused-title">
            <h2 id="tused-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
              What you need
            </h2>
            <ul className="ingredients">
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
                <ul className="technique-mistakes">
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
                <ul className="tips">
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

// Class strings shared by public pages and the app. Kept apart from components so the
// landing page can use them without pulling in the app shell and dialogs.
/** Wordmark: Fraunces with soft, wonky optical settings; the icon tilts on hover. */
export const brandClasses =
  "group flex items-center gap-[9px] font-serif text-[1.4rem] font-semibold tracking-[-0.03em] text-foreground no-underline [font-variation-settings:'SOFT'_100,'WONK'_1] hover:text-foreground";

/** Small lowercase label for metadata (tags, "archived", "AI estimate"). Add ml-1 when it follows inline text. */
export const metaBadge = 'inline-block rounded-[6px] bg-surface-2 px-2 py-0.5 align-middle text-[0.74rem] leading-[1.5] font-medium text-foreground-2 lowercase';

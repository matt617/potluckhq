# Tailwind v4 and shadcn/ui migration plan

Move `@potluck/web` from hand-written CSS to Tailwind v4 with shadcn/ui components in one branch and one pull request. The work is split into steps, each with its own commit and a validation gate. Do not start a step until the previous gate passes.

The goal is to keep the warm editorial cookbook look from #10 and fix the UX problems: bloated dialogs, list fields that require typed commas, and inconsistent controls. Visual parity holds until step 5. After that, visual changes must be intended and reviewed.

## Starting point

| Item | Today |
| --- | --- |
| Styling | `src/styles.css` (2,923 lines, 30 sections) and `src/kitchen.css` (42 lines), with semantic class names |
| Tokens | 83 CSS variables on `:root`, with dark mode through `prefers-color-scheme` and `data-theme` |
| Fonts | Geist, Geist Mono and Fraunces through `@fontsource-variable` |
| Markup | 571 static `className` strings and 7 template strings across 28 components and pages (5,694 lines) |
| Most used classes | `btn` (209 uses including variants), `muted`, `small`, `stack`, `card`, `row`, `badge`, `h3`, `h4` |
| Dialog-like UI | 5 `Sheet`, 5 `<details>`, 15 `<select>`, 14 `ConfirmButton`, 5 `Chip`, 53 `Field` |
| Tests | `vitest` for core and functions; `scripts/kitchen-browser-check.mjs` runs Playwright against local fixtures with every API route mocked |

## Validation gates

Every step ends with the same gate. A step is not done until each item passes, or until a difference is listed in the commit message as intended.

1. `npm run typecheck` and `npm run build:web` pass.
2. `npm test` passes.
3. `npm run test:kitchens:browser` passes.
4. `npm run test:visual` (added in step 0) shows no unintended differences against the baseline. The script reports per-screen pixel differences and writes side-by-side images to `artifacts/visual/diff/`.
5. No page errors or console errors in either Playwright script.
6. Accessibility scan (axe through Playwright) shows no new violations compared with the baseline.
7. Built CSS and JS sizes are recorded in the commit message, so growth stays visible.

Steps that change interaction also have a manual keyboard pass: Tab order, focus trap in dialogs, Escape to close, focus returning to the trigger, and screen-reader labels.

## Step 0: Baseline and harness

- Settle the package changes from the shadcn MCP install. Revert `package-lock.json` and reinstall with the repo's npm version, so the lockfile diff in this PR only shows real changes.
- Add `scripts/visual-check.mjs` with its own read-only fixtures. They're richer than the browser check's (diet lists, collections, a changed origin) and leave that passing test untouched. The script starts its own dev server on port 5179.
- Screen matrix, captured in light and dark themes at 1366×900 and 390×844:
  - Routes: `/`, `/privacy`, `/terms`, `/invite/:token`, `/week`, `/library`, `/circles`, `/book`, `/book/:rid` (kitchen, personal and technique), `/plan`, `/shop`, `/community`, `/account`, and a 404 page.
  - Open states: each of the 5 sheets, each `<details>` expanded, an armed `ConfirmButton`, a `TagInput` with items, the error and quota notes, and skeletons.
- Add `@axe-core/playwright` and record baseline violations.
- Add the `test:visual` and `test:visual:update` scripts.
- **Gate:** the baseline is captured and the script passes against itself twice in a row, so the screenshots are deterministic. Disable animations and freeze the clock and fonts if needed.

## Step 1: Install Tailwind without changing anything

- Add `tailwindcss` and `@tailwindcss/vite`, and register the plugin in `vite.config.ts`.
- Create `src/app.css`. It imports `tailwindcss/theme` and `tailwindcss/utilities` but not preflight, so the existing base styles stay in charge. Then it imports `styles.css`.
- **Gate:** zero visual differences. The only change is a slightly larger CSS bundle.

## Step 2: Map tokens into the Tailwind theme

- Under `@theme inline`, map the existing variables onto the shadcn token names: `--background`, `--foreground`, `--card`, `--popover`, `--primary` (the current accent), `--secondary`, `--muted`, `--accent` (the current accent-soft), `--destructive`, `--border`, `--input`, `--ring`, and `--radius` with its sm and lg values.
- Keep the app-specific tokens as Tailwind colors: `ink`, `ink-text`, `surface-2`, `text-2`, `accent-text`.
- Fonts: `--font-sans` for Geist, `--font-mono` for Geist Mono, and `--font-serif` for Fraunces.
- Dark mode: `@custom-variant dark` should match both the `prefers-color-scheme` rule and `[data-theme="dark"]`, exactly as the current CSS does.
- Bring the easing values and spring curves over as `--ease-*` theme values.
- **Gate:** zero visual differences. A throwaway check confirms that `bg-primary text-primary-foreground` and the `dark:` variant render the expected colors.

## Step 3: Set up shadcn and add primitives

- Run `npx shadcn@latest init`. It needs the `@/` path alias in `tsconfig.json` and `vite.config.ts`, `components.json`, and `src/lib/utils.ts` (`cn` with `clsx` and `tailwind-merge`).
- Add these primitives to `src/components/ui/`: `button`, `input`, `textarea`, `label`, `select`, `checkbox`, `badge`, `card`, `dialog`, `alert-dialog`, `popover`, `command`, `toggle-group`, `tabs`, `collapsible`, `skeleton`, `sonner`, `separator`, `tooltip`.
- Restyle the variants to the cookbook look: pill buttons, a focus ring with a 4px accent halo, 46px input height, serif dialog titles, and the paper surface.
- Add a dev-only `/__ui` gallery route showing every primitive and variant. Add it to the visual matrix.
- **Gate:** typecheck and build pass, the gallery is captured in both themes, the axe scan of the gallery is clean, and app screens show zero differences, since nothing uses the new components yet.

## Step 4: Rebuild the shared components in `ui.tsx`

This is the step that fixes the dialogs.

| Current | Replacement |
| --- | --- |
| `Sheet` (native `<dialog>`) | `Dialog`, centered on every screen size, with a sticky header, a scrolling body and a sticky footer holding the primary action |
| `Field` (`cloneElement` wiring) | `Field` built on `Label`, with the hint and error passed by `aria-describedby`, and an `error` prop |
| `TagInput` | Rebuilt with `Badge` and `Input`. It keeps the current keyboard behavior and adds optional `Command` suggestions (for example, common allergens) |
| `ConfirmButton` | `AlertDialog` for destructive actions; the two-step inline pattern stays for everything else |
| `Chip` | `ToggleGroup` items |
| `Skeleton` | shadcn `Skeleton` placed in the same layouts |
| `Flash` and `useFlash` | `sonner` toasts |
| `ErrorNote` and `QuotaNote` | An `Alert` built with the variants for error and upgrade notes |
| `Empty` and `PageHeader` | Kept, restyled with utilities |

- Move the forms in the 5 sheets onto the new dialog structure. Group related fields, drop repeated hints, and keep one primary action per footer.
- Delete the CSS for controls, sheets, notes and skeletons from `styles.css`.
- **Gate:** the full gate plus the manual keyboard pass on every dialog. Intended visual differences in dialogs and controls are reviewed side by side. The browser check still finds every control by role and name; update selectors only where an accessible name intentionally changed.

## Step 5: App shell

- `Layout.tsx`, the top bar, the floating tab bar on phones, `CommunitySwitcher` (becomes `Popover` with `Command`), `SiteFooter`, `PageHeader`, and the layout helpers (`stack`, `row`, `between`, `wrap`, `grid`, `form-grid`).
- Replace the helper classes with utilities (`flex flex-col gap-4` and so on), and delete the matching CSS sections.
- **Gate:** the full gate, including the mobile navigation check and a review of shell differences on every route.

## Step 6: Pages, in four groups

Convert each group's markup to utilities and the new components, then delete that group's CSS section in the same commit. One commit per group, with a full gate after each.

| Group | Files | CSS sections removed |
| --- | --- | --- |
| 6a Recipes | `RecipeBook`, `RecipeDetail`, `RecipeEditor`, `RecipeParticipation`, `AddRecipe`, `ImportList`, `TechniqueView` | recipe book, recipe detail, techniques |
| 6b Planning | `ThisWeek`, `Planner`, `AiSuggest`, `Shopping` | planner, shopping |
| 6c People and settings | `CommunitySettings`, `KitchenAdministration`, `Diners`, `Account`, `Circles`, `Library`, `InvitePage`, `CreateCommunity`, `KitchenOnboarding` | community and account, account data controls |
| 6d Public pages | `Landing`, `Legal`, `NotFound`, `AuthCallback` | landing (3 sections), legal, 404, scroll reveal |

- The `<select>` elements become shadcn `Select` where they hold short option lists. Long or searchable lists use `Combobox`.
- The `<details>` blocks become `Collapsible`.
- Landing animations (staggered reveal, hero overlap, paper grain) stay as a small set of `@utility` and `@keyframes` rules in `app.css`, not utility strings.

## Step 7: Enable preflight and delete the old CSS

- Switch `app.css` to the full `@import "tailwindcss"` with preflight on. Move the remaining base rules (body, headings, links, paper grain, reduced-motion safety) into `@layer base`.
- Delete `styles.css` and `kitchen.css`.
- Search the source for any leftover semantic class names that no longer have CSS.
- **Gate:** the full gate across the whole matrix. Any remaining difference is listed and approved.

## Step 8: Cleanup and guardrails

- Add `prettier-plugin-tailwindcss` for class sorting, applied only to the web package.
- Add a `CLAUDE.md` rule: styling is Tailwind v4 with the theme tokens in `app.css`, components come from `src/components/ui` (shadcn), and no new global CSS beyond `@layer base`.
- Update `docs/architecture.md`.
- Remove the dev-only `/__ui` route from production builds, or gate it behind `import.meta.env.DEV`.
- **Gate:** the full gate, and a final comparison of bundle sizes before and after.

## Decisions

Agreed on 2026-10-05:

1. **Look:** keep the warm editorial cookbook look. shadcn components are restyled to match it.
2. **Confirmation:** `AlertDialog` only for destructive actions. Other `ConfirmButton` uses keep the inline two-step pattern.
3. **Phones:** centered `Dialog` on every screen size. No bottom-sheet drawer.
4. **Component library:** Radix.

## Risks

- **Screenshot noise.** Fonts and animations can make screenshots flaky. Step 0 must prove the screenshots are deterministic before anything else changes.
- **Selector drift.** The browser check finds elements by role and name. Component swaps that change accessible names will break it. That is a useful signal, but each break needs a deliberate fix.
- **Rules that work together.** Some current CSS relies on the cascade across sections (for example, landing rules layered over base rules). Deleting a section can affect another page, which is why every group runs the full matrix.
- **PR size.** One PR will be large. One commit per step, each with its gate results, keeps it reviewable.

## Follow-ups found during the migration

- **Muted text contrast.** `--muted` (#7c7064) on `--bg` (#f6f1e8) is 4.28:1, below the 4.5:1 AA minimum for body text. It's behind most of the 23 color-contrast findings in the step 0 baseline. Darken it slightly once visual parity is no longer required (step 5 or later), and record the drop in axe findings.

# Potluck

## Web styling

- Style with Tailwind v4 utility classes in markup. Don't add page CSS or new global stylesheets. `src/base.css` only holds element defaults in `@layer base`.
- Use the theme names from `src/theme.css` (`bg-card`, `text-muted-foreground`, `bg-primary`, `shadow-paper`, `rounded-lg`, `font-serif`, `wide:`), not raw hex values. Raw token values live in `src/tokens.css`.
- Build UI from `src/components/ui/` (shadcn on Radix) and the app components in `src/components/ui.tsx`. Use `FormDialog` for dialogs, `ConfirmAction` for destructive actions and `Field` for labelled controls.
- Combine conditional classes with `cn()` from `@/lib/utils`.
- Before committing UI changes, run `npm run lint:classes`, `npm run format -w @potluck/web` and `npm run test:visual`. Review any screenshot differences in `artifacts/visual/diff/` and refresh the baseline with `npm run test:visual:update` only for intended changes.

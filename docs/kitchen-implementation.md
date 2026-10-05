# Kitchens and recipe circles implementation

Potluck helps people save recipes, decide what to cook and shop together. The implementation separates a person's library, the people they feed, and groups that exchange recipes. It is reconciled with merged main `54a67ee`, including the editorial redesign, hero frames, technique videos and actionable import status list.

The code is implemented and locally verified. Production data migration, deployment and observation with real households have not been performed. Follow the migration procedure before enabling writes with this release.

## Product model

| Space | Purpose | What belongs here |
| --- | --- | --- |
| My recipes | Keep a personal collection | Independent recipes and techniques, private notes and collections |
| Kitchen | Coordinate meals with the people you feed | Shared recipes, opted-in food requirements, child and guest profiles, attendance, cooks, weekly plans and groceries |
| Recipe circle | Exchange cooking ideas | Independent shared recipes and techniques, invitations and cooking activity; no shared meal plans, groceries or diner profiles |

Members are accounts with access. Diners are people who eat, including children and guests without accounts. A diner linked to an account controls their own shared requirements. Kitchen organizers can manage unlinked guest and child profiles. Personal medication settings and health goals are not copied into kitchen profiles.

A copied recipe has its own identity and source lineage. Editing or deleting one version does not modify the other versions. Private technique videos are also copied into the destination recipe's media namespace. An author can publish a version for people who already saved copies; recipients review and explicitly apply updates. Private unpublished changes require access to the original.

## Delivered scope

| Workstream | Implemented behavior | Main implementation |
| --- | --- | --- |
| Domain and migration | Kitchen and circle kinds; independent copies; recipe lineage; plan revisions; additive snapshot migration | `core/src/kitchen.ts`, `functions/src/lib/kitchen-migration.ts` |
| Personal library | Private notes, collections, search, personal saves and source update review | `Library.tsx`, `RecipeParticipation.tsx` |
| Onboarding | First recipe creates a default kitchen without naming a group or connecting a bot; existing members retain their kitchens | `KitchenOnboarding.tsx`, kitchen start endpoint |
| Diners and privacy | Self-controlled food requirements, child and guest profiles, usual portions, per-meal attendance and cook assignment | `Diners.tsx`, kitchen people endpoints |
| Planning | Dinner-first grid, optional other meals, ingredient-aware AI draft, known conflict checks and selected attendance | `Planner.tsx`, `AiSuggest.tsx`, `functions/src/lib/planner.ts` |
| Cooking and shopping | Add a recipe to a chosen kitchen/week, batch portions and leftovers, selected-week links, shopping change preview and staleness detection | `RecipeParticipation.tsx`, `Shopping.tsx`, core shopping utilities |
| Shared home | Tonight, meals and cooks, shopping progress, recent additions, Want to try, Made it and cooking notes | `ThisWeek.tsx`, activity endpoints |
| Invitations and governance | Scope-specific invitations, revocation, role controls, explicit ownership offers and recipient acceptance | `InvitePage.tsx`, `KitchenAdministration.tsx` |
| Chat and billing | Explicit chat destination separate from browsing context; owner allowance shared across owned spaces; owner-directed upgrade explanations | `bot.ts`, `messages.ts`, kitchen allowance endpoint |
| Recipe circles | Separate creation and navigation; optional independent copies from an existing kitchen; three owned circles and twenty members each | `Circles.tsx`, circle route restrictions |
| Account lifecycle | Export personal annotations and accessible shared recipes/plans/lists; remove own contributions on deletion; preserve independently saved copies | `account.ts`, `kitchen-repo.ts` |
| Recovery and measurement | Versioned plan/recipe writes, recoverable local plan drafts, quantity-sensitive shopping checks, weekly participation flags and counts | `repo.ts`, `Planner.tsx`, participation endpoint |

Existing community IDs and API route names remain for compatibility. The public product language uses kitchens and circles. Existing groups default to kitchens; an organizer can create a circle and copy recipes without moving or deleting the old group's plans.

Recipes removed from a kitchen are archived so existing plans remain usable. The book can show archived recipes, and an organizer can restore them. Techniques remain available in the book and in personal collections, but cannot be added as meals or grocery ingredients.

## Contracts and limits

Plan writes require the last read `revision`. A conflicting write returns 409 and the browser retains the draft. Recipe edits similarly require `updatedAt`. Source updates require both the saved version and reviewed original timestamps.

Shopping regeneration first returns a preview and a `planFingerprint`. Applying requires that fingerprint to still match the plan and referenced recipe versions. Concurrent checkbox and manual-item changes are preserved through optimistic retries. Changed generated quantities become unchecked so a previous purchase is not silently treated as sufficient.

Each leftover entry states portions eaten at that meal and points to an earlier original cooking meal with the same recipe. The original batch is the sum of its portions and its planned leftovers. Shopping counts each consumed portion once. Chained, missing and backward leftover references are rejected.

AI planning uses ingredient text and the attending diners' kitchen requirements, then screens known conflicts before returning a draft. The screen is deliberately conservative and is not an allergy-safety certification. Estimated amounts remain marked. Ingredient substitutions require explicit review and only affect the saved version being edited. Unsupported or incomplete ingredient information still requires human review.

Weekly participation stores action flags and hashed participant IDs for up to ninety days. The organizer sees counts and milestones, not participant identities or food requirements. Metrics are best effort and do not block core actions. A production cohort report and evidence of improved participation still require real usage.

## Verification

Full local verification before merge #13: 103 tests passed across twelve files; all twelve browser journeys passed. Workspace type checks, the production web build, migration bundle, fixture migration rehearsal, infrastructure synthesis and production dependency audit passed. Desktop and mobile screenshots were inspected. After reconciling merge #13, workspace type checks, 25 targeted API/security tests and six focused browser import checks passed. The full suite was not repeated.

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build:web
npm run build:kitchen-migration
npm audit --omit=dev --audit-level=high
```

For infrastructure synthesis without AWS account lookup:

```sh
npm run synth -w @potluck/infra -- Potluck-prod -c stage=prod -c skipYtdlp=true --quiet
```

The browser check uses isolated API fixtures. It does not log in to production, spend AI credits, send invitations or modify cloud data. Start a development server and run the script in another terminal:

```sh
npm run dev:web -- --host 127.0.0.1 --port 5178
npx playwright install chromium
npm run test:kitchens:browser
```

Use `npm run test:kitchens:browser -- --imports-only` for focused retry, dismiss, upload/text alternative and onboarding checks.

`TEST_ORIGIN` overrides the server address. `CHROME_PATH` selects an installed Chromium-compatible browser. `PLAYWRIGHT_MODULE` can select a bundled installation. Screenshots go to ignored `artifacts/kitchen-check/`.

The automated checks cover scope permissions, private food data, independent copies, technique media paths, migration idempotence, ownership transfer races, plan conflicts, shopping previews and account export/deletion. Browser journeys cover cooking assignments, adding meals, selected weeks, rejected-save recovery, shopping review, guest profiles, private notes, circles, technique detail, first-recipe onboarding and mobile navigation.

These checks do not establish live Cognito, Gemini, S3 copying, email delivery or payment-provider behavior. Validate those integrations in staging before production rollout.

## Production migration procedure

1. Rehearse in a staging environment containing a representative snapshot, including multi-kitchen recipes, completed imports, plans, shopping lists and technique videos. Verify the old recipe links resolve to authorized copies.
2. Put the existing deployment into maintenance for writes. Pause new imports and drain or pause the ingest worker; include bots, webhooks and account deletion. A DynamoDB scan is not a transactionally consistent snapshot while writers remain active.
3. Take a recoverable DynamoDB backup and retain the media bucket. Build the migration tool. With writes paused, export and rehearse using a new private local snapshot path:

   ```sh
   npm run build:kitchen-migration
   node artifacts/migrate-kitchens.mjs --table "$POTLUCK_TABLE" --snapshot "$POTLUCK_SNAPSHOT"
   ```

   Set those variables to the target table and a new snapshot file. The snapshot contains private data; do not commit it. The tool writes it with owner-only permissions and does not overwrite an existing file. Without `--apply`, it transforms only in memory and verifies that a second pass produces no changes.

4. Review the reported record, copy and change counts. Apply to the same paused table and source snapshot:

   ```sh
   node artifacts/migrate-kitchens.mjs --table "$POTLUCK_TABLE" --snapshot "$POTLUCK_SNAPSHOT" --media-bucket "$POTLUCK_MEDIA_BUCKET" --apply --maintenance-confirmed
   ```

   The operator needs DynamoDB read/write access and S3 read/write access for private technique media. The tool copies technique objects first, materializes new recipe records, rewrites references and finally detaches personal originals. Conditional writes stop if the snapshot is stale. Keep writes paused after a failure; rerun with the same snapshot to resume already-applied changes safely.

5. After verifying the migration, set the GitHub repository variable `KITCHEN_MIGRATION_COMPLETE` to `true` and dispatch the Pipeline workflow on main. Keep maintenance active while it deploys the reviewed app and infrastructure. API and worker permissions include the private media copy operations. Verify copy counts, plans, lists, memberships, source indexes, imports and technique playback. Re-export to a different snapshot path and confirm another rehearsal reports zero changes.
6. Reopen writes and observe a small initial group of households. Verify a second member can find tonight's meal, claim cooking, update groceries and understand what is private. Check expired invitations, ownership transfer, exhausted allowance and account deletion using staging accounts first.

Before writes reopen, restore the backup and previous release if verification fails; remove migration-created media only after identifying it from the snapshot. Once people have edited independent copies, do not collapse them back into shared records. Keep the new data model and repair forward, or reconcile subsequent writes explicitly before a restore.

The pipeline continues to test pushes to main, but its production deployment is gated by the repository variable `KITCHEN_MIGRATION_COMPLETE`. Leave it unset until the maintenance and migration steps above are complete. Then set it to `true` and dispatch the Pipeline workflow on main. Merging this PR alone does not migrate data.

## Household validation after rollout

Observe several households with different arrangements: one organizer and guests, two active cooks, and a kitchen that also shares through a circle. Ask each to save a recipe, plan a night, choose who eats, adjust leftovers and shop without coaching.

Record where people hesitate, whether they can predict who sees an edit, and whether a second person participates during the following week. Compare first-recipe completion, invite acceptance, weeks with saved/planned/shopped activity, and weeks with at least two participants. Treat improved comprehension and participation as hypotheses until this observation is complete.

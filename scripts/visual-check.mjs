// Visual and accessibility regression check for the web app. All API requests are fulfilled
// with local fixtures, so no deployed stack is needed.
//
//   node scripts/visual-check.mjs            compare against artifacts/visual/baseline
//   node scripts/visual-check.mjs --update   capture a new baseline
//   --only=<substring>                       limit to screens whose name contains it
//
// Writes current captures to artifacts/visual/current and side-by-side diffs to artifacts/visual/diff.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { AxeBuilder } from '@axe-core/playwright';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const update = process.argv.includes('--update');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const port = Number(process.env.VISUAL_PORT || 5179);
const origin = process.env.TEST_ORIGIN || `http://127.0.0.1:${port}`;
const root = 'artifacts/visual';
const baselineDir = `${root}/baseline`;
const outDir = update ? baselineDir : `${root}/current`;
// A screen passes when fewer than this share of pixels differ (anti-aliasing noise).
const maxDiffRatio = Number(process.env.VISUAL_MAX_DIFF || 0.0005);
const week = '2026-10-05';

const variants = [
  { name: 'light-desktop', colorScheme: 'light', viewport: { width: 1366, height: 900 } },
  { name: 'dark-desktop', colorScheme: 'dark', viewport: { width: 1366, height: 900 } },
  { name: 'light-mobile', colorScheme: 'light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'dark-mobile', colorScheme: 'dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

/** Each screen is a route plus an optional action that opens a state. `full` captures the whole page; dialogs capture the viewport. */
const screens = [
  { name: 'landing', path: '/', signedOut: true, wait: (p) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'privacy', path: '/privacy', signedOut: true, wait: (p) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'terms', path: '/terms', signedOut: true, wait: (p) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'not-found', path: '/nope', signedOut: true, wait: (p) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'invite', path: '/invite/tok', wait: (p) => p.getByText('Test kitchen').first() },
  { name: 'week', path: `/week?kitchen=home&week=${week}`, wait: (p) => p.getByRole('heading', { name: 'This week in Test kitchen' }) },
  { name: 'library', path: '/library', wait: (p) => p.getByRole('link', { name: /Roast tomatoes/ }).first() },
  { name: 'circles', path: '/circles', wait: (p) => p.getByLabel('Circle name') },
  { name: 'book', path: '/book?kitchen=home', wait: (p) => p.getByRole('link', { name: /Roast tomatoes/ }).first() },
  {
    name: 'book-loading',
    path: '/book?kitchen=home',
    hang: '/api/communities/home/recipes',
    wait: (p) => p.getByRole('status').filter({ hasText: /Loading/ }).first(),
  },
  { name: 'recipe-kitchen', path: `/book/r-home?kitchen=home&week=${week}`, wait: (p) => p.getByRole('heading', { name: 'Roast tomatoes', level: 1 }) },
  { name: 'recipe-personal', path: '/book/r-personal', wait: (p) => p.getByLabel('Collections', { exact: true }) },
  { name: 'recipe-technique', path: '/book/tech?kitchen=home', wait: (p) => p.getByRole('heading', { name: 'Knife skills', level: 1 }) },
  { name: 'plan', path: `/plan?kitchen=home&week=${week}`, wait: (p) => p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }) },
  { name: 'shop', path: `/shop?kitchen=home&week=${week}`, wait: (p) => p.getByText('tomatoes').first() },
  { name: 'community', path: '/community?kitchen=home', wait: (p) => p.getByRole('heading', { name: 'Who eats here?' }) },
  { name: 'account', path: '/account', wait: (p) => p.getByRole('heading', { name: 'Profile', exact: true }) },
  // Dev-only shadcn gallery in the cookbook theme.
  { name: 'ui-gallery', path: '/__ui', signedOut: true, wait: (p) => p.getByRole('heading', { name: 'UI gallery' }) },
  { name: 'ui-dialog', path: '/__ui?open=dialog', signedOut: true, full: false, wait: (p) => p.getByRole('dialog') },
  { name: 'ui-alert', path: '/__ui?open=alert', signedOut: true, full: false, wait: (p) => p.getByRole('alertdialog') },
  // Open states.
  {
    name: 'dialog-add-to-plan',
    path: `/book/r-home?kitchen=home&week=${week}`,
    wait: (p) => p.getByRole('button', { name: 'Cook this week' }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Cook this week' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'dialog-plan-entry',
    path: `/plan?kitchen=home&week=${week}`,
    wait: (p) => p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'dialog-diner-new',
    path: '/community?kitchen=home',
    wait: (p) => p.getByRole('button', { name: 'Add a child or guest' }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Add a child or guest' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'dialog-diner-edit',
    path: '/community?kitchen=home',
    wait: (p) => p.getByRole('button', { name: 'Edit', exact: true }).first(),
    act: async (p) => {
      await p.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'dialog-new-kitchen',
    path: '/book?kitchen=home',
    wait: (p) => p.getByRole('link', { name: /Roast tomatoes/ }).first(),
    act: async (p) => {
      await p.getByRole('combobox', { name: /Kitchen or recipe circle/ }).click();
      await p.getByRole('option', { name: 'New kitchen' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'switcher-open',
    path: '/book?kitchen=home',
    wait: (p) => p.getByRole('link', { name: /Roast tomatoes/ }).first(),
    act: async (p) => {
      await p.getByRole('combobox', { name: /Kitchen or recipe circle/ }).click();
      await p.getByRole('option', { name: 'New kitchen' }).waitFor();
    },
  },
  {
    name: 'menu-more',
    path: '/book?kitchen=home',
    wait: (p) => p.getByRole('link', { name: /Roast tomatoes/ }).first(),
    act: async (p) => {
      await p.getByRole('button', { name: 'More' }).click();
      await p.getByRole('dialog').getByRole('link', { name: 'My recipes' }).waitFor();
    },
  },
  {
    name: 'dialog-origin-review',
    path: '/book/r-personal',
    wait: (p) => p.getByRole('button', { name: 'Review changes to the original' }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Review changes to the original' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'dialog-confirm-remove',
    path: '/community?kitchen=home',
    wait: (p) => p.getByRole('button', { name: 'Remove profile' }).first(),
    act: async (p) => {
      await p.getByRole('button', { name: 'Remove profile' }).first().click();
      await p.getByRole('alertdialog').waitFor();
    },
  },
  {
    name: 'confirm-armed',
    path: `/book/r-home?kitchen=home&week=${week}`,
    full: true,
    wait: (p) => p.getByRole('button', { name: 'Publish an update to saved copies' }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Publish an update to saved copies' }).click();
    },
  },
  {
    name: 'details-open',
    path: `/shop?kitchen=home&week=${week}`,
    full: true,
    wait: (p) => p.getByText('tomatoes').first(),
    act: async (p) => {
      for (const s of await p.locator('summary').all()) if (await s.isVisible()) await s.click();
    },
  },
  {
    name: 'details-substitution',
    path: '/book/r-personal',
    full: true,
    wait: (p) => p.getByText('Review an ingredient substitution'),
    act: async (p) => {
      await p.getByText('Review an ingredient substitution').click();
    },
  },
  {
    name: 'details-ai-preferences',
    path: `/plan?kitchen=home&week=${week}`,
    full: true,
    wait: (p) => p.getByText('Advanced food preferences'),
    act: async (p) => {
      await p.getByText('Advanced food preferences').click();
    },
  },
  {
    name: 'error-plan-conflict',
    path: `/plan?kitchen=home&week=${week}`,
    full: true,
    failPlanSave: true,
    wait: (p) => p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }),
    act: async (p) => {
      await p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }).click();
      await p.getByRole('dialog').getByRole('option', { name: 'Roast tomatoes', exact: true }).click();
      await p.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
      // Park the pointer: it rests where the dialog's Add button was, and hovering Save plan lifts it 1px, out from under the pointer, forever.
      await p.mouse.move(0, 0);
      await p.getByRole('button', { name: 'Save plan', exact: true }).click();
      await p.getByText('Someone changed this plan. Reload it before saving.', { exact: true }).waitFor();
    },
  },
].map((s) => ({ full: !s.act, ...s }));

/**
 * Keyboard contract for every dialog: the trigger opens it from the keyboard, Tab stays inside,
 * Escape closes it and focus returns to the trigger. Runs once per check at desktop size.
 */
const keyboardChecks = [
  { name: 'diner dialog', path: '/community?kitchen=home', trigger: (p) => p.getByRole('button', { name: 'Add a child or guest' }) },
  { name: 'plan entry dialog', path: `/plan?kitchen=home&week=${week}`, trigger: (p) => p.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }) },
  { name: 'add to plan dialog', path: `/book/r-home?kitchen=home&week=${week}`, trigger: (p) => p.getByRole('button', { name: 'Cook this week' }) },
  { name: 'origin review dialog', path: '/book/r-personal', trigger: (p) => p.getByRole('button', { name: 'Review changes to the original' }) },
  { name: 'remove confirmation', path: '/community?kitchen=home', role: 'alertdialog', trigger: (p) => p.getByRole('button', { name: 'Remove profile' }).first() },
  {
    name: 'new kitchen dialog',
    path: '/book?kitchen=home',
    trigger: (p) => p.getByRole('combobox', { name: /Kitchen or recipe circle/ }),
    open: async (p) => {
      await p.keyboard.press('Enter');
      await p.getByRole('option', { name: 'New kitchen' }).waitFor();
      await p.keyboard.press('End');
      await p.keyboard.press('Enter');
    },
  },
];

async function keyboardCheck(browser, check) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('potluck.tokens', JSON.stringify({ idToken: 'local-test-only', expiresAt: Date.now() + 3600000 })));
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${week}T12:00:00`));
  const { api, publicApi } = fixtures();
  await page.route(/^(?!http:\/\/(127\.0\.0\.1|localhost))/, (r) => r.abort());
  await page.route('**/config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/public/**', (r) => r.fulfill({ json: publicApi(new URL(r.request().url()).pathname) }));
  await page.route('**/api/**', (r) => r.fulfill({ json: api(r.request().method(), new URL(r.request().url()).pathname) ?? { ok: true } }));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`${origin}${check.path}`);
    const trigger = check.trigger(page);
    await trigger.focus();
    if (check.open) await check.open(page);
    else await page.keyboard.press('Enter');
    const dialog = page.getByRole(check.role ?? 'dialog');
    await dialog.waitFor();
    const inside = () => page.evaluate((role) => !!document.activeElement?.closest(`[role=${role}]`), check.role ?? 'dialog');
    if (!(await inside())) throw new Error('focus did not move into the dialog');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
      if (!(await inside())) throw new Error(`focus left the dialog after ${i + 1} Tab presses`);
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    // Radix restores focus on the next tick after the dialog unmounts.
    let returned = false;
    for (let i = 0; i < 20 && !returned; i++) {
      returned = await trigger.evaluate((el) => el === document.activeElement).catch(() => false);
      if (!returned) await page.waitForTimeout(50);
    }
    if (!returned) {
      const active = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 40)}`);
      throw new Error(`focus did not return to the trigger (focused: ${active})`);
    }
    return null;
  } catch (e) {
    return { check: check.name, failure: e.message.split('\n')[0] };
  } finally {
    await context.close();
  }
}

function fixtures({ failPlanSave = false } = {}) {
  const user = {
    id: 'u1',
    displayName: 'Sam',
    email: 'sam@example.test',
    tier: 'plus',
    units: 'us',
    defaultCommunityId: 'home',
    diet: { allergies: ['peanuts', 'shellfish'], diets: ['vegetarian'], dislikes: ['cilantro'], dailyProteinTargetG: 120 },
    aiCreditMicros: 0,
    usageMonth: '2026-10',
    aiUsedMicros: 400000,
    importsUsed: 12,
    createdAt: '2026-01-10',
  };
  const budget = { tier: 'plus', allowanceLeftMicros: 1600000, creditMicros: 0, importsLeft: 288, aiFeatures: true };
  const tier = {
    id: 'plus',
    name: 'Plus',
    maxMembersPerCommunity: 6,
    maxCommunities: 3,
    importsPerMonth: 300,
    priceCents: 400,
    aiFeatures: true,
    aiAllowanceMicros: 2000000,
  };
  const home = {
    id: 'home',
    name: 'Test kitchen',
    ownerId: 'u1',
    kind: 'kitchen',
    memberCount: 2,
    pantryStaples: ['salt', 'olive oil'],
    createdAt: '2026-01-10',
    role: 'owner',
  };
  const circle = { ...home, id: 'circle', name: 'Friends', kind: 'circle' };
  const member = { communityId: 'home', userId: 'u1', displayName: 'Sam', role: 'owner', joinedAt: '2026-01-10' };
  const recipe = {
    id: 'r-home',
    ownerId: 'KITCHEN#home',
    kitchenId: 'home',
    title: 'Roast tomatoes',
    description: 'Blistered cherry tomatoes with garlic and thyme.',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    cuisine: 'Italian',
    tags: ['quick', 'weeknight'],
    ingredients: [
      { name: 'cherry tomatoes', quantity: 2, unit: 'cup', aisle: 'produce' },
      { name: 'garlic', quantity: 3, unit: 'clove', aisle: 'produce', note: 'smashed' },
      { name: 'olive oil', quantity: 2, unit: 'tbsp', aisle: 'pantry' },
    ],
    steps: [{ text: 'Heat the oven to 425°F.' }, { text: 'Toss the tomatoes with oil and garlic, then roast until blistered.' }],
    tips: ['Use the smallest tomatoes you can find.'],
    source: { platform: 'text' },
    communityIds: ['home'],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };
  const personal = { ...recipe, id: 'r-personal', ownerId: 'u1', kitchenId: undefined, communityIds: [], copiedFrom: { recipeId: 'r-home' } };
  const technique = { ...recipe, id: 'tech', kind: 'technique', title: 'Knife skills', ingredients: [], tags: ['technique'] };
  const recipes = new Map([
    [recipe.id, recipe],
    [personal.id, personal],
    [technique.id, technique],
  ]);
  const summary = (r) => ({ ...r, addedBy: 'u1', addedAt: r.createdAt, platform: 'text' });
  const plan = {
    communityId: 'home',
    weekStart: week,
    revision: 1,
    constraints: [],
    entries: [
      { id: 'meal', day: 0, slot: 'dinner', recipeId: 'r-home', servings: 2, dinerIds: ['sam'], cookId: 'u1' },
      { id: 'label', day: 2, slot: 'lunch', label: 'Leftover soup', servings: 1 },
    ],
    updatedAt: '2026-10-04',
  };
  const diners = [
    { id: 'sam', name: 'Sam', userId: 'u1', usual: true, portions: 2, diet: { allergies: ['peanuts', 'shellfish'], diets: ['vegetarian'], dislikes: [] } },
    { id: 'kid', name: 'Robin', usual: true, portions: 0.5, diet: { allergies: [], diets: [], dislikes: ['mushrooms'] } },
  ];
  const annotations = [{ recipeId: 'r-personal', collections: ['weeknight', 'summer'], note: 'Use the small pan' }];
  const list = {
    communityId: 'home',
    weekStart: week,
    items: [
      { key: 'tomatoes', name: 'cherry tomatoes', quantity: 2, unit: 'cup', display: '2 cups', aisle: 'produce', checked: false, recipeIds: ['r-home'] },
      { key: 'garlic', name: 'garlic', quantity: 3, unit: 'clove', display: '3 cloves', aisle: 'produce', checked: true, recipeIds: ['r-home'] },
      { key: 'salt', name: 'salt', quantity: 1, unit: '', display: '', aisle: 'pantry', checked: false, recipeIds: ['r-home'] },
      { key: 'olive oil', name: 'olive oil', quantity: 2, unit: 'tbsp', display: '2 tbsp', aisle: 'pantry', checked: false, recipeIds: ['r-home'] },
    ],
    generatedAt: '2026-10-04',
    updatedAt: '2026-10-04',
    planFingerprint: 'new',
  };
  const communities = [home, circle];

  function api(method, p, b) {
    if (p === '/api/me') return { user, budget, communities, channels: [] };
    if (p === '/api/library') return { recipes: [summary(personal)], annotations };
    if (p.startsWith('/api/library/')) return p.endsWith('/annotation') ? annotations[0] : { recipe: personal };
    if (p === '/api/imports') return { imports: [] };
    if (p.startsWith('/api/recipes/')) {
      const rid = p.split('/')[3];
      if (p.endsWith('/origin'))
        return rid === 'r-personal' ? { available: true, changed: true, recipe: { ...recipe, updatedAt: '2026-10-04' } } : { available: false };
      return { recipe: recipes.get(rid), canEdit: true };
    }
    const parts = p.split('/'),
      cid = parts[3],
      kind = parts[4],
      c = communities.find((x) => x.id === cid) ?? home;
    if (!kind) return { community: c, role: 'owner', members: [member, { ...member, userId: 'u2', displayName: 'Alex', role: 'member' }], ownerTier: 'plus' };
    if (kind === 'recipes') return { recipes: [...recipes.values()].filter((r) => r.communityIds.includes(cid)).map(summary) };
    if (kind === 'allowance') return { ownerName: 'Sam', ownerId: 'u1', budget, tier };
    if (kind === 'people') return { diners };
    if (kind === 'activity') return { activity: [] };
    if (kind === 'transfer') return { transfer: null };
    if (kind === 'invites') return { invites: [{ token: 'tok', expiresAt: '2026-10-12', role: 'member' }] };
    if (kind === 'participation') return { weeks: [] };
    if (kind === 'plans') {
      if (method === 'PUT' && failPlanSave) return { status: 409, body: { error: 'Someone changed this plan. Reload it before saving.', code: 'plan_conflict' } };
      return { plan: { ...plan, weekStart: parts[5] }, recipes: [summary(recipe)] };
    }
    if (kind === 'lists') return { list: { ...list, weekStart: parts[5] }, stale: false };
    throw new Error(`Unhandled fixture route ${method} ${p}`);
  }
  const publicApi = (p) =>
    p.startsWith('/public/invites/')
      ? { communityName: 'Test kitchen', invitedByName: 'Alex', expiresAt: '2026-10-12', full: false, kind: 'kitchen' }
      : { tiers: [tier], creditPacks: [], billingEnabled: false };
  return { api, publicApi };
}

async function startServer() {
  if (process.env.TEST_ORIGIN) return null;
  const child = spawn('npx', ['vite', '--config', 'packages/web/vite.config.ts', 'packages/web', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Dev server did not start on ${origin}`);
}

/** Waits until the page stops changing layout: two animation frames with the same document height. */
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = -1,
          stable = 0;
        const tick = () => {
          const h = document.documentElement.scrollHeight + (document.querySelector('dialog[open]')?.scrollHeight ?? 0);
          stable = h === last ? stable + 1 : 0;
          last = h;
          if (stable >= 3) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.waitForTimeout(200);
}

async function capture(browser, variant, screen) {
  const context = await browser.newContext({
    viewport: variant.viewport,
    isMobile: variant.isMobile,
    hasTouch: variant.hasTouch,
    colorScheme: variant.colorScheme,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  if (!screen.signedOut)
    await context.addInitScript(() => localStorage.setItem('potluck.tokens', JSON.stringify({ idToken: 'local-test-only', expiresAt: Date.now() + 3600000 })));
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${week}T12:00:00`));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const { api, publicApi } = fixtures(screen);
  // Block everything that is not the dev server so third-party requests cannot change pixels.
  await page.route(/^(?!http:\/\/(127\.0\.0\.1|localhost))/, (r) => r.abort());
  await page.route('**/config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/public/**', (r) => r.fulfill({ json: publicApi(new URL(r.request().url()).pathname) }));
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      p = new URL(req.url()).pathname;
    if (screen.hang && p === screen.hang) return; // never fulfilled: keeps the loading state on screen
    const data = api(req.method(), p, req.postDataJSON());
    if (data?.status) return route.fulfill({ status: data.status, json: data.body });
    await route.fulfill({ json: data ?? { ok: true } });
  });
  page.setDefaultTimeout(10000);
  await page.goto(`${origin}${screen.path}`);
  await screen.wait(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Freeze motion so captures are stable: no transitions, animations, smooth scrolling or caret.
  await page.addStyleTag({
    content: '*,*::before,*::after,::backdrop{transition:none!important;animation:none!important;scroll-behavior:auto!important;caret-color:transparent!important}',
  });
  if (screen.act) await screen.act(page);
  if (screen.full) await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0); // no stray hover states in captures
  await settle(page);
  if (process.env.VISUAL_EVAL) console.error(screen.name, variant.name, JSON.stringify(await page.evaluate(process.env.VISUAL_EVAL)));
  const file = `${outDir}/${screen.name}--${variant.name}.png`;
  await page.screenshot({ path: file, fullPage: screen.full, animations: 'disabled', caret: 'hide' });
  let axe = [];
  if (variant.name === 'light-desktop' || variant.name === 'dark-desktop') {
    // With a modal open, audit the modal: the page behind it is dimmed and hidden from assistive technology.
    const modal = (await page.locator('[role=dialog], [role=alertdialog]').count()) > 0;
    const builder = new AxeBuilder({ page });
    if (modal) builder.include('[role=dialog], [role=alertdialog]');
    const result = await builder.analyze();
    axe = result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 8).map((n) => n.target.join(' ')) }));
  }
  await context.close();
  return { file, errors, axe };
}

function compare(name) {
  const basePath = `${baselineDir}/${name}`;
  if (!existsSync(basePath)) return { name, status: 'new' };
  return Promise.all([readFile(basePath), readFile(`${outDir}/${name}`)]).then(([a, b]) => {
    const base = PNG.sync.read(a),
      cur = PNG.sync.read(b);
    const width = Math.max(base.width, cur.width),
      height = Math.max(base.height, cur.height);
    const pad = (img) => {
      if (img.width === width && img.height === height) return img;
      const out = new PNG({ width, height });
      out.data.fill(255);
      PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
      return out;
    };
    const pa = pad(base),
      pb = pad(cur),
      diff = new PNG({ width, height });
    const changed = pixelmatch(pa.data, pb.data, diff.data, width, height, { threshold: 0.1 });
    const ratio = changed / (width * height);
    const sizeChanged = base.width !== cur.width || base.height !== cur.height;
    if (ratio <= maxDiffRatio && !sizeChanged) return { name, status: 'same', ratio };
    // Side by side: baseline | current | diff.
    const sheet = new PNG({ width: width * 3, height });
    PNG.bitblt(pa, sheet, 0, 0, width, height, 0, 0);
    PNG.bitblt(pb, sheet, 0, 0, width, height, width, 0);
    PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2, 0);
    return writeFile(`${root}/diff/${name}`, PNG.sync.write(sheet)).then(() => ({
      name,
      status: 'changed',
      ratio,
      size: sizeChanged ? `${base.width}x${base.height} -> ${cur.width}x${cur.height}` : undefined,
    }));
  });
}

const server = await startServer();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
let failed = false;
try {
  // A filtered run updates only its own screens and keeps the rest.
  if (!only) await rm(outDir, { recursive: true, force: true });
  if (!update) await rm(`${root}/diff`, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(`${root}/diff`, { recursive: true });
  const selected = screens.filter((s) => !only || s.name.includes(only));
  const jobs = selected.flatMap((s) => variants.map((v) => [v, s]));
  const results = [];
  // Small worker pool: enough to be quick, few enough to stay deterministic.
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const [v, s] = queue.shift();
        try {
          results.push({ screen: s.name, variant: v.name, ...(await capture(browser, v, s)) });
        } catch (e) {
          results.push({ screen: s.name, variant: v.name, failure: e.message.split('\n').slice(0, process.env.VISUAL_DEBUG ? 30 : 1).join('\n') });
        }
      }
    }),
  );
  const keyboard = only && only !== "keyboard" ? [] : (await Promise.all(keyboardChecks.map((c) => keyboardCheck(browser, c)))).filter(Boolean);
  const failures = [...results.filter((r) => r.failure), ...keyboard];
  const errors = results.filter((r) => r.errors?.length).map((r) => ({ screen: r.screen, variant: r.variant, errors: [...new Set(r.errors)] }));
  const axe = Object.fromEntries(
    results
      .filter((r) => r.axe?.length)
      .sort((a, b) => `${a.screen}${a.variant}`.localeCompare(`${b.screen}${b.variant}`))
      .map((r) => [`${r.screen}--${r.variant}`, r.axe]),
  );
  const axeFile = `${outDir}/axe.json`;
  const keptAxe = only && existsSync(axeFile) ? JSON.parse(await readFile(axeFile, 'utf8')) : {};
  for (const key of Object.keys(keptAxe)) if (key.split('--')[0].includes(only)) delete keptAxe[key];
  await writeFile(axeFile, JSON.stringify({ ...keptAxe, ...axe }, null, 2));
  let diffs = [],
    newAxe = [];
  if (!update) {
    diffs = await Promise.all(results.filter((r) => r.file).map((r) => compare(r.file.split('/').pop())));
    const baseAxe = existsSync(`${baselineDir}/axe.json`) ? JSON.parse(await readFile(`${baselineDir}/axe.json`, 'utf8')) : {};
    for (const [key, list] of Object.entries(axe)) {
      for (const v of list) {
        const before = baseAxe[key]?.find((x) => x.id === v.id);
        if (!before || v.nodes > before.nodes) newAxe.push({ key, ...v, before: before?.nodes ?? 0 });
      }
    }
  }
  const changed = diffs.filter((d) => d.status === 'changed').sort((a, b) => b.ratio - a.ratio);
  const added = diffs.filter((d) => d.status === 'new');
  failed = failures.length > 0 || errors.length > 0 || changed.length > 0 || newAxe.length > 0;
  console.log(
    JSON.stringify(
      {
        mode: update ? 'update' : 'compare',
        captured: results.filter((r) => r.file).length,
        failures,
        errors,
        changed: changed.map((d) => ({ name: d.name, pct: +(d.ratio * 100).toFixed(3), size: d.size })),
        new: added.map((d) => d.name),
        newAxeViolations: newAxe,
        axeViolationsTotal: Object.values(axe).reduce((n, l) => n + l.length, 0),
        passed: !failed,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);

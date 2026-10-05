// Isolated browser contract checks. All API requests are fulfilled with local fixtures.
// PLAYWRIGHT_MODULE can point at a bundled Playwright installation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5178';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await context.addInitScript(() => localStorage.setItem('potluck.tokens', JSON.stringify({ idToken: 'local-test-only', expiresAt: Date.now() + 3600000 })));
const errors = [];
const requests = [];
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
const user = {
  id: 'u1',
  displayName: 'Sam',
  email: 'sam@example.test',
  tier: 'plus',
  units: 'us',
  defaultCommunityId: 'home',
  diet: { allergies: [], diets: [], dislikes: [] },
  aiCreditMicros: 0,
  usageMonth: '2026-10',
  aiUsedMicros: 0,
  importsUsed: 0,
  createdAt: '',
};
const budget = { tier: 'plus', allowanceLeftMicros: 2000000, creditMicros: 0, importsLeft: 300, aiFeatures: true };
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
const home = { id: 'home', name: 'Test kitchen', ownerId: 'u1', kind: 'kitchen', memberCount: 2, pantryStaples: ['salt'], createdAt: '', role: 'owner' };
const circle = { ...home, id: 'circle', name: 'Friends', kind: 'circle' };
const member = { communityId: 'home', userId: 'u1', displayName: 'Sam', role: 'owner', joinedAt: '' };
let communities = [home, circle];
const recipe = {
  id: 'r-home',
  ownerId: 'KITCHEN#home',
  kitchenId: 'home',
  title: 'Roast tomatoes',
  servings: 2,
  tags: ['quick'],
  ingredients: [{ name: 'tomatoes', quantity: 2, unit: '', aisle: 'produce' }],
  steps: [{ text: 'Roast the tomatoes.' }],
  source: { platform: 'text' },
  communityIds: ['home'],
  createdAt: '2026-10-04',
  updatedAt: '2026-10-04',
};
const personal = { ...recipe, id: 'r-personal', ownerId: 'u1', kitchenId: undefined, communityIds: [] };
const technique = { ...recipe, id: 'tech', kind: 'technique', title: 'Knife skills', ingredients: [] };
const recipes = new Map([
  [recipe.id, recipe],
  [personal.id, personal],
  ['tech', technique],
]);
const summary = (r) => ({ ...r, addedBy: 'u1', addedAt: r.createdAt, platform: 'text' });
const plans = new Map();
const week = '2026-10-05';
plans.set(`home:${week}`, {
  communityId: 'home',
  weekStart: week,
  revision: 1,
  constraints: [],
  entries: [{ id: 'meal', day: 0, slot: 'dinner', recipeId: 'r-home', servings: 2, dinerIds: ['sam'] }],
  updatedAt: '2026-10-04',
});
const diners = [{ id: 'sam', name: 'Sam', userId: 'u1', usual: true, portions: 2, diet: { allergies: [], diets: [], dislikes: [] } }];
const annotations = [];
const activities = [];
let imported = false;
const importJobs = [];
let failSave = false;
let list = {
  communityId: 'home',
  weekStart: week,
  items: [{ key: 'tomatoes', name: 'tomatoes', quantity: 2, unit: '', display: '2', aisle: 'produce', checked: true, recipeIds: ['r-home'] }],
  generatedAt: 'yesterday',
  updatedAt: 'yesterday',
};
await page.route('**/public/**', (r) => r.fulfill({ json: { tiers: [tier], creditPacks: [], billingEnabled: false } }));
await page.route('**/api/**', async (route) => {
  const req = route.request(),
    p = new URL(req.url()).pathname,
    method = req.method(),
    b = req.postDataJSON();
  requests.push({ p, method, b });
  let data = { ok: true };
  let status = 200;
  if (p === '/api/me') {
    if (method === 'PATCH') Object.assign(user, b);
    data = { user, budget, communities, channels: [] };
  } else if (p === '/api/kitchens/start') {
    communities = [home];
    data = home;
  } else if (p === '/api/library') data = { recipes: [summary(personal)], annotations };
  else if (p.startsWith('/api/library/') && p.endsWith('/annotation')) {
    const recipeId = p.split('/')[3];
    annotations.splice(0, annotations.length, { recipeId, ...b });
    data = annotations[0];
  } else if (p.startsWith('/api/library/')) data = { recipe: personal };
  else if (p === '/api/imports') {
    if (method === 'POST') imported = true;
    data =
      method === 'POST'
        ? { id: 'job', status: 'done' }
        : { imports: [...importJobs, ...(imported ? [{ id: 'job', communityId: 'home', status: 'done', recipeId: 'r-home', createdAt: '2026-10-04' }] : [])] };
  } else if (p.startsWith('/api/imports/')) {
    const job = importJobs.find((j) => j.id === p.split('/')[3]);
    assert(job, 'Import fixture must exist');
    job.dismissedAt = new Date().toISOString();
    if (p.endsWith('/retry')) {
      imported = true;
      data = { id: 'job', communityId: job.communityId, status: 'done', recipeId: 'r-home' };
    }
  } else if (p.startsWith('/api/recipes/')) {
    const rid = p.split('/')[3];
    if (p.endsWith('/origin')) data = { available: false };
    else if (p.endsWith('/share')) {
      const r = { ...recipes.get(rid), id: `copy-${rid}-${b.communityId}`, communityIds: [b.communityId], kitchenId: b.communityId };
      recipes.set(r.id, r);
      data = { ok: true, recipe: r };
    } else data = { recipe: recipes.get(rid), canEdit: true };
  } else if (p === '/api/communities' && method === 'POST') {
    const c = { ...home, id: 'circle-new', kind: b.kind, name: b.name };
    communities.push(c);
    data = c;
  } else {
    const parts = p.split('/'),
      cid = parts[3],
      kind = parts[4],
      id = parts[5],
      c = communities.find((c) => c.id === cid) ?? home;
    if (!kind) data = { community: c, role: 'owner', members: [member, { ...member, userId: 'u2', displayName: 'Alex', role: 'member' }], ownerTier: 'plus' };
    else if (kind === 'recipes') data = { recipes: [...recipes.values()].filter((r) => r.communityIds.includes(cid)).map(summary) };
    else if (kind === 'allowance') data = { ownerName: 'Sam', ownerId: 'u1', budget, tier };
    else if (kind === 'people') {
      if (method === 'PUT') diners.push(b);
      data = { diners };
    } else if (kind === 'activity') {
      if (method === 'POST') activities.push({ ...b, id: 'action', actorId: 'u1', actorName: 'Sam', at: '2026-10-04' });
      data = { activity: activities };
    } else if (kind === 'transfer') data = { transfer: null };
    else if (kind === 'invites') data = { invites: [] };
    else if (kind === 'participation') data = { weeks: [] };
    else if (kind === 'plans') {
      const key = `${cid}:${id}`;
      let plan = plans.get(key) ?? { communityId: cid, weekStart: id, entries: [], constraints: [], revision: 0, updatedAt: '' };
      if (method === 'PUT') {
        if (failSave) {
          status = 409;
          data = { error: 'Someone changed this plan. Reload it before saving.', code: 'plan_conflict' };
        } else {
          assert.equal(b.revision, plan.revision);
          plan = { ...plan, ...b, revision: plan.revision + 1 };
          plans.set(key, plan);
        }
      }
      if (status === 200) data = { plan, recipes: [summary(recipe)] };
    } else if (kind === 'lists') {
      if (parts[6] === 'generate') {
        const next = { ...list, weekStart: id, items: [{ ...list.items[0], quantity: 4, display: '4', checked: false }], planFingerprint: 'new' };
        if (!b.preview) list = next;
        data = { list: next };
      } else if (parts[6] === 'items' && method === 'PATCH') {
        list.items[0].checked = b.checked;
        data = { list };
      } else data = { list: { ...list, weekStart: id }, stale: list.planFingerprint !== 'new' };
    } else throw new Error(`Unhandled fixture route ${method} ${p}`);
  }
  await route.fulfill({ status, json: data });
});
try {
  if (process.argv.includes('--imports-only')) {
    importJobs.push(
      ...['blocked', 'download'].map((errorCode, i) => ({
        id: `failed-${i}`,
        communityId: 'home',
        userId: 'u1',
        status: 'failed',
        kind: 'url',
        url: 'https://www.tiktok.com/@chef/video/1',
        channel: 'web',
        errorCode,
        createdAt: '2026-10-04',
        updatedAt: '2026-10-04',
      })),
    );
    await page.goto(`${origin}/book?kitchen=home`);
    await page.getByRole('heading', { name: '2 imports failed', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Paste the caption', exact: true }).first().click();
    assert.equal(await page.getByRole('tab', { name: 'Text', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Upload the video', exact: true }).first().click();
    assert.equal(await page.getByRole('tab', { name: 'Upload', exact: true }).getAttribute('aria-selected'), 'true');
    const recipeReadsBeforeRetry = requests.filter((r) => r.p === '/api/communities/home/recipes').length;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: "Couldn't import", exact: true }).waitFor();
    assert(importJobs[1].dismissedAt);
    assert(
      requests.filter((r) => r.p === '/api/communities/home/recipes').length > recipeReadsBeforeRetry,
      'Retry completion refreshes recipes even without a polling cycle',
    );
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByRole('heading', { name: "Couldn't import", exact: true }).waitFor({ state: 'hidden' });
    communities = [];
    await page.goto(`${origin}/book`);
    await page.getByRole('button', { name: 'Save my first recipe' }).click();
    await page.getByLabel('Video or recipe link').fill('https://example.test/recipe');
    await page.getByRole('button', { name: 'Import recipe', exact: true }).click();
    await page
      .getByRole('link', { name: /Roast tomatoes/ })
      .first()
      .waitFor();
    assert(requests.some((r) => r.p === '/api/imports' && r.method === 'POST' && r.b.communityId === 'home'));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        checks: ['failure actions', 'upload/text alternatives', 'retry', 'dismiss', 'onboarding opens import form', 'fast completed import'],
        requests: requests.length,
      }),
    );
  } else {
    await page.goto(`${origin}/week?kitchen=home&week=${week}`);
    await page.getByRole('heading', { name: 'This week in Test kitchen' }).waitFor();
    await page.getByRole('button', { name: 'I’ll cook', exact: true }).click();
    await page.getByRole('button', { name: 'Unassign me' }).waitFor();
    assert.equal(plans.get(`home:${week}`).entries[0].cookId, 'u1');
    await page.goto(`${origin}/book/r-home?kitchen=home&week=${week}`);
    await page.getByRole('button', { name: 'Cook this week' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Day', { exact: true }).selectOption('1');
    await dialog.getByRole('button', { name: 'Add meal', exact: true }).click();
    await page.waitForURL('**/plan?**');
    assert.equal(plans.get(`home:${week}`).entries.length, 2);
    // A rejected write stays recoverable across navigation and preserves its revision.
    await page.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }).click();
    await page.getByRole('dialog').getByRole('option', { name: 'Roast tomatoes', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    failSave = true;
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await page.getByText('Someone changed this plan. Reload it before saving.', { exact: true }).waitFor();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('link', { name: 'Recipes', exact: true }).first().click();
    await page.goto(`${origin}/plan?kitchen=home&week=${week}`);
    await page.getByRole('button', { name: 'Restore draft' }).click();
    failSave = false;
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    await page.getByText('Plan saved', { exact: true }).waitFor();
    assert.equal(plans.get(`home:${week}`).entries.length, 3);
    await page.getByRole('link', { name: 'Shopping list', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('week'), week);
    await page.getByRole('button', { name: 'Review plan changes' }).click();
    await page.getByRole('heading', { name: 'Review shopping update' }).waitFor();
    await page.getByRole('button', { name: 'Apply update' }).click();
    await page.getByRole('heading', { name: 'Review shopping update' }).waitFor({ state: 'hidden' });
    assert.equal(list.items[0].checked, false);
    await page.goto(`${origin}/community?kitchen=home`);
    await page.getByRole('button', { name: 'Add a child or guest' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Guest');
    await page.getByRole('button', { name: 'Save kitchen profile' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert(diners.some((d) => d.name === 'Guest' && !d.userId));
    await page.goto(`${origin}/book/r-personal`);
    await page.getByLabel('Private note', { exact: true }).fill('Use the small pan');
    await page.getByLabel('Collections', { exact: true }).fill('Weeknights');
    await page.getByRole('button', { name: 'Save private notes' }).click();
    await page.getByText('Private notes saved', { exact: true }).waitFor();
    assert.equal(annotations[0].note, 'Use the small pan');
    await page.goto(`${origin}/circles`);
    await page.getByLabel('Circle name').fill('Sunday cooks');
    await page.getByRole('button', { name: 'Create circle', exact: true }).click();
    await page.waitForURL('**/book?kitchen=circle-new');
    assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).first().getByRole('link', { name: 'Plan', exact: true }).count(), 0);
    await page.goto(`${origin}/book/tech?kitchen=home`);
    await page.getByRole('heading', { name: 'Knife skills', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cook this week', exact: true }).count(), 0);
    // New-user onboarding is independent of group naming and bot linking.
    communities = [];
    await page.goto(`${origin}/book`);
    await page.getByRole('button', { name: 'Save my first recipe' }).click();
    await page.getByLabel('Video or recipe link').fill('https://example.test/recipe');
    await page.getByRole('button', { name: 'Import recipe', exact: true }).click();
    await page
      .getByRole('link', { name: /Roast tomatoes/ })
      .first()
      .waitFor();
    // Responsive checks and artifacts use actual rendered pages, with fixture data.
    await mkdir('artifacts/kitchen-check', { recursive: true });
    await page.goto(`${origin}/week?kitchen=home&week=${week}`);
    await page.getByRole('heading', { name: 'This week in Test kitchen' }).waitFor();
    await page.screenshot({ path: 'artifacts/kitchen-check/week-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('More', { exact: true }).click();
    await page.getByRole('link', { name: 'My recipes', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile page must not overflow horizontally');
    await page.screenshot({ path: 'artifacts/kitchen-check/week-mobile.png', fullPage: true });
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          'cooking assignment',
          'recipe to plan',
          'selected week',
          'failed-save draft recovery',
          'shopping review',
          'guest diner',
          'private notes',
          'circle separation',
          'technique detail preserved',
          'recipe-first onboarding',
          'mobile navigation',
          'no runtime errors',
        ],
        requests: requests.length,
      }),
    );
  }
} catch (e) {
  console.error({ url: page.url(), errors, body: (await page.locator('body').innerText()).slice(-5000) });
  await mkdir('artifacts/kitchen-check', { recursive: true });
  await page.screenshot({ path: 'artifacts/kitchen-check/failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}

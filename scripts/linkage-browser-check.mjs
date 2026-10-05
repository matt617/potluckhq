// Local fixtures only; no member or invitation writes reach a deployed API.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5181';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
});
await context.addInitScript(() => localStorage.setItem('potluck.tokens', JSON.stringify({ idToken: 'local-test', expiresAt: Date.now() + 3600000 })));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const user = {
  id: 'owner',
  displayName: 'Sam',
  email: 'sam@example.test',
  tier: 'plus',
  units: 'us',
  defaultCommunityId: 'home',
  diet: { allergies: [], diets: [], dislikes: [] },
};
const home = {
  id: 'home',
  name: 'Sunday kitchen',
  kind: 'kitchen',
  ownerId: 'owner',
  memberCount: 2,
  pantryStaples: [],
  role: 'owner',
};
const budget = {
  importsLeft: 90,
  allowanceLeftMicros: 1000000,
  creditMicros: 0,
  aiFeatures: true,
};
const members = [
  { userId: 'owner', displayName: 'Sam', role: 'owner' },
  { userId: 'alex', displayName: 'Alex', role: 'member' },
];
const nominations = [];
let inbox = [];
let transfer = null;
const requests = [];
const recipe = {
  id: 'recipe',
  title: 'Roast tomatoes',
  servings: 2,
  tags: [],
  totalMin: 25,
  ingredients: [],
  steps: [],
  source: { platform: 'text' },
  communityIds: ['home'],
  kitchenId: 'home',
  ownerId: 'KITCHEN#home',
};
await page.route('**/public/**', (route) => route.fulfill({ json: { tiers: [], creditPacks: [] } }));
await page.route('**/api/**', async (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname,
    method = request.method(),
    body = request.postDataJSON();
  requests.push({ path, method, body });
  let data;
  if (path === '/api/me') data = { user, budget, communities: [home], channels: [] };
  else if (path === '/api/me/nominations') data = { nominations: inbox };
  else if (path === '/api/communities/home') data = { community: home, role: 'owner', ownerTier: 'plus', members };
  else if (path.endsWith('/allowance')) data = { ownerName: 'Sam', tier: { name: 'Plus' }, budget };
  else if (path.endsWith('/participation')) data = { weeks: [] };
  else if (path.endsWith('/invites')) data = { invites: [] };
  else if (path.endsWith('/people')) data = { diners: [] };
  else if (path.endsWith('/transfer')) {
    if (method === 'POST') transfer = { to: body.to, from: 'owner', expiresAt: '2099-01-01' };
    data = { transfer };
  } else if (path.endsWith('/member-search'))
    data = {
      members:
        body.query === 'missing'
          ? []
          : [
              {
                userId: 'mira',
                displayName: 'Mira Patel',
                context: 'Email matches your search',
                status: 'available',
              },
            ],
    };
  else if (path.endsWith('/nominations/accept')) {
    inbox = [];
    data = home;
  } else if (path.endsWith('/nominations') && method === 'POST') {
    const n = {
      ...body,
      communityId: 'home',
      communityName: home.name,
      displayName: 'Mira Patel',
      nominatedByName: 'Sam',
      expiresAt: '2099-01-01',
    };
    nominations.push(n);
    data = { nomination: n };
  } else if (path.endsWith('/nominations')) data = { nominations };
  else if (path.includes('/nominations/') && method === 'DELETE') {
    nominations.length = 0;
    inbox = [];
    data = { ok: true };
  } else if (path.endsWith('/recipes')) data = { recipes: [recipe] };
  else if (path.includes('/plans/'))
    data = {
      plan: {
        communityId: 'home',
        weekStart: '2026-10-05',
        entries: [],
        constraints: [],
        revision: 0,
      },
      recipes: [recipe],
    };
  else throw new Error(`Missing fixture: ${method} ${path}`);
  await route.fulfill({ json: data });
});
try {
  await page.goto(`${origin}/community?kitchen=home`);
  await page.getByLabel('Find a member', { exact: true }).fill('mira@example.test');
  await page.getByRole('button', { name: 'Search members', exact: true }).click();
  await page.getByRole('button', { name: 'Select Mira Patel', exact: true }).click();
  assert.equal(nominations.length, 0, 'Selecting a person must not change membership');
  await page.getByRole('button', { name: 'Nominate Mira Patel', exact: true }).click();
  await page.getByText('Awaiting acceptance', { exact: false }).waitFor();
  assert.equal(nominations[0].userId, 'mira');
  assert.equal(members.length, 2, 'Nomination grants no access');
  await mkdir('artifacts/linkage-check', { recursive: true });
  await page.screenshot({
    path: 'artifacts/linkage-check/member-nomination-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await page.getByText('No nominations awaiting acceptance.').waitFor();
  await page.getByLabel('Find a member', { exact: true }).fill('missing');
  await page.getByRole('button', { name: 'Search members', exact: true }).click();
  await page.getByText(/No matching member found/).waitFor();
  await page.getByRole('combobox', { name: 'Nominate a new owner', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search members', exact: true }).fill('Alex');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Nominate owner', exact: true }).click();
  await page.getByText(/Pending acceptance by Alex/).waitFor();
  assert.equal(transfer.to, 'alex');
  await page.goto(`${origin}/plan?kitchen=home&week=2026-10-05`);
  await page.getByRole('button', { name: 'Add dinner on Wednesday', exact: true }).click();
  await page.getByRole('combobox', { name: 'Recipe', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search recipes', exact: true }).fill('tomato');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('combobox', { name: 'Recipe', exact: true }).innerText(), 'Roast tomatoes');
  await page.getByRole('combobox', { name: 'Recipe', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search recipes', exact: true }).fill('no matches');
  await page.getByText(/No recipes match/).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('combobox', { name: 'Recipe', exact: true }).innerText(), 'Roast tomatoes');
  await page.getByRole('combobox', { name: 'Search recipes', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('dialog', { name: 'Wednesday dinner' }).waitFor();
  const axe = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await page.screenshot({
    path: 'artifacts/linkage-check/meal-selection-desktop.png',
    fullPage: true,
  });
  inbox = [
    {
      communityId: 'home',
      communityName: home.name,
      userId: 'owner',
      displayName: 'Sam',
      nominatedByName: 'Mira',
      role: 'member',
      expiresAt: '2099-01-01',
    },
  ];
  await page.goto(`${origin}/community?kitchen=home`);
  await page.getByRole('button', { name: 'Accept nomination', exact: true }).click();
  await page.getByRole('button', { name: 'Accept nomination', exact: true }).waitFor({ state: 'hidden' });
  assert(requests.some((r) => r.path.endsWith('/nominations/accept') && r.method === 'POST'));
  inbox = [
    {
      communityId: 'home',
      communityName: home.name,
      userId: 'owner',
      displayName: 'Sam',
      nominatedByName: 'Mira',
      role: 'member',
      expiresAt: '2099-02-01',
    },
  ];
  await page.reload();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Find a member', { exact: true }).fill('Mira');
  await page.getByRole('button', { name: 'Search members', exact: true }).click();
  await page.getByRole('button', { name: 'Select Mira Patel', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile form must not overflow');
  await page.screenshot({
    path: 'artifacts/linkage-check/member-selection-mobile.png',
    fullPage: true,
  });
  const mobileAxe = await new AxeBuilder({ page }).include('section[aria-labelledby="members-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(
    mobileAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    'Linkage UX checks passed: lookup, nominate, withdraw, accept, decline, ownership, keyboard recipe selection, empty states, mobile and accessibility.',
  );
} finally {
  await browser.close();
}

/**
 * Swaggrr keyboard shortcut integration tests.
 *
 * Run with:  npm test
 *
 * Requires a headed browser — Chrome extensions don't work in headless mode.
 * The Playwright config starts the local static server automatically and
 * spreads tests across parallel workers (one Chrome instance per worker).
 */
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH  = path.resolve(__dirname, '..');
const FIXTURE   = 'http://localhost:7474/test/fixtures/swagger-petstore.html';

// ── Per-worker browser context (extension loaded once per worker) ─────────────
// With fullyParallel: true, each worker is a separate Node process, so these
// module-level variables are isolated — no cross-worker state sharing.

let ctx, page;

test.beforeAll(async () => {
  // Each worker calls this independently and gets its own temp profile dir.
  ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
});

test.beforeEach(async () => {
  page = await ctx.newPage();
  await page.goto(FIXTURE);
  await page.waitForSelector('.opblock', { timeout: 15_000 });
  await page.waitForTimeout(300);
});

test.afterEach(async () => {
  await page.close();
});

test.afterAll(async () => {
  await ctx.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const press = key => page.keyboard.press(key);

const countBlocks = () => page.locator('.opblock').count();
const countOpen   = () => page.locator('.opblock.is-open').count();
const focusedId   = () => page.evaluate(() =>
  document.querySelector('.opblock.swaggrr-focus')?.id ?? null
);
const focusedSection = () => page.evaluate(() => {
  const block = document.querySelector('.opblock.swaggrr-focus');
  return block
    ?.closest('.opblock-tag-section')
    ?.querySelector('.opblock-tag')
    ?.textContent?.trim()
    ?? null;
});

// ── Navigation ────────────────────────────────────────────────────────────────

test('j focuses the first endpoint', async () => {
  await press('j');
  expect(await focusedId()).not.toBeNull();
});

test('j moves focus forward', async () => {
  await press('j');
  const a = await focusedId();
  await press('j');
  const b = await focusedId();
  expect(b).not.toBeNull();
  expect(b).not.toBe(a);
});

test('j wraps from the last endpoint back to the first', async () => {
  await press('j');
  const firstId = await focusedId();
  await press('k'); // wrap to last
  const lastId  = await focusedId();
  expect(lastId).not.toBe(firstId);

  await press('j'); // wrap last → first
  expect(await focusedId()).toBe(firstId);
});

test('k moves focus backward', async () => {
  await press('j');
  await press('j'); // skip to second
  const second = await focusedId();
  await press('k');
  const first = await focusedId();
  expect(first).not.toBe(second);
});

test('k wraps from the first endpoint to the last', async () => {
  await press('j');
  const firstId = await focusedId();
  await press('k');
  const lastId = await focusedId();
  expect(lastId).not.toBe(firstId);
});

test('ArrowDown / ArrowUp are aliases for j / k', async () => {
  await press('ArrowDown');
  const a = await focusedId();
  await press('ArrowDown');
  const b = await focusedId();
  expect(b).not.toBe(a);
  await press('ArrowUp');
  expect(await focusedId()).toBe(a);
});

test('only one endpoint has swaggrr-focus at a time', async () => {
  await press('j');
  await press('j');
  await press('j');
  expect(await page.locator('.opblock.swaggrr-focus').count()).toBe(1);
});

// ── Expand / collapse ─────────────────────────────────────────────────────────

test('Enter expands the focused endpoint', async () => {
  await press('j');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`, { timeout: 3000 });
  expect(await page.locator(`#${id}.is-open`).count()).toBe(1);
});

test('Enter collapses an already-open endpoint', async () => {
  await press('j');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  await press('Enter');
  await page.waitForFunction(
    id => !document.querySelector(`#${id}.is-open`), id, { timeout: 3000 }
  );
  expect(await page.locator(`#${id}.is-open`).count()).toBe(0);
});

test('Space is an alias for Enter (expands and collapses)', async () => {
  await press('j');
  const id = await focusedId();
  await press('Space');
  await page.waitForSelector(`#${id}.is-open`, { timeout: 3000 });
  await press('Space');
  await page.waitForFunction(
    id => !document.querySelector(`#${id}.is-open`), id, { timeout: 3000 }
  );
  expect(await page.locator(`#${id}.is-open`).count()).toBe(0);
});

test('focus class persists on the same block after React re-renders it', async () => {
  await press('j');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  expect(await page.locator(`#${id}.swaggrr-focus`).count()).toBe(1);
});

// ── Expand all / collapse all ─────────────────────────────────────────────────

test('o expands all visible endpoints', async () => {
  const total = await countBlocks();
  await press('o');
  await page.waitForFunction(
    total => document.querySelectorAll('.opblock.is-open').length === total,
    total, { timeout: 5000 }
  );
  expect(await countOpen()).toBe(total);
});

test('c collapses all open endpoints', async () => {
  const total = await countBlocks();
  await press('o');
  await page.waitForFunction(
    total => document.querySelectorAll('.opblock.is-open').length === total,
    total, { timeout: 5000 }
  );
  await press('c');
  await page.waitForFunction(
    () => document.querySelectorAll('.opblock.is-open').length === 0, null, { timeout: 5000 }
  );
  expect(await countOpen()).toBe(0);
});

test('c does nothing when all endpoints are already collapsed', async () => {
  expect(await countOpen()).toBe(0);
  await press('c');
  expect(await countOpen()).toBe(0);
});

test('c collapses an endpoint that has try-it-out active', async () => {
  await press('j');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await press('c');
  await page.waitForFunction(
    () => document.querySelectorAll('.opblock.is-open').length === 0, null, { timeout: 5000 }
  );
  expect(await countOpen()).toBe(0);
});

test('j navigation works correctly after o expand-all', async () => {
  const total = await countBlocks();
  await press('o');
  await page.waitForFunction(
    total => document.querySelectorAll('.opblock.is-open').length === total,
    total, { timeout: 5000 }
  );
  await press('j');
  const a = await focusedId();
  expect(a).not.toBeNull();
  await press('j');
  const b = await focusedId();
  expect(b).not.toBe(a);
});

// ── Try it out ────────────────────────────────────────────────────────────────

test('t opens try-it-out on a collapsed endpoint', async () => {
  await press('j');
  const id = await focusedId();
  const isOpen = await page.locator(`#${id}.is-open`).count();
  if (isOpen) await press('Enter');
  await page.waitForFunction(id => !document.querySelector(`#${id}.is-open`), id);
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
});

test('t activates try-it-out on an already-open endpoint', async () => {
  await press('j');
  await press('Enter');
  const id = await focusedId();
  await page.waitForSelector(`#${id}.is-open`);
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 3000 });
});

test('t cancels active try-it-out (acts as a toggle)', async () => {
  await press('j');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await press('t'); // second press → cancel
  await page.waitForSelector(`#${id} .try-out__btn:not(.cancel)`, { timeout: 3000 });
  expect(await page.locator(`#${id} .try-out__btn.cancel`).count()).toBe(0);
});

test('t activates try-it-out on a second endpoint while another has it open', async () => {
  await press('j');
  const idA = await focusedId();
  await press('t');
  await page.waitForSelector(`#${idA} .try-out__btn.cancel`, { timeout: 5000 });

  await press('j');
  const idB = await focusedId();
  expect(idB).not.toBe(idA);

  await press('t');
  await page.waitForSelector(`#${idB} .try-out__btn.cancel`, { timeout: 5000 });

  // A stays untouched
  expect(await page.locator(`#${idA} .try-out__btn.cancel`).count()).toBe(1);
});

// ── Section jumps ─────────────────────────────────────────────────────────────

test('J jumps to the first endpoint of the next section', async () => {
  await press('J'); // no focus → first section (pets)
  expect(await focusedSection()).toContain('pets');

  await press('J'); // pets → users
  expect(await focusedSection()).toContain('users');
});

test('J wraps from the last section back to the first', async () => {
  await press('J'); // → pets
  await press('J'); // → users
  await press('J'); // wraps → pets
  expect(await focusedSection()).toContain('pets');
});

test('K jumps to the first endpoint of the previous section', async () => {
  await press('J'); // → pets
  await press('J'); // → users
  await press('K'); // users → pets
  expect(await focusedSection()).toContain('pets');
});

test('K wraps from the first section to the last', async () => {
  await press('J'); // → pets (first section)
  expect(await focusedSection()).toContain('pets');
  await press('K'); // wraps → users (last section)
  expect(await focusedSection()).toContain('users');
});

// ── Authorize dialog ──────────────────────────────────────────────────────────

test('a opens the Authorize dialog', async () => {
  await press('a');
  await page.waitForSelector('.dialog-ux', { timeout: 3000 });
  expect(await page.locator('.dialog-ux').count()).toBe(1);
});

test('Escape closes the Authorize dialog', async () => {
  await press('a');
  await page.waitForSelector('.dialog-ux');
  await press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('.dialog-ux'), null, { timeout: 3000 }
  );
  expect(await page.locator('.dialog-ux').count()).toBe(0);
});

test('Escape closes the Authorize dialog even while typing in it', async () => {
  await press('a');
  await page.waitForSelector('.dialog-ux');
  const input = page.locator('.dialog-ux input').first();
  if (await input.count()) {
    await input.fill('test-token');
    await press('Escape'); // Escape is not blocked by isInputFocused
    await page.waitForFunction(
      () => !document.querySelector('.dialog-ux'), null, { timeout: 3000 }
    );
    expect(await page.locator('.dialog-ux').count()).toBe(0);
  }
});

// ── Help overlay ──────────────────────────────────────────────────────────────

test('? shows the help overlay', async () => {
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeVisible();
});

test('? toggles the help overlay off', async () => {
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeVisible();
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeHidden();
});

test('Escape closes the help overlay', async () => {
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeVisible();
  await press('Escape');
  await expect(page.locator('#swaggrr-help')).toBeHidden();
});

test('clicking the backdrop closes the help overlay', async () => {
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeVisible();
  // Click the backdrop (top-left corner, well outside the card)
  await page.locator('#swaggrr-help').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#swaggrr-help')).toBeHidden();
});

test('Escape closes help but not both help and Authorize at once', async () => {
  await press('?');
  await expect(page.locator('#swaggrr-help')).toBeVisible();
  await press('Escape'); // should close help only
  await expect(page.locator('#swaggrr-help')).toBeHidden();
  // Authorize dialog was never opened — pressing Escape again is a no-op
  expect(await page.locator('.dialog-ux').count()).toBe(0);
});

// ── Filter ────────────────────────────────────────────────────────────────────

test('f focuses the filter input', async () => {
  await press('f');
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('operation-filter-input')
    )
  ).toBe(true);
});

test('shortcuts are suppressed while the filter input is focused', async () => {
  await press('j');
  const idBefore = await focusedId();
  await press('f'); // focus filter input
  // ArrowDown is a navigation shortcut but doesn't insert characters into the
  // input, so Swagger won't re-filter and remove blocks from the DOM.
  await press('ArrowDown');
  expect(await focusedId()).toBe(idBefore);
});

// ── Shortcuts suppressed in try-it-out inputs ─────────────────────────────────

test('j does not move focus while a try-it-out input is focused', async () => {
  await press('j');
  await press('t');
  await page.waitForSelector('.try-out__btn.cancel', { timeout: 5000 });

  const idBefore = await focusedId();
  const input = page.locator('.opblock.swaggrr-focus input').first();
  if (await input.count()) {
    await input.focus();
    await press('j');
    expect(await focusedId()).toBe(idBefore);
  }
});

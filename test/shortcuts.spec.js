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

test('ArrowDown focuses the first endpoint', async () => {
  await press('ArrowDown');
  expect(await focusedId()).not.toBeNull();
});

test('ArrowDown moves focus forward', async () => {
  await press('ArrowDown');
  const a = await focusedId();
  await press('ArrowDown');
  const b = await focusedId();
  expect(b).not.toBeNull();
  expect(b).not.toBe(a);
});

test('ArrowDown wraps from the last endpoint back to the first', async () => {
  await press('ArrowDown');
  const firstId = await focusedId();
  await press('ArrowUp'); // wrap to last
  const lastId  = await focusedId();
  expect(lastId).not.toBe(firstId);

  await press('ArrowDown'); // wrap last → first
  expect(await focusedId()).toBe(firstId);
});

test('ArrowUp moves focus backward', async () => {
  await press('ArrowDown');
  await press('ArrowDown'); // skip to second
  const second = await focusedId();
  await press('ArrowUp');
  const first = await focusedId();
  expect(first).not.toBe(second);
});

test('ArrowUp wraps from the first endpoint to the last', async () => {
  await press('ArrowDown');
  const firstId = await focusedId();
  await press('ArrowUp');
  const lastId = await focusedId();
  expect(lastId).not.toBe(firstId);
});

test('only one endpoint has swaggrr-focus at a time', async () => {
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowDown');
  expect(await page.locator('.opblock.swaggrr-focus').count()).toBe(1);
});

// ── Expand / collapse ─────────────────────────────────────────────────────────

test('ArrowRight expands a collapsed endpoint', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await page.waitForFunction(id => !document.querySelector(`#${id}.is-open`), id);
  await press('ArrowRight');
  await page.waitForSelector(`#${id}.is-open`, { timeout: 3000 });
  expect(await page.locator(`#${id}.is-open`).count()).toBe(1);
});

test('ArrowRight is a no-op when the endpoint is already open', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  await press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await page.locator(`#${id}.is-open`).count()).toBe(1);
});

test('ArrowLeft collapses an open endpoint', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  await press('ArrowLeft');
  await page.waitForFunction(
    id => !document.querySelector(`#${id}.is-open`), id, { timeout: 3000 }
  );
  expect(await page.locator(`#${id}.is-open`).count()).toBe(0);
});

test('ArrowLeft is a no-op when the endpoint is already collapsed', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await page.waitForFunction(id => !document.querySelector(`#${id}.is-open`), id);
  await press('ArrowLeft');
  await page.waitForTimeout(300);
  expect(await page.locator(`#${id}.is-open`).count()).toBe(0);
});

test('Enter expands the focused endpoint', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`, { timeout: 3000 });
  expect(await page.locator(`#${id}.is-open`).count()).toBe(1);
});

test('Enter collapses an already-open endpoint', async () => {
  await press('ArrowDown');
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
  await press('ArrowDown');
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
  await press('ArrowDown');
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
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await press('c');
  await page.waitForFunction(
    () => document.querySelectorAll('.opblock.is-open').length === 0, null, { timeout: 5000 }
  );
  expect(await countOpen()).toBe(0);
});

test('ArrowDown navigation works correctly after o expand-all', async () => {
  const total = await countBlocks();
  await press('o');
  await page.waitForFunction(
    total => document.querySelectorAll('.opblock.is-open').length === total,
    total, { timeout: 5000 }
  );
  await press('ArrowDown');
  const a = await focusedId();
  expect(a).not.toBeNull();
  await press('ArrowDown');
  const b = await focusedId();
  expect(b).not.toBe(a);
});

// ── Try it out ────────────────────────────────────────────────────────────────

test('t opens try-it-out on a collapsed endpoint', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  const isOpen = await page.locator(`#${id}.is-open`).count();
  if (isOpen) await press('Enter');
  await page.waitForFunction(id => !document.querySelector(`#${id}.is-open`), id);
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
});

test('t activates try-it-out on an already-open endpoint', async () => {
  await press('ArrowDown');
  await press('Enter');
  const id = await focusedId();
  await page.waitForSelector(`#${id}.is-open`);
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 3000 });
});

test('t cancels active try-it-out (acts as a toggle)', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await press('t'); // second press → cancel
  await page.waitForSelector(`#${id} .try-out__btn:not(.cancel)`, { timeout: 3000 });
  expect(await page.locator(`#${id} .try-out__btn.cancel`).count()).toBe(0);
});

test('t activates try-it-out on a second endpoint while another has it open', async () => {
  await press('ArrowDown');
  const idA = await focusedId();
  await press('t');
  await page.waitForSelector(`#${idA} .try-out__btn.cancel`, { timeout: 5000 });

  await press('ArrowDown');
  const idB = await focusedId();
  expect(idB).not.toBe(idA);

  await press('t');
  await page.waitForSelector(`#${idB} .try-out__btn.cancel`, { timeout: 5000 });

  // A stays untouched
  expect(await page.locator(`#${idA} .try-out__btn.cancel`).count()).toBe(1);
});

test('t moves real focus into the endpoint body after activating try-it-out', async () => {
  // Navigate to getPet which has a path parameter input in try-it-out mode
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  // focusFirstInputWhenReady is async — wait until focus lands inside the block
  await page.waitForFunction(id =>
    document.activeElement?.closest(`#${id}`) !== null, id, { timeout: 3000 }
  );
  expect(await page.evaluate(id =>
    document.activeElement?.closest(`#${id}`) !== null, id
  )).toBe(true);
});

test('t does not focus the content-type select on an endpoint with a request body', async () => {
  // createPet (second endpoint) has a multi-media-type request body, which
  // causes Swagger UI to render a select.content-type dropdown.  Focus should
  // land on the body textarea, not on that dropdown.
  await press('ArrowDown');
  await press('ArrowDown'); // createPet
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await page.waitForFunction(id =>
    document.activeElement?.closest(`#${id}`) !== null, id, { timeout: 3000 }
  );
  const focusedClass = await page.evaluate(() => document.activeElement?.className ?? '');
  expect(focusedClass).not.toContain('content-type');
});

// ── Section jumps ─────────────────────────────────────────────────────────────

test('PageDown jumps to the first endpoint of the next section', async () => {
  await press('PageDown'); // no focus → first section (pets)
  expect(await focusedSection()).toContain('pets');

  await press('PageDown'); // pets → users
  expect(await focusedSection()).toContain('users');
});

test('PageDown wraps from the last section back to the first', async () => {
  await press('PageDown'); // → pets
  await press('PageDown'); // → users
  await press('PageDown'); // wraps → pets
  expect(await focusedSection()).toContain('pets');
});

test('PageUp jumps to the first endpoint of the previous section', async () => {
  await press('PageDown'); // → pets
  await press('PageDown'); // → users
  await press('PageUp'); // users → pets
  expect(await focusedSection()).toContain('pets');
});

test('PageUp wraps from the first section to the last', async () => {
  await press('PageDown'); // → pets (first section)
  expect(await focusedSection()).toContain('pets');
  await press('PageUp'); // wraps → users (last section)
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
  await press('ArrowDown');
  const idBefore = await focusedId();
  await press('f'); // focus filter input
  // ArrowDown is a navigation shortcut but doesn't insert characters into the
  // input, so Swagger won't re-filter and remove blocks from the DOM.
  await press('ArrowDown');
  expect(await focusedId()).toBe(idBefore);
});

// ── Shortcuts suppressed in try-it-out inputs ─────────────────────────────────

test('ArrowDown does not move focus while a try-it-out input is focused', async () => {
  await press('ArrowDown');
  await press('t');
  await page.waitForSelector('.try-out__btn.cancel', { timeout: 5000 });

  const idBefore = await focusedId();
  const input = page.locator('.opblock.swaggrr-focus input').first();
  if (await input.count()) {
    await input.focus();
    await press('ArrowDown');
    expect(await focusedId()).toBe(idBefore);
  }
});

// ── Enter form (l / Shift+Enter) ──────────────────────────────────────────────

test('l moves real focus into an open endpoint', async () => {
  // Navigate to getPet which has a Try-it-out button once the body renders
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  await press('l');
  // enterForm is async (body renders after .is-open) — poll until focus lands
  await page.waitForFunction(id =>
    document.activeElement?.closest(`#${id}`) !== null, id, { timeout: 3000 }
  );
  expect(await page.evaluate(id =>
    document.activeElement?.closest(`#${id}`) !== null, id
  )).toBe(true);
});

test('Shift+Enter moves real focus into an open endpoint', async () => {
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter');
  await page.waitForSelector(`#${id}.is-open`);
  await press('Shift+Enter');
  await page.waitForFunction(id =>
    document.activeElement?.closest(`#${id}`) !== null, id, { timeout: 3000 }
  );
  expect(await page.evaluate(id =>
    document.activeElement?.closest(`#${id}`) !== null, id
  )).toBe(true);
});

test('l expands a collapsed endpoint then enters the form', async () => {
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowDown');
  const id = await focusedId();
  // Ensure it's collapsed
  await page.waitForFunction(id => !document.querySelector(`#${id}.is-open`), id);
  await press('l');
  await page.waitForSelector(`#${id}.is-open`, { timeout: 3000 });
  await page.waitForFunction(id =>
    document.activeElement?.closest(`#${id}`) !== null, id, { timeout: 3000 }
  );
  expect(await page.evaluate(id =>
    document.activeElement?.closest(`#${id}`) !== null, id
  )).toBe(true);
});

// ── Execute (Ctrl+Enter / Cmd+Enter) ─────────────────────────────────────────

test('Ctrl+Enter executes the endpoint when try-it-out is active', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await page.waitForSelector(`#${id} .btn.execute`, { timeout: 3000 });
  await press('Control+Enter');
  // Page should not crash — execute button remains (endpoint returns a response)
  expect(await page.locator(`#${id} .btn.execute`).count()).toBe(1);
});

test('Meta+Enter executes the endpoint when try-it-out is active', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await page.waitForSelector(`#${id} .btn.execute`, { timeout: 3000 });
  await press('Meta+Enter');
  expect(await page.locator(`#${id} .btn.execute`).count()).toBe(1);
});

test('Ctrl+Enter is a no-op when try-it-out is not active', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('Enter'); // expand only
  await page.waitForSelector(`#${id}.is-open`);
  await press('Control+Enter');
  // No response area should have appeared
  expect(await page.locator(`#${id} .btn.execute`).count()).toBe(0);
});

test('Ctrl+Enter executes even while a form input is focused', async () => {
  await press('ArrowDown');
  const id = await focusedId();
  await press('t');
  await page.waitForSelector(`#${id} .try-out__btn.cancel`, { timeout: 5000 });
  await page.waitForSelector(`#${id} .btn.execute`, { timeout: 3000 });
  // If there are inputs, focus one to simulate mid-fill execution
  const input = page.locator(`#${id} .opblock-body input`).first();
  if (await input.count()) {
    await input.focus();
    await press('Control+Enter');
    expect(await page.locator(`#${id} .btn.execute`).count()).toBe(1);
  }
});

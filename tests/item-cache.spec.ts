import { test, expect, type Page } from '@playwright/test';
import { ITEMS_URL } from '../src/lib/api';
import { ITEM_CACHE_DB, ITEM_CACHE_STORE, ITEM_CACHE_MAX_AGE } from '../src/lib/itemCache';
import { fixtureItems } from '../src/test/fixtures';
import { STORAGE_KEY } from '../src/types';

async function readCache(page: Page) {
  return page.evaluate(({ database, store, key }) => new Promise<{ fetchedAt: number; items: ReturnType<typeof fixtureItems> } | undefined>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, 'readonly');
      const operation = transaction.objectStore(store).get(key);
      transaction.oncomplete = () => { db.close(); resolve(operation.result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), { database: ITEM_CACHE_DB, store: ITEM_CACHE_STORE, key: ITEMS_URL });
}

async function seedCache(page: Page, record: unknown) {
  await page.evaluate(({ database, store, key, record }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).put(record, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), { database: ITEM_CACHE_DB, store: ITEM_CACHE_STORE, key: ITEMS_URL, record });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
});

async function firstVisit(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  await expect.poll(() => readCache(page)).toBeTruthy();
}

test('fresh items survive closing the tab and are reused without API requests', async ({ page, context }) => {
  await firstVisit(page);
  await page.close();
  const returning = await context.newPage();
  let requests = 0;
  await returning.route('**/v1/assets/items?**', route => { requests++; return route.abort(); });
  await returning.goto('/');
  await expect(returning.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  expect(requests).toBe(0);
  await returning.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(returning.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
});

test('expired cached items stay playable during a slow refresh and active games stay unchanged', async ({ page }) => {
  await firstVisit(page);
  const oldTimestamp = Date.now() - ITEM_CACHE_MAX_AGE - 1000;
  await seedCache(page, { version: 1, fetchedAt: oldTimestamp, items: fixtureItems() });
  let finish!: () => void;
  const responseReady = new Promise<void>(resolve => { finish = resolve; });
  const updated = fixtureItems().map(item => ({ ...item, name: `${item.name} updated` }));
  await page.route('**/v1/assets/items?**', async route => {
    await responseReady;
    await route.fulfill({ json: updated });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const snapshot = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).active, STORAGE_KEY);
  expect(snapshot.questions.every((question: { item: { name: string } }) => !question.item.name.endsWith(' updated'))).toBe(true);
  finish();
  await expect.poll(async () => (await readCache(page))?.items[0].name).toBe(updated[0].name);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).active, STORAGE_KEY)).toEqual(snapshot);
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game · -10' }).click();
  const next = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).active, STORAGE_KEY);
  expect(next.questions.every((question: { item: { name: string } }) => question.item.name.endsWith(' updated'))).toBe(true);
});

test('failed refresh keeps stale data and retry updates it without disabling play', async ({ page }) => {
  await firstVisit(page);
  const fetchedAt = Date.now() - ITEM_CACHE_MAX_AGE - 1000;
  await seedCache(page, { version: 1, fetchedAt, items: fixtureItems() });
  await page.route('**/v1/assets/items?**', route => route.fulfill({ status: 503 }));
  await page.reload();
  await expect(page.getByText('Using saved item data')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  expect((await readCache(page))?.fetchedAt).toBe(fetchedAt);
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
  await page.getByRole('button', { name: 'Retry update', exact: true }).click();
  await expect.poll(async () => (await readCache(page))?.fetchedAt).toBeGreaterThan(fetchedAt);
  await expect(page.getByText('Using saved item data')).toHaveCount(0);
});

for (const [name, record] of [
  ['unsupported version', { version: 99, fetchedAt: Date.now(), items: fixtureItems() }],
  ['malformed item', { version: 1, fetchedAt: Date.now(), items: [{ id: 'invalid' }] }],
  ['empty items', { version: 1, fetchedAt: Date.now(), items: [] }],
  ['future timestamp', { version: 1, fetchedAt: Date.now() + ITEM_CACHE_MAX_AGE, items: fixtureItems() }],
]) {
  test(`invalid cache falls back to the API (${name})`, async ({ page }) => {
    await firstVisit(page);
    await seedCache(page, record);
    let requests = 0;
    await page.route('**/v1/assets/items?**', route => { requests++; return route.fulfill({ json: fixtureItems() }); });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
    expect(requests).toBeGreaterThan(0);
    await expect.poll(async () => (await readCache(page))?.items.length).toBe(fixtureItems().length);
  });
}

test('unavailable IndexedDB does not prevent network loading or scoring', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.getByText('Now you know.')).toBeVisible();
});

test('refused cache writes do not block play and the next visit fetches again', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  let requests = 0;
  await page.route('**/v1/assets/items?**', route => { requests++; return route.fulfill({ json: fixtureItems() }); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  expect(await readCache(page)).toBeUndefined();
  const before = requests;
  await page.reload();
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
  expect(requests).toBeGreaterThan(before);
});

test('cached descriptions are sanitized again before use', async ({ page }) => {
  await firstVisit(page);
  const items = fixtureItems();
  for (const item of items) item.tooltip_sections![0].section_attributes[0].loc_string = '<b>Safe formatting</b><img src=x onerror="window.cacheXss = true"><script>window.cacheXss = true</script>';
  await seedCache(page, { version: 1, fetchedAt: Date.now(), items });
  await page.reload();
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const descriptions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).active.questions.map((question: { item: { tooltip_sections: { section_attributes: { loc_string: string }[] }[] } }) => question.item.tooltip_sections[0].section_attributes[0].loc_string), STORAGE_KEY);
  expect(descriptions).toEqual(Array(15).fill('<b>Safe formatting</b>'));
  expect(await page.evaluate(() => Reflect.get(window, 'cacheXss'))).toBeUndefined();
});

import { test, expect, type Page } from '@playwright/test';
import { fixtureItems } from '../src/test/fixtures';
import { STORAGE_KEY, type StudyState } from '../src/types';

const artwork = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#e4b20c"/><circle cx="36" cy="36" r="18" fill="#4b3b30"/></svg>';
const icon = (page: Page) => page.locator('.item-shop-icon img');
const readActive = (page: Page) => page.evaluate(key => (JSON.parse(localStorage.getItem(key)!) as StudyState).active!, STORAGE_KEY);

test.beforeEach(async ({ page }) => {
  await page.route('https://example.com/shop-icons/**', route => route.fulfill({ contentType: 'image/svg+xml', body: artwork }));
});

test('shows the current item shop icon before and after answering, on the next question, and after reload', async ({ page }) => {
  const items = fixtureItems().map(item => ({
    ...item,
    shop_image_webp: `https://example.com/shop-icons/${item.id}.webp`,
    shop_image: `https://example.com/shop-icons/${item.id}.png`,
    image: `https://example.com/shop-icons/${item.id}-regular.png`,
  }));
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: items }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const first = (await readActive(page)).questions[0].item;
  await expect(icon(page)).toHaveAttribute('src', first.shop_image_webp!);
  await expect(icon(page)).toHaveAttribute('alt', `${first.name} shop icon`);
  await expect.poll(() => icon(page).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(72);
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(icon(page)).toHaveAttribute('src', first.shop_image_webp!);
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  const second = (await readActive(page)).questions[1].item;
  await expect(icon(page)).toHaveAttribute('src', second.shop_image_webp!);
  await page.reload();
  await expect(icon(page)).toHaveAttribute('src', second.shop_image_webp!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await icon(page).scrollIntoViewIfNeeded();
  await expect(icon(page)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.openchamber/screenshots/practice-shop-icon-mobile.png', fullPage: true });
});

test('uses the PNG shop icon when WebP is missing', async ({ page }) => {
  const items = fixtureItems().map(item => ({ ...item, shop_image: `https://example.com/shop-icons/${item.id}.png` }));
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: items }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const item = (await readActive(page)).questions[0].item;
  await expect(icon(page)).toHaveAttribute('src', item.shop_image!);
  await expect.poll(() => icon(page).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(72);
});

test('tries the alternate shop format and regular icon when shop artwork fails', async ({ page }) => {
  const items = fixtureItems().map(item => ({
    ...item,
    shop_image_webp: `https://example.com/shop-icons/${item.id}.webp`,
    shop_image: `https://example.com/shop-icons/${item.id}.png`,
    image: `https://example.com/shop-icons/${item.id}-regular.svg`,
  }));
  const failedRequests: string[] = [];
  await page.route('https://example.com/shop-icons/*.*', route => {
    if (route.request().url().endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: artwork });
    failedRequests.push(route.request().url());
    return route.abort();
  });
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: items }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const item = (await readActive(page)).questions[0].item;
  await expect(icon(page)).toHaveAttribute('src', item.image!);
  await expect.poll(() => icon(page).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(72);
  expect(failedRequests).toContain(item.shop_image_webp);
  expect(failedRequests).toContain(item.shop_image);
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.getByText('Now you know.')).toBeVisible();
});

for (const missing of [true, false]) {
  test(`shows a placeholder without blocking practice when artwork is ${missing ? 'missing' : 'unavailable'}`, async ({ page }) => {
    const items = fixtureItems().map(item => ({ ...item, shop_image: missing ? null : `https://example.com/shop-icons/${item.id}.png` }));
    await page.route('https://example.com/shop-icons/**', route => route.abort());
    await page.route('**/v1/assets/items?**', route => route.fulfill({ json: items }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Start a game', exact: true }).click();
    const item = (await readActive(page)).questions[0].item;
    await expect(page.getByRole('img', { name: `${item.name} shop icon unavailable`, exact: true })).toBeVisible();
    await expect(icon(page)).toHaveCount(0);
    await page.getByRole('button', { name: /Not sure No points/ }).click();
    await expect(page.getByText('Now you know.')).toBeVisible();
  });
}

import { test, expect } from '@playwright/test';
import { fixtureItems } from '../src/test/fixtures';
import { createGame, transition } from '../src/lib/game';
import { emptyState } from '../src/lib/storage';
import { STORAGE_KEY } from '../src/types';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`starts with the ${colorScheme} system theme and resets to it on reload`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Dark theme', exact: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
    await expect(toggle).toHaveAttribute('aria-pressed', String(colorScheme === 'dark'));
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', colorScheme === 'dark' ? '#211e1b' : '#faf7f2');
    await toggle.focus();
    await page.keyboard.press('Enter');
    const next = colorScheme === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', next);
    await expect(toggle).toHaveAttribute('aria-pressed', String(next === 'dark'));
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', next);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
  });
}

test('follows system changes until the theme is manually toggled', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('recent games keep distinct icon backgrounds during smooth hover in both themes', async ({ page }) => {
  const at = new Date();
  const game = createGame(fixtureItems());
  let state = transition(emptyState(), { type: 'start', game, at });
  for (const question of game.questions) {
    state = transition(state, { type: 'answer', selection: question.correctLabel, at });
    state = transition(state, { type: 'next' });
  }
  state = transition(state, { type: 'start', game: createGame(fixtureItems()), at });
  state = transition(state, { type: 'abandon', gameId: state.active!.id, at });
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    for (const row of await page.locator('.game-row').all()) {
      const before = await row.evaluate(element => getComputedStyle(element).backgroundColor);
      const icon = await row.locator('.session-icon').evaluate(element => getComputedStyle(element).backgroundColor);
      await row.hover();
      await expect(row).toHaveCSS('background-color', colorScheme === 'dark' ? 'rgb(78, 64, 51)' : 'rgb(227, 214, 198)');
      const after = await row.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(after).not.toBe(before);
      expect(after).not.toBe(icon);
      await expect(row.locator('.session-icon')).toHaveCSS('background-color', icon);
      const transition = await row.evaluate(element => getComputedStyle(element).transitionDuration);
      expect(transition.split(',').map(parseFloat).every(value => value > 0)).toBe(true);
      await page.mouse.move(0, 0);
    }
    if (colorScheme === 'dark') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.page-heading')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: '.openchamber/screenshots/theme-dark-overview.png', fullPage: true });
    }
  }
});

test('dark theme covers every screen and remains usable on mobile with reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/#/practice');
  await expect(page.locator('.practice-launch')).toHaveCSS('background-color', 'rgb(51, 44, 37)');
  await expect(page.locator('.paper-preview')).toHaveCSS('background-color', 'rgb(41, 37, 33)');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.locator('.answer-choice').first()).toHaveCSS('background-color', 'rgb(41, 37, 33)');
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.locator('.feedback-card')).toHaveCSS('background-color', 'rgb(58, 48, 39)');
  await page.getByText('Game options', { exact: true }).click();
  await page.getByRole('button', { name: /Abandon game/ }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(41, 37, 33)');
  await page.getByRole('dialog').getByRole('button', { name: /Abandon game/ }).click();
  await expect(page.locator('.summary-score')).toHaveCSS('background-color', 'rgb(51, 44, 37)');
  await page.getByRole('button', { name: 'Back to history' }).click();
  await expect(page.locator('.history-game-card')).toHaveCSS('background-color', 'rgb(41, 37, 33)');
  await page.getByRole('tab', { name: /Daily activity/ }).click();
  await expect(page.locator('.data-table th').first()).toHaveCSS('background-color', 'rgb(48, 42, 36)');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const toggle = page.getByRole('button', { name: 'Dark theme', exact: true });
    await expect(toggle).toBeInViewport();
    await expect(toggle).toHaveCSS('transition-duration', '0s');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
});

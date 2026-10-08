import { test, expect, type Page } from '@playwright/test';
import { fixtureItems } from '../src/test/fixtures';
import { createGame, transition } from '../src/lib/game';
import { emptyState } from '../src/lib/storage';
import { STORAGE_KEY } from '../src/types';

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const active = page.url().includes('#/practice') ? 'Practice' : page.url().includes('#/history') ? 'History' : 'Overview';
  await expect(page.locator('.site-nav .nav-active')).toHaveText(active);
  for (const element of await page.locator('.page-heading, .summary-hero, .history-toolbar').all()) {
    await expect(element).toHaveCSS('opacity', '1');
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `.openchamber/screenshots/${name}.png`, fullPage: true });
}

function completedState() {
  const game = createGame(fixtureItems());
  const at = new Date();
  let state = transition(emptyState(), { type: 'start', game, at });
  for (let index = 0; index < 15; index++) {
    const q = game.questions[index];
    const selection = index === 0 ? q.choices.find(choice => choice !== q.correctLabel)! : index === 1 ? null : q.correctLabel;
    state = transition(state, { type: 'answer', selection, at });
    state = transition(state, { type: 'next' });
  }
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
});

test('Practice previews expand, navigation supports back/forward, and starting needs one click', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(page.getByRole('button', { name: 'Read the item.' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Trust your recall.' }).click();
  await expect(page.getByRole('button', { name: 'Read the item.' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Trust your recall.' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Take it with you.' }).click();
  await expect(page.locator('#flow-preview-2')).toBeVisible();
  await capture(page, 'practice-lobby-desktop');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'A little practice. A better recall.' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your practice, on the record.' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Practice' }).click();
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.locator('.answer-choice')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /Abandon game/ })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('calendar drills into a day, reviews filter answers, and return preserves history context', async ({ page }) => {
  const state = completedState();
  await page.addInitScript(({ key, state }) => { localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
  await page.goto('/');
  const day = state.games[0].guesses[0].day;
  await page.locator('.calendar-cell[title*="15 guesses"]').click();
  await page.getByRole('button', { name: 'View day' }).click();
  await expect(page).toHaveURL(new RegExp(`#/history/day/${day}$`));
  await expect(page.getByRole('tab', { name: /Daily activity/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.daily-totals tbody tr td').first()).toHaveText('15');
  await capture(page, 'history-daily-desktop');
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/history/game/${state.games[0].id}$`));
  await page.getByRole('button', { name: /Missed & uncertain/ }).click();
  await expect(page.locator('.review-answers tbody tr')).toHaveCount(2);
  await capture(page, 'game-review-desktop');
  await page.getByRole('button', { name: 'Back to history' }).click();
  await expect(page).toHaveURL(new RegExp(`#/history/day/${day}$`));
  await expect(page.locator('.day-option.selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: /Games/ }).click();
  await expect(page.getByRole('tab', { name: /Games/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.locator('.history-game-card')).toHaveCount(1);
  await capture(page, 'history-games-desktop');
  await page.locator('.history-game-card').click();
  await page.getByRole('button', { name: 'Back to history' }).click();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export data' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^deadlock-flashcard-.*\.json$/);
});

test('empty calendar days have a useful destination and History tabs are keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.locator('.calendar-cell:not([disabled])').last().click();
  await page.getByRole('button', { name: 'View day' }).click();
  await expect(page.getByRole('heading', { name: 'Room for a little practice.' })).toBeVisible();
  await page.getByRole('tab', { name: /Daily activity/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /Games/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'No history. Yet.' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /Daily activity/ })).toBeFocused();
});

test('all redesigned screens fit small viewports and mobile navigation stays available', async ({ page }) => {
  const state = completedState();
  await page.addInitScript(({ key, state }) => { localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
  const paths = ['#/overview', '#/practice', '#/history', `#/history/day/${state.games[0].guesses[0].day}`, `#/history/game/${state.games[0].id}`];
  for (const width of [1440, 1024, 850, 768, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(`/${path}`);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
      const title = await page.locator('h1').evaluate(element => ({ height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) }));
      expect(title.height / title.line, `${path} heading at ${width}px`).toBeLessThan(3.1);
      if (width <= 620) await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/practice');
  await capture(page, 'practice-lobby-mobile');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await expect(page.locator('.progress-label')).toContainText('Question 2');
  await expect(page.locator('.game-progress')).toBeInViewport();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('tab', { name: /Games/ }).click();
  await capture(page, 'history-games-mobile');
  await page.getByRole('tab', { name: /Daily activity/ }).click();
  await capture(page, 'history-daily-mobile');
});

test('review resumes an existing game even offline instead of replacing it', async ({ page }) => {
  let state = completedState();
  state = transition(state, { type: 'start', game: createGame(fixtureItems()), at: new Date() });
  await page.addInitScript(({ key, state }) => { localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
  await page.route('**/v1/assets/items?**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(`/#/history/game/${state.games[0].id}`);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.games).toHaveLength(2);
  expect(saved.active.id).toBe(state.active!.id);
  expect(saved.games.every((game: { penalty: unknown }) => !game.penalty)).toBe(true);
});

test('Practice remains readable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/practice');
  await expect(page.locator('.practice-illustration')).toHaveCSS('opacity', '1');
  await expect(page.locator('.practice-manifesto span').first()).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Trust your recall.' }).click();
  await expect(page.locator('#flow-preview-1')).toBeVisible();
});

test('hover and selection effects have transitions, and Practice previews collapse smoothly', async ({ page }) => {
  const state = completedState();
  await page.addInitScript(({ key, state }) => { localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
  const checkTransitions = async (selectors: Record<string, string[]>) => {
    for (const [selector, properties] of Object.entries(selectors)) {
      const transitions = await page.locator(selector).first().evaluate(element => {
        const style = getComputedStyle(element);
        return { properties: style.transitionProperty.split(',').map(value => value.trim()), durations: style.transitionDuration.split(',').map(parseFloat) };
      });
      for (const property of properties) expect(transitions.properties, `${selector}: ${property}`).toContain(property);
      expect(transitions.durations.every(duration => duration > 0), selector).toBe(true);
    }
  };
  await page.goto('/#/overview');
  await checkTransitions({ '.button': ['transform', 'background-color', 'color'], '.icon-button': ['background-color', 'color'], '.text-button': ['color'], '.calendar-cell': ['outline-color', 'background-color'], '.game-row': ['background-color'], '.site-nav button': ['background-color', 'color'], '.main-footer a': ['color'] });
  await expect(page.getByRole('heading', { name: 'Small sessions. Steady progress.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.overview-heading')).toHaveCSS('opacity', '1');
  await capture(page, 'overview-polished-desktop');
  await page.goto('/#/practice');
  await checkTransitions({ '.flow-panel': ['background-color'], '.flow-toggle svg': ['transform', 'color'], '.flow-content': ['grid-template-rows', 'opacity'], '.flow-accordion': ['grid-template-columns'] });
  await page.getByRole('button', { name: 'Trust your recall.' }).click();
  await expect(page.locator('#flow-preview-0')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#flow-preview-0')).toHaveAttribute('inert', '');
  await expect(page.locator('#flow-preview-0')).toHaveCSS('grid-template-rows', '0px');
  await expect(page.locator('#flow-preview-0')).toHaveCSS('opacity', '0');
  await expect(page.locator('#flow-preview-1')).toHaveCSS('opacity', '1');
  await page.goto('/#/history');
  await checkTransitions({ '.history-tabs button': ['color', 'border-bottom-color'], '.filter-bar button': ['background-color', 'color', 'border-color'], '.history-game-card': ['transform', 'box-shadow'] });
  await page.getByRole('tab', { name: /Daily activity/ }).click();
  await checkTransitions({ '.day-option': ['background-color', 'box-shadow'] });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const selector of ['.site-nav button', '.history-tabs button', '.icon-button', '.day-option', '.text-button']) {
    await expect(page.locator(selector).first()).toHaveCSS('transition-duration', '0s');
  }
});

test('button and card arrows stay horizontally fixed on hover across all screens', async ({ page }) => {
  const state = completedState();
  await page.addInitScript(({ key, state }) => { localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
  const checkArrows = async () => {
    await page.evaluate(() => document.fonts.ready);
    for (const button of await page.locator('button:has(.lucide-arrow-right, .lucide-arrow-left, .lucide-arrow-up-right)').all()) {
      const arrows = button.locator('.lucide-arrow-right, .lucide-arrow-left, .lucide-arrow-up-right');
      await button.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const offsets = () => button.evaluate(element => {
        const left = element.getBoundingClientRect().left;
        return [...element.querySelectorAll('.lucide-arrow-right, .lucide-arrow-left, .lucide-arrow-up-right')].map(arrow => arrow.getBoundingClientRect().left - left);
      });
      const before = await offsets();
      await button.hover();
      for (const arrow of await arrows.all()) await expect(arrow).toHaveCSS('transform', 'none');
      const after = await offsets();
      after.forEach((offset, index) => expect(offset).toBeCloseTo(before[index], 1));
    }
  };
  for (const path of ['#/overview', '#/practice', '#/history', `#/history/day/${state.games[0].guesses[0].day}`, `#/history/game/${state.games[0].id}`]) {
    await page.goto(`/${path}`);
    await checkArrows();
  }
  await page.goto('/#/practice');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await checkArrows();
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await checkArrows();
});

test('links, help, and abandonment instructions consistently name the home page Overview', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Deadlock Flashcard Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await expect(page.locator('.help-panel')).toContainText('visiting Overview saves your place');
  await expect(page.locator('.help-panel')).not.toContainText(/dashboard/i);
  await page.getByRole('button', { name: 'Close instructions' }).click();
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await expect(page).toHaveURL(/#\/overview$/);
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await page.getByText('Game options', { exact: true }).click();
  await page.getByRole('button', { name: /Abandon game/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Go to Overview instead.');
  await expect(page.getByRole('dialog')).not.toContainText(/dashboard/i);
  await page.getByRole('button', { name: 'Keep my game' }).click();
});

import { test, expect, type Page } from '@playwright/test';
import { fixtureItems } from '../src/test/fixtures';
import { STORAGE_KEY, type StudyState } from '../src/types';

const read = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as StudyState, STORAGE_KEY);

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
});

test('masks only the asked property in the real tooltip, scores correctly, and resumes after refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
  const state = await read(page);
  const q = state.active!.questions[0];
  const tooltip = page.locator('dl-item-tooltip');
  await expect(page.getByText('Choose an answer to reveal the property immediately.')).toBeVisible();
  await expect(page.locator('.answer-choice')).toHaveCount(4);
  await expect(page.locator('.answer-action')).toHaveText(['Choose', 'Choose', 'Choose', 'Choose', 'Choose']);
  await expect(page.locator('.choice-ring, input[type="radio"], [role="radio"]')).toHaveCount(0);
  await expect(tooltip.locator('.property-value', { hasText: '[?]' })).toHaveCount(1);
  await expect(tooltip.locator('.mod-name')).toHaveText(q.item.name);
  await expect(tooltip.locator('.mod-info-label')).toHaveText('An unchanged description.');
  const otherKey = q.propertyKey === 'Stat' ? 'Other' : 'Stat';
  await expect(tooltip.locator('.attribute-name', { hasText: q.item.properties![otherKey].label! })).toBeVisible();
  await expect(tooltip.locator('.attribute-name', { hasText: q.item.properties![q.propertyKey].label! })).toHaveCount(0);
  await page.locator('.answer-choice').filter({ hasText: q.correctLabel }).click();
  await expect(page.getByText('You remembered it.')).toBeVisible();
  await expect(page.locator('.answer-action')).toHaveCount(0);
  await expect(page.locator('.answer-choice').first()).toBeDisabled();
  await expect(tooltip.locator('.property-value', { hasText: '[?]' })).toHaveCount(0);
  await expect(tooltip.locator('.attribute-name', { hasText: q.item.properties![q.propertyKey].label! })).toBeVisible();
  await page.reload();
  await expect(page.getByText('You remembered it.')).toBeVisible();
  expect((await read(page)).games[0].guesses).toHaveLength(1);
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.locator('.progress-label')).toContainText('Question 2');
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.getByText('Now you know.')).toBeVisible();
  expect((await read(page)).games[0].guesses.map(g => g.points)).toEqual([1, 0]);
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await expect(page.locator('.cumulative-score')).toHaveText('+1 pts');
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.getByText('Now you know.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('not sure matches the answer buttons before hover and remains selectable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const unsure = page.getByRole('button', { name: /Not sure No points/ });
  await page.mouse.move(0, 0);
  await expect(unsure).toBeEnabled();
  const firstChoice = page.locator('.answer-choice').first();
  await page.evaluate(() => document.fonts.ready);
  expect((await unsure.boundingBox())!.height).toBe((await firstChoice.boundingBox())!.height);
  for (const property of ['background-color', 'border', 'border-radius', 'box-shadow', 'font-size', 'padding', 'gap', 'min-height', 'color']) {
    const expected = await firstChoice.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property);
    await expect(unsure).toHaveCSS(property, expected);
  }
  await expect(unsure.locator(':scope > :first-child')).toHaveText('5');
  const shortcut = await unsure.locator('kbd').boundingBox();
  const firstShortcut = await page.locator('.answer-choice kbd').first().boundingBox();
  expect(shortcut!.x).toBe(firstShortcut!.x);
  const label = await unsure.locator(':scope > span').first().boundingBox();
  const firstLabel = await firstChoice.locator(':scope > span').first().boundingBox();
  expect(label!.x).toBe(firstLabel!.x);
  await expect(unsure.locator('.answer-action')).toHaveText('Choose');
  await expect(unsure.locator('.answer-action svg')).toBeVisible();
  await unsure.hover();
  await expect(unsure).toHaveCSS('background-color', 'rgb(241, 231, 218)');
  await expect(unsure).toHaveCSS('border-color', 'rgb(171, 137, 106)');
  await expect(unsure).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -1)');
  await expect(unsure.locator('.answer-action svg')).toHaveCSS('transform', 'none');
  await unsure.click();
  await page.mouse.move(0, 0);
  await expect(unsure).toBeDisabled();
  await expect(unsure.locator('.answer-action')).toHaveCount(0);
  await expect(unsure).toHaveCSS('background-color', 'rgb(240, 231, 218)');
  await expect(page.getByText('Now you know.')).toBeVisible();
});

test('cancel keeps progress and confirmed replacement applies exactly one -10 penalty', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await expect(page.locator('.cumulative-score')).toHaveText('0 pts');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep my game' }).click();
  expect((await read(page)).games).toHaveLength(1);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game · -10' }).click();
  await expect(page.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
  const state = await read(page);
  expect(state.games).toHaveLength(2);
  expect(state.games[0].status).toBe('abandoned');
  expect(state.games[0].penalty?.points).toBe(-10);
  expect(state.games[1].status).toBe('active');
  await page.reload();
  expect((await read(page)).games.filter(g => g.penalty)).toHaveLength(1);
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await expect(page.locator('.cumulative-score')).toHaveText('-10 pts');
});

test('hover keeps recent-game spacing stable and lifts the start button without moving its arrow independently', async ({ page }) => {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start a game', exact: true });
  await expect(start).toBeEnabled();
  const arrow = start.locator('svg');
  await start.hover();
  await expect(start).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
  await expect(arrow).toHaveCSS('transform', 'none');
  await start.click();
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  const row = page.locator('.game-row').first();
  await row.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  const layout = () => row.evaluate(element => ({
    padding: getComputedStyle(element).padding,
    children: [...element.children].map(child => {
      const rect = child.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  }));
  const before = await layout();
  await row.hover();
  await expect(row).toHaveCSS('background-color', 'rgb(227, 214, 198)');
  expect(await layout()).toEqual(before);
});

for (const score of [1, -12]) {
  test(`abandoning at ${score} shows and persists the correct final score`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start a game', exact: true }).click();
    for (let index = 0; index < Math.abs(score); index++) {
      const state = await read(page);
      const question = state.active!.questions[index];
      const choice = score > 0 ? question.correctLabel : question.choices.find(value => value !== question.correctLabel)!;
      await page.locator('.answer-choice').filter({ hasText: choice }).click();
      await page.getByRole('button', { name: 'Next question', exact: true }).click();
    }
    const finalScore = Math.min(score, -10);
    await page.getByText('Game options', { exact: true }).click();
    await page.getByRole('button', { name: /Abandon game/ }).click();
    await expect(page.getByRole('dialog')).toContainText(`final score of ${finalScore}`);
    await page.getByRole('button', { name: `Abandon game · ${finalScore}`, exact: true }).click();
    await expect(page.locator('.summary-score')).toContainText(String(finalScore));
    await expect(page.locator('.data-table tbody tr').last().locator('td').last()).toHaveText(String(finalScore - score));
    const state = await read(page);
    expect(state.games[0].penalty?.points).toBe(finalScore - score);
    expect(state.games[0].guesses).toHaveLength(Math.abs(score));
    await page.reload();
    await expect(page.locator('.summary-score')).toContainText(String(finalScore));
    await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
    await expect(page.locator('.cumulative-score')).toHaveText(`${finalScore} pts`);
    await expect(page.locator('.session-score')).toContainText(String(finalScore));
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('tab', { name: /Daily activity/ }).click();
    await expect(page.locator('.daily-totals tbody tr').first().locator('td').last()).toHaveText(String(finalScore));
  });
}

test('finishes fifteen questions, stores daily results, and starts unlimited new games without completion penalties', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  for (let index = 0; index < 15; index++) {
    const state = await read(page);
    const q = state.active!.questions[index];
    const choice = index === 0 ? q.choices.find(c => c !== q.correctLabel)! : q.correctLabel;
    await page.locator('.answer-choice').filter({ hasText: choice }).click();
    await page.getByRole('button', { name: index === 14 ? 'See game summary' : 'Next question', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Practice, in the bank.' })).toBeVisible();
  await expect(page.locator('.summary-score')).toContainText('+13');
  const state = await read(page);
  expect(state.active).toBeNull();
  expect(state.games[0].guesses).toHaveLength(15);
  expect(state.games[0].status).toBe('completed');
  await page.getByRole('button', { name: 'Play another game' }).click();
  expect((await read(page)).games).toHaveLength(2);
  expect((await read(page)).games[0].penalty).toBeNull();
  await page.getByRole('button', { name: 'Back to Overview', exact: true }).click();
  await expect(page.locator('.game-row').filter({ hasText: 'Completed game' }).locator('.session-score')).toContainText('+13');
  await expect(page.locator('.cumulative-score')).toHaveText('+13 pts');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('tab', { name: /Daily activity/ }).click();
  await expect(page.locator('.daily-totals tbody tr')).toHaveCount(1);
  await expect(page.locator('.daily-totals tbody tr')).toContainText('15');
});

test('mobile layout stays within the viewport and the tooltip remains complete', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your study rhythm' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.openchamber/screenshots/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.locator('dl-item-tooltip .property-value', { hasText: '[?]' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.openchamber/screenshots/study-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(page.getByText('Now you know.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeInViewport();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your practice, on the record.' })).toBeVisible();
});

test('API failure provides retry and malformed storage is not overwritten', async ({ page }) => {
  await page.route('**/v1/assets/items?**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByText('Item data is unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeDisabled();
  await page.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  await page.evaluate(key => localStorage.setItem(key, '{"version":99}'), STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('Your saved data has not been overwritten.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{"version":99}');
});

test('storage write failure does not award a point or reveal an unsaved answer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.locator('.answer-choice').first().click();
  await expect(page.getByText('Progress could not be saved')).toBeVisible();
  expect((await read(page)).games[0].guesses).toHaveLength(0);
  await expect(page.locator('dl-item-tooltip .property-value', { hasText: '[?]' })).toBeVisible();
  await expect(page.locator('.answer-choice').first()).toBeDisabled();
});

test('the tooltip is readable even when remote artwork fails', async ({ page }) => {
  await page.route('**/images/tooltips/items/tooltip_backer_*.png', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const tooltip = page.locator('dl-item-tooltip');
  await expect(tooltip.locator('.property-value', { hasText: '[?]' })).toBeVisible();
  await expect.poll(() => tooltip.locator('.tooltip-shadow').evaluate(el => getComputedStyle(el).maskImage)).toBe('none');
  await expect(tooltip.locator('.mod-name')).not.toBeEmpty();
});

test('another tab synchronizes a saved answer without overwriting it', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  const second = await context.newPage();
  await second.route('**/v1/assets/items?**', route => route.fulfill({ json: fixtureItems() }));
  await second.goto('/');
  await expect(second.getByRole('heading', { name: 'What’s the missing property?' })).toBeVisible();
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await expect(second.getByText('Now you know.')).toBeVisible();
  await expect(second.locator('.answer-choice').first()).toBeDisabled();
  expect((await read(second)).games[0].guesses).toHaveLength(1);
});

test('Overview has an editorial title and subtitle, keeping the calendar and cumulative score prominent', async ({ page }) => {
  const motionWarnings: string[] = [];
  page.on('console', message => { if (message.text().includes('GSAP target')) motionWarnings.push(message.text()); });
  await page.goto('/');
  await expect(page).toHaveTitle('Deadlock Flashcard');
  await expect(page.getByRole('button', { name: 'Deadlock Flashcard Overview' })).toBeVisible();
  await expect(page.locator('.dashboard h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Small sessions. Steady progress.', exact: true })).toBeVisible();
  await expect(page.locator('.overview-heading p')).toHaveText('Your practice, day by day. A little more remembered each time.');
  await expect(page.locator('.dashboard > section').first()).toHaveClass(/activity-panel/);
  await expect(page.locator('.activity-panel + .overview-score')).toBeVisible();
  await expect(page.locator('.cumulative-score')).toHaveText('0 pts');
  await expect(page.locator('.dashboard .starter, .dashboard .stats-section, .dashboard .category-section, .dashboard .progress-intro, .dashboard .quiet-marquee, .dashboard img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start a game', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'The recall breakdown' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent games' })).toBeVisible();
  for (const width of [1440, 1024, 850, 768, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const title = await page.locator('.overview-title').boundingBox();
    const header = await page.locator('.site-header').boundingBox();
    expect(title!.y - (header!.y + header!.height)).toBeLessThanOrEqual(72);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`).toBe(true);
    expect(await page.locator('.dashboard').evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.activity-panel').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(motionWarnings).toEqual([]);
});

test('reduced motion keeps the calendar readable without scrolling animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.activity-panel')).toHaveCSS('opacity', '1');
  await expect(page.locator('.marquee-track')).toHaveCount(0);
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
});

test('supporting text stays readable across desktop and mobile screens', async ({ page }) => {
  await page.goto('/');
  const readable = async (selectors: string, minimum: number) => {
    const sizes = await page.locator(selectors).evaluateAll(elements => elements.map(element => ({
      text: element.textContent,
      size: parseFloat(getComputedStyle(element).fontSize),
    })));
    expect(sizes.length).toBeGreaterThan(0);
    for (const { text, size } of sizes) expect(size, text ?? selectors).toBeGreaterThanOrEqual(minimum);
  };
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['.site-header', '.answer-panel', '.overview-score']) {
      const element = page.locator(selector);
      if (await element.count()) expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth), selector).toBe(true);
    }
  };
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await readable('.overview-heading p, .dashboard-actions .button', 16);
    await readable('.calendar-months span, .weekday-labels span, .quiet-badge, .overview-score p, .panel-footnote, .main-footer', 14);
    await fits();
  }
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await readable('.practice-launch-copy p, .flow-content-inner > p', 16);
  await readable('.practice-deck span, .practice-fineprint', 14);
  await page.getByRole('button', { name: 'Start a game', exact: true }).click();
  await expect(page.locator('.answer-choice')).toHaveCount(4);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await readable('.answer-panel > p:not(.answer-instruction):not(.keyboard-note), .answer-choice, .unsure-button', 16);
    await readable('.answer-instruction, .answer-action, .unsure-note, .keyboard-note, .category-badge, .item-stage-caption', 14);
    await fits();
  }
  await page.getByRole('button', { name: /Not sure No points/ }).click();
  await readable('.feedback-card p', 16);
  await readable('.feedback-title', 14);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await readable('.history-tabs button', 16);
  await readable('.filter-bar button, .history-card-metrics > span, .history-card-footer', 14);
  await fits();
});

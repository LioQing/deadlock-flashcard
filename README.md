# Deadlock Flashcard

> [!WARNING]
>
> This is a vibe-coded personal project.

Practice Deadlock item stats by guessing the missing property in an item tooltip. Each game has 15 questions, and your progress stays in your browser.

Built with React, TypeScript, Vite, and [`@deadlock-api/ui-react`](https://ui.deadlock-api.com/).

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173/deadlock-flashcard/`.

```sh
npm run build
npm run preview
```

Open the preview URL printed by Vite, normally `http://127.0.0.1:4173/deadlock-flashcard/`.

The production site is in `dist/`. The `base` in `vite.config.ts` is `/deadlock-flashcard/`, matching the GitHub Pages project path. For another hosting path or repository name, update `base` before building. Use `/` when hosting at the domain root. No backend, API key, or environment variables are needed.

## Gameplay

- Every game samples 15 distinct shop items: five Weapon, five Vitality, and five Spirit, shuffled together.
- The library's `DlItemTooltip` shows `[?]` in place of one property, hiding its label, value, and identifying metadata. Other properties, descriptions, prices, and related items remain visible.
- Choose from four distinct answers drawn from the same shop category, with a preference for comparable tiers. Incorrect choices exclude properties already visible on the item.
- Correct answers earn +1 point. Incorrect answers lose 1 point. Not sure earns 0 points.
- Click an answer or press 1–4 to reveal the property immediately. Press 5 for Not sure. Select Next question to continue.

Closing the tab, refreshing, or leaving Practice saves your place without a penalty. Abandoning or replacing an unfinished game requires confirmation and sets its final score to the lower of its current score and -10. A score of -12 stays -12. Answer logs remain, and any score adjustment counts on the abandonment date. Completed games have no abandonment penalty.

Play as many games as you want. Questions use random sampling without spaced-repetition scheduling.

Timing pills and properties whose names appear again in descriptions remain fully visible but are not selected for questions, since their identity cannot be cleanly hidden without changing other tooltip content.

## Progress and privacy

Progress lives in local storage under the key `deadlock-flashcard:v1`. Active questions include item snapshots, so API updates do not change an ongoing game. Finished games keep their answer logs without the large snapshots.

Overview shows an activity calendar, cumulative score, recall breakdown, and recent games. Select a calendar date and use View day to open its answers in History. History includes game filters, daily scores, and answer logs. Game reviews can show all answers or only missed and uncertain answers.

Daily statistics use your local calendar date. The cumulative score includes answers from unfinished games and abandonment penalties. Accuracy counts Not sure answers in its denominator.

Data stays in this browser profile and does not sync between devices. Use History → Export data to download a JSON backup before clearing browser data. Import is not supported. If the browser cannot save progress, the app blocks further scoring. It does not silently overwrite invalid saved data.

## Item data and connectivity

The app fetches English item data from [Deadlock API](https://api.deadlock-api.com/v1/assets/items?language=english), validates it, sanitizes descriptions, and caches it in IndexedDB separately from progress.

Returning visits use cached items immediately. On page load, caches older than six hours refresh in the background. If an update fails, you can keep playing with cached items and use Retry update to try again. Updates affect new games only. If cache storage is unavailable or full, the app falls back to network loading.

You need internet access for the first download and later updates. Cached items and saved games remain usable during API failures if the app itself loads. Full offline support is not available. Artwork and tooltip fonts use normal browser caching from the Deadlock assets CDN. If tooltip mask artwork fails to load, a rectangular background keeps the tooltip readable. Progress exports do not include the item cache, which the browser may clear or evict.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Unit tests cover question generation, masking, scoring, state transitions, date grouping, storage protection, and item caching. Playwright tests cover tooltips, saved games, penalties, mobile layouts, themes, and API and storage failures. Browser tests use isolated contexts and fixture data without changing your personal progress. Playwright starts the development server automatically.

## Source map

- `src/App.tsx`: navigation and app orchestration.
- `src/components/`: Overview, calendar, game, tooltip adapter, history, and summary.
- `src/lib/game.ts`: sampling, masking, and pure scoring transitions.
- `src/lib/api.ts`: item fetching, validation, and description sanitization.
- `src/lib/itemCache.ts`, `src/lib/itemLoader.ts`: best-effort IndexedDB item caching and background refresh.
- `src/lib/storage.ts`, `src/lib/schema.ts`: versioned persistence and data validation.
- `src/lib/stats.ts`: daily and accumulated statistics.
- `src/hooks/useStudy.ts`: saved state updates and cross-tab synchronization.
- `src/styles.css`: layout, typography, themes, and transitions.

## Interface

Overview, Practice, and History have persistent bottom navigation on mobile. Hash URLs support direct links, refresh, and browser back/forward navigation. Abandonment lives under Game options, separate from ordinary navigation.

The interface uses warm light and dark palettes, Cabinet Grotesk body text, and serif headings. Each page load follows your system theme until you use the header's Dark theme toggle. GSAP animations and hover effects respect reduced-motion preferences.

Unofficial fan project. Not affiliated with Valve.

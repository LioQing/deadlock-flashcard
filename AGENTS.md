# Repository guidance

## Commands and verification

- Use Node.js 22.12+ and npm (`package-lock.json`). No backend, API key, or environment variables are required.
- `npm run build` runs `tsc -b` before Vite. For typechecking alone, use `npx tsc -b`; there are no lint or formatter scripts.
- Unit tests: `npm test`. Focus a file or test with `npm test -- src/lib/game.test.ts -t "test name"`. Vitest only discovers `src/**/*.test.ts`, not the Playwright specs.
- Browser tests: first install Chromium with `npx playwright install chromium`, then use `npm run test:e2e`. Focus with `npm run test:e2e -- tests/app.spec.ts -g "test name"`.
- Playwright starts Vite on `http://127.0.0.1:5173` with `--strictPort` and reuses an existing server outside CI. Ensure that port serves this app. Tests mock item API responses using `src/test/fixtures.ts`, but tooltip artwork/fonts still use the remote CDN.
- `dist/` and `*.tsbuildinfo` are generated. Change source and rebuild rather than editing build output. Deployment is static hosting of `dist/`.

## State and execution flow

- `src/main.tsx` mounts React StrictMode; `src/App.tsx` coordinates hash navigation, item loading, and study dispatch. Routing uses `src/lib/navigation.ts` and browser history, not a router package.
- Study changes go through `useStudy.dispatch` -> `game.transition` -> `storage.saveState`. Saving succeeds before UI state changes. Keep revision-based stale-tab protection and blocking on invalid/unwritable storage; never replace invalid saved progress with an empty state.
- Progress uses `STORAGE_KEY` in `src/types.ts`, currently `deadlock-flashcard:v1`. The rename intentionally has no legacy-key migration. Keep types and `stateSchema` in `src/lib/schema.ts` aligned when changing persisted data.
- A game becomes `completed` when its last answer is submitted, but `state.active` remains until Next question. The schema deliberately accepts this revealed-final-answer state.
- Game length is not controlled by `GAME_LENGTH` alone: five items per category and last index `14` also appear in generation, schema validation, and UI logic. Update them together if changing game size.
- Abandonment/replacement requires confirmation and caps the final score at `Math.min(currentScore, -10)`, not a flat -10 deduction. Navigation and refresh must not abandon a game. Daily grouping uses local dates, not UTC date slices.
- Item caching is separate, best-effort IndexedDB (`src/lib/itemCache.ts`). `itemLoader.ts` publishes cached data immediately and refreshes after six hours. Refreshes affect new games only; saved active questions retain their item snapshots.

## Tooltip integration

- Keep the actual `@deadlock-api/ui-react` tooltip under `DlProvider`. It renders in Shadow DOM with a fixed 450px width; `src/components/ItemTooltip.tsx` injects responsive styles and disables its image mask until artwork loads so failed CDN requests cannot hide content. Ordinary page CSS cannot style its internals.
- `game.maskItem` must hide identifying metadata as well as the property's value. Timing pills and properties named in unchanged descriptions are intentionally ineligible for questions.
- Tooltip descriptions render as HTML. API responses and IndexedDB reads both pass through `api.parseItems` for validation and DOMPurify sanitization; do not bypass that path.

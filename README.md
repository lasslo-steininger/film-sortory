# Sortory

A Next.js application that turns a CSV of film names into a personal ranking through pairwise choices, illustrated with covers found via IMDb.

## Film covers

Put film names in the first CSV column. A single column of names works; an optional `year` or `jahr` column distinguishes remakes (case-insensitive; `Release Year` is also supported). The year is included in the IMDb search text, and results must match that release year. Names such as `Dune (1984)` also work; a valid CSV year takes precedence. Other columns remain available as comparison context.

Covers appear in the import preview, comparison cards, and final ranking. The browser loads visible covers through `GET /api/films?title=…&year=…`; all IMDb querying and matching happens in `src/server/imdb.ts`, behind a server-only service. The sorting engine remains independent of the film provider, and saved rankings from earlier versions work without migration.

The adapter uses IMDb's public search-suggestion endpoint, verified with live requests. No API key is needed. This endpoint is not the supported commercial IMDb API and can change or become unavailable. It supplies a limited set of suggestions, so some films or localized titles may not match. The adapter accepts exact normalized film-title matches and optional release years, excludes people and series, and chooses the first matching result in IMDb's returned order when several films match. Unavailable searches or broken images show a placeholder and never block ranking.

Requests are deduplicated, limited to four simultaneous upstream lookups, and cached in server memory (24 hours for results; 30 seconds for failures). Covers load only as they approach the viewport. Image URLs are restricted to IMDb's Amazon image host and use a resized variant. Film names and optional years are sent to IMDb for lookup; browsers load the resulting images from its image host.

With the app running and internet access, `npm run test:imdb` verifies a live IMDb match and that its poster image is accessible. Provider matching, failures, caching, and concurrency also have offline unit tests in `tests/imdb.test.ts`. For a supported commercial data integration, replace the provider adapter with the [official IMDb API](https://data.imdb.com/documentation/api-documentation/).

## Run locally

Requires Node.js 20.9 or later and npm.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For production, run `npm run build` and `npm start`.

## Use

Upload a `.csv` with one item per row. The first column is the item name; other columns supply comparison context. Leave “My first row contains column names” checked for a header row, or uncheck it for a plain list. Quoted commas, multiline fields, UTF-8 BOMs, and common delimiters are supported. Limits: 1 MB, 1000 items, 2,000 characters per cell. At least two named items are required. Duplicate names remain distinct items.

Review the import, start ranking, and select the film you prefer. The app uses merge sort to build the ranking. Left/right arrow keys also work. Undo reopens the preceding comparison, including after completion. Results are ordered favorite first and can be exported as CSV with original metadata. Export escapes spreadsheet formula prefixes.

## Architecture

Every newly uploaded ranking and explicit ranking restart shuffles all films on the server using Fisher–Yates. The shuffled order is saved with the session and remains stable when resuming or undoing choices. A shuffle can legitimately produce the same order by chance.

- `src/components/`: client-side presentation and interaction state only.
- `src/client/api.ts`: typed HTTP adapter; no ranking logic.
- `src/shared/types.ts`: shared transport types.
- `src/app/api/sessions/`: thin HTTP route handlers and input validation.
- `src/server/csv.ts`: parsing and validation.
- `src/server/sort.ts`: pure resumable merge sort, independent of React and HTTP.
- `src/server/sessions.ts`: server-only orchestration, revision checks, atomic file persistence, and serialized session writes.

The server replays the decision history through merge sort, stopping at the first comparison that needs a human decision. Only the current pair is accepted. This makes undo deterministic and keeps sorting authoritative on the backend. Merge sort takes O(n log n) comparisons with a consistent preference relation. Inconsistent human choices still produce a ranking but cannot guarantee a globally consistent order. The progress bar estimates progress against the worst-case comparison count and may reach completion early.

## Persistence and deployment

Choose “Pause & view ranking” to stop comparing and see or download a provisional order. Recorded preferences determine the order where possible; unestablished relationships use the initial session order as a tie-breaker. Inconsistent preferences may not all fit one order. “Resume ranking” returns to the same unanswered comparison, with all choices and undo history preserved. This browser remembers the paused screen across reloads.

Choose “Start over” during ranking or on the results screen to clear all choices and rank the same films again with merge sort. Confirming permanently resets the saved ranking, including undo history.

Sessions are stored in `.data/sessions` (gitignored). Set `SESSION_DATA_DIR` to change the location. The browser remembers the opaque session ID in local storage so refreshes and restarts can resume the latest list. Sessions survive server restarts while the data directory persists. Starting a new list removes the browser pointer, not the old server file.

This storage adapter targets a **single Node.js server with persistent writable disk**. Use a database with transactional revision checks for multiple instances or serverless hosting. Sessions have no accounts: possession of the random session ID grants access. Configure retention/cleanup and infrastructure request limits for public deployment. Google Fonts are optional; system fallback fonts work offline.

## API

- `POST /api/sessions`: multipart `file` and `hasHeader`; creates a session and returns its view.
- `GET /api/sessions/:id`: returns a saved session.
- `POST /api/sessions/:id`: JSON `{ "revision": 0, "action": "choose", "winner": "0" }`, `{ "revision": 1, "action": "undo" }`, or `{ "revision": 1, "action": "restart" }`.

Stale revisions return HTTP 409. Invalid CSVs or choices return HTTP 400. Missing sessions return HTTP 404.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

Tests exercise preference orders across 99 list sizes, comparison bounds, undo, invalid decisions, and CSV edge cases.

With a local server running, `npm run test:integration` checks upload, validation, conflicting concurrent choices, undo, completion, restoration, and HTTP page rendering. Set `TEST_BASE_URL` to test a different local port. It creates its own small test rankings.

Built with the [Next.js App Router and Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).

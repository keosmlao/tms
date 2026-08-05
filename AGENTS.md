<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project conventions

- API routes live in `src/app/api/**/route.ts`. Mobile routes (`src/app/api/mobile/*`) require a Bearer JWT via `requireMobileSession`.
- All mobile/public route bodies + query params are validated with Zod schemas in [`src/lib/mobile-schemas.ts`](src/lib/mobile-schemas.ts). Use `parseJsonBody` / `parseSearchParams` from [`src/lib/validation.ts`](src/lib/validation.ts) — they throw a `ValidationError` (status 400) which `mobileErrorResponse` translates.
- Sensitive endpoints are rate-limited per IP via `rateLimit()` from [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts).
- DB access goes through `src/queries/*.js` (CommonJS) — these are imported from server actions and route handlers.
- Server-side state-changing work is in `src/actions/*` (server actions).
- The push service ([`src/queries/push.js`](src/queries/push.js)) reads Firebase credentials from env (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`) before falling back to a local JSON file.

## Dates and time (Laos, UTC+7)

- Never derive "today" from `new Date().toISOString().slice(0, 10)` (that is a UTC date) or from the host clock. Use `getLaoToday()` / `getLaoTodayMonth()` / `getLaoNowStamp()` from [`src/lib/lao-date.js`](src/lib/lao-date.js) — they read the Laos wall clock via `Intl` and give the same answer whether the process runs in UTC or UTC+7.
- Never do date arithmetic with `new Date(\`${ymd}T00:00:00\`)` + `.toISOString()`. Parsing as host-local and printing as UTC shifts the date by a day on a UTC+7 machine. Use `addDays` / `addMonths` / `startOfMonth` from the same module (pure string math).
- `getFixedTodayDate()` in [`src/lib/fixed-year.js`](src/lib/fixed-year.js) is already Lao-based; prefer it wherever the fixed-year pin matters.
- **`ic_trans.create_date_time_now` and `ic_trans_shipment.create_date_time_now` are written by the ERP in UTC** and must never be shown as a bill's open time. Use `billOpenedAtSql()` from [`src/queries/helpers.js`](src/queries/helpers.js), which reads `doc_date + doc_time` (Laos wall clock, present on 99.9% of bills).
- Every TMS-owned table (`odg_tms*`) stores Laos local time — those are written with `LOCALTIMESTAMP` against a DB whose `TimeZone` is `Asia/Bangkok`. Keep new writes on `LOCALTIMESTAMP(0)`, not `now()`.

## Adding a new mobile route

1. Define a Zod schema for the body/query in `src/lib/mobile-schemas.ts`.
2. Add the route handler under `src/app/api/mobile/<name>/route.ts`. Call `requireMobileSession` first, then `parseJsonBody` / `parseSearchParams`.
3. Wrap the body in `try/catch` and return `mobileErrorResponse(error)` from the catch.
4. Add an entry to [`docs/openapi.yaml`](docs/openapi.yaml).
5. Add tests under `src/lib/*.test.ts` for the schema, plus an integration test if the route has non-trivial logic.

## Quality gates

```bash
npm run typecheck && npm run lint && npm test
```

CI runs all three on every PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

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

## Report metrics — one definition, one place

Every screen that shows the same number must reach it through the same helper.
These were re-unified on 2026-08-23/24 after the same metric was found computed
three different ways; `src/lib/metric-definitions.test.ts` guards them.

- **"ຖ້ຽວ"** = rows of `public.odg_tms` with `approve_status = 1`, scoped with
  `branchFilterJob()` from [`src/queries/helpers.js`](src/queries/helpers.js).
  Operational lists (`/reports/daily`, `/reports/by-trip`) may show documents
  still awaiting approval, but they must report the approved/pending split
  rather than a single blended count.
- **"ສົ່ງທັນເວລາ"** — the due date always comes from `deliveryDueDateSql()`.
  Never write `COALESCE(pb.scheduled_date::date, …)` inline:
  `odg_tms_pending_bill.scheduled_date` is overwritten on reschedule, so the
  first promise has to come from `odg_tms_pending_bill_history`.
- **Branch scope** — `branchFilterJob()` (the trip's `origin_transport_code`
  first) for anything trip-based; `branchFilterShipment()` for bills that have
  no trip yet; `odg_tms_car.transport_code` only for fleet questions. Do not
  hand-roll an `EXISTS (SELECT 1 FROM ic_trans_shipment …)` scope clause.
- **"ຄົງເຫຼືອ" / outstanding bills** — always `getBillsPending()` /
  `getOutstandingBillNos()`, never a rewritten SQL rule.
- Counting at `odg_tms_detail` level counts **ຈຸດສົ່ງ (drops)**, not **ບິນ**: a
  bill delivered in two rounds is two rows. Label it accordingly, or dedupe on
  `bill_no`.
- A server action that calls `requireSession()` must pass that session down to
  the query, otherwise the page silently reports every branch.
- Never select image columns (`url_img`, `sight_img`,
  `odg_tms_delivery_images`) in a list query — they are base64 and a one-day
  range already reaches ~27 MB.

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

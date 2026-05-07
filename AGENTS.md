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

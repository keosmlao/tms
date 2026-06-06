# ODG TMS Web

Next.js web dashboard and API server for ODG transport management.

## Main Modules

- Web dashboard: dispatch planning, approval, bill status, reports, GPS tracking, fuel logs, settings.
- Public tracking: `/track` and `/api/public/track`.
- Mobile driver APIs: `/api/mobile/login`, `/api/mobile/jobs`, `/api/mobile/bills`, `/api/mobile/fuel`, `/api/mobile/fcm-token`.
  Supervisor/manager mobile tokens can call `/api/mobile/jobs?scope=all` for all-driver job monitoring.
- GPS integrations: Thai GPS realtime, daily usage, backfill.

## Environment

Copy `.env.example` and fill every required value.

`JWT_SECRET` is required. The app intentionally fails without it so sessions and mobile tokens cannot be signed with a default secret.

For production, set:

```bash
JWT_SECRET="$(openssl rand -base64 32)"
SECURE_COOKIE=true
```

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test            # vitest run
npm run test:watch  # vitest --watch
```

`npm run lint` is configured as a practical baseline for the current codebase. It still reports warnings for cleanup work such as unused imports and raw `<img>` tags.

## API Reference

The mobile + public API contract lives in [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1). Render it with any spec viewer (`npx redocly preview-docs docs/openapi.yaml`).

## Validation & Rate Limiting

- All `/api/mobile/*` routes validate inputs with Zod schemas in [`src/lib/mobile-schemas.ts`](src/lib/mobile-schemas.ts).
- `POST /api/mobile/login` and `/api/public/track` are rate-limited per IP via the in-memory limiter in [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) (login: 10/min, track: 60/min). For multi-replica deployments, swap the in-memory store for Redis.

## Firebase Credentials

The push service resolves the FCM service account in this order:

1. `FIREBASE_SERVICE_ACCOUNT_JSON` env (inline JSON)
2. `FIREBASE_SERVICE_ACCOUNT_BASE64` env (base64-encoded JSON)
3. `firebase-service-account.json` at the project root (local dev only — gitignored)

Use 1 or 2 in production so the secret never lands on the filesystem.

## Security Notes

- Dashboard pages require a signed cookie session.
- Mobile APIs require `Authorization: Bearer <token>` after login.
- `/api/health` requires a valid dashboard session.
- Existing ERP passwords are still validated against the current database columns; migrating to password hashes requires a coordinated DB/user migration.

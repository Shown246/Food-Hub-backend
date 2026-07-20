# FoodHub Backend

FoodHub is an Express and TypeScript REST API for customer ordering, provider
menu and fulfilment workflows, reviews, administration, and dashboards. It uses
PostgreSQL, Prisma, Better Auth server sessions, and cookie authentication. The
API is mounted under `/api`; its detailed contract is in
[`API-Documentation.md`](./API-Documentation.md).

## Prerequisites

- Node.js `20.19+`, `22.12+`, or `24+` (the versions supported by Prisma 7)
- npm
- PostgreSQL with permission to create and migrate the application schema

## Local setup

1. Install dependencies and generate Prisma Client:

   ```sh
   npm install
   npm run db:generate
   ```

2. Copy `.env.example` to `.env` and replace every placeholder. Do not commit
   `.env`; it is intentionally ignored.

3. Create or select an empty PostgreSQL database and set `DATABASE_URL` to its
   connection string.

4. Apply migrations:

   ```sh
   npm run db:migrate:dev
   ```

5. Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and a unique
   `SEED_ADMIN_PASSWORD`, then seed the required baseline data:

   ```sh
   npm run seed
   ```

   This provisions one credential-backed admin account and eight active food
   categories. It is safe to rerun: categories are updated by normalized name,
   and the configured admin account and credential are reused.

6. Start the development server:

   ```sh
   npm run dev
   ```

   The default local API URL is `http://localhost:3000`. Readiness is available
   at `GET /api/health`.

## Optional development fixtures

Development fixtures are deliberately separate from baseline/production seed
data. Set a strong, local-only `SEED_DEVELOPMENT_PASSWORD`, make sure
`NODE_ENV` is not `production`, and run:

```sh
npm run seed:dev
```

This adds the clearly named `dev.customer@foodhub.local` and
`dev.provider@foodhub.local` accounts, one provider profile, two meals, and two
sample orders. The configured development password is used for both fixture
accounts. The command is idempotent and refuses to run in production. Setting
`SEED_DEVELOPMENT_DATA=true` before `npm run seed` has the same effect.

Never use fixture accounts or their password in a shared or production system.

## Environment variables

| Variable | Required/default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`; production enables stricter cookie requirements. |
| `PORT` | `3000` | HTTP listening port. |
| `DATABASE_URL` | Required | PostgreSQL connection string used by the application, Prisma, and seed command. |
| `DATABASE_POOL_MAX` | `10` | Maximum application-side PostgreSQL connections per running API replica. |
| `BETTER_AUTH_SECRET` | Required, 32+ characters | Signs and protects Better Auth data. Use a different random secret per environment. |
| `BETTER_AUTH_URL` | Required | Public base URL of this API, such as `http://localhost:3000`. |
| `CORS_ORIGINS` | Local default `http://localhost:4000` | Comma-separated exact browser origins allowed to send credentialed requests. |
| `COOKIE_SECURE` | Production default `true` | Requires HTTPS cookies; cannot be false in production. |
| `COOKIE_SAME_SITE` | `lax` | Cookie policy: `lax`, `strict`, or `none`; `none` requires secure cookies. |
| `TRUST_PROXY` | `false` | Set true only behind a trusted reverse proxy that supplies correct forwarding headers. |
| `MAX_BODY_BYTES` | `1048576` | Maximum JSON request body size. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `OPENAPI_DOCS_ENABLED` | `false` | Serves the OpenAPI JSON at `/api/openapi.json` and Swagger UI at `/api/docs/` when explicitly enabled. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Shared rate-limit window duration. |
| `AUTH_RATE_LIMIT_MAX` | `20` | Authentication requests allowed per window. |
| `ORDER_RATE_LIMIT_MAX` | `10` | Order creations allowed per window. |
| `REVIEW_RATE_LIMIT_MAX` | `10` | Review creations allowed per window. |
| `PUBLIC_SEARCH_RATE_LIMIT_MAX` | `60` | Public search requests allowed per window. |
| `SEED_ADMIN_NAME` | Required for seed | Full name for the provisioned admin. |
| `SEED_ADMIN_EMAIL` | Required for seed | Normalized admin login email. An existing non-admin at this email causes a clear failure. |
| `SEED_ADMIN_PASSWORD` | Required for seed | Unique admin password satisfying the application policy. Never hard-code it. |
| `SEED_DEVELOPMENT_DATA` | `false` | Enables optional fixtures when exactly `true`; forbidden in production. |
| `SEED_DEVELOPMENT_PASSWORD` | Required for optional fixtures | Local-only password satisfying the application policy. |

Generate `BETTER_AUTH_SECRET` with Node's cryptographically secure random source:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Generate administrator passwords with a password manager. Passwords must be
8–128 characters and contain at least one lowercase letter, uppercase letter,
and number. Use substantially more than the minimum length in real environments.
Do not reuse the Better Auth secret, database password, admin password, or
development fixture password.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the TypeScript server with file watching. |
| `npm run typecheck` | Check TypeScript without emitting output. |
| `npm run build` | Compile production JavaScript into `dist/`. |
| `npm run openapi:validate` | Validate the OpenAPI document and verify that it covers every product and health route. |
| `npm start` | Run the compiled server. |
| `npm test` | Run all unit and integration tests. |
| `npm run test:unit` | Run unit tests only. |
| `npm run test:integration` | Run integration tests against `TEST_DATABASE_URL` or `DATABASE_URL`. |
| `npm run db:generate` | Regenerate Prisma Client after schema changes. |
| `npm run db:validate` | Validate the authoritative Prisma schema. |
| `npm run db:migrate:dev` | Create/apply migrations during development. |
| `npm run db:migrate:deploy` | Apply committed migrations in deployment. |
| `npm run db:migrate:status` | Show migration state. |
| `npm run seed` | Provision baseline categories and the environment-configured admin. |
| `npm run seed:dev` | Add optional local development fixtures. |
| `npm run audit:release` | Fail on high or critical production dependency findings. |
| `npm run release:verify` | Run the schema, type, build, OpenAPI, dependency, and complete test release gate. |

Integration tests create isolated temporary PostgreSQL schemas and remove them
afterward. Use a dedicated test database account with schema creation rights;
set `TEST_DATABASE_URL` to keep tests away from development data.

## Production build and start

Use an HTTPS endpoint or trusted HTTPS reverse proxy and provide production
environment variables through the deployment platform's secret manager. Then:

```sh
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run seed
npm run build
npm start
```

Run migrations and the baseline seed as controlled release jobs, ideally once
per deployment rather than independently in every application replica. The seed
requires credentials from the secret manager and never contains a hard-coded
production password. Keep `SEED_DEVELOPMENT_DATA=false` in production.

The process checks database connectivity before listening, reports database
readiness through `/api/health`, and closes HTTP/database connections on
`SIGINT` or `SIGTERM`. Configure the platform to use that endpoint for readiness
checks and allow a graceful shutdown interval.

## Session and browser notes

Authentication uses HttpOnly server-session cookies. Browser clients must send
credentials and use an origin listed in `CORS_ORIGINS`. Cookie-authenticated
mutations also enforce the trusted origin. Native Better Auth HTTP routes are not
exposed; clients use the documented `/api/auth/*` FoodHub adapters.

## OpenAPI documentation

The authoritative OpenAPI 3.1 contract describes all 43 product endpoints plus
the operational health endpoint, including cookie authentication, role rules,
request/response schemas, pagination, stable error envelopes, examples, and
order-status transitions. Set `OPENAPI_DOCS_ENABLED=true`, then open Swagger UI
at `/api/docs/` or fetch the machine-readable document from `/api/openapi.json`.

Set `OPENAPI_DOCS_ENABLED=false` to remove both documentation routes. They are
disabled by default in test and production environments and should be exposed in
a shared deployment only when that is an intentional operational choice. The
checked-in contract remains available to tooling through `src/docs/openapi.ts`.

## Release and deployment

CI provisions clean PostgreSQL, installs the lockfile, generates and validates
Prisma, applies migrations, seeds baseline data, typechecks, builds, validates
OpenAPI coverage, enforces the dependency severity gate, runs all tests, and
exercises the built health endpoint and graceful shutdown.

See `docs/DEPLOYMENT.md` for HTTPS, pooling, migration rollout, monitoring,
backup/restore, and query-plan guidance. `docs/RELEASE-CHECKLIST.md` maps every
MVP acceptance criterion to automated or operational evidence.

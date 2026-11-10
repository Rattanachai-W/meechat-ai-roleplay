# Local Docker Postgres + Better Auth

Date: 2026-11-10  
Status: approved (conversation); awaiting spec file review before implementation plan

## Goal

Run MeeChat locally without Supabase Auth or a remote Postgres:

1. Postgres in Docker for local `DATABASE_URL`
2. Email/password auth via Better Auth, owned by this app
3. Remove runtime dependency on Supabase Auth for sessions, signup, sign-in, and account delete

Redis / Upstash stays optional and unset for now (rate limit continues to skip when unset).

## Non-goals

- Local Redis / Upstash-compatible REST proxy
- Google (or other) OAuth in this pass
- Supabase Storage migration
- Dual-mode auth (local Better Auth + cloud Supabase Auth)
- Keeping `@supabase/ssr` wired for session refresh

## Current state (problem)

- Prisma domain data lives in `public.*`; `users.id` was designed to mirror Supabase `auth.users.id` via SQL trigger in `supabase/sql/001_auth_triggers_rls.sql`
- Session path: browser/server Supabase clients, `proxy.ts` → `updateSession`, `getCurrentUser()` via `supabase.auth.getUser()`
- Login UI and sign-out call Supabase Auth; account delete calls Supabase Admin API
- Tests seed users through Supabase service role helpers

## Decisions

| Decision | Choice |
| --- | --- |
| Local DB | Docker Compose Postgres only |
| Auth provider | Better Auth (email/password) |
| Supabase Auth | Fully replace (not dual-mode) |
| Redis local | Skip this pass |
| OAuth | Out of scope; remove Google button for now |

## Architecture

```
Browser
  └─ Better Auth client (sign-up / sign-in / sign-out)
       └─ POST/GET /api/auth/[...all]
            └─ Better Auth (Prisma adapter)
                 ├─ auth tables (user, session, account, verification)
                 └─ databaseHooks on user create
                      └─ ensure domain User + EnergyWallet in public.users

proxy.ts
  └─ session cookie refresh / getSession (Better Auth)
       └─ getCurrentUser() reads Better Auth session → { id, email }
```

App APIs keep using `getCurrentUser()`; callers should not need to know Better Auth internals beyond that boundary.

## Infra: Docker Postgres

Add `docker-compose.yml` at repo root:

- Image: `postgres:16`
- Container name: `meechat-postgres`
- Port: `5432:5432`
- Env: `POSTGRES_USER=meechat`, `POSTGRES_PASSWORD=meechat`, `POSTGRES_DB=meechat`
- Named volume for data
- Healthcheck: `pg_isready`

npm scripts:

- `db:up` → `docker compose up -d`
- `db:down` → `docker compose down`
- `db:reset` → `docker compose down -v && docker compose up -d` (destructive local wipe)

Local connection string:

```text
DATABASE_URL=postgresql://meechat:meechat@localhost:5432/meechat
```

After containers are healthy: `npm run db:deploy` (or `db:migrate` in interactive local work) so Prisma migrations apply.

## Auth data model

### Better Auth tables

Add Prisma models required by Better Auth (names/fields follow Better Auth Prisma adapter conventions), typically:

- `user` (auth identity: id, name, email, emailVerified, image, timestamps)
- `session` (token, userId, expiresAt, ip/userAgent as needed)
- `account` (credential provider + password hash for email/password)
- `verification` (email verification tokens if enabled)

Exact field set follows the current Better Auth docs for the Prisma adapter at implementation time.

### Domain `public.users`

Keep existing `User` model as the app profile / ownership root for conversations, wallet, etc.

**ID strategy (explicit):** use the same UUID for Better Auth `user.id` and domain `User.id`. On successful sign-up, a Better Auth `databaseHooks.user.create.after` (or equivalent) creates:

1. `public.users` row with that id + email (+ default display name from email local-part)
2. `energy_wallets` row for that userId

This preserves foreign keys and ownership checks without a second id mapping table.

If a sign-up fails after auth user insert but before domain provisioning, the hook must be transactional where the adapter allows, or roll back / clean up so orphaned auth users are not left without wallets. Prefer a single transactional path; if the adapter cannot share a transaction, delete the auth user on domain insert failure and return a clear error.

### Email verification

MVP: allow sign-in without mandatory email verification (`emailAndPassword.requireEmailVerification: false` or equivalent). Verification can be added later without changing the domain user model.

## Application changes

### New / replace modules

- `src/lib/auth/auth.ts` — Better Auth server instance (Prisma adapter, secret, baseURL, email/password enabled, user create hook)
- `src/lib/auth/auth-client.ts` — browser client
- `src/app/api/auth/[...all]/route.ts` — Better Auth handler
- `src/lib/auth/current-user.ts` — read Better Auth session; return `{ id, email }` or null
- `src/proxy.ts` — stop calling Supabase `updateSession`; use Better Auth session handling appropriate for Next.js proxy

### UI

- `auth-form.tsx`: sign-up / sign-in via Better Auth client; remove Google OAuth button and Supabase client usage
- Login page: remove “Supabase not configured” gate; require `DATABASE_URL` + Better Auth env instead (or fail clearly at runtime if missing)
- Sign-out button / app shell: call Better Auth sign-out

### Account delete

`DELETE /api/me/delete` (or existing route): delete domain user via Prisma (cascade) and ensure Better Auth user/session/account rows are removed. Do not call Supabase Admin API.

### Remove / stop using

- Runtime use of `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` for auth
- `src/app/auth/callback/route.ts` (Supabase code exchange) unless replaced by a Better Auth-specific need (not required for email/password-only)
- Env helpers centered on Supabase Auth (`isSupabaseConfigured`, `requireSupabaseConfig`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) once nothing else needs them

If any non-auth Supabase usage remains (none expected for this pass beyond auth), document it; otherwise remove packages `@supabase/ssr` and `@supabase/supabase-js` when unused.

### Legacy SQL

`supabase/sql/001_auth_triggers_rls.sql` remains historical docs for the old cloud setup. Local Docker + Prisma path does not create `auth.users` or depend on that trigger. Do not require running that file against local Postgres.

## Environment

`.env.example` updates:

```text
DATABASE_URL=postgresql://meechat:meechat@localhost:5432/meechat
BETTER_AUTH_SECRET=          # long random string
BETTER_AUTH_URL=http://localhost:3000

# Optional (unchanged this pass)
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

Remove Supabase Auth variables from the “required” section of `.env.example`. Developers may delete them from local `.env`.

`src/lib/env.ts`: validate `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` (and keep `DATABASE_URL`); drop Supabase auth client env once removed from code.

## Error handling

- Invalid credentials → Better Auth standard error surfaced as toast on login form
- Duplicate email on sign-up → clear validation/toast message
- Domain provisioning failure after auth user create → fail the sign-up; no silent half-account
- Missing `BETTER_AUTH_SECRET` or `DATABASE_URL` in dev → throw/log clear startup or first-request error (same spirit as current `requireDatabaseUrl`)

## Testing

- Update `tests/helpers/user.ts` (and related env helpers) to create sessions via Better Auth / direct Prisma + cookie format that Better Auth expects, instead of Supabase service role + `sb-*-auth-token` cookies
- Security tests that forge Supabase cookies or call Supabase Admin must be rewritten for Better Auth session cookies
- Keep unit tests that do not touch auth unchanged
- Manual smoke: `db:up` → migrate → sign-up → sign-in → hit a protected API → sign-out → confirm unauthenticated

## Docs / roadmap touch-ups (minimal)

- Note in architecture or roadmap that Auth is Better Auth + local/Docker Postgres (not Supabase Auth)
- Avoid rewriting every historical decision unless needed for accuracy of “current stack”

## Implementation order (for the later plan)

1. Docker Compose + env example + npm scripts
2. Prisma Better Auth models + migration; wire Better Auth server + route
3. User create hook → domain `User` + wallet
4. Replace `getCurrentUser` + `proxy.ts`
5. Replace login UI / sign-out / account delete
6. Remove Supabase auth code and unused packages
7. Fix tests + smoke local path

## Risks

- **Schema naming collision:** Better Auth’s `user` table vs domain `users` (`@@map("users")`). Keep them separate tables with identical UUID ids; do not merge in this pass.
- **Migration on existing cloud DB:** if someone still points `DATABASE_URL` at an old Supabase project, adding Better Auth tables is fine, but existing `auth.users` sync triggers are no longer the source of truth. This project’s intended local path is Docker Postgres.
- **Test rewrite cost:** auth helpers are deeply Supabase-shaped; budget time for cookie/session helper changes.

## Success criteria

- `docker compose up -d` yields a healthy Postgres; Prisma migrate succeeds against it
- New user can sign up and sign in with email/password without any Supabase Auth env
- `getCurrentUser()` returns that user for subsequent requests
- Rate limit still no-ops when Upstash env is unset
- No runtime import path requires `@supabase/*` for authentication

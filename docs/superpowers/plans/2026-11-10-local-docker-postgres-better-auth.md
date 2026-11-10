# Local Docker Postgres + Better Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run MeeChat on local Docker Postgres with email/password auth via Better Auth, fully replacing Supabase Auth.

**Architecture:** Docker Compose provides Postgres. Better Auth (Prisma adapter) owns `user` / `session` / `account` / `verification` tables. Domain `public.users` keeps the same UUID as Better Auth `user.id`, provisioned in a `databaseHooks.user.create.after` hook (plus energy wallet). `getCurrentUser()` reads Better Auth sessions. Supabase Auth clients, callback, and env are removed.

**Tech Stack:** Next.js 16 (`proxy.ts`), Prisma 7 + `@prisma/adapter-pg`, Better Auth (`better-auth` + Prisma adapter), Docker Compose Postgres 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-local-docker-postgres-better-auth-design.md`

## Global Constraints

- No Redis / Upstash local setup in this plan (rate limit stays skip-when-unset)
- Email/password only; no Google/Facebook OAuth in this pass
- Better Auth `user.id` and domain `User.id` must be the same UUID
- Prisma model name conflict: existing `model User` maps to `users`; Better Auth tables must use distinct Prisma models (e.g. `AuthUser` `@@map("user")`) with `user.modelName: "authUser"`
- Do not run `supabase/sql/001_auth_triggers_rls.sql` against local Docker Postgres
- No emojis in UI/code/commits; no em/en dashes in copy
- Prefer existing project patterns (`src/lib/env.ts`, `src/lib/db/prisma.ts`, Vitest helpers)
- Commit only when the human asks, or when executing under a workflow that explicitly includes commits; otherwise leave working tree ready for review

---

## File map

| File | Responsibility |
| --- | --- |
| `docker-compose.yml` | Local Postgres 16 |
| `.env.example` | Local `DATABASE_URL`, `BETTER_AUTH_*`; drop Supabase-as-required |
| `package.json` | `db:up` / `db:down` / `db:reset`; deps |
| `prisma/schema.prisma` | Auth models + migration |
| `src/lib/auth/auth.ts` | Better Auth server instance + domain provision hook |
| `src/lib/auth/auth-client.ts` | Browser client |
| `src/lib/auth/current-user.ts` | Session → `{ id, email }` |
| `src/lib/auth/provision-domain-user.ts` | Create domain `User` + `EnergyWallet` |
| `src/app/api/auth/[...all]/route.ts` | Better Auth HTTP handler |
| `src/proxy.ts` | i18n only (no Supabase session refresh) |
| `src/features/auth/components/auth-form.tsx` | Email/password via Better Auth |
| `src/app/[locale]/(auth)/login/page.tsx` | Remove Supabase gate |
| `src/app/(auth)/login/page.tsx` | Same if still present |
| `src/features/shell/components/sign-out-button.tsx` | Better Auth sign-out |
| `src/features/shell/components/app-shell.tsx` | Better Auth sign-out |
| `src/app/api/me/delete/route.ts` | Delete domain + auth rows; sign out |
| Delete: `src/lib/supabase/*`, `src/app/auth/callback/route.ts` | Remove Supabase Auth |
| `src/lib/env.ts` | Better Auth env; remove Supabase helpers when unused |
| `tests/helpers/user.ts`, `tests/helpers/env.ts`, `tests/security/security.test.ts` | Better Auth cookies / signup |

---

### Task 1: Docker Postgres + env scripts

**Files:**
- Create: `docker-compose.yml`
- Modify: `package.json` (scripts)
- Modify: `.env.example`
- Modify: `.env` (local only; do not commit secrets)

**Interfaces:**
- Consumes: none
- Produces: Postgres at `postgresql://meechat:meechat@localhost:5432/meechat`

- [ ] **Step 1: Add `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: meechat-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: meechat
      POSTGRES_PASSWORD: meechat
      POSTGRES_DB: meechat
    volumes:
      - meechat_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U meechat -d meechat"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  meechat_pg_data:
```

- [ ] **Step 2: Add npm scripts in `package.json`**

```json
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"db:reset": "docker compose down -v && docker compose up -d"
```

Keep existing `db:migrate`, `db:deploy`, `db:studio`.

- [ ] **Step 3: Update `.env.example` required block**

Replace the Supabase-required header with:

```env
# ── Required: Postgres (local Docker) + Better Auth ──
DATABASE_URL=postgresql://meechat:meechat@localhost:5432/meechat
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Optional legacy notes: Supabase Auth is removed from this app.
# UPSTASH_* still optional for rate limit.
```

Keep AI / payments / optional sections. Remove `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` from the required section (delete lines entirely once Task 6 finishes; for Task 1, move them under a commented "removed / unused" note or delete if already unused).

- [ ] **Step 4: Point local `.env` at Docker Postgres**

Set (do not commit `.env`):

```env
DATABASE_URL=postgresql://meechat:meechat@localhost:5432/meechat
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<run: openssl rand -base64 32>
```

- [ ] **Step 5: Start Postgres and verify**

Run:

```bash
npm run db:up
docker compose ps
```

Expected: `meechat-postgres` healthy / running.

Run:

```bash
docker compose exec postgres pg_isready -U meechat -d meechat
```

Expected: `accepting connections`

- [ ] **Step 6: Commit (only if human requested commits)**

```bash
git add docker-compose.yml package.json .env.example
git commit -m "$(cat <<'EOF'
chore: add local Docker Postgres for development

EOF
)"
```

---

### Task 2: Install Better Auth + Prisma auth schema

**Files:**
- Modify: `package.json` / lockfile
- Create: `src/lib/auth/auth.ts` (minimal, enough for CLI generate)
- Modify: `prisma/schema.prisma` (auth models)
- Create: `prisma/migrations/<timestamp>_better_auth/migration.sql` via Prisma CLI

**Interfaces:**
- Consumes: `prisma` from `@/lib/db/prisma`
- Produces: Prisma models `AuthUser`, `Session`, `Account`, `Verification`; exported `auth` instance

- [ ] **Step 1: Install packages**

```bash
npm install better-auth
```

If current Better Auth docs require `@better-auth/prisma-adapter`, install that too and import `prismaAdapter` from the package the docs specify. Prefer `prismaAdapter` from `better-auth/adapters/prisma` when available (matches Vercel auth skill).

- [ ] **Step 2: Create minimal `src/lib/auth/auth.ts` for schema generate**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    // Avoid clashing with domain model User (@@map("users"))
    modelName: "authUser",
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [nextCookies()],
});
```

Note: `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` are read by Better Auth from env by convention.

- [ ] **Step 3: Generate Prisma schema fragments**

```bash
npx auth@latest generate --config src/lib/auth/auth.ts
```

If the CLI writes a `model User`, rename it to `AuthUser` with `@@map("user")` and keep `user.modelName: "authUser"`. Ensure Session / Account / Verification FKs point at `AuthUser`. Domain `model User` must remain untouched.

Expected Prisma shape (adjust field list to match CLI output exactly; do not invent columns the adapter does not expect):

```prisma
model AuthUser {
  id            String    @id @db.Uuid
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false) @map("email_verified")
  image         String?
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id @db.Uuid
  expiresAt DateTime @map("expires_at")
  token     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  userId    String   @map("user_id") @db.Uuid
  user      AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

model Account {
  id                    String    @id @db.Uuid
  accountId             String    @map("account_id")
  providerId            String    @map("provider_id")
  userId                String    @map("user_id") @db.Uuid
  user                  AuthUser  @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?   @map("access_token")
  refreshToken          String?   @map("refresh_token")
  idToken               String?   @map("id_token")
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at")
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at")
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  @@map("account")
}

model Verification {
  id         String   @id @db.Uuid
  identifier String
  value      String
  expiresAt  DateTime @map("expires_at")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("verification")
}
```

If CLI uses different column naming (no `@map`), prefer the CLI output and keep `modelName` wiring correct. Domain `User.id` stays `@db.Uuid` without `@default` (app supplies the Better Auth id).

- [ ] **Step 4: Create and apply migration against Docker**

```bash
npm run db:up
npx prisma migrate dev --name better_auth
npx prisma generate
```

Expected: migration applied; client regenerated under `src/generated/prisma`.

- [ ] **Step 5: Smoke Better Auth handler mount (create route early)**

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

Restart `npm run dev`, then:

```bash
curl -s http://localhost:3000/api/auth/ok
```

Expected: JSON containing `"status":"ok"` (or equivalent Better Auth health payload).

- [ ] **Step 6: Commit (only if human requested)**

```bash
git add package.json package-lock.json prisma src/lib/auth/auth.ts src/app/api/auth
git commit -m "$(cat <<'EOF'
feat: add Better Auth Prisma schema and API handler

EOF
)"
```

---

### Task 3: Domain user provisioning + `getCurrentUser`

**Files:**
- Create: `src/lib/auth/provision-domain-user.ts`
- Modify: `src/lib/auth/auth.ts` (hooks)
- Modify: `src/lib/auth/current-user.ts`
- Create: `src/lib/auth/auth-client.ts`
- Modify: `src/lib/env.ts` (Better Auth fields; keep DATABASE_URL)

**Interfaces:**
- Consumes: `auth.api.getSession({ headers })`
- Produces:
  - `provisionDomainUser(user: { id: string; email: string; name?: string | null }): Promise<void>`
  - `getCurrentUser(): Promise<{ id: string; email?: string } | null>`
  - `authClient` with `signIn.email`, `signUp.email`, `signOut`

- [ ] **Step 1: Write unit test for provision helper**

Create `tests/unit/provision-domain-user.test.ts` that mocks `prisma` OR (preferred if DB available) integration-style:

Prefer a focused unit that exports pure display-name helper if mocking Prisma is heavy. Minimum:

```ts
import { describe, expect, it } from "vitest";
import { displayNameFromEmail } from "@/lib/auth/provision-domain-user";

describe("displayNameFromEmail", () => {
  it("uses local part", () => {
    expect(displayNameFromEmail("alice@example.com")).toBe("alice");
  });
});
```

- [ ] **Step 2: Implement `provision-domain-user.ts`**

```ts
import { prisma } from "@/lib/db/prisma";

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "user";
}

export async function provisionDomainUser(input: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<void> {
  const displayName =
    (input.name && input.name.trim()) || displayNameFromEmail(input.email);

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: { email: input.email, NOT: { id: input.id } },
    });

    await tx.user.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        email: input.email,
        displayName,
      },
      update: {
        email: input.email,
      },
    });

    await tx.energyWallet.upsert({
      where: { userId: input.id },
      create: { userId: input.id },
      update: {},
    });
  });
}
```

- [ ] **Step 3: Wire hook in `auth.ts`**

```ts
import { APIError } from "better-auth/api";
import { provisionDomainUser } from "@/lib/auth/provision-domain-user";

// inside betterAuth({ ... })
databaseHooks: {
  user: {
    create: {
      after: async (user) => {
        try {
          await provisionDomainUser({
            id: user.id,
            email: user.email,
            name: user.name,
          });
        } catch (error) {
          await prisma.authUser.delete({ where: { id: user.id } }).catch(() => null);
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to provision application user",
          });
        }
      },
    },
  },
},
```

- [ ] **Step 4: Replace `current-user.ts`**

```ts
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

export interface CurrentUser {
  id: string;
  email?: string;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email };
  } catch {
    return null;
  }
});
```

- [ ] **Step 5: Add `auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 6: Update `env.ts`**

Add optional/required server fields:

```ts
BETTER_AUTH_SECRET: z.string().min(32).optional(),
BETTER_AUTH_URL: z.string().url().optional(),
```

Remove `isSupabaseConfigured` / `requireSupabaseConfig` and Supabase client env once no imports remain (finish in Task 6 if still referenced). Add:

```ts
export function isAuthConfigured(): boolean {
  return Boolean(env.DATABASE_URL && env.BETTER_AUTH_SECRET && env.BETTER_AUTH_URL);
}
```

- [ ] **Step 7: Manual sign-up smoke via API**

```bash
curl -s -c /tmp/meechat-cookies.txt -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dev1@example.com\",\"password\":\"Test-pass-1234\",\"name\":\"Dev One\"}"
```

Then SQL check:

```bash
docker compose exec -T postgres psql -U meechat -d meechat -c "select id, email from \"user\";"
docker compose exec -T postgres psql -U meechat -d meechat -c "select id, email from users;"
docker compose exec -T postgres psql -U meechat -d meechat -c "select user_id from energy_wallets;"
```

Expected: same UUID in `"user"` and `users`; wallet row exists.

- [ ] **Step 8: Run unit test**

```bash
npm run test:unit -- tests/unit/provision-domain-user.test.ts
```

Expected: PASS

---

### Task 4: Simplify `proxy.ts` (drop Supabase refresh)

**Files:**
- Modify: `src/proxy.ts`
- Delete usage of `src/lib/supabase/middleware.ts` (file deleted in Task 6)

**Interfaces:**
- Consumes: `next-intl` middleware only
- Produces: unchanged i18n routing; no auth DB calls in proxy

- [ ] **Step 1: Replace `proxy.ts`**

```ts
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

function shouldSkip(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$/.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  if (shouldSkip(request)) {
    return;
  }
  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
```

Real session checks stay in `getCurrentUser` / route handlers (Better Auth recommendation: do not hit DB in proxy for every request).

- [ ] **Step 2: Verify pages still load**

Open `http://localhost:3000/th/login` (or default locale). Expected: login page renders without proxy errors in the terminal.

---

### Task 5: Login UI + sign-out

**Files:**
- Modify: `src/features/auth/components/auth-form.tsx`
- Modify: `src/app/[locale]/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx` (if duplicate still exists)
- Modify: `src/features/shell/components/sign-out-button.tsx`
- Modify: `src/features/shell/components/app-shell.tsx`
- Optionally trim unused Auth Google strings later (not required)

**Interfaces:**
- Consumes: `authClient.signIn.email`, `authClient.signUp.email`, `authClient.signOut`
- Produces: email/password-only auth UX

- [ ] **Step 1: Rewrite `auth-form.tsx` (email/password only)**

Remove Google/Facebook UI and Supabase client. Core submit:

```ts
import { authClient } from "@/lib/auth/auth-client";

// sign-in
const { error } = await authClient.signIn.email({
  email: parsed.data.email,
  password: parsed.data.password,
});
if (error) throw error;
router.replace("/discover");
router.refresh();

// sign-up
const { error } = await authClient.signUp.email({
  email: parsed.data.email,
  password: parsed.data.password,
  name: parsed.data.email.split("@")[0] || "user",
});
if (error) throw error;
router.replace("/discover");
router.refresh();
```

Map Better Auth error codes/messages into existing `toLocalizedErrorMessage` where possible (`INVALID_EMAIL_OR_PASSWORD`, user exists, weak password). Fallback to `error.message`.

- [ ] **Step 2: Login page always shows `AuthForm` when auth env is ready**

```tsx
import { isAuthConfigured } from "@/lib/env";

{isAuthConfigured() ? (
  <Card>...</Card> with <AuthForm />
) : (
  <Alert> explaining DATABASE_URL + BETTER_AUTH_SECRET + BETTER_AUTH_URL
)}
```

Update copy keys if needed (reuse Supabase alert keys temporarily only if unavoidable; prefer new `authConfig*` keys in `messages/th.json` and `messages/en.json`).

- [ ] **Step 3: Sign-out**

```ts
await authClient.signOut();
router.replace("/login");
router.refresh();
```

Apply in `sign-out-button.tsx` and `app-shell.tsx`.

- [ ] **Step 4: Manual UI smoke**

1. Sign up new email
2. Land on discover
3. Sign out
4. Sign in again

Expected: all succeed without Supabase env.

---

### Task 6: Account delete + remove Supabase Auth

**Files:**
- Modify: `src/app/api/me/delete/route.ts`
- Delete: `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`
- Delete: `src/app/auth/callback/route.ts`
- Modify: `src/lib/env.ts` (remove Supabase)
- Modify: `package.json` (remove `@supabase/ssr`, `@supabase/supabase-js` if unused)
- Grep + fix any remaining imports

**Interfaces:**
- Consumes: `requireUser()`, `prisma`, `auth.api.signOut`
- Produces: account delete that removes domain + auth rows

- [ ] **Step 1: Rewrite delete route**

```ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUser } from "@/lib/api/errors";
import { auth } from "@/lib/auth/auth";

const bodySchema = z.object({
  confirm: z.literal("DELETE"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    bodySchema.parse(await request.json());

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: user.id } }).catch(() => null);
      await tx.authUser.delete({ where: { id: user.id } }).catch(() => null);
    });

    await auth.api.signOut({ headers: await headers() }).catch(() => null);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof ApiError) return jsonErrorResponseLocalized(error);
    return jsonErrorResponseLocalized(error);
  }
}
```

Note: deleting `AuthUser` cascades session/account. Deleting domain `User` cascades app data. Order: domain first or auth first is fine if both ids match; keep both deletes.

- [ ] **Step 2: Remove Supabase modules and callback**

Delete the files listed above. Fix compile errors.

- [ ] **Step 3: Uninstall unused packages**

```bash
npm uninstall @supabase/ssr @supabase/supabase-js
```

Only if no remaining imports (`rg "@supabase" src tests`).

- [ ] **Step 4: Clean `env.ts` + `.env.example`**

Remove Supabase zod fields and helpers. Keep Upstash optional.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors related to deleted Supabase modules.

---

### Task 7: Test helpers + security suite

**Files:**
- Modify: `tests/helpers/env.ts`
- Modify: `tests/helpers/user.ts`
- Modify: `tests/security/security.test.ts`
- Grep other tests for `SB_URL`, `SERVICE_KEY`, `sb-` cookies

**Interfaces:**
- Consumes: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`
- Produces: `createTestUser()` → `{ id, email, password, cookie }` where `cookie` is the Better Auth session cookie header value(s)

- [ ] **Step 1: Slim `tests/helpers/env.ts`**

```ts
import "dotenv/config";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://meechat:meechat@localhost:5432/meechat";

export async function requireDevServer(): Promise<void> {
  const res = await fetch(`${BASE}/api/models`).catch(() => null);
  if (!res) {
    throw new Error(`dev server ไม่ตอบที่ ${BASE} — รัน "npm run dev" ก่อนแล้วค่อยรัน suite นี้`);
  }
}
```

- [ ] **Step 2: Rewrite `createTestUser` / cookie helper**

```ts
import { BASE, DATABASE_URL } from "./env";
import { q } from "./db";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

const PASSWORD = "Test-pass-1234";
let counter = 0;

export function uniqueEmail(prefix = "meechat.t"): string {
  const suffix = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `${prefix}.${suffix}@example.com`;
}

function cookiesFromResponse(res: Response): string {
  // Node 18+: getSetCookie if present
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = anyHeaders.getSetCookie?.() ?? [];
  if (raw.length === 0) {
    const single = res.headers.get("set-cookie");
    if (!single) throw new Error("sign-up/sign-in returned no Set-Cookie");
    return single.split(",")[0].split(";")[0]; // fragile fallback
  }
  return raw.map((c) => c.split(";")[0]).join("; ");
}

export async function createTestUser(
  opts: { password?: string } = {}
): Promise<TestUser> {
  const email = uniqueEmail();
  const password = opts.password ?? PASSWORD;
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name: email.split("@")[0],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sign-up failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const cookie = cookiesFromResponse(res);
  const json = (await res.json()) as { user?: { id: string } };
  const id = json.user?.id;
  if (!id) throw new Error(`sign-up missing user.id: ${JSON.stringify(json).slice(0, 200)}`);
  return { id, email, password, cookie };
}

export async function cleanupTestUser(user: { id: string; email: string }): Promise<void> {
  try {
    await q("delete from ai_usage_logs where user_id = $1", [user.id]);
  } catch { /* ignore */ }
  try {
    await q("delete from users where id = $1", [user.id]);
  } catch { /* ignore */ }
  try {
    await q('delete from "user" where id = $1', [user.id]);
  } catch { /* ignore */ }
}
```

Keep `topUpEnergy` as-is (SQL against `energy_wallets`).

- [ ] **Step 3: Update security tests forged-cookie cases**

Replace `sb-yauoirkmvouoownxtbhr-auth-token=...` with forged Better Auth cookies, e.g.:

```ts
cookie: "better-auth.session_token=forged"
```

Replace service-role Authorization test with a nonsense Bearer still expecting 401/403.

Remove reliance on `SUPABASE_SERVICE_ROLE_KEY` / anon key.

- [ ] **Step 4: Run security suite (dev server + Docker DB required)**

```bash
npm run db:up
# ensure migrate applied + npm run dev
npx vitest run tests/security/security.test.ts
```

Expected: PASS (or fix cookie parsing / sign-up path until green).

- [ ] **Step 5: Grep remaining Supabase auth assumptions**

```bash
rg -n "supabase|SUPABASE|sb-.*auth-token|GoTrue" src tests docs/roadmap.md
```

Fix leftover test/docs references that claim Supabase Auth is current (minimal doc touch: architecture/roadmap note).

---

### Task 8: Final verification + short docs note

**Files:**
- Modify: `docs/architecture.md` (Auth bullet: Better Auth + Postgres; Supabase Auth removed)
- Optionally one line in `docs/roadmap.md`

- [ ] **Step 1: End-to-end checklist**

1. `npm run db:down` then `npm run db:up`
2. `npm run db:deploy`
3. `npm run dev`
4. Sign up / sign in / sign out in browser
5. `npm run test:unit`
6. `npx vitest run tests/security/security.test.ts` (with server up)

- [ ] **Step 2: Architecture note**

In `docs/architecture.md` system overview, change Auth line from Supabase Auth to Better Auth (email/password) on app Postgres. Keep Upstash as optional rate limit.

- [ ] **Step 3: Stop — hand off for human commit/PR**

Do not push. Summarize files changed and how to run locally.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Docker Postgres compose + scripts | Task 1 |
| `.env.example` local DATABASE_URL + BETTER_AUTH_* | Task 1, 6 |
| Better Auth tables via Prisma | Task 2 |
| Same UUID domain user + wallet hook | Task 3 |
| `/api/auth/[...all]` | Task 2 |
| `getCurrentUser` from Better Auth | Task 3 |
| `proxy.ts` without Supabase refresh | Task 4 |
| Login UI email/password; remove Google | Task 5 |
| Account delete without Supabase Admin | Task 6 |
| Remove Supabase auth runtime | Task 6 |
| Test helpers / security rewrite | Task 7 |
| Redis out of scope | Global Constraints |
| No OAuth this pass | Task 5 / Constraints |

No intentional TBD placeholders. Cookie header parsing may need adjustment to match Better Auth’s exact `Set-Cookie` names after Step 7.2 — implementers must print response headers once and match them, not invent a second cookie format.

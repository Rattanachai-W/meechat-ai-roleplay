import { SB_URL, ANON, SERVICE_KEY } from "./env";
import { q } from "./db";

/**
 * Test user helper — สร้าง user จริงผ่าน GoTrue admin API (service role)
 * เพื่อให้ trigger handle_new_user ทำงานครบเหมือน production
 */

export interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: { id: string; email?: string };
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
  session: GoTrueSession;
}

let counter = 0;

/** email gmail.com — GoTrue ปฏิเสธโดเมน .local / .supabase.co */
export function uniqueEmail(prefix = "meechat.t"): string {
  const suffix = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `${prefix}.${suffix}@gmail.com`;
}

const PASSWORD = "Test-pass-1234";

/** @supabase/ssr cookie format: base64(JSON) */
export function makeCookie(session: GoTrueSession): string {
  const name = "sb-yauoirkmvouoownxtbhr-auth-token";
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: session.expires_in ?? 3600,
    expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
    user: session.user,
  };
  return `${name}=base64-${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

async function login(email: string, password: string): Promise<GoTrueSession> {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as GoTrueSession & { msg?: string };
  if (!json.access_token) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

/** สร้าง user ใหม่ + login + cookie — พร้อมใช้ยิง API ทันที */
export async function createTestUser(
  opts: { password?: string } = {}
): Promise<TestUser> {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY ไม่ได้ตั้งใน .env");
  const email = uniqueEmail();
  const password = opts.password ?? PASSWORD;

  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = (await res.json()) as { id?: string; msg?: string };
  if (!res.ok || !created.id) {
    throw new Error(`admin createUser failed (${res.status}): ${JSON.stringify(created).slice(0, 200)}`);
  }

  const session = await login(email, password);
  return { id: created.id, email, password, cookie: makeCookie(session), session };
}

/** เพิ่ม free energy เข้า wallet ของ test user — เขียน ledger row ควบคู่กัน (คง invariant ledger↔wallet) */
export async function topUpEnergy(userId: string, amount: number): Promise<void> {
  const idem = `test-topup-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await q(
    `with w as (
       insert into energy_wallets (user_id, free_balance, lifetime_earned)
       values ($1, $2::int, $2::int)
       on conflict (user_id) do update
         set free_balance = energy_wallets.free_balance + $2::int,
             lifetime_earned = energy_wallets.lifetime_earned + $2::int
       returning id, (free_balance - $2::int) as before, free_balance as after
     )
     insert into energy_transactions
       (wallet_id, user_id, type, amount, balance_before, balance_after, idempotency_key, reference_type)
     select id, $1, 'ADMIN_ADJUSTMENT', $2::int, before, after, $3, 'test_topup' from w`,
    [userId, amount, idem]
  );
}

/** ล้างข้อมูล test user ทั้งหมด — cascade ครบผ่าน public.users → auth.users */
export async function cleanupTestUser(user: { id: string; email: string }): Promise<void> {
  try {
    await q("delete from ai_usage_logs where user_id = $1", [user.id]);
  } catch { /* ignore */ }
  try {
    await q("delete from public.users where id = $1", [user.id]);
  } catch { /* ignore */ }
  try {
    await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch { /* ignore */ }
}

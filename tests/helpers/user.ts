import { BASE } from "./env";
import { q } from "./db";

/**
 * Test user helper — สร้าง user ผ่าน Better Auth sign-up API
 * เพื่อให้ databaseHooks provision domain User + wallet เหมือน production
 */

export interface TestUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

let counter = 0;

export function uniqueEmail(prefix = "meechat.t"): string {
  const suffix = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `${prefix}.${suffix}@example.com`;
}

const PASSWORD = "Test-pass-1234";

function cookiesFromResponse(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = anyHeaders.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) throw new Error("sign-up/sign-in returned no Set-Cookie");
  return single
    .split(/,(?=\s*[^;=]+=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

/** สร้าง user ใหม่ + cookie — พร้อมใช้ยิง API ทันที */
export async function createTestUser(
  opts: { password?: string } = {}
): Promise<TestUser> {
  const email = uniqueEmail();
  const password = opts.password ?? PASSWORD;

  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
    },
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

/** ล้างข้อมูล test user ทั้งหมด — cascade ครบผ่าน public.users + Better Auth user */
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

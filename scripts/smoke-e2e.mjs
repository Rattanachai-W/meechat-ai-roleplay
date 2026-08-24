/**
 * Smoke test E2E ของ pipeline หลัก
 *
 * Flow: สร้าง temp user (SQL native-shape) → password login (Supabase REST) →
 *   สร้าง persona/conversation → POST /api/chat (SSE) →
 *   ตรวจ: first message seeded, daily-claim +50 idempotent,
 *         chat stream ครบวงจร (success: done + บันทึกข้อความ + settle energy,
 *                              failure: error event + refund คืนเต็ม),
 *         ai_usage_log, cross-user 404
 * จบแล้วลบข้อมูลชั่วคราวทิ้ง
 *
 * หมายเหตุ: ต้อง insert แถว auth.users ให้มี shape ครบแบบ GoTrue
 * (instance_id zeros, timestamps, identity row ใน auth.identities)
 * และ email ต้องไม่ใช่โดเมน .supabase.co / .local — GoTrue จะ 500 ตอน password grant
 * run: node scripts/smoke-e2e.mjs
 */
import { Client } from "pg";
import bcrypt from "bcryptjs";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.yauoirkmvouoownxtbhr:YYXbS4HCIitB8aTJ@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
const BASE = "http://localhost:3000";
// โดเมน gmail.com เป็นเพียงตัวผ่าน validation ของ GoTrue — เราไม่เรียก endpoint ที่ส่งอีเมลจริง
const EMAIL = "meechat.smoke.tester@gmail.com";
const PASSWORD = "smoke-test-1234";
const SB_URL = "https://yauoirkmvouoownxtbhr.supabase.co";
const ANON = "sb_publishable_1xQb_iLG5Cf5UXzxm9Dzqg_uDsfGZV1";
const ZERO = "00000000-0000-0000-0000-000000000000";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // ── 1. temp user (native shape ตามที่ GoTrue คาดหวัง) ──
  await cleanupTempUser(db);
  const u = await db.query(
    `insert into auth.users
       (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_sent_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        created_at, updated_at)
     values ($1, gen_random_uuid(), 'authenticated', 'authenticated', $2::text, $3,
        now(), now(), '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('sub', gen_random_uuid()::text, 'email', $4::text, 'email_verified', true),
        false, false, now(), now())
     returning id`,
    [ZERO, EMAIL, bcrypt.hashSync(PASSWORD, 10), EMAIL]
  );
  const userId = u.rows[0].id;
  await db.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1::uuid, $1::uuid, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), 'email', now(), now(), now())`,
    [userId, String(userId), EMAIL]
  );
  check("temp user created", true, userId);

  // ── 2. login via Supabase REST ──
  const loginRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await loginRes.json();
  check("password login", Boolean(session.access_token), loginRes.status);
  if (!session.access_token) throw new Error("login failed — cannot continue");

  // ── cookie แบบ @supabase/ssr (base64 JSON) ──
  const cookieName = "sb-yauoirkmvouoownxtbhr-auth-token";
  const makeCookie = (s) =>
    `${cookieName}=base64-${Buffer.from(JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      token_type: "bearer",
      expires_in: s.expires_in ?? 3600,
      expires_at: Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
      user: s.user,
    })).toString("base64")}`;
  const cookieHeader = makeCookie(session);

  // ── 3. สร้าง persona + conversation ──
  const personaRes = await fetch(`${BASE}/api/personas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ name: "สมชาย", description: "นักทดสอบระบบ", isDefault: true }),
  });
  const personaData = await personaRes.json();
  check("create persona", personaRes.status === 201, JSON.stringify(personaData).slice(0, 120));

  const charRow = await db.query("select id from characters where slug='pranee-doctor'");
  const convRes = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ characterId: charRow.rows[0].id, personaId: personaData.persona.id }),
  });
  const convData = await convRes.json();
  check("create conversation", convRes.status === 201, convRes.status);

  const convId = convData.conversation.id;

  const msgCount = await db.query("select count(*)::int n from messages where conversation_id=$1", [convId]);
  check("first assistant message seeded", msgCount.rows[0].n === 1);

  // ── 4. daily claim ก่อน (ให้มี energy สำหรับ chat) ──
  const claimRes = await fetch(`${BASE}/api/energy/daily-claim`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
  });
  const claimData = await claimRes.json();
  check("daily claim +50", claimData.claimed === true && Number(claimData.amount) === 50, JSON.stringify(claimData).slice(0, 120));

  // ── 5. chat SSE — คาดหวัง event: done (LLM ตอบจริง) หรือ event: error (fallback) ──
  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ conversationId: convId, content: "สวัสดีครับหมอ" }),
  });
  check("chat responds", chatRes.status === 200, chatRes.status);
  const sseText =
    chatRes.body && chatRes.headers.get("content-type")?.includes("text/event-stream")
      ? await chatRes.text()
      : "";
  const parseData = (block) => {
    const m = /^data: (.+)$/m.exec(block);
    if (!m) return null;
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  };
  const blocks = sseText.split("\n\n").filter((b) => b.trim());
  const doneBlocks = blocks.filter((b) => b.startsWith("event: done"));
  const errBlocks = blocks.filter((b) => b.startsWith("event: error"));
  const successPath = doneBlocks.length > 0;
  check(
    "chat stream completes (done|error)",
    successPath || errBlocks.length > 0,
    sseText.slice(0, 160)
  );

  let doneData = null;
  if (successPath) {
    doneData = parseData(doneBlocks[doneBlocks.length - 1]) ?? {};
    check(
      "assistant replied with content",
      typeof doneData.content === "string" && doneData.content.trim().length > 0,
      String(doneData.content ?? "").slice(0, 80)
    );
    check(
      "usage tokens reported",
      Number(doneData.usage?.promptTokens) > 0 && Number(doneData.usage?.completionTokens) > 0,
      JSON.stringify(doneData.usage)
    );
    const savedMsg = await db.query(
      "select status, model, content from messages where conversation_id=$1 and role='ASSISTANT' order by created_at desc limit 1",
      [convId]
    );
    check(
      "assistant message saved COMPLETED",
      savedMsg.rows[0]?.status === "COMPLETED" && savedMsg.rows[0]?.model?.length > 0,
      `${savedMsg.rows[0]?.status} / ${savedMsg.rows[0]?.model}`
    );
  } else {
    check("SSE error event received (fallback path)", errBlocks.length > 0, errBlocks[0]?.slice(0, 120));
  }

  // ── 6. ledger: reserve → settle/refund ครบวงจร ──
  const txs = await db.query(
    "select type, amount from energy_transactions where user_id=$1 order by created_at",
    [userId]
  );
  const types = txs.rows.map((t) => t.type);
  const chatNet = txs.rows
    .filter((t) => t.type === "CHAT_USAGE" || t.type === "REFUND")
    .reduce((s, t) => s + Number(t.amount), 0);
  if (successPath) {
    check("ledger settled CHAT_USAGE", types.includes("CHAT_USAGE"), types.join(","));
    check("energy charged (net<0)", chatNet < 0, `chatNet=${chatNet}`);
  } else {
    check("ledger has CHAT_USAGE + REFUND", types.includes("CHAT_USAGE") && types.includes("REFUND"), types.join(","));
    check("energy fully refunded (net=0)", chatNet === 0, `chatNet=${chatNet}`);
  }

  // ── 7. usage log + idempotent claim ──
  const logs = await db.query("select status, error_code from ai_usage_logs where user_id=$1", [userId]);
  if (successPath) {
    check(
      "ai_usage_log SUCCESS row",
      logs.rows.some((r) => r.status === "SUCCESS"),
      JSON.stringify(logs.rows).slice(0, 160)
    );
  } else {
    check(
      "ai_usage_log ERROR row",
      logs.rows.some((r) => r.status === "ERROR"),
      JSON.stringify(logs.rows).slice(0, 160)
    );
  }
  const claim2 = await fetch(`${BASE}/api/energy/daily-claim`, { method: "POST", headers: { Cookie: cookieHeader } });
  const claim2Data = await claim2.json();
  check("second claim idempotent", claim2Data.claimed === false);

  // ── 8. ownership: user อื่นห้ามดู messages ──
  const OTHER_EMAIL = "meechat.smoke.other@gmail.com";
  await cleanupTempUser(db);
  const other = await db.query(
    `insert into auth.users
       (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_sent_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        created_at, updated_at)
     values ($1, gen_random_uuid(), 'authenticated', 'authenticated', $2::text, $3,
        now(), now(), '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('sub', gen_random_uuid()::text, 'email', $4::text, 'email_verified', true),
        false, false, now(), now())
     returning id`,
    [ZERO, OTHER_EMAIL, bcrypt.hashSync("smoke-other-1234", 10), OTHER_EMAIL]
  );
  await db.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1::uuid, $1::uuid, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), 'email', now(), now(), now())`,
    [other.rows[0].id, String(other.rows[0].id), OTHER_EMAIL]
  );
  const otherLogin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OTHER_EMAIL, password: "smoke-other-1234" }),
  });
  const otherSession = await otherLogin.json().catch(() => ({}));
  if (!otherSession.access_token) {
    console.log("(skip cross-user check — second login failed:", otherLogin.status, ")");
  } else {
    const forbidden = await fetch(`${BASE}/api/conversations/${convId}/messages`, {
      headers: { Cookie: makeCookie(otherSession) },
    });
    check("cross-user messages blocked", forbidden.status === 404, forbidden.status);
  }

  // ── cleanup ──
  await db.query("delete from energy_transactions where user_id=$1", [userId]);
  await db.query("delete from energy_wallets where user_id=$1", [userId]);
  await db.query("delete from user_personas where user_id=$1", [userId]);
  await db.query("delete from conversations where id=$1", [convId]);
  await db.query("delete from ai_usage_logs where user_id=$1", [userId]);
  await cleanupTempUser(db);
  await db.end();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? "ALL PASSED" : failed.length + " FAILED"} (${results.length} checks)`);
  if (failed.length > 0) process.exit(1);
}

/** ลบ temp users ทั้งฝั่ง public.users และ auth.users (trigger ต้องการฝั่ง public ว่างก่อน) */
async function cleanupTempUser(db) {
  for (const email of ["meechat.smoke.tester@gmail.com", "meechat.smoke.other@gmail.com"]) {
    await db.query("delete from public.users where email = $1", [email]);
    await db.query("delete from auth.users where email = $1", [email]);
  }
}

main().catch((e) => {
  console.error("smoke crashed:", e.message);
  process.exit(1);
});

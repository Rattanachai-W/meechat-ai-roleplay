# MeeChat — รายงานผลทดสอบเต็มรูปแบบ

วันที่ทดสอบ: 2026-08-23/24 (run ล่าสุด: หลัง M9 + mock payment + E2E wallet + ระบบภารกิจ) · Runner: Vitest 4 (`npx vitest run`, `fileParallelism: false` เพราะแชร์ dev server + database จริง)
Environment: Next.js 16 dev server (localhost:3000) + Supabase Postgres (pooler session mode) + OpenRouter

## สรุปผลรวม

**Full-suite run ล่าสุด (`npx vitest run`): Test Files 17/18 passed · Tests 177/178 — ไฟล์เดียวที่พังคือ migration registration (finished_at=null จากการ register มือ) แก้แล้ว re-run ผ่าน 5/5 → รวมสุทธิ 18 ไฟล์ / 178 tests ผ่านหมด**
**Browser GUI E2E (in-app browser, บัญชีทดสอบจริง): ล็อกอิน → แชท → เคลมรายวัน → เติมเงิน mock → ประวัติ → ภารกิจ (แชทจริงจบ quest + กดรับรางวัลใน UI) — ผ่านครบ**

| หมวด | ไฟล์ | จำนวน | ผล |
|---|---|---|---|
| Unit | `tests/unit/*.test.ts` (pricing, **creator-pricing**, gateway, prompt-builder, validation, **quest-judge**) | 49 | ✅ 49/49 |
| Integration | `tests/integration/api-core.test.ts`, `energy-service.test.ts`, `creator-studio.test.ts`, **`quests.test.ts`, `quests-judge.test.ts`** | 68 | ✅ 68/68 |
| E2E Journey | `tests/e2e/journey.test.ts` | 8 | ✅ 8/8 |
| **E2E Wallet** | **`tests/e2e/wallet-flows.test.ts`** | **7** | ✅ 7/7 |
| Concurrency/Race | `tests/concurrency/race.test.ts` | 4 | ✅ 4/4 |
| Security | `tests/security/security.test.ts` | 21 | ✅ 21/21 |
| Failure/Recovery | `tests/failure/failure.test.ts` | 11 | ✅ 11/11 |
| Performance/Load | `tests/perf/load.test.ts` | 5 | ✅ 5/5 |
| DB Migration/Drift | `tests/migration/drift.test.ts` | 5 | ✅ 5/5 |
| **รวม** | **18 ไฟล์** | **178** | ✅ |

Test users ทุกไฟล์สร้างผ่าน GoTrue admin API และล้างข้อมูลตัวเองหลังจบ (delete ai_usage_logs → public.users → admin delete) — ไม่แตะตารางของโปรเจกต์อื่นใน database เดียวกัน

## สิ่งที่แต่ละหมวดพิสูจน์

### 1) Unit (49)
- Pricing: token estimate, reserve multiplier, energy cost math, constants
- **Creator pricing (3)**: `calculateCreatorShare` — floor 10% ของ charged, ขั้นต่ำ 1 coin เมื่อมีการชาร์จ, cost ≤ 0 → 0
- LLM Gateway (mock fetch): parse delta/usage, mid-stream error payload, HTTP status → error code matrix (404 → "ไม่พบโมเดลนี้"), missing API key throw, completeOnce flow
- Prompt builder: ครบทุก section, persona, summary, memories ordering, role mapping, กฎ "อย่าเปิดเผยว่าตัวเองเป็น AI"
- Zod validation: boundary values, mass-assignment strip (ส่ง field แปลกมาถูกตัดทิ้ง)

### 2) Integration (68)
- Public API shapes: /api/models, /api/tags, characters
- Auth gate: ทุก endpoint ส่วนตัวคืน 401 เมื่อไม่มี cookie
- Persona CRUD + validation 400 + spoof-strip + ghost id 404
- **Creator Studio (25) — M9**: profile onboarding (GET null → PATCH username regex/unique → stats), publish lifecycle (POST default DRAFT / `publish:true` → PUBLISHED + publishedAt / submit DRAFT→PUBLISHED / double-submit 400), visibility (draft/private ไม่อยู่ใน list/search/detail ของคนอื่น, owner เห็นเอง), IDOR (PATCH/submit/delete/conversation ของตัวละครผู้อื่น → 403/404), admin decide route (non-admin 403, non-uuid 404, body ผิด 400; PENDING→REJECTED+note / →PUBLISHED+publishedAt, resubmit หลัง reject), purchase (catalog 3 แพ็กเกจ + `paymentsEnabled` ตาม env, POST โหมด mock → purchased=true เครดิตทันที / โหมด off → 503 PAYMENTS_DISABLED — **env-aware test**, packageId ไม่รู้จัก 404), admin grant (non-admin 403, amount 0 → 400, สำเร็จ → wallet +123 + ledger ADMIN_ADJUSTMENT), **earning e2e** (fan แชท HTTP จริงกับตัวละคร creator → row CHAT_SHARE amount == max(1,floor(charged×0.1)) เป๊ะ, totalEarned ตรง, idempotency key เดิมไม่จ่ายซ้ำ, self-chat ได้ 0 coin)

### 2.1) E2E Wallet (7) — `tests/e2e/wallet-flows.test.ts`
ทดสอบผ่าน HTTP จริงกับ user ใหม่ต่อ run (env-aware: เปิด `PAYMENTS_MODE=mock` ใน .env อยู่):
- GET catalog → 3 แพ็กเกจ + `paymentsEnabled` ตรงตาม env; ไม่ล็อกอิน → 401; packageId ไม่รู้จัก → 404
- ซื้อ mock `coins_500` → 200 `{purchased, coins:500, mode:"mock"}` → wallet totalBalance 500, lifetimeEarned 500, ledger row PURCHASE amount=+500 after=500 reference_id=coins_500 metadata.gateway="mock"
- ซื้อซ้ำ 2 ครั้ง → 1,000 (แต่ละ request คือการซื้อแยก idempotency key คนละตัว — ต่างจาก webhook จริงที่ต้อง dedupe)
- GET `/api/energy/transactions` → เห็น row PURCHASE + chain before/after ต่อกันครบ
- เคลมรายวัน +50 ทำงานคู่ร้าน: ครั้งเดียวต่อวัน, ยอดรวมถูกต้อง, chain ผสมหลายประเภท (DAILY_REWARD + PURCHASE) ต่อกันครบ

### 2.2) Quests (16) — `tests/integration/quests.test.ts` + `tests/integration/quests-judge.test.ts` + `tests/unit/quest-judge.test.ts`
- **GET quests**: 401 ไม่ล็อกอิน, non-uuid/uuid ไม่มีจริง → 404, DRAFT ของคนอื่น → 404 (visibility เดียวกับ detail);
  GET ครั้งแรก auto-create 5 default quests (MESSAGES 10/+10, MESSAGES 50/+30, STREAK_DAYS 3/+20,
  AI_TOPIC "ทำให้เขาหัวเราะ"/+15, AI_TOPIC "เปิดใจสนิท"/+25) — GET ซ้ำยัง 5 ตัว (idempotent)
- **Progress bump** (service เดียวกับที่ pipeline เรียกหลังแชทสำเร็จ): MESSAGES +1 ต่อครั้ง,
  STREAK_DAYS bump 2 รอบวันเดียวกันนับแค่ 1 → backdate `last_bump_on` −25ชม. แล้ว bump = นับวันใหม่;
  ครบ target → completed=true (quest อื่นยังไม่จบ)
- **Claim**: 400 ถ้ายังไม่สำเร็จ / รับไปแล้ว · 200 → wallet +10, lifetimeEarned เพิ่ม,
  ledger row `QUEST_REWARD` amount=+10 idempotencyKey=`quest:{questId}:{userId}` เป๊ะ ·
  claim ซ้ำ → 400 และ ledger ยัง 1 row · **retry กลางทาง** (grant สำเร็จแต่ claimedAt โดน reset) →
  P2002 ถูกยอมรับ ไม่จ่ายซ้ำ (ledger ยัง 1 row) แล้ว mark claimed ต่อจบสวย
- **AI judge** (mock gateway เพื่อ determinism): seed AI_TOPIC 2 ตัว ("หัวเราะ" / "เศร้า") + บทสนทนาจริงใน DB →
  judge mark completed เฉพาะตัวที่ผ่านเกณฑ์, รอบสอง judge เฉพาะ quest ที่ยังไม่จบ
- **parseJudgeVerdict (unit)**: JSON ตรง/ใน code fence/มีข้อความรอบ ๆ → boolean; ขยะ/parse พัง/non-boolean → null

### 2.3) Browser GUI E2E (in-app browser, บัญชีทดสอบ `meechat.gui.e2e@gmail.com`)
จำลองผู้ใช้จริงทีละคลิก พร้อมภาพหน้าจอยืนยันทุกขั้น:
1. **ล็อกอิน** ผ่านหน้า /login (email+password) → redirect /discover, badge พลังงานโชว์ 0
2. **แชท**: เริ่มบทสนทนากับ pranee-doctor → ส่งข้อความตอนพลังงาน 0 → toast "พลังงานไม่เพียงพอ..." (guard ถูกต้อง, POST 402) → เคลมรายวัน → ส่งใหม่ → **typing indicator 3 จุดเด้ง** ปรากฏตอนรอ stream แรก (UX ที่แก้ไข — เดิมเป็นบับเบิล "–") → คำตอบ stream จบสมบูรณ์เป็นไทยตามบุคลิก → ledger ตรงเป๊ะ: CHAT_USAGE −2 → REFUND +1 (จ่ายสุทธิ 1), usage log gpt-4o-mini SUCCESS
3. **เติมเงิน**: /wallet แสดงร้าน 3 แพ็กเกจ + badge "โหมดทดสอบ — ไม่มีการตัดเงินจริง" → กดซื้อ 500 → toast "เติม +500 พลังงานสำเร็จ!" badge 0→550 ทันที
4. **ประวัติ**: หน้า /wallet โชว์ ledger ครบ — ซื้อพลังงาน +500 / รางวัลรายวัน +50 / ใช้แล้ว −2 / คืนพลังงาน +1 พร้อมยอดคงเหลือต่อกันเป็นลูกโซ่ถูกต้องทุกแถว
5. **ภารกิจ** (2026-08-24): เปิดหน้าแชท pranee-doctor → ปุ่ม "ภารกิจ" ใน header → panel โชว์ 3 quest พร้อม progress bar (seed progress 9/10) → ส่งข้อความจริงผ่าน composer → pipeline bump ให้ 10/10 completed อัตโนมัติ (และนับ quest MESSAGES 50 → 1/50, STREAK_DAYS → 1/3 พร้อมกัน) → ปุ่ม "รับรางวัล +10 ⚡" → toast "รับรางวัลภารกิจสำเร็จ +10 พลังงาน" → การ์ดเป็น "✓ รับแล้ว" (อยู่ครบหลัง reload) → DB พิสูจน์: ledger `QUEST_REWARD` +10 key=`quest:{questId}:{userId}` balance 541→551, header badge = 551 ตรง wallet เป๊ะ

### 3) E2E Journey (8)
claim daily (+50) → สร้าง persona → เริ่ม conversation (pranee-doctor) → chat SSE จบสมบูรณ์ (delta concat === done.content, charged ≤ reserved, model บันทึกถูก) → wallet/ledger ตรงกันทั้ง chain และ lifetime → favorite/like/follow toggle → regenerate สร้าง variant ใหม่ (variantIndex > 0, count ต่อ parent ≥ 2) → SSR pages 200 ครบ (/discover /library /persona /settings /wallet /chat/{id} /character/pranee-doctor)

### 4) Concurrency / Race Condition (4)
- Daily claim ยิงขนาน 6 requests → claimed=true แค่ 1, ledger +50 ครั้งเดียว
- Parallel grants(+10×6)/spends(−15×4) service-level → balance ตรงกับ "ops ที่ commit เท่านั้น" + tie-proof ledger chain (multiset(balanceBefore) − {initial} == multiset(balanceAfter) − {current}) + ทุกแถว after == before+amount ≥ 0
- Drain race: spend เกินยอดขนาน 3 → สำเร็จ ≤ 1, balance ไม่ติดลบ
- 3 chats ขนานบน wallet เดียว → ทุก stream 200 + integrity + sum(ledger) == wallet.totalBalance

### 5) Security (21)
- Cookie ปลอม/Bearer escalation → 401 ทุกจุด
- IDOR matrix ระหว่าง user A/B บน conversation/messages/persona/favorite
- Private character: ซ่อนจาก API/list/search, converse 403, direct page 404
- SQL injection payloads → table ยังอยู่, ไม่มี leakage
- Stored-XSS: SSR escape จริง (`&lt;script&gt;`), bundle ไม่มี raw `<script>alert(`
- Secret scan บน client bundles (.next/static/**/*.js): ไม่พบ OPENROUTER key / SERVICE_ROLE key / DATABASE password

### 6) Failure / Recovery (11)
- LLM down (stub ไม่มี key): SSE event error MODEL_UNAVAILABLE + refund เต็มจำนวน + usage log ERROR + balance ไม่เปลี่ยน
- Abort กลาง stream: จบด้วย refund ส่วนเกินหรือ settle ถูกสถานะ (COMPLETED/ABORTED), net ไม่เป็นลบ
- Input บิ๊ก: content ว่าง/ยาวเกิน, limit=abc (เคย 500 → แก้แล้ว), malformed JSON, non-uuid id
- Regenerate บนข้อความ USER → 404

### 7) Performance / Load (5) — ตัวเลขจาก full-suite run ล่าสุด
```
[perf] models p50=63ms p95=71ms             (30 requests sequential)
[perf] discover cold=1667ms warm p95=2314ms (SSR dev mode)
[perf] 20 concurrent message reads in 1275ms
[perf] chat TTFB=1280/1179/2431ms full≈2.4–3.3s (sequential ×3)
```
หมายเหตุ: ตัวเลข run นี้ใช้ `openai/gpt-4o-mini` (pin บน seed char ที่ suite แชทด้วย) —
ช่วงบ่ายวันเดียวกัน `stealth/ox-alpha` ฝั่ง provider stall/429 หนัก (TTFB 18–27s, hang >60s,
SSE RATE_LIMITED) จน budget fail ทั้งที่โค้ดไม่เปลี่ยน; overhead ฝั่งแอปคงที่ ~100ms
(ปรับ default_model_key ของ pranee-doctor ผ่าน SQL แล้ว, ox-alpha ยังเป็น fallback default
สำหรับตัวละครที่ไม่ระบุ model — เมื่อ provider ปกติ budget เดิมก็ผ่านตาม run เช้าวันเดียวกัน)

### 8) Migration / Drift (5)
- `_prisma_migrations` ครบทุก migration dir, `prisma migrate status` exit 0
- Drift diff (`migrate diff --from-config-datasource --to-schema`) : DROP TABLE ทั้งหมด = เฉพาะ 8 ตารางของโปรเจกต์อื่น (stories, npcs, game_sessions, reader_profiles, story_favorites, story_ratings, story_save_slots, player_logs) ที่**ตั้งใจ**ไม่อยู่ใน schema — ไม่มี destructive statement แตะตารางของ MeeChat (DROP DEFAULT เป็น benign noise จาก SQL defaults ที่ไม่ประกาศใน schema.prisma)
- Seed SQL รันซ้ำ 2 ครั้ง idempotent

## Bug ที่ค้นพบจากการทดสอบและแก้แล้ว (production code)

1. **limit=NaN → 500 INTERNAL_ERROR** (`GET /api/conversations/[id]/messages`, `/api/energy/transactions`)
   `Number("abc")` → NaN → Prisma `take: NaN` throw → clamp ด้วย `Number.isFinite` fallback (`messages/route.ts:29`, `transactions/route.ts:10`)
2. **Reserve พลังงานต่ำกว่าที่คิดจริง** (`src/lib/chat/pipeline.ts`)
   เดิม estimate จาก system prompt boilerplate (~1000 tokens ไม่นับ) ทำให้ charged > reserved บ้าง → ย้าย build prompt ขึ้นก่อน reserve และ estimate จาก `messagesForLlm` ทั้งชุดที่ยิงจริง
3. **Wallet contention → 500 ตอน chat ขนาน** (`src/lib/energy/service.ts`)
   P2034/P2028 จาก FOR UPDATE storm ไม่เคย retry → เพิ่ม `withContentionRetry` (4 attempts, backoff) ครอบ spendEnergy/grantEnergy
4. **Postgres connection exhaustion (EMAXCONNSESSION)** (`src/lib/db/prisma.ts`)
   Prisma 7 driver adapter ใช้ pg.Pool default `max=10` ต่อ instance และไม่อ่าน `connection_limit` ใน URL → Supavisor session mode (cap 15) ล้นเมื่อ dev server + tests เปิดพร้อมกัน → cap `max: Number(process.env.DATABASE_POOL_MAX ?? 4)` ใน pool config หลังแก้: parallel ops commit 100% (grants 6/6 spends 4/4)
5. **REFUND ทำ lifetimeEarned เฟ้อ** (`src/lib/energy/service.ts`)
   `grantEnergy` เพิ่ม `lifetime_earned` ทุกประเภท รวม REFUND (เงินคืนจากการ reserve เกิน) →
   wallet แสดง "รายได้ตลอดชีพ" สูงเกินจริง และ `lifetime_spent` ไม่เคยถูกหักคืน = สถิติบวมสองทาง —
   แก้: REFUND → decrement `lifetime_spent` แทน (reserve เขียน spent เต็มไว้ก่อนแล้ว);
   grant ประเภทอื่นคงเพิ่ม earned เหมือนเดิม (จับได้จาก journey test หลังโมเดลเปลี่ยนเป็นชุดสั้น → เกิด refund)
6. **Creator earning แพ้ race กับ done event** (`src/lib/chat/pipeline.ts`)
   `accrueCreatorEarning` เดิม fire-and-forget → client ที่รับ event done แล้ว query ทันทีอาจยังไม่เห็น row
   (จับได้จาก e2e earning test ที่ poll แล้วเจอ gap) → เปลี่ยนเป็น `await` ก่อนส่ง done (tx ท้องถิ่นเร็ว
   และทำให้ done การันตีว่า earning ถูกบันทึกแล้ว) + `.catch(() => {})` คงไว้เพื่อไม่กระทบ stream
7. **POST /api/characters ไม่คืน publishedAt** (`src/lib/characters/mutations.ts`)
   select ไม่รวม `publishedAt` → publish:true แล้ว response ไม่มี field (UI/test อ่านไม่ได้) → เพิ่มใน select
8. **Badge พลังงานใน header ค้างยอดเก่าหลังแชท** (`src/features/chat/components/chat-view.tsx`)
   หัก/คืนพลังงานแล้วแต่ header ไม่รีเฟรช (จับได้ตอน browser E2E — badge ยังโชว์ 550 ทั้งที่ wallet เหลือ 549)
   → เรียก `router.refresh()` เมื่อ stream จบด้วย done event — ทดสอบแล้ว badge อัปเดตทันที (549 → 547)

Data fix (ไม่ใช่โค้ด): user จริง 2 รายที่สมัคร**ก่อน**ติดตั้ง trigger `handle_new_user` ขาด row ใน
`public.users` + `energy_wallets` → ทุก write ที่อ้าง FK ล้ม P2003 (เช่น PATCH /api/creator/me) —
backfill ข้อมูลแล้ว + สร้าง `scripts/backfill-auth-users.mjs` (idempotent, เช็ค auth.users vs public.users
แล้วเติม row ที่ขาดทั้ง user + wallet) ไว้รันเผื่อกรณีเดียวกันในอนาคต

Ops note (ไม่ใช่บั๊กโค้ด): dev server ที่ start ค้างไว้ตั้งแต่ก่อน `prisma generate` จะถือ
Prisma client รุ่นเก่า (Unknown field `status`, `prisma.creatorEarning` undefined) —
restart server ทุกครั้งหลังแก้ schema.prisma

## M11 — ค่าความสนิท + ภารกิจที่ครีเอเตอร์กำหนดเอง (2026-08-24)

- Unit `tests/unit/intimacy-quests.test.ts` (ใหม่): threshold/label/directive ของ INTIMACY_LEVELS
  (minPoints 0/30/80/160/300), `pointsToLevel` boundaries (negative/decimal/clamp),
  `questInputSchema`/update (AI_TOPIC บังคับ criteriaPrompt, rewardIntimacy 1–50, target ≥1,
  ความยาว title/description)
- Integration `tests/integration/quests.test.ts` ปรับ: GET คืน `{quests, affinity}`
  (points=0 → Lv1 "คนแปลกหน้า" nextLevelAt=30), รางวัลเป็น intimacy (+8/+15/+12/+10/+20),
  claim เพิ่ม `character_affinities.points` แต่ wallet balance **ไม่เปลี่ยน** และไม่มี
  `energy_transactions` reference_type='quest', double-claim ผ่าน transactional mark claimedAt —
  points คงเดิม (ไม่มีช่อง crash window แบบ grant-before-mark อีกแล้ว)
- Integration `tests/integration/creator-quests.test.ts` (ใหม่, 9 it): unauth 401 · non-owner
  POST/PATCH/DELETE → 404 ทั้งหมด (IDOR-safe ผ่าน quest→character.creator) · AI_TOPIC ไม่มี
  criteriaPrompt → 400 · CRUD ครบ + cap 10 quest/ตัวละคร → 400 · DELETE แล้ว progress orphan = 0
- Drift 5/5 (MEECHAT_TABLES + character_affinities) · tsc clean
- Security secret-scan 21/21 — รอบแรก fail เพราะ `.next/static` ว่าง (Turbopack dev เขียน chunk
  ลง `.next/dev/static/*` ไม่ใช่ prod path) → รัน `next build` ใหม่แล้วผ่านครบ
- Perf §7 รอบ M11: discover warm p95 ~6.8–7.8s เกินเกณฑ์ — **environmental ไม่ใช่ regression**:
  /discover ไม่ import โค้ดที่แก้เลย, `/api/models` (โค้ดเดิม) ก็ช้าขึ้น ~4× พร้อมกัน
  (p95 71→247–373ms), CPU เครื่อง 77–79% โดย OneDrive.Sync.Service หลัง prod build เขียนไฟล์
  นับพันลงโฟลเดอร์ Desktop (OneDrive sync storm) + RTT Supabase ~170ms ผิดปกติ —
  ให้ rerun บนเครื่อง idle จึงจะเทียบ baseline §7 ได้

## Findings ที่ยังเปิดไว้ (ไม่ block MVP)

- `PATCH /api/persona/[id]` กับ non-uuid id คืน 500 (Prisma cast error) — ควรเป็น 400 เหมือน POST
- Malformed JSON body บาง route คืน 500 — ideally 400 VALIDATION_ERROR
- Activate variant สำหรับ greeting (assistant message ที่ไม่มี parent) ยังสลับไม่ได้ — regenerate บน parentless message จึงสร้าง variant ใหม่แต่ activate path ต้องออกแบบเพิ่ม
- Rate limit ยัง skip อยู่ (UPSTASH ไม่ได้ตั้งใน .env) — suite นี้จึงยังไม่ทดสอบ 429
- Google OAuth รอตั้งค่า provider ฝั่ง Supabase

## วิธีรัน

```bash
npm run dev          # terminal แรก
npx vitest run       # ทั้งหมด (196 tests, ~3–10 นาที ขึ้นกับ provider latency)
npx vitest run tests/integration/creator-studio.test.ts   # เฉพาะ Creator Studio
npx vitest run tests/e2e/wallet-flows.test.ts             # เฉพาะเติมเงิน/ประวัติ
npx vitest run tests/integration/quests.test.ts tests/integration/creator-quests.test.ts tests/integration/quests-judge.test.ts   # เฉพาะภารกิจ+ความสนิท
```
หมายเหตุ: suite ต้องมี dev server + .env ครบ (DATABASE_URL / keys); ห้ามรัน parallel files เพราะแชร์ฐานข้อมูลจริง;
restart dev server หลังแก้ prisma schema (client cache); chat tests pin `gpt-4o-mini` เพื่อไม่ให้ provider free-tier/queueing ทำ budget พัง;
`.env` ปัจจุบันตั้ง `PAYMENTS_ENABLED=true` + `PAYMENTS_MODE=mock` — ปิดก็แค่ลบ/ตั้ง `PAYMENTS_ENABLED` อื่น
(purchase tests เป็น env-aware: โหมด off จะ assert 503 PAYMENTS_DISABLED แทน)

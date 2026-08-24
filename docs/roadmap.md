# Development Roadmap

Vertical slice — ทุก milestone ต้อง run/test ได้จริงก่อนขึ้นไมล์ถัดไป
(P0 ก่อน launch, P1/P1.5 ตาม spec §37)

## ✅ M1 — Project Setup (เสร็จแล้ว)

- Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui
- Prisma schema เต็ม ERD + client generation
- Supabase auth wiring (@supabase/ssr, proxy session refresh, login page)
- Centralized env config, RLS/trigger SQL starter, design docs

## ✅ M2 — Database Live + Auth E2E (เสร็จแล้ว)

- [x] สร้าง Supabase project → ตั้งค่า .env
- [x] `prisma migrate dev` สร้างตาราง + รัน RLS SQL
- [x] Seed ai_models + tags (+ characters)
- [x] ทดสอบ password login E2E (smoke-e2e.mjs) — *Google OAuth รอตั้งค่า provider credentials*
- [x] App shell: nav layout หลัง login (Discover/Library/Persona/Settings)

## ✅ M3 — Character CRUD + Discover (เสร็จแล้ว)

- [x] `/create/character` form (structured fields, zod validation)
- [x] Character API + ownership/visibility rules
- [x] Character card component + `/character/[slug]` profile page
- [x] `/discover` sections จาก DB (categories จาก tags — ไม่ hardcode)
- [x] Seed characters ไทย original 10 ตัว

## ✅ M4 — Chat Core (P0 หัวใจ) (เสร็จแล้ว)

- [x] Conversation CRUD + persona selection
- [x] Prompt Builder v1 (character fields + recent messages)
- [x] LLM Gateway abstraction + OpenRouter streaming provider
- [x] `POST /api/chat` SSE + chat UI (streaming, stop, retry, regenerate variant)
- [x] Error taxonomy mapping → ข้อความไทยที่เข้าใจง่าย (404 → MODEL_UNAVAILABLE)

## ✅ M5 — Energy + Usage Tracking (P0 ปิดท้าย) (เสร็จแล้ว)

- [x] Energy service (reserve/settle/refund, idempotency key)
- [x] Pricing service (`calculateChatCost`) + energy_multiplier
- [x] ai_usage_logs writer + daily reward claim (idempotent)
- [x] Wallet UI (balance, transaction history)

## ✅ M6 — P1 Features (เสร็จแล้ว)

- [x] User Persona full CRUD + ผูก conversation
- [x] Favorites/Likes + `/library`
- [x] Search (Postgres full-text: name/tag/description/creator)
- [x] Creator profile `/creator/[username]` + auto-create on first character
- [x] Regenerate variants UI

## ✅ M7 — P1.5 Memory & Summary (เสร็จแล้ว)

- [x] Memory extraction job (ทุก N messages)
- [x] Memory retrieval (top-K importance × recency)
- [x] Rolling conversation summary + prompt integration
- [x] Follow creator

## ✅ M8 — Trending + Production Hardening (เสร็จแล้ว*)

- [x] Trending score cron (Vercel Cron) — growth-weighted
- [x] Upstash rate limiting ทุก AI endpoints — *โค้ดพร้อม แต่ UPSTASH ยังไม่ตั้งค่า .env (ผ่านเมื่อ unset)*
- [x] Observability: error tracking hooks, cost dashboards จาก usage logs
- [x] Analytics events (§42) + mobile UX audit (100dvh, sticky input)
- [x] Security review (RLS + ownership tests ผ่าน smoke — cross-user 404)
- [ ] Load test chat flow — *รอ staging จริง*

## ✅ M9 — Creator Studio + Energy Shop Stub (เสร็จแล้ว)

Design: `docs/creator-system.md` (แรงบันดาลใจ: Character.AI stats dashboard,
JanitorAI followers, Chub publishing pipeline, SpicyChat usage-based revenue share)

- [x] Publish lifecycle: DRAFT → PENDING → PUBLISHED / REJECTED (+edit & resubmit)
  — `CREATOR_AUTO_APPROVE` env (default true = submit ผ่านตรงเป็น PUBLISHED)
- [x] Migration `20260824000000_creator_system`: `characters.status/review_note/published_at`,
  `creator_profiles.total_earned`, ตาราง `creator_earnings` (idempotency_key unique) +
  backfill seed chars → PUBLISHED *(manual migration — shared DB ห้าม `prisma migrate dev`)*
- [x] API: `/api/creator/me` (GET/PATCH), `/api/creator/me/characters`,
  `/api/creator/me/earnings`, `/api/characters/[id]/submit`,
  `/api/admin/characters/[id]/decide`
- [x] Creator earning share-of-energy: `max(1, floor(charged × CREATOR_SHARE=0.10))`
  จ่ายเมื่อ settle สำเร็จเท่านั้น; self-chat excluded (กัน farm); idempotent ต่อ request;
  await ก่อน event done เพื่อให้ client เห็นการันตี
- [x] Visibility: list/search/discover เฉพาะ PUBLIC+PUBLISHED; draft/pending เห็นได้เฉพาะ owner;
  conversation guard กับตัวละครที่ยังไม่ published
- [x] Studio UI `/creator`: onboarding (username/bio) → dashboard (stat cards,
  character list + status chip + review note, publish/edit/delete actions, earnings ledger);
  create-form flow "บันทึกฉบับร่าง" vs "เผยแพร่"
- [x] Energy shop: `/api/energy/purchase` GET catalog (3 packages) + POST —
  3 โหมดตาม env (`paymentsMode()`): **`mock`** = เครดิตทันที ไว้ทดสอบ/E2E (ปัจจุบันเปิดอยู่:
  `PAYMENTS_ENABLED=true` + `PAYMENTS_MODE=mock`, UI แสดง badge "โหมดทดสอบ"),
  `off` (default) = 503 `PAYMENTS_DISABLED`, `gateway` = เตรียมพื้นที่รอต่อ webhook verify (TODO)
- [x] Admin grant: `/api/admin/energy/grant` (role gate + ADMIN_ADJUSTMENT ledger)

---

## ✅ M10 — Character Quests / ภารกิจประจำตัวละคร (เสร็จแล้ว)

Goal types: MESSAGES / STREAK_DAYS / AI_TOPIC — แรงบันดาลใจจาก engagement hooks
ของหน้าตัวละคร competitor (quest/login tab, gift cards) แต่ออกแบบ data model + UI เองทั้งหมด

- [x] Migration `20260824000001_character_quests`: enum `QuestGoalType` + `EnergyTransactionType.QUEST_REWARD`,
  ตาราง `character_quests` + `user_quest_progress` (unique user+quest, cascade ลบตาม character/user)
  *(manual migration — shared DB)*
- [x] Service `src/lib/quests/service.ts`: `ensureDefaultQuests` (auto-create MESSAGES ×2 +
  STREAK_DAYS + AI_TOPIC ×2 ("ทำให้เขาหัวเราะ" +15 / "เปิดใจสนิท" +25 — สนทนาจนสำเร็จตามเงื่อนไข
  AI ตัดสิน) idempotent; ตัวละครเก่า backfill ด้วย `scripts/backfill-quest-defaults.mjs` — 10 ตัวครบ),
  `bumpChatQuestProgress` (MESSAGES +1/ข้อความ, STREAK_DAYS distinct UTC day
  ผ่าน `last_bump_on`), `judgeAiTopicQuests` (AI ตัดสินตาม criteriaPrompt ด้วยโมเดลถูกสุด — best-effort),
  `claimQuestReward` (grant ก่อน mark claimedAt + P2002-tolerant = retry-safe ไม่จ่ายซ้ำ)
- [x] Pipeline hook: bump + judge หลัง save message สำเร็จ (นับเฉพาะแชทที่ไม่ error)
- [x] API: GET `/api/characters/[id]/quests` (visibility เดียวกับ detail, auto-create default)
  · POST `/api/quests/[questId]/claim` (400 ยังไม่สำเร็จ/รับแล้ว, ledger QUEST_REWARD key `quest:{id}:{userId}`)
- [x] UI: ปุ่ม "ภารกิจ" ใน header หน้าแชท → panel (progress bar, chip +N⚡, จุดแดงเมื่อมีรางวัลรับได้,
  ปุ่มรับรางวัล → toast + router.refresh badge)

---

### Verification log (2026-08-23)

- `scripts/smoke-e2e.mjs` — **ALL PASSED (16 checks)**: temp user → password login →
  persona/conversation → first message seeded → daily claim +50 (idempotent) →
  **chat streaming จริงผ่าน `stealth/ox-alpha`** (delta events, ตอบไทย,
  usage 1419/639 tokens, บันทึก COMPLETED) → energy settle ถูกต้อง
  (success: CHAT_USAGE net<0 / failure: REFUND คืนเต็ม) → ai_usage_logs SUCCESS →
  cross-user ownership block 404
- Model catalog: `stealth/ox-alpha` เป็น default (sort_order 0); โมเดลที่ถูกปลดจาก
  OpenRouter (gemini-2.0-flash-001, claude-3.5-haiku, gemma-3-27b-it:free) ปิดใช้งาน —
  sync แล้วทั้ง live DB และ `supabase/sql/002_seed_models_tags.sql`
- GoTrue หมายเหตุ: manual insert ต้องมี identity row พร้อม created_at/updated_at ชัดเจน
  และ email ต้องไม่ใช่โดเมน `.supabase.co` / `.local`
- Creator Studio verification: `tests/unit/creator-pricing.test.ts` + `tests/integration/creator-studio.test.ts`
  — lifecycle/IDOR/admin decide/purchase (env-aware mock)/admin grant/earning e2e (แชทจริง →
  creator ได้ `max(1,floor(charged×0.1))`, idempotent, self-chat ได้ 0) — รายละเอียดใน docs/test-report.md
- Wallet E2E + Browser GUI E2E: `tests/e2e/wallet-flows.test.ts` (ซื้อ mock/ซื้อซ้ำ/ประวัติ/เคลมรายวัน)
  + จำลองผู้ใช้จริงใน in-app browser: ล็อกอิน → แชท (typing indicator ใหม่, ledger CHAT_USAGE −2 + REFUND +1)
  → เคลมรายวัน → เติมเงิน mock +500 (badge ร้าน "โหมดทดสอบ") → ประวัติครบทุกรายการ — ภาพหน้าจอยืนยันใน test-report
- แก้บั๊กจากการทดสอบรอบนี้: REFUND บวม lifetimeEarned (#5), earning race vs done event (#6),
  publishedAt หายจาก create response (#7), badge พลังงานค้างยอดหลังแชท (#8 — router.refresh),
  P2003 FK สำหรับ user ที่สมัครก่อนติด trigger (backfill + `scripts/backfill-auth-users.mjs`)

### Verification log (2026-08-24) — M10 quests

- Full suite **18 ไฟล์ / 178 tests ผ่านหมด**: เพิ่ม `tests/unit/quest-judge.test.ts` (4),
  `tests/integration/quests.test.ts` (14 — default auto-create/visibility/bump distinct-day/
  claim idempotent + retry-safe P2002), `tests/integration/quests-judge.test.ts` (2 — mock gateway
  ตัดสินเฉพาะ quest ที่ผ่านเกณฑ์, judge ซ้ำ idempotent)
- Browser GUI E2E ภารกิจ: seed progress 9/10 → ส่งข้อความจริงใน composer → pipeline bump 10/10
  completed เอง (พร้อมนับ quest 50 ข้อความ → 1/50 และ streak → 1/3) → กด "รับรางวัล +10 ⚡" →
  toast + "✓ รับแล้ว" (คงอยู่หลัง reload) → ledger `QUEST_REWARD` +10 balance 541→551,
  header badge = 551 ตรง wallet เป๊ะ; migration drift test ผ่านหลังแก้ `_prisma_migrations.finished_at`
  ของ manual registration (null = Prisma ถือว่า failed)
- ตารางของโปรเจกต์อื่นครบ 8/8 (31 public tables หลังเพิ่ม quest tables)

## ✅ M11 — ค่าความสนิท (Character Affinity) + ภารกิจที่ครีเอเตอร์กำหนดเอง (เสร็จแล้ว)

แรงจูงใจ: ภารกิจ M10 แจกรางวัลเป็นพลังงาน → เสี่ยงเงินเฟ้อ (ผู้ใช้ farm ภารกิจได้เรื่อย ๆ)
จึงเปลี่ยนรางวัลเป็น **คะแนนความสนิท user↔ตัวละคร** ที่ AI ใช้ปรับน้ำเสียงการพูดจริง
(เคลมรายวัน +50⚡ คงเดิม — de-monetize เฉพาะ quest reward)

- [x] Migration `20260824000003_intimacy_affinity` *(manual — shared DB)*: ตาราง
  `character_affinities` (unique user+character, FK cascade 2 ทาง, index character+points)
  + `character_quests` เปลี่ยน `reward_energy` → `reward_intimacy` (backfill ตามระดับเดิม)
- [x] ระบบ 5 เลเวล `src/lib/quests/intimacy.ts`: Lv1 คนแปลกหน้า (0–29) / Lv2 คนรู้จัก (30–79) /
  Lv3 เพื่อนสนิท (80–159) / Lv4 สนิทใจ (160–299) / Lv5 ผู้พิเศษ (300+) — level **derive จาก points
  ในโค้ด** (`pointsToLevel`) ไม่เก็บลง DB เพื่อแก้ threshold ได้ไม่ต้อง migrate; แต่ละเลเวลมี
  directive ภาษาไทย inject เข้า system prompt ("### ความสัมพันธ์กับผู้ใช้") ผ่าน prompt-builder + pipeline
- [x] `claimQuestReward` redesign: `$transaction` เดียว [updateMany mark claimedAt WHERE claimedAt IS NULL
  (count=0 → 400 รับแล้ว) + upsert-increment affinity] — atomic ไม่มีช่อง crash window,
  เลิกพึ่ง ledger idempotencyKey; wallet/energy ไม่ถูกแตะ
- [x] Creator CRUD: POST/PATCH/DELETE `/api/characters/[id]/quests[/questId]` (owner check แบบ IDOR-safe
  → non-owner เห็น 404, Zod `questInputSchema`/`questUpdateSchema`, cap 10 quest/ตัวละคร,
  rate limit `quest-write` 20/ชม.) + Dialog "ภารกิจ" ใน Creator Studio (list/edit/delete/add,
  field criteriaPrompt โผล่เฉพาะ AI_TOPIC)
- [x] UI: badge ❤Lv.N ใน header หน้าแชท · QuestPanel แสดง bar ความสนิท (points/nextLevelAt) +
  chip "+N❤" + toast "ความสนิท +N" · GET quests คืน `{quests, affinity}` ให้ทั้ง player/creator ใช้ร่วมกัน

### Verification log (2026-08-24) — M11 intimacy

- Full suite **196 tests**: ผ่าน 195 — drift 5/5 (เพิ่ม character_affinities), unit 60/60
  (incl. `tests/unit/intimacy-quests.test.ts`: thresholds/boundaries/validation),
  integration quests 12/12 + creator-quests 9/9 (CRUD/cap/non-owner/AI_TOPIC criteria/
  claim เพิ่ม points + wallet คงเดิม) + quests-judge 2/2, security secret-scan 21/21
  (หลัง `next build` ใหม่), tsc clean
- 1 fail คือ `tests/perf/load.test.ts` (SSR /discover warm p95 > 3000ms) — **environmental
  ไม่ใช่ regression**: /discover ไม่ import โค้ดที่แก้เลย, endpoint `/api/models` (ไม่แตะ feature)
  ก็ช้าขึ้น ~4× จาก baseline, CPU เครื่อง 77–79% โดย OneDrive.Sync.Service หลัง prod build
  เขียนไฟล์นับพันลงโฟลเดอร์ Desktop (OneDrive sync storm) — baseline เดิม p95=2314ms
  (test-report §M10); ให้ rerun บนเครื่อง idle

> Phase 2 (Interactive Fiction): worlds/stories/story_states/**quests**/inventory/stats/
> choices/endings — data model ปัจจุบัน reuse ได้ (characters, personas, messages,
> memories, wallet, gateway) โดยไม่ต้อง migrate ทิ้ง; character_quests/user_quest_progress
> ที่เพิ่มใน M10 เป็นภารกิจ engagement ระดับตัวละคร แยกจาก story quests ของ Phase 2

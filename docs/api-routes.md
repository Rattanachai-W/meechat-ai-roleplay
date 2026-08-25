# API Design

หลักการร่วม:

- ทุก endpoint validate input ด้วย Zod (`src/lib/validation/`)
- Error response รูปแบบเดียว: `{ "error": { "code": "INSUFFICIENT_ENERGY", "message": "..." } }`
- Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`,
  `INSUFFICIENT_ENERGY`, `RATE_LIMITED`, `MODEL_UNAVAILABLE`, `CONTENT_REJECTED`,
  `LLM_TIMEOUT`, `PAYMENTS_DISABLED`, `PAYMENT_FAILED`, `INTERNAL_ERROR`
- Auth: Supabase session cookie (ผ่าน proxy middleware); ownership check เสมอใน handler
- Lists ใช้ cursor pagination (`?cursor=&limit=`)

## Auth

Supabase Auth จัดการโดยตรง (ไม่สร้าง custom endpoints):

| Route | คำอธิบาย |
| --- | --- |
| `POST /auth/callback` | OAuth/email-code exchange → redirect |
| Email/Google flows | client SDK + `/login` |

## Characters

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/characters` | list public characters — filters: `q, tags, category, sort=(trending\|new\|popular), cursor` |
| POST | `/api/characters` | สร้าง character (ต้อง login; auto-create creator profile) — `publish:true` = ส่งเผยแพร่ทันที (AUTO_APPROVE → PUBLISHED, ไม่งั้น → PENDING) |
| GET | `/api/characters/[id]` | detail (visibility rules — draft/pending เห็นเฉพาะ owner) + viewer state (favorited/liked) |
| PATCH | `/api/characters/[id]` | update — owner only |
| DELETE | `/api/characters/[id]` | delete — owner only |
| POST | `/api/characters/[id]/favorite` / DELETE | toggle favorite |
| POST | `/api/characters/[id]/like` / DELETE | toggle like |
| POST | `/api/characters/[id]/submit` | ส่งเผยแพร่ — owner only; DRAFT/REJECTED → PUBLISHED (AUTO_APPROVE) หรือ PENDING; submit ซ้ำ → 400 |

`GET /api/discover` — sections พร้อมกัน (recommended/trending/new/popular/categories) สำหรับหน้า Discover

## Conversations & Messages

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/conversations?characterId=` | conversations ของ user (ต่อ character ได้) |
| POST | `/api/conversations` | สร้าง conversation `{characterId, personaId?, title?}` (+1 chat_count) |
| GET | `/api/conversations/[id]` | metadata + summary version |
| PATCH | `/api/conversations/[id]` | rename / change persona |
| DELETE | `/api/conversations/[id]` | delete cascade messages/memories |
| GET | `/api/conversations/[id]/messages?cursor=` | cursor pagination (ล่าสุดก่อน) |
| DELETE | `/api/messages/[id]` | ลบ message (owner) |
| POST | `/api/messages/[id]/regenerate` | สร้าง variant ใหม่ของ assistant message |

## Chat (Streaming)

```
POST /api/chat
Body: { conversationId, content }
Response: SSE stream
  event: delta   data: {"text":"..."}
  event: done    data: { messageId, usage: {...}, energy: {...} }
  event: error   data: { code: "MODEL_UNAVAILABLE" }
```

Server-side pipeline: auth → ownership → energy reserve → rate limit → prompt build →
LLM gateway stream → save → usage log → settle charge (refund ถ้า fail)

## Personas

| Method | Route |
| --- | --- |
| GET / POST | `/api/personas` |
| GET / PATCH / DELETE | `/api/personas/[id]` |

## Creators & Social

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/creators/[username]` | profile + stats |
| POST / DELETE | `/api/creators/[username]/follow` | follow/unfollow |

## Creator Studio

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/creator/me` | profile (null = ยังไม่สมัคร → onboarding) + studio stats |
| PATCH | `/api/creator/me` | สมัคร/แก้โปรไฟล์ `{username, bio?, avatarUrl?}` — username unique `/^[a-z0-9_]{3,20}$/` |
| GET | `/api/creator/me/characters?status=` | ตัวละครของเราทุกสถานะ (DRAFT/PENDING/PUBLISHED/REJECTED) |
| GET | `/api/creator/me/earnings?cursor=&limit=` | ledger รายได้ (share-of-energy) |

การได้ coin: แชทสำเร็จทุกครั้งครีเอเตอร์เจ้าของตัวละครได้ `max(1, floor(charged × 0.10))`
(ไม่รวมกรณีแชทกับตัวละครตัวเอง — กัน farm; idempotent ต่อ request)

## Quests (ภารกิจประจำตัวละคร)

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/characters/[id]/quests` | `{quests, affinity}` — quests + progress ของผู้ใช้, affinity = ความสนิทผู้ใช้ปัจจุบัน `{points, level, label, nextLevelAt}`; GET ครั้งแรก auto-create default quests 5 ตัว (MESSAGES ×2, STREAK_DAYS ×1, AI_TOPIC ×2: "ทำให้เขาหัวเราะ" +15❤ / "เปิดใจสนิท" +20❤) idempotent |
| POST | `/api/characters/[id]/quests` | ครีเอเตอร์เจ้าของตัวละครเพิ่มภารกิจ — Zod `questInputSchema`, cap 10 quest/ตัวละคร, rate limit `quest-write` (20/ชม.); 201 `{quest}`, non-owner → 404, เกิน cap → 400 |
| PATCH | `/api/characters/[id]/quests/[questId]` | แก้ภารกิจ (owner only) — `questUpdateSchema` (partial), `{quest}` |
| DELETE | `/api/characters/[id]/quests/[questId]` | ลบภารกิจ (owner only) — 204; `user_quest_progress` orphan ถูก cascade ลบ |
| POST | `/api/quests/[questId]/claim` | รับรางวัลความสนิท `{claimed, amount, affinity}` — atomic `$transaction` (mark claimedAt + upsert points) idempotent; 400 `ยังทำภารกิจไม่สำเร็จ` / `รับรางวัลไปแล้ว`, 404 ไม่พบ quest |

- Goal types: **MESSAGES** (นับข้อความผู้ใช้), **STREAK_DAYS** (นับวันที่แชท distinct UTC day),
  **AI_TOPIC** (AI ตัดสินจากบทสนทนาตาม `criteriaPrompt` — best-effort หลังแชท, ใช้โมเดลถูกที่สุด)
- Progress bump เกิดใน chat pipeline หลังข้อความสำเร็จเท่านั้น (`src/lib/quests/service.ts`)
- Reward = **คะแนนความสนิท** (`character_affinities.points`) ไม่แจกพลังงาน (กันเงินเฟ้อ);
  level derive ในโค้ด: Lv1 คนแปลกหน้า 0–29 / Lv2 คนรู้จัก 30–79 / Lv3 เพื่อนสนิท 80–159 /
  Lv4 สนิทใจ 160–299 / Lv5 ผู้พิเศษ 300+ — directive ต่อเลเวลถูก inject เข้า system prompt
  ("### ความสัมพันธ์กับผู้ใช้") เพื่อให้ AI ปรับน้ำเสียงตามความสนิท (`src/lib/quests/intimacy.ts`)

## Energy

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/energy/wallet` | balance ปัจจุบัน |
| GET | `/api/energy/transactions?cursor=` | ledger ของ user |
| POST | `/api/energy/daily-claim` | รับ daily reward (idempotent ต่อวัน) |
| GET | `/api/energy/daily-claim` | สถานะปุ่มรางวัลรายวัน `{claimedToday, amount}` — amount อ่านจาก `app_settings` (key=`daily_reward_amount`, แอดมินแก้ใน DB ได้, fallback ค่าคงที่เมื่อค่าไม่ถูกต้อง) |
| GET | `/api/energy/purchase` | catalog แพ็กเกจเติมพลังงาน + `paymentsEnabled` + `mode` (`"mock"` โหมดทดสอบ / `"stripe"` เชื่อม Stripe Checkout แล้ว) |
| POST | `/api/energy/purchase` | ซื้อแพ็กเกจ `{packageId}` — ตาม env `PAYMENTS_ENABLED`/`PAYMENTS_MODE`: **`mock`** = เครดิตทันที + ledger PURCHASE (metadata.gateway="mock", แต่ละ request = การซื้อแยก), **`stripe`** (มี `STRIPE_SECRET_KEY`) = สร้าง Checkout Session → `{checkoutUrl, sessionId}` ให้ redirect (rate limit `purchase` 10/ชม.), `off` (default) = 503 `PAYMENTS_DISABLED` |
| POST | `/api/energy/confirm` | fallback webhook — `{sessionId}` ตอนผู้ใช้กลับถึง `/wallet?purchase=success`; retrieve session จาก Stripe → เครดิตถ้า paid, idempotent ร่วมกับ webhook ผ่าน idempotencyKey `stripe:{sessionId}`; error: `FORBIDDEN` (session ไม่ใช่ของผู้ใช้) / `PAYMENT_FAILED` (ยังไม่จ่าย) |
| POST | `/api/webhooks/stripe` | Stripe webhook (production primary) — verify signature ด้วย `STRIPE_WEBHOOK_SECRET`, จัดการ `checkout.session.completed` → เครดิต ledger; signature ผิด → 400 |

## Admin

| Method | Route | คำอธิบาย |
| --- | --- | --- |
| POST | `/api/admin/characters/[id]/decide` | ตัดสินตัวละคร PENDING — `{approve, note?}` (role=ADMIN); approve → PUBLISHED, reject → REJECTED+note |
| POST | `/api/admin/energy/grant` | เติมพลังงานให้ user — `{targetUserId?|email?, amount(1–100k), note?}` → ADMIN_ADJUSTMENT + ledger |

promote admin: `update users set role='ADMIN' where email='...';`
(design docs/creator-system.md §6 — `/api/admin/models` CRUD และ reports moderation queue เป็นงานถัดไป)

# MeeChat Architecture

> AI Roleplay Platform ที่ออกแบบมาเพื่อภาษาไทยโดยเฉพาะ
> Phase 1: Chatbot MVP · Phase 1.5: Memory + Persona + Creator · Phase 2 (อนาคต): Interactive Fiction

## 1. System Overview

Modular Monolith บน Next.js App Router — ทุกส่วน deploy บน Vercel โดยใช้ managed services:

- **Supabase** — Postgres (Prisma ORM), Auth, Storage
- **Upstash Redis** — rate limiting, temporary cache
- **OpenRouter** — LLM gateway เริ่มต้น (replaceable)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Next.js RSC/CSR)                 │
│   Discover │ Character │ Chat (streaming UI) │ Library │ ...    │
└──────────────┬──────────────────────────────────────────────────┘
               │ fetch (SSE for chat)
┌──────────────▼──────────────────────────────────────────────────┐
│                     Next.js Route Handlers                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────────┐ │
│  │   Auth   │ │Characters│ │   Chat   │ │ Energy / Usage      │ │
│  │ (proxy + │ │ CRUD/API │ │ POST SSE │ │ APIs                │ │
│  │ callback)│ │          │ │          │ │                     │ │
│  └──────────┘ └──────────┘ └────┬─────┘ └─────────────────────┘ │
│                                 │                               │
│         src/lib — domain modules (framework-agnostic)           │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│  │ prompt-builder/  │ │ ai/providers/    │ │ energy/pricing   │ │
│  │ memory/retrieval │ │ (LLM gateway)    │ │ usage tracking   │ │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ │
└───────┬───────────────────┬───────────────────┬─────────────────┘
        │                   │                   │
┌───────▼───────┐  ┌────────▼────────┐  ┌───────▼─────────┐
│ Supabase      │  │ OpenRouter      │  │ Upstash Redis   │
│ • Postgres    │  │ (OpenAI-compatible│ • rate limit     │
│   (+ pgvector │  │  abstraction)    │  │ • temp cache    │
│   เมื่อจำเป็น) │  │ ↕ swap ได้:       │  └─────────────────┘
│ • Auth        │  │ OpenAI/Anthropic/ │
│ • Storage     │  │ Gemini/local LLM  │
└───────────────┘  └─────────────────┘
```

## 2. LLM Request Flow (Chat)

```
POST /api/chat
  → authenticate (Supabase session via proxy)
  → validate input (Zod)
  → load conversation + ownership check
  → check energy (reserve, idempotency key)
  → rate limit (Upstash)
  → prompt-builder: platform rules + character fields + persona
      + relevant memories + conversation summary + recent messages
  → llm gateway.streamChat() → stream tokens to client (SSE)
  → on success: save assistant message (+variant row)
      → record ai_usage_log → settle energy charge
  → on failure: refund reserved energy, save FAILED message row
```

Energy ใช้รูปแบบ **reserve → settle/refund** เพื่อไม่คิดเงินเกินเมื่อ LLM fail

## 3. Memory Flow (Phase 1.5)

```
AI response saved
  → ทุก N messages: extract memory candidates (model ถูก)
  → dedupe/upsert into memories (typed: fact/relationship/event/...)
  → retrieval ตอน build prompt: top-K by importance × recency (+semantic เมื่อมี pgvector)
Conversation ยาว > threshold
  → rolling summary เก็บใน conversation_summaries
```

## 4. Folder Structure

```
src/
  app/                    # routes (App Router)
    (auth)/login/           # login/signup
    auth/callback/          # OAuth code exchange
    (app)/                  # discover, library, persona, settings ...
    api/                    # route handlers
  proxy.ts                # Next.js proxy (middleware) — session refresh + guards
  components/ui/          # shadcn/ui primitives
  features/               # feature-scoped components & hooks
    auth/ characters/ chat/ personas/ memories/ creators/ energy/
  lib/
    ai/
      providers/            # LLM gateway (OpenRouter first, swap-able)
      prompt-builder/       # ประกอบ prompt จาก structured character data
      memory/               # extraction + retrieval strategy
      usage/                # ai_usage_logs writer
    db/prisma.ts            # Prisma singleton
    supabase/               # browser/server/admin clients
    auth/                   # current-user helpers
    env.ts                  # centralized env config (zod)
    validation/             # shared zod schemas
  generated/prisma/         # generated client (gitignored)
prisma/
  schema.prisma             # authoritative ERD
  migrations/               # version-controlled migrations
supabase/sql/               # triggers + RLS (รันใน Supabase SQL editor)
docs/                       # เอกสารชุดนี้
```

หลักการ: domain logic อยู่ใน `lib/` + `services` เท่านั้น — route handlers และ UI
เรียกผ่าน module เหล่านี้เสมอ ห้ามฝัง business logic ใน component หรือ handler โดยตรง

## 5. Data Model (สรุป)

ดู schema เต็มที่ `prisma/schema.prisma`

| Domain | Tables |
| --- | --- |
| Users | `users`, `user_personas`, `creator_profiles` |
| Characters | `characters`, `tags`, `character_tags`, `character_examples` |
| Chat | `conversations`, `messages` (variants ผ่าน `parent_message_id`) |
| Memory | `memories`, `conversation_summaries` |
| Social | `favorites`, `character_likes`, `creator_follows` |
| Energy | `energy_wallets`, `energy_transactions` (append-only ledger) |
| AI Ops | `ai_models`, `ai_usage_logs` |
| Quests & Affinity | `character_quests`, `user_quest_progress`, `character_affinities` (ค่าความสนิท user↔character, unique ต่อคู่) |
| App Settings | `app_settings` (KV — MVP แอดมินแก้ SQL ตรง ๆ เช่น `daily_reward_amount`; app fallback ค่า default เมื่อค่าหาย/เพี้ยน) |

> หมายเหตุ: ตาราง `reports` (moderation stub จาก ERD เริ่มต้น) ถูกลบออกเมื่อ 2026-08-24
> เพราะไม่มี feature ใดใช้ (0 rows, ไม่มี API/UI) — DDL backup: `backups/reports-table-backup.sql`,
> สร้างคืนได้เมื่อทำระบบ moderation จริง

จุดออกแบบสำคัญ:

- `users.id` mirror กับ `auth.users.id` ผ่าน SQL trigger (`supabase/sql/001_auth_triggers_rls.sql`)
- Social login = Supabase Auth OAuth (email/password + Google + Facebook) — client เรียก
  `signInWithOAuth({ redirectTo: "/auth/callback" })`, callback route แลก code เป็น session;
  เปิด/ปิด provider และ App ID/Secret จัดการที่ Supabase Dashboard (ไม่มี credential ใน repo)
- Character เก็บแบบ **structured fields** (personality/scenario/style/examples แยกกัน) — Prompt Builder ประกอบตอน runtime ไม่ใช่ system prompt string เดียว
- Message รองรับ regenerate variants ด้วย `parent_message_id + variant_index + is_active_variant`
- Energy เป็น double-entry-ish ledger: `balance_before/balance_after` + `idempotency_key` กัน double charge; wallet แยก `free_balance` (daily) กับ `paid_balance`
- Payment = **Stripe Checkout** (redirect, THB) — ไม่มีตาราง payments เพิ่ม: session metadata
  (userId/packageId/coins) snapshot ตอนสร้าง checkout, เครดิตผ่าน ledger idempotencyKey
  `stripe:{sessionId}` unique อยู่แล้ว → webhook (`checkout.session.completed`) กับ confirm-on-return
  (`/api/energy/confirm`) ชนกันได้ปลอดภัย โดยเครดิตเกิดครั้งเดียว (`src/lib/payments/service.ts`)
- Counters (`chat_count`, `like_count`, `favorite_count`) เป็น denormalized เพื่อ listing performance และ update แบบ transactional
- Intimacy level **ไม่เก็บลง DB** — derive จาก `character_affinities.points` ในโค้ด (`src/lib/quests/intimacy.ts`)
  เพื่อให้แก้ threshold ได้โดยไม่ต้อง migrate; directive ของเลเวลถูก inject เข้า system prompt
  เพื่อให้ AI ปรับน้ำเสียงตามความสนิท

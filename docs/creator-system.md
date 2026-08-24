# MeeChat Creator Studio — ระบบครีเอเตอร์ (M9)

> ออกแบบโดยเทียบกับแนวปฏิบัติของเจ้าตลาด: Character.AI (creator program + usage stats),
> JanitorAI (creator profile + follower), Chub (publishing pipeline + tags/rating),
> SpicyChat (revenue share ตาม usage) — ปรับให้เข้ากับ energy-ledger ที่ MeeChat มีอยู่แล้ว

## 0. สรุปสำหรับผู้อ่าน

ระบบครีเอเตอร์ = วงจรครบ "สร้าง → เผยแพร่ → มีคนใช้ → ได้รางวัล":

1. **Creator Profile** (มีอยู่แล้วจาก M6) — auto-create ครั้งแรกที่สร้างตัวละคร + หน้า public `/creator/[username]` + follow
2. **Character Lifecycle / Moderation** (ใหม่) — `DRAFT → PENDING → PUBLISHED / REJECTED (+ resubmit)` พร้อม admin decide endpoint
3. **Creator Earnings** (ใหม่) — เปอร์เซ็นต์จาก "พลังงานที่ user จ่ายจริง" ในการแชทกับตัวละครของครีเอเตอร์ ไหลเข้า ledger แยก พร้อม counter บน profile
4. **Creator Studio Dashboard** (ใหม่) — `/creator`: สถิติรวม + จัดการตัวละครทุก status + ประวัติ earnings + แก้ profile
5. **Energy Shop (stub)** (ใหม่) — แพ็กเกจเติมพลังงาน (PURCHASE → paidBalance) เปิดใช้เมื่อต่อ payment gateway; ตอนนี้คืน 503 อย่างเป็นทางการ

## 1. แรงบันดาลใจและสิ่งที่ยืม/ไม่ยืม

| แพลตฟอร์ม | สิ่งที่ยืม | สิ่งที่ไม่ยืม (เหตุผล) |
|---|---|---|
| Character.AI | ใครก็สร้างได้, dashboard สถิติต่อตัวละคร | ระบบ c.ai+ subscription (ยังไม่มี billing จริง) |
| JanitorAI | follower ของครีเอเตอร์, หน้าโปรไฟล์สาธารณะ | — |
| Chub | state machine การ publish + content rating | card marketplace หลาย format |
| SpicyChat | revenue share จาก usage จริง (เราใช้ % ของ energy ที่ settle แล้ว) | จ่ายเป็นเงินบาท (ยังไม่มี payout gateway) |

หลักการ: **ไม่ copy UI ใคร**, ตัวละครต้องเป็นงานแต่งเองเท่านั้น (no copyrighted characters),
ทุก write path ผ่าน Zod + ownership check ใน application layer (Prisma bypass RLS)

## 2. Data Model (migration `creator_system`)

```prisma
enum CharacterStatus { DRAFT PENDING PUBLISHED REJECTED }   // ใหม่
enum CreatorEarningType { CHAT_SHARE BONUS ADJUSTMENT }      // ใหม่

model Character {
  // เพิ่ม:
  status       CharacterStatus @default(DRAFT)
  reviewNote   String?         // เหตุผลที่ reject (จาก admin)
  publishedAt  DateTime?
}

model CreatorProfile {
  // เพิ่ม:
  totalEarned Int @default(0)   // denormalized counter (source of truth = ledger)
}

model CreatorEarning {          // append-only เหมือน energy_transactions
  id             String   @id @default(uuid()) @db.Uuid
  creatorUserId  String   @map("creator_user_id") @db.Uuid
  characterId    String?  @map("character_id") @db.Uuid
  type           CreatorEarningType
  amount         Int                  // พลังงาน (coin) ที่ครีเอเตอร์ได้รับ
  note           String?
  idempotencyKey String?  @unique @map("idempotency_key")
  createdAt      DateTime @default(now()) @map("created_at")
}
```

- Backfill: character เดิมทุกตัว (seed meemee-studio) → `status='PUBLISHED'`, `published_at=created_at`
- Index: `characters(status)`, `creator_earnings(creator_user_id, created_at desc)`
- ตารางของโปรเจกต์อื่นใน database เดียวกัน (stories/npcs/game_sessions/...) ไม่ถูกแตะ

## 3. Lifecycle การเผยแพร่

```
DRAFT ──submit──▶ PENDING ──approve──▶ PUBLISHED
  ▲                  │                     
  │              reject└──▶ REJECTED ──edit+submit──▶ PENDING ...
  └────────── edit ──────────┘
```

- **สร้างใหม่** → `DRAFT` เสมอ (form มีปุ่ม "บันทึกฉบับร่าง" / "เผยแพร่เลย")
- **"เผยแพร่เลย"** = create/patch แล้ว submit ใน request เดียว (`?action=publish`)
- **AUTO_APPROVE** (config `CREATOR_AUTO_APPROVE`, default `true` ช่วง MVP ไม่มีทีม review):
  submit → `PUBLISHED` ทันที + `publishedAt`; ปิด flag เมื่อมี moderation team — flow PENDING/admin-decide พร้อมใช้เสมอ
- **Admin**: `POST /api/admin/characters/[id]/decide` `{approve: boolean, note?}` (ต้อง `users.role=ADMIN`) — approve→PUBLISHED, reject→REJECTED(+note)
- **กฎการมองเห็น** (ซ้อนกับ visibility เดิม):
  - list/search/discover/trending: แสดงเฉพาะ `status=PUBLISHED AND visibility=PUBLIC`
  - detail: owner เห็นได้ทุก status; คนอื่นเห็นเฉพาะ `PUBLISHED` (UNLISTED = มี link ถึงดูได้, PRIVATE = owner only)
  - chat/converse ได้เฉพาะตัวที่ owner เห็น (draft ของตัวเองทดสอบแชทได้)

## 4. Creator Earnings (share-of-energy)

- ทุกครั้งที่ chat **settle สำเร็จ** (success path เท่านั้น): ครีเอเตอร์ของตัวละครได้
  `amount = max(1, floor(actualCost × CREATOR_SHARE))` โดย `CREATOR_SHARE = 0.10` (10%)
  — แชทสำเร็จทุกครั้งครีเอเตอร์ได้อย่างน้อย 1 coin (chat ทั่วไปคิด 2-3 energy ถ้าใช้ floor
  เปล่าจะได้ 0 ตลอด)
- **ทำไมใช้ actualCost ไม่ใช่ reserved**: refund เกิดก่อน settle เสมอ ผู้เล่น "จ่ายจริง" = charged;
  stream fail/abort → ไม่มี earning (แฟร์ทั้งสองฝั่ง)
- **Self-chat ไม่มี share** — แชทกับตัวละครตัวเองไม่ได้ coin กัน farm
- Idempotent: key `${chatIdempotencyKey}:earning` — regenerate/retry ซ้ำไม่ได้ coin เพิ่ม
- เขียนใน `.catch(() => {})` เหมือน usage log — ความผิดพลาดของ earning ห้ามพัง chat
- Counter `total_earned` อัปเดตใน transaction เดียวกับ insert ledger
- Payout เป็นเงินจริง = Phase หลัง (ต้องมี billing/KYC); ตอนนี้ coin สะสมดูได้ใน studio

## 5. Energy Top-up Shop (stub แบบ production-ready shape)

- `GET /api/energy/purchase/packages` → catalog ในโค้ด (e.g., 500 coins, 1200 coins)
- `POST /api/energy/purchase` `{packageId}`:
  - `PAYMENTS_ENABLED=false` (default) → **503** `{code:"VALIDATION_ERROR"…}` จริงๆ ใช้ INTERNAL_ERROR? → ใช้ code `PAYMENTS_DISABLED` map 503 พร้อม message ไทย
  - เมื่อต่อ gateway แล้ว: verify webhook → `PURCHASE` เข้า **paidBalance** (free-first spend ยังเดิม) idempotent ด้วย provider session id

## 6. Admin Utilities

- `POST /api/admin/energy/grant` `{targetUserId|email, amount, note}` — ADMIN_ADJUSTMENT เข้า free balance (ใช้ support/compensation); guard `requireAdmin`
- promotion วิธีแรก: SQL `update users set role='ADMIN' where email='...'` (มี snippet ใน docs) — ยังไม่ทำ UI admin console

## 7. API ใหม่ทั้งหมด

| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/creator/me` | login | profile + stats (characters by status, chats, likes, followers, totalEarned) |
| PATCH | `/api/creator/me` | login | แก้ username/bio/avatarUrl (username unique, regex `[a-z0-9_]{3,20}`) |
| GET | `/api/creator/me/characters` | login | ตัวละครตัวเองทุก status (?status= filter) |
| GET | `/api/creator/me/earnings` | login | ledger earnings (?cursor= paginated) |
| POST | `/api/characters/[id]/submit` | owner | DRAFT/REJECTED → PENDING/PUBLISHED (ตาม AUTO_APPROVE) |
| POST | `/api/admin/characters/[id]/decide` | ADMIN | PENDING → PUBLISHED/REJECTED(+note) |
| GET | `/api/energy/purchase/packages` | public | แพ็กเกจเติมพลังงาน |
| POST | `/api/energy/purchase` | login | stub: 503 เมื่อยังไม่เปิด payments |
| POST | `/api/admin/energy/grant` | ADMIN | เติมพลังงานให้ user (support) |

## 8. Frontend

- **`/creator` (Studio hub)**: ถ้ายังไม่มี profile → onboarding form; ถ้ามี → stat cards (chats/likes/followers/earned) + ตารางตัวละครของเรา (chip สี per status, ปุ่ม แก้ไข/ส่งตรวจ/ลบ) + earnings ล่าสุด
- **`/create/character`**: เพิ่ม action ปุ่ม "บันทึกฉบับร่าง" / "เผยแพร่"; แสดง badge สถานะหลัง save
- **`/creator/[username]`**: query เดิมแต่กรอง `status=PUBLISHED` เพิ่ม (public page ต้องโชว์เฉพาะของ published)

## 9. Testing plan

- Unit: earning share math (`floor`, threshold ≥10, share 0% edge), packages catalog shape
- Integration (ใหม่ `tests/integration/creator-studio.test.ts`): lifecycle matrix + permission (owner/non-owner/admin) + username uniqueness/validation + stats ตรง DB จริง + earnings idempotency (เรียก accrue ซ้ำ same key) + purchase stub 503 + admin grant (role gate + wallet/ledger effect)
- E2E: user B publish char → user A chat HTTP จริง → มี creator_earning ของ B == floor(charged×0.1), counter ตรง
- Security: IDOR draft (B อ่าน/แก้/submit A's draft → 404/403), admin route 403 สำหรับ user ปกติ
- Migration/drift: suite เดิมต้องยังผ่าน (ตารางแปลกยังไม่ถูกแตะ)
- รัน full suite ซ้ำทั้งหมด

## 10. Non-goals ชัดเจน

- ไม่มีการจ่ายเงินจริง/payout/KYC (รอ payment gateway)
- ไม่มี review team/console (แค่ endpoint + SQL promote admin)
- ไม่ทำ analytics chart แบบ time-series (แค่ totals + recent ledger) — ต่อยอดภายหลัง

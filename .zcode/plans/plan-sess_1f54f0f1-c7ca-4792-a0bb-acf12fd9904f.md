## Feature: ค่าความสนิท (Character Affinity) + ภารกิจที่ครีเอเตอร์กำหนดเอง

เปลี่ยนรางวัลภารกิจจาก "แจกเหรียญ" เป็น "ค่าความสนิท" ระหว่างผู้ใช้↔ตัวละคร, ให้ครีเอเตอร์เพิ่ม/แก้/ลบภารกิจของตัวละครตัวเองได้, และตัวละคร AI ปรับน้ำเสียงการพูดตามระดับความสนิท

**ตัดสินใจแล้ว (จากที่ปรึกษาไม่ได้ตอบ — ใช้ตัวเลือกแนะนำ):** ระบบ 5 เลเวล + ชื่อระดับ · เก็บ default quest 5 อันไว้แต่ให้ค่าสนิท + ครีเอเตอร์จัดการได้ · เคลมรายวัน +50⚡ คงเดิม

### 1) Migration `20260824000003_intimacy_affinity` (manual — shared DB)
- `CREATE TABLE character_affinities`: id UUID PK, user_id FK users CASCADE, character_id FK characters CASCADE, points INT DEFAULT 0, timestamps, UNIQUE(user_id, character_id)
- `character_quests`: ADD `reward_intimacy INTEGER NOT NULL` → backfill แถวเดิมด้วย CASE ตาม reward_energy เดิม (10→8, 15→10, 20→12, 25→20, 30→15) → DROP `reward_energy`
- สคริปต์ .mjs: apply SQL + register `_prisma_migrations` (checksum sha256 + finished_at NOT NULL) ใน transaction เดียว
- schema.prisma: model `CharacterAffinity`, `CharacterQuest.rewardIntimacy` (ลบ rewardEnergy), prisma generate
- drift.test.ts: เพิ่ม "character_affinities" ใน MEECHAT_TABLES

### 2) ระบบเลเวล `src/lib/quests/intimacy.ts` (ใหม่)
LEVELS: Lv1 คนแปลกหน้า (0–29, พูดสุภาพกึงระยะ) / Lv2 คนรู้จัก (30–79, เริ่มเป็นกันเอง) / Lv3 เพื่อนสนิท (80–159, อบอุ่น แซวได้) / Lv4 สนิทใจ (160–299, เปิดใจ เรียกชื่อเล่น) / Lv5 ผู้พิเศษ (300+, น้ำเสียงที่สงวนให้คนพิเศษ) + `pointsToLevel()` + directive ภาษาไทยต่อเลเวลสำหรับ prompt

### 3) Quest service (`src/lib/quests/service.ts`)
- DEFAULT_QUESTS เปลี่ยน rewardEnergy→rewardIntimacy (+8/+15/+12/+10/+20)
- `claimQuestReward` ใหม่: `$transaction([mark claimedAt where claimedAt=null (กัน claim ซ้ำ), upsert affinity += rewardIntimacy])` — return `{amount, points, level, label}` ไม่ผูก wallet; enum QUEST_REWARD คงไว้ใน DB (unused, ไม่จำเป็นต้อง drop)
- เพิ่ม CRUD ฝั่งครีเอเตอร์: createQuest/updateQuest/deleteQuest + cap 10 quests/character

### 4) Validation `src/lib/validation/quest.ts` (ใหม่)
title(2–60), description(5–200), goalType(MESSAGES/STREAK_DAYS/AI_TOPIC), target(1–999), criteriaPrompt(required เมื่อ AI_TOPIC, ≤500), rewardIntimacy(1–50, default 10)

### 5) API routes
- `POST /api/characters/[id]/quests` (owner check ผ่าน getOwnedCharacter + rate limit)
- `PATCH|DELETE /api/characters/[id]/quests/[questId]` (owner only)
- GET quests: field rewardEnergy→rewardIntimacy + แถม `affinity {points, level, label}` เมื่อล็อกอิน (ใช้ทั้ง player panel และ creator dialog — ไม่ต้องมี endpoint ใหม่)
- claim route: response shape ใหม่

### 6) Prompt + Pipeline
- `buildSystemPrompt` รับ `intimacy?: {level, label}` → insert section "### ความสัมพันธ์กับผู้ใช้" หลัง speakingStyle (directive ตามเลเวล + บอกให้ปรับน้ำเสียงตาม)
- pipeline.prepareChat: load affinity (userId+characterId) ส่งเข้า prompt builder

### 7) UI
- **Chat header** (chat-view/page.tsx): badge ❤ Lv.N ข้างชื่อตัวละคร (server prop; router.refresh หลัง claim ทำให้ badge update เอง)
- **QuestPanel**: chip รางวัล "+N ❤" โทน rose, toast "ความสนิท +N", ด้านบน panel แสดง bar ความสนิทปัจจุบัน (Lv + คะแนน/เกณฑ์ถัดไป)
- **Creator Studio** (creator-studio.tsx): ปุ่ม "ภารกิจ" ต่อ character row → Dialog จัดการ: list quest (edit/delete) + ฟอร์มเพิ่ม (field criteriaPrompt โผล่เฉพาะ AI_TOPIC)

### 8) Tests + Docs
- unit: intimacy thresholds, prompt-builder section, validation refine
- integration: quests.test.ts ปรับ field ใหม่; ไฟล์ใหม่ creator-quests.test.ts (owner CRUD/cap 10/non-owner 404/AI_TOPIC require criteria/claim → points เพิ่ม + idempotent)
- grep เก็บ reference rewardEnergy/"⚡" ใน tests เดิม (wallet-flows, api-core) ให้หมด
- รัน full suite + drift test + tsc; อัปเดต roadmap/architecture/test-report สั้น ๆ
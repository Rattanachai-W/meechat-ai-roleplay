# Technical Decisions & Risks

## Decisions

### 1. Next.js proxy.ts แทน middleware.ts
Next.js 16 เปลี่ยน convention เป็น `src/proxy.ts` — ใช้ตัวใหม่เลยเพื่อไม่ต้อง migrate ภายหลัง

### 2. Prisma 7 + Supabase coexistence
- Prisma จัดการ schema/migrations (public tables)
- Triggers + RLS policies อยู่ใน `supabase/sql/` (รัน manual / supabase CLI) เพราะ Prisma ไม่ควร manage `auth.*`
- Server เชื่อมผ่าน connection pooler (port 6543) — serverless-friendly; migrations ใช้ direct URL ถ้าจำเป็น
- Prisma (postgres role) bypass RLS → **ownership check ต้อง enforce ซ้ำใน application layer เสมอ** RLS ป้องกันเส้นทาง PostgREST/anon key เท่านั้น

### 3. Regenerate = message variants ไม่ใช่ตารางแยก
Spec เสนอ `message_variants` — เลือกใช้ sibling rows (`parent_message_id` + `variant_index` + `is_active_variant`)
บน `messages` แทน เพราะ query/render ง่ายกว่า ไม่มี storage path ซ้ำซ้อน และรองรับ branching อนาคตได้เท่ากัน

### 4. Memory retrieval: เริ่ม heuristic ก่อน pgvector
MVP ใช้ importance × recency + keyword match — เพิ่ม `vector` column ผ่าน raw SQL migration ได้ภายหลัง
โดยไม่กระทบ interface (`MemoryRetriever`) — ตัด complexity ตอนที่ semantic search ยังไม่พิสูจน์ว่าจำเป็น

### 5. Energy: reserve → settle/refund + idempotency key
- Reserve ก่อนเรียก LLM, settle หลัง success, refund ถ้า error
- `idempotencyKey` unique บน transactions กัน double charge จาก retry/stream reconnect
- Wallet แยก free/paid balance เตรียม Free tier + billing อนาคต

### 6. Streaming ด้วย SSE บน Node runtime
Route handler return `ReadableStream` (SSE) — รองรับ Vercel serverless streaming;
Edge runtime ยังไม่จำเป็นเพราะต้องใช้ Prisma/Postgres ฝั่ง server

### 7. Env vars optional ตอน build
Build ต้องผ่านได้แม้ยังไม่ตั้ง Supabase — feature ที่ต้องใช้ throw runtime error ที่อ่านง่าย
(Trade-off: config errors โผล่ตอน runtime ไม่ใช่ build time)

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM cost รั่ว (loop, abuse) | สูง | rate limit ต่อ user/IP, energy reserve, usage log ทุก request, model default ราคาถูก |
| Prompt injection ผ่าน character fields | กลาง | character fields ถูก treat เป็น untrusted data, platform rules block ท้าย system prompt, moderation queue |
| Thai token cost สูงกว่า English | กลาง | benchmark tokenizer ตอนเลือก default model, energy multiplier ต่อ model |
| Supabase pooler connection exhaustion | กลาง | pgbouncer transaction mode, singleton client, monitor usage |
| OneDrive sync folder dev | ต่ำ | node_modules/.next ช้าลงเล็กน้อย — พิจารณา exclude folder จาก sync ถ้าช้าจริง |
| Vercel function timeout บน stream ยาว | กลาง | cap max_tokens ต่อ response, monitor p95 latency จาก usage logs |

## Cost Principles (§44)

- Memory extraction / summary ใช้ cheap model + ทำทุก N messages เท่านั้น
- Cache discover sections (Redis, TTL ~1–5 min)
- Default chat model = cheapest acceptable; premium models gated ด้วย `is_premium_only`

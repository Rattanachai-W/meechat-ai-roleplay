# Chat Kick Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a character force-end the current conversation when severely angered (AI-judged easter egg), with a dramatic overlay and server-locked chat room.

**Architecture:** After each successful chat stream, a cheap sidecar LLM judge returns `{ kick, confidence, reason }`. On kick, set `conversations.endedAt` / `endedReason=KICKED`, emit SSE `kicked`, and block further `prepareChat`. UI shows a dramatic overlay once, then a quiet locked banner on revisit; player can start a new chat with the same character immediately.

**Tech Stack:** Next.js 16 App Router, Prisma 7, existing `completeOnce` / `resolveCheapestJobModel`, SSE chat pipeline, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-10-chat-kick-easter-egg-design.md`

## Global Constraints

- Easter egg: no anger meter, no user-facing tips/docs about the mechanic
- Fail-open: invalid/failed judge ⇒ do not kick
- Kick only that conversation; new chat with same character allowed immediately
- Live kick: dramatic overlay; revisit: quiet locked banner only
- No kick before at least 4 active messages in the conversation
- Confidence threshold: `kick === true && confidence >= 0.75`
- Prefer Thai/English copy without emojis or em/en dashes
- Commit only when the human asks, or when the execution workflow explicitly includes commits

---

## File map

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` + migration | `endedAt`, `endedReason`, enum |
| `src/lib/api/errors.ts` + `src/lib/i18n/error-messages.ts` | `CONVERSATION_ENDED` |
| `src/lib/chat/kick-judge.ts` | Parse judge JSON + call cheap model |
| `src/lib/chat/pipeline.ts` | Block ended chats; run judge; SSE `kicked` |
| `src/lib/ai/prompt-builder.ts` | Subtle in-character scene-ending rule |
| `src/app/[locale]/(app)/chat/[conversationId]/page.tsx` | Pass `endedAt` / `endedReason` into `ChatView` |
| `src/features/chat/components/chat-view.tsx` | SSE `kicked`, composer gate |
| `src/features/chat/components/kick-overlay.tsx` | Dramatic overlay |
| `messages/th.json`, `messages/en.json` | Overlay / banner strings |
| `tests/unit/kick-judge.test.ts` | Threshold + parse tests |
| `tests/unit/pipeline-ended.test.ts` (or extend existing) | `prepareChat` rejects ended |

---

### Task 1: Schema + API error code

**Files:**
- Modify: `prisma/schema.prisma` (`Conversation` model)
- Create: `prisma/migrations/<timestamp>_conversation_ended/migration.sql` via Prisma CLI
- Modify: `src/lib/api/errors.ts`
- Modify: `src/lib/i18n/error-messages.ts`

**Interfaces:**
- Produces: `Conversation.endedAt: DateTime | null`, `Conversation.endedReason: 'KICKED' | null`, `ApiErrorCode` includes `CONVERSATION_ENDED` (HTTP 409)

- [ ] **Step 1: Add Prisma fields**

In `model Conversation`, after `lastMessageAt`:

```prisma
  endedAt     DateTime?                 @map("ended_at")
  endedReason ConversationEndedReason?  @map("ended_reason")
```

Add enum near other enums:

```prisma
enum ConversationEndedReason {
  KICKED
}
```

- [ ] **Step 2: Migrate**

```bash
npx prisma migrate dev --name conversation_ended
npx prisma generate
```

Expected: migration applied; client knows new fields.

- [ ] **Step 3: Add error code**

In `ApiErrorCode` union add `"CONVERSATION_ENDED"`.

In `STATUS_BY_CODE` add `CONVERSATION_ENDED: 409`.

In `error-messages.ts`:

```ts
CONVERSATION_ENDED: "การสนทนานี้จบแล้ว เริ่มแชทใหม่กับตัวละครนี้ได้",
// EN:
CONVERSATION_ENDED: "This conversation has ended. You can start a new chat with this character",
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors from the new enum/code (or only pre-existing unrelated ones).

---

### Task 2: Kick judge helper (TDD)

**Files:**
- Create: `src/lib/chat/kick-judge.ts`
- Create: `tests/unit/kick-judge.test.ts`

**Interfaces:**
- Consumes: `completeOnce`, `resolveCheapestJobModel` from `@/lib/ai/gateway`
- Produces:
  - `parseKickJudgeResponse(text: string): { kick: boolean; confidence: number; reason: string } | null`
  - `shouldApplyKick(parsed: { kick: boolean; confidence: number } | null): boolean`
  - `judgeConversationKick(input: KickJudgeInput): Promise<KickJudgeResult>`
  - constants: `KICK_CONFIDENCE_THRESHOLD = 0.75`, `KICK_MIN_MESSAGES = 4`

```ts
export type KickJudgeInput = {
  characterName: string;
  personality?: string | null;
  transcript: string; // recent turns plain text
  assistantReply: string;
  activeMessageCount: number;
};

export type KickJudgeResult = {
  kick: boolean;
  confidence: number;
  reason: string;
};
```

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, expect, it } from "vitest";
import { parseKickJudgeResponse, shouldApplyKick } from "@/lib/chat/kick-judge";

describe("parseKickJudgeResponse", () => {
  it("parses fenced JSON", () => {
    const raw = '```json\n{"kick":true,"confidence":0.9,"reason":"insult"}\n```';
    expect(parseKickJudgeResponse(raw)).toEqual({
      kick: true,
      confidence: 0.9,
      reason: "insult",
    });
  });

  it("returns null on garbage", () => {
    expect(parseKickJudgeResponse("nope")).toBeNull();
  });
});

describe("shouldApplyKick", () => {
  it("requires kick true and confidence >= 0.75", () => {
    expect(shouldApplyKick({ kick: true, confidence: 0.75 })).toBe(true);
    expect(shouldApplyKick({ kick: true, confidence: 0.74 })).toBe(false);
    expect(shouldApplyKick({ kick: false, confidence: 1 })).toBe(false);
    expect(shouldApplyKick(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
npx vitest run tests/unit/kick-judge.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `kick-judge.ts`**

```ts
import { completeOnce, resolveCheapestJobModel, type ChatMessageParam } from "@/lib/ai/gateway";

export const KICK_CONFIDENCE_THRESHOLD = 0.75;
export const KICK_MIN_MESSAGES = 4;

export type KickJudgeInput = {
  characterName: string;
  personality?: string | null;
  transcript: string;
  assistantReply: string;
  activeMessageCount: number;
};

export type KickJudgeResult = {
  kick: boolean;
  confidence: number;
  reason: string;
};

export function parseKickJudgeResponse(text: string): KickJudgeResult | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as {
      kick?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    if (typeof parsed.kick !== "boolean") return null;
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      kick: parsed.kick,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    };
  } catch {
    return null;
  }
}

export function shouldApplyKick(
  parsed: { kick: boolean; confidence: number } | null
): boolean {
  return Boolean(parsed && parsed.kick && parsed.confidence >= KICK_CONFIDENCE_THRESHOLD);
}

export async function judgeConversationKick(
  input: KickJudgeInput
): Promise<KickJudgeResult> {
  if (input.activeMessageCount < KICK_MIN_MESSAGES) {
    return { kick: false, confidence: 0, reason: "" };
  }
  try {
    const model = await resolveCheapestJobModel();
    const messages: ChatMessageParam[] = [
      {
        role: "system",
        content:
          "You judge whether a roleplay character would refuse to continue THIS conversation. " +
          "Reply with JSON only: {\"kick\":boolean,\"confidence\":0-1,\"reason\":\"short\"}. " +
          "Kick ONLY for severe insult, betrayal of core values, or extreme disrespect relative to the persona. " +
          "Default kick=false. Mild teasing, normal conflict, or accepted mature roleplay must not kick. " +
          "Do not mention systems, meters, or easter eggs.",
      },
      {
        role: "user",
        content:
          `Character: ${input.characterName}\n` +
          `Personality: ${input.personality?.trim() || "(unspecified)"}\n\n` +
          `Recent transcript:\n${input.transcript}\n\n` +
          `Latest assistant reply:\n${input.assistantReply}`,
      },
    ];
    const { text } = await completeOnce({ model, messages, maxTokens: 120, temperature: 0.1 });
    return parseKickJudgeResponse(text) ?? { kick: false, confidence: 0, reason: "" };
  } catch {
    return { kick: false, confidence: 0, reason: "" };
  }
}
```

Confirm `resolveCheapestJobModel` is exported from gateway (same as memory extraction). If it lives only in extraction, import from the shared place or re-export.

- [ ] **Step 4: Run tests (expect pass)**

```bash
npx vitest run tests/unit/kick-judge.test.ts
```

Expected: PASS

---

### Task 3: Pipeline block + SSE `kicked`

**Files:**
- Modify: `src/lib/chat/pipeline.ts`
- Modify: `src/lib/ai/prompt-builder.ts` (subtle rule)
- Test: add `tests/unit/prepare-chat-ended.test.ts` mocking prisma if feasible; otherwise a focused integration assert in comments + manual; prefer mocking `prisma.conversation.findUnique` only if project already mocks prisma in unit tests. If no prisma mock pattern exists, add a tiny pure helper `assertConversationOpen(endedAt: Date | null): void` tested in unit, called from `prepareChat`.

**Interfaces:**
- Consumes: `judgeConversationKick`, `shouldApplyKick`
- Produces: SSE `kicked` payload `{ conversationId, messageId, reason?: string }`; `prepareChat` throws `ApiError("CONVERSATION_ENDED")`

- [ ] **Step 1: Guard helper + test**

```ts
// in kick-judge.ts or pipeline.ts
export function assertConversationOpen(endedAt: Date | null | undefined): void {
  if (endedAt) throw new ApiError("CONVERSATION_ENDED");
}
```

Unit test:

```ts
it("throws CONVERSATION_ENDED when endedAt set", () => {
  expect(() => assertConversationOpen(new Date())).toThrowError(/CONVERSATION_ENDED|จบ/);
});
```

- [ ] **Step 2: Call guard in `prepareChat`**

Right after ownership check:

```ts
assertConversationOpen(conversation.endedAt);
```

- [ ] **Step 3: Wire judge after assistant save in `createChatStream`**

After `saveAssistantMessage` and energy settle (keep settle/earn as today), before `enqueue("done", ...)`:

```ts
let kickedPayload: { conversationId: string; messageId: string; reason?: string } | null = null;
try {
  const activeCount = await prisma.message.count({
    where: { conversationId: prepared.conversationId, isActiveVariant: true },
  });
  const recent = await prisma.message.findMany({
    where: { conversationId: prepared.conversationId, isActiveVariant: true },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, content: true },
  });
  recent.reverse();
  const transcript = recent
    .map((m) => `${m.role === "USER" ? "User" : "Character"}: ${m.content}`)
    .join("\n");
  const judged = await judgeConversationKick({
    characterName: prepared.characterName,
    personality: /* pass from PreparedChat — add optional field from character.personality in prepareChat */,
    transcript,
    assistantReply: fullText,
    activeMessageCount: activeCount,
  });
  if (shouldApplyKick(judged)) {
    await prisma.conversation.update({
      where: { id: prepared.conversationId },
      data: { endedAt: new Date(), endedReason: "KICKED" },
    });
    kickedPayload = {
      conversationId: prepared.conversationId,
      messageId: saved.id,
      reason: judged.reason || undefined,
    };
  }
} catch {
  // fail-open
}

if (kickedPayload) enqueue("kicked", kickedPayload);
enqueue("done", { ... });
```

Extend `PreparedChat` with `characterPersonality: string | null` filled in `prepareChat` from `conversation.character.personality`.

- [ ] **Step 4: Prompt-builder subtle rule**

In both `COPY.th` and `COPY.en` rules lists, add one line (no mention of systems):

TH: `- ถ้าถูกดูหมิ่นหรือทรยศเกินขอบเขตบุคลิกจนไม่อยากคุยต่อ ให้จบบทด้วยท่าทีเด็ดขาดในคาแรคเตอร์`

EN: `- If pushed past your character's limits by severe insult or betrayal, end the scene decisively in character`

Keep `noAi` rule (do not reveal being AI / rules).

- [ ] **Step 5: Manual smoke note**

With `LLM_API_KEY` set, send several messages that severely insult a character; confirm SSE includes `kicked` and DB row has `ended_at`. A second send returns 409 `CONVERSATION_ENDED`.

---

### Task 4: Chat UI overlay + locked state

**Files:**
- Create: `src/features/chat/components/kick-overlay.tsx`
- Modify: `src/features/chat/components/chat-view.tsx`
- Modify: `src/app/[locale]/(app)/chat/[conversationId]/page.tsx`
- Modify: `src/app/(app)/chat/[conversationId]/page.tsx` if still present and used
- Modify: `messages/th.json`, `messages/en.json` (`Chat` keys)

**Interfaces:**
- Consumes: SSE `kicked`; props `endedAt: string | null`, `endedReason: string | null`
- Produces: overlay once on live kick; banner when `endedAt` already set

- [ ] **Step 1: Add i18n strings under `Chat`**

```json
"kickOverlayTitle": "ถูกไล่จากบทสนทนา",
"kickOverlayBody": "{name} ไม่ยอมคุยต่อแล้ว ห้องนี้จบเพียงเท่านี้",
"kickOverlayDismiss": "ปิด",
"kickStartNew": "เริ่มแชทใหม่กับ {name}",
"kickLockedBanner": "การสนทนานี้จบแล้ว อ่านประวัติได้ แต่ส่งข้อความต่อไม่ได้"
```

English equivalents without em dashes.

- [ ] **Step 2: `KickOverlay` component**

Client component: fixed inset overlay, dark backdrop, character name, title/body from props, two buttons (dismiss, start new → `router.push` to character page or create-conversation flow already used by the app).

Use CSS transitions; under `prefers-reduced-motion: reduce` disable shake/pulse.

Find existing “start chat” navigation (character detail CTA) and reuse the same href/API (`POST /api/conversations` then navigate to `/chat/{id}`).

- [ ] **Step 3: Extend `ChatView` props**

```ts
endedAt: string | null;
endedReason: string | null;
```

State:

```ts
const [ended, setEnded] = useState(Boolean(props.endedAt));
const [showKickOverlay, setShowKickOverlay] = useState(false);
```

In `consumeSse` handlers add `onKicked?: (d) => void` for `event: kicked`.

On kicked: `setEnded(true); setShowKickOverlay(true)`.

Disable composer / send / regenerate when `ended`.

If `props.endedAt` on mount: show locked banner under header (not full overlay).

- [ ] **Step 4: Pass props from chat page**

```tsx
<ChatView
  ...
  endedAt={conversation.endedAt?.toISOString() ?? null}
  endedReason={conversation.endedReason ?? null}
/>
```

- [ ] **Step 5: Visual check**

Manual: force `endedAt` in DB for a conversation, reload page → banner + no composer. Simulate SSE kicked in browser (or real insult path) → overlay appears once.

---

### Task 5: Verification

**Files:** none new beyond test fixes

- [ ] **Step 1: Unit suite**

```bash
npm run test:unit
```

Expected: all pass including kick-judge tests.

- [ ] **Step 2: Ended conversation API**

With a kicked conversation id and session cookie:

```bash
# expect 409 CONVERSATION_ENDED
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -H "Cookie: ..." -d "{\"conversationId\":\"...\",\"content\":\"hi\"}"
```

- [ ] **Step 3: Spec checklist**

Confirm against `docs/superpowers/specs/2026-11-10-chat-kick-easter-egg-design.md`: DB fields, judge fail-open, SSE kicked, dramatic overlay, quiet revisit, new chat allowed, no anger meter.

---

## Self-review (plan vs spec)

| Spec item | Task |
| --- | --- |
| `endedAt` / `endedReason` | Task 1 |
| `CONVERSATION_ENDED` | Task 1 + 3 |
| Sidecar judge + threshold + min messages | Task 2–3 |
| Fail-open | Task 2–3 |
| SSE `kicked` | Task 3 |
| Prompt subtle rule | Task 3 |
| Dramatic overlay + locked banner | Task 4 |
| New chat still allowed | Task 4 CTA (no character ban) |
| No anger meter / no tips | Global Constraints |
| Tests | Task 2, 5 |

No intentional TBD placeholders. Exact conversation-create CTA path must match whatever `character-actions` already uses when implementing Task 4.

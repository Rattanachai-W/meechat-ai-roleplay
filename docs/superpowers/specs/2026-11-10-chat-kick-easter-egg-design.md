# Chat kick easter egg (character ends the conversation)

Date: 2026-11-10  
Status: approved in conversation; awaiting spec file review before implementation plan

## Goal

When the player upsets a character badly enough during roleplay, the character can **force-end that conversation** (kick the player out of that chat room). This is an **easter egg**: not advertised in marketing, nav, tips, or a visible anger meter. When it triggers, the moment should feel **dramatic**.

## Decisions

| Topic | Choice |
| --- | --- |
| Detection | AI judges after each assistant turn (structured kick signal) |
| Scope after kick | Lock **that conversation only**; player may start a **new** chat with the same character immediately |
| Discovery | Easter egg (no anger UI / no docs for players) |
| Kick moment UX | Dramatic overlay + short explanation |
| Implementation approach | Structured signal after stream (Approach A), not `[[KICK]]` tags or a persistent anger meter |

## Non-goals

- Per-character anger meter in the UI
- Cooldown bans on the character
- Deleting conversation history
- Soft-blocking new chats with the same character
- Documenting the mechanic in user-facing help/legal copy

## Current context

- Chat path: `prepareChat` → `createChatStream` (SSE `delta` / `done` / `error`) in `src/lib/chat/pipeline.ts`
- `Conversation` has no ended/locked state today
- Affinity/intimacy exists for quests; it is **not** reused as anger (different meaning)

## Architecture

```
POST /api/chat
  → prepareChat
       if conversation.endedAt != null → ApiError CONVERSATION_ENDED
  → stream assistant deltas (normal)
  → save assistant message
  → evaluateKick(character, recent turns, assistant text)
       if kick:
         set conversation.endedAt / endedReason = KICKED
         SSE event: kicked { conversationId, messageId, title?, blurb? }
  → SSE event: done (still sent; client uses kicked for overlay)
```

Regenerate on a kicked conversation is also blocked in `prepareChat`.

## Data model

Add to `Conversation`:

- `endedAt DateTime?` `@map("ended_at")`
- `endedReason ConversationEndedReason?` `@map("ended_reason")`

```prisma
enum ConversationEndedReason {
  KICKED
}
```

Only `KICKED` in this pass (keeps the door open for later reasons without schema churn).

Indexes: none required beyond existing; filter by `endedAt` is rare.

## Kick evaluation (Approach A)

### Preferred: trailer / sidecar JSON (cheap, reliable)

After the streamed reply is saved, run a **small non-stream completion** (same stack as memory extraction: cheap model path via existing gateway) with:

- character name + short personality snippet
- last N turns (small window, e.g. 6–10 messages)
- the just-produced assistant reply

Ask for JSON only:

```json
{ "kick": false, "confidence": 0.0, "reason": "" }
```

Rules encoded in the judge prompt:

- Kick only when the character would **genuinely refuse to continue** this scene (severe insult, betrayal of core values, extreme disrespect relative to persona)
- Default is **not** to kick; false positives are worse than rarity
- Do not kick for mild teasing, normal conflict, or mature roleplay the character accepts
- `reason` is internal (logging / overlay subtitle); keep it short and spoiler-light

Kick if `kick === true` and `confidence >= 0.75` (tunable constant in code).

### Fallback if cost must be zero extra calls

Parse a hidden trailer from the assistant stream (e.g. final line `<!--kick:0|1-->`) stripped before save/display. Prefer the sidecar judge first so streamed prose stays clean.

### Fail-open

If the judge errors or returns invalid JSON: **do not kick**.

## Server enforcement

1. `prepareChat`: if `endedAt` set → throw `ApiError("CONVERSATION_ENDED")` (HTTP 409)
2. After kick write: any in-flight second tab still racing should re-check before save where practical; ended conversation ignores further user messages
3. Conversation list / get APIs expose `endedAt` / `endedReason` so the chat page can render locked state without relying only on the live SSE event

Add `CONVERSATION_ENDED` to `ApiErrorCode` + th/en API messages.

## SSE contract

Existing:

- `delta` → `{ text }`
- `done` → `{ messageId, content, ... }`
- `error` → `{ code }`

New:

- `kicked` → `{ conversationId, messageId, reason?: string }`

Order: stream deltas → save → (optional) kick update → enqueue `kicked` if any → enqueue `done` → close.

Energy settle / creator share / quests run as today **before** or **regardless of** kick (player already spent the turn). Kick does not refund the turn.

## Prompt / character behavior

System prompt (subtle, not user-visible tip):

- Characters may end the scene in-character when pushed past their limit
- The farewell line should be in-character (anger, cold dismissal, etc.)
- The mechanical kick is decided by the server judge, not by asking the model to invent UI copy about “systems”

Do **not** tell the model to mention “easter egg”, “kick system”, or “anger meter”.

## UI / UX

### Live kick (dramatic)

When SSE `kicked` arrives after a successful reply:

1. Keep the final assistant message visible in the transcript
2. Show a full-viewport (or chat-pane) **overlay**: dark/intense motion, character-focused framing if avatar exists, short title + one sentence explanation (localized)
3. Primary actions: dismiss overlay, link/button to start a **new** conversation with the same character, optional back to library/discover
4. Hide / disable the composer for this conversation

Copy tone: in-world and punchy (“เธอไม่ยอมคุยต่อแล้ว”, “ถูกไล่จากบทสนทนา”), not “error code”. Avoid explaining the hidden rules.

Motion: 2–3 intentional motions (enter overlay, pulse/shake, fade composer). Respect `prefers-reduced-motion` (static overlay, no shake).

### Revisit locked conversation

Opening an already-kicked conversation:

- Read-only transcript
- Composer replaced by a compact ended banner (less dramatic than first-time overlay; no repeated full theatrical overlay every visit unless product later wants a “replay” toggle; **default: banner only on revisit**)
- CTA to start a new chat with same character

### Easter egg constraints

- No discover tip, tooltip, or settings flag
- No anger bar
- Library/conversation cards may show a subtle status (e.g. muted “จบแล้ว”) without spoiling how

## Localization

Add Chat (or dedicated) strings in `messages/th.json` and `messages/en.json` for overlay title, body, dismiss, start-new CTA, locked banner.

## Testing

- Unit: kick threshold helper (true/false from judge JSON); stripping/ignore invalid judge payloads
- Unit/integration: `prepareChat` rejects ended conversations with `CONVERSATION_ENDED`
- Stream integration (mock LLM): when judge returns kick, conversation row gets `endedAt` and SSE includes `kicked`
- UI: composer disabled when `endedAt` present; overlay shown once on live `kicked` event

## Risks

- **False kicks** spoil trust: keep confidence threshold high and fail-open
- **Extra LLM call** latency/cost: use cheap model; skip judge when reply is very short / first N messages of a brand-new chat (optional guard: no kick before message count >= 4)
- **Drama vs easter egg**: theatrical UI is OK at the moment of discovery; do not market the feature

## Success criteria

- Player can be locked out of one conversation after a severe in-character refusal
- History remains readable; new chat with same character works immediately
- Server rejects further sends/regenerates on that conversation
- No anger meter or help-doc spoilers ship in this pass
- Live kick shows dramatic overlay; revisit shows quiet locked state

## Implementation order (for later plan)

1. Prisma fields + migration + API error code
2. Judge helper + wire into pipeline + SSE `kicked`
3. Block `prepareChat` when ended
4. Chat UI: overlay, locked banner, composer gate, start-new CTA
5. Tests

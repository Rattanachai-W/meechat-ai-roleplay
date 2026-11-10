import { describe, it, expect, vi, afterEach } from "vitest";
import { LlmError, streamChatCompletion, completeOnce } from "@/lib/ai/gateway";

/** สร้าง Response จำลอง OpenRouter SSE */
function sseResponse(events: string[], status = 200): Response {
  const body = events.map((e) => `data: ${e}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const CHUNK = (delta?: string | null, usage?: object) =>
  JSON.stringify({
    choices: delta !== undefined ? [{ delta: { content: delta } }] : [],
    ...(usage ? { usage } : {}),
  });

describe("LLM gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("ไม่มี LLM_API_KEY → LlmError MODEL_UNAVAILABLE", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    await expect(
      streamChatCompletion({ model: "x/y", messages: [] }).next()
    ).rejects.toMatchObject({ name: "LlmError", code: "MODEL_UNAVAILABLE" });
  });

  it("stream: parse delta + usage ถูกต้อง, ข้าม [DONE]", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    vi.stubEnv("LLM_API_URL", "");
    vi.stubEnv("LLM_MODEL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          CHUNK("สวัส"),
          CHUNK("ดีครับ"),
          CHUNK(null),
          JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        ])
      )
    );
    const chunks = [];
    for await (const c of streamChatCompletion({ model: "m", messages: [] })) chunks.push(c);
    expect(chunks).toEqual([
      { text: "สวัส" },
      { text: "ดีครับ" },
      { usage: { promptTokens: 10, completionTokens: 5 } },
    ]);
    // request body ต้องขอ usage + stream
    const call = (fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.stream).toBe(true);
    expect(body.usage).toEqual({ include: true });
    expect(body.model).toBe("m");
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("stream: ใช้ LLM_API_URL เป็น base (ตัด trailing slash)", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    vi.stubEnv("LLM_API_URL", "https://api.tokenme.limited/api/v1/");
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([CHUNK("ok")]));
    vi.stubGlobal("fetch", fetchMock);
    await streamChatCompletion({ model: "m", messages: [] }).next();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.tokenme.limited/api/v1/chat/completions"
    );
  });

  it("stream: LLM_MODEL บังคับ model ใน request body", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    vi.stubEnv("LLM_MODEL", "forced/model-id");
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([CHUNK("ok")]));
    vi.stubGlobal("fetch", fetchMock);
    await streamChatCompletion({ model: "ignored/from-db", messages: [] }).next();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("forced/model-id");
  });

  it("stream: payload error กลาง stream → MODEL_UNAVAILABLE", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse([JSON.stringify({ error: { message: "boom" } })]))
    );
    await expect(
      streamChatCompletion({ model: "m", messages: [] }).next()
    ).rejects.toMatchObject({ name: "LlmError", code: "MODEL_UNAVAILABLE" });
  });

  it("HTTP error mapping: 401/402/404/429/400-content/5xx/other", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    const cases: { status: number; body?: string; code: string; msgContains?: string }[] = [
      { status: 401, code: "MODEL_UNAVAILABLE", msgContains: "API key" },
      { status: 403, code: "MODEL_UNAVAILABLE" },
      { status: 402, code: "MODEL_UNAVAILABLE", msgContains: "เครดิต" },
      { status: 404, code: "MODEL_UNAVAILABLE", msgContains: "ไม่พบโมเดลนี้" },
      { status: 429, code: "RATE_LIMITED" },
      { status: 400, body: "content policy moderation filter", code: "CONTENT_REJECTED" },
      { status: 500, code: "MODEL_UNAVAILABLE" },
      { status: 418, code: "INTERNAL_ERROR" },
    ];
    for (const tc of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(tc.body ?? "err", { status: tc.status })));
      await expect(completeOnce({ model: "m", messages: [] }))
        .rejects.toSatisfy((e: unknown) => {
          const err = e as LlmError;
          return err instanceof Error && err.name === "LlmError" && err.code === tc.code &&
            (!tc.msgContains || err.message.includes(tc.msgContains));
        }, `${tc.status} → ${tc.code}`);
    }
  });

  it("completeOnce: parse choices+usage / fetch crash → MODEL_UNAVAILABLE", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({
          choices: [{ message: { content: "คำตอบ" } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        }), { status: 200 })
      )
    );
    const out = await completeOnce({ model: "m", messages: [] });
    expect(out.text).toBe("คำตอบ");
    expect(out.usage).toEqual({ promptTokens: 7, completionTokens: 3 });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ECONNREFUSED"); }));
    await expect(completeOnce({ model: "m", messages: [] })).rejects.toMatchObject({
      name: "LlmError",
      code: "MODEL_UNAVAILABLE",
    });
  });
});

import { BASE } from "./env";

export interface ApiResult {
  status: number;
  ok: boolean;
  headers: Headers;
  json: any;
  text: string;
}

export async function api(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  opts: { cookie?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined || opts.rawBody !== undefined) {
    headers["Content-Type"] = opts.headers?.["Content-Type"] ?? "application/json";
  }
  if (opts.cookie) headers.Cookie = opts.cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON (HTML page / SSE) — คืน null
  }
  return { status: res.status, ok: res.ok, headers: res.headers, json, text };
}

export interface SseEvent {
  event: string;
  data: any;
}

/** parse SSE text → events (event: X\ndata: {...}) */
export function parseSse(text: string): SseEvent[] {
  const out: SseEvent[] = [];
  for (const block of text.split("\n\n")) {
    if (!block.trim()) continue;
    const ev = /^event: (.+)$/m.exec(block);
    if (!ev) continue;
    let data: any = null;
    const dataLine = /^data: (.+)$/m.exec(block);
    if (dataLine) {
      try {
        data = JSON.parse(dataLine[1]);
      } catch {
        data = dataLine[1];
      }
    }
    out.push({ event: ev[1], data });
  }
  return out;
}

/** อ่าน SSE stream แบบ incremental — onEvent callback ทุก event */
export async function readSseStream(
  res: Response,
  onEvent: (ev: SseEvent) => void | Promise<void>
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      full += chunk;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const block of parts) {
        const evMatch = /^event: (.+)$/m.exec(block);
        if (!evMatch) continue;
        let data: any = null;
        const d = /^data: (.+)$/m.exec(block);
        if (d) {
          try {
            data = JSON.parse(d[1]);
          } catch {
            data = d[1];
          }
        }
        await onEvent({ event: evMatch[1], data });
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader อาจถูก release ไปแล้ว (stream จบเอง) — ไม่เป็นไร
    }
  }
  return full;
}

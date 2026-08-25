"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, RefreshCw, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuestPanel } from "@/features/chat/components/quest-panel";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  parentMessageId?: string | null;
}

interface ChatViewProps {
  conversationId: string;
  characterId: string;
  characterName: string;
  avatarUrl: string | null;
  intimacyLevel: number;
  intimacyLabel: string;
}

/** parse SSE stream (event/data pairs) — callback ต่อ event */
async function consumeSse(
  res: Response,
  handlers: { onDelta?: (t: string) => void; onDone?: (d: Record<string, unknown>) => void; onError?: (d: Record<string, unknown>) => void },
  signal?: AbortSignal
) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined as Uint8Array | undefined }));
      if (done) break;
      buffer += decoder.decode(value!, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        let name = "message";
        let data = "";
        for (const line of evt.split("\n")) {
          if (line.startsWith("event:")) name = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (name === "delta") handlers.onDelta?.(String(parsed.text ?? ""));
          else if (name === "done") handlers.onDone?.(parsed);
          else if (name === "error") handlers.onError?.(parsed);
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function ChatView(props: ChatViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [variantCounts, setVariantCounts] = useState<Record<string, number>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // API คืน role เป็น enum ตัวใหญ่ ("USER"/"ASSISTANT") ตาม DB — normalize เป็นตัวเล็ก
    // ให้ตรงกับ UiMessage ไม่งั้น bubble ผู้ใช้เรนเดอร์ฝั่งตัวละครหมด (บั๊กข้อความผิดฝั่ง)
    fetch(`/api/conversations/${props.conversationId}/messages?limit=50`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { messages: (Omit<UiMessage, "role"> & { role: string })[]; variantCounts: Record<string, number> }) => {
        const normalized = d.messages.map((m) => ({
          ...m,
          role: m.role.toLowerCase() === "user" ? ("user" as const) : ("assistant" as const),
        }));
        setMessages([...normalized].reverse());
        setVariantCounts(d.variantCounts ?? {});
      })
      .catch(() => toast.error("โหลดประวัติแชทไม่สำเร็จ"))
      .finally(() => setLoadingHistory(false));
  }, [props.conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);
  useEffect(() => {
    streamingRef.current?.scrollIntoView({ block: "end" });
  }, [streamingText]);

  /** เรียก SSE endpoint (chat / regenerate) แล้วอัปเดต state */
  const runStream = useCallback(
    async (url: string, body: unknown, opts?: { replaceMessageId?: string }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setStreamingText("");

      let acc = "";
      let donePayload: Record<string, unknown> | null = null;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null;
          throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
        }

        await consumeSse(
          res,
          {
            onDelta: (t) => {
              acc += t;
              setStreamingText(acc);
            },
            onDone: (d) => {
              donePayload = d;
            },
            onError: (d) => {
              throw new Error(String(d.code ?? "INTERNAL_ERROR"));
            },
          },
          controller.signal
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const msg =
            error instanceof Error && !error.message.startsWith("HTTP")
              ? error.message
              : "เกิดข้อผิดพลาด ลองอีกครั้ง";
          toast.error(msg);
        }
      } finally {
        abortRef.current = null;

        const aborted = Boolean(donePayload && (donePayload as Record<string, unknown>).aborted);
        const serverId = donePayload ? (donePayload as { messageId?: string }).messageId : undefined;
        const finalContent =
          donePayload && typeof (donePayload as { content?: string }).content === "string"
            ? (donePayload as { content?: string }).content!
            : acc;

        if (opts?.replaceMessageId) {
          // regenerate — update variant ใน place
          setMessages((prev) =>
            prev.map((m) =>
              m.id === opts.replaceMessageId
                ? { ...m, content: finalContent || m.content }
                : m
            )
          );
          if (serverId && serverId !== opts.replaceMessageId) {
            // variant ใหม่ id ต่างจากเดิม — สลับไปชี้ id ใหม่ + นับ variant เพิ่ม
            setMessages((prev) =>
              prev.map((m) => (m.id === opts.replaceMessageId ? { ...m, id: serverId } : m))
            );
            setVariantCounts((vc) => {
              const oldMsg = messages.find((m) => m.id === opts.replaceMessageId);
              const key = oldMsg?.parentMessageId ?? "";
              return { ...vc, [key]: Math.max(1, (vc[key] ?? 1)) };
            });
          }
        } else if ((finalContent.trim().length > 0 && serverId) || aborted) {
          setMessages((prev) => [
            ...prev,
            { id: serverId ?? `local-${Date.now()}`, role: "assistant", content: finalContent, status: aborted ? "ABORTED" : "COMPLETED" },
          ]);
        } else if (!aborted && finalContent.trim().length === 0) {
          toast.error("AI ไม่ได้ตอบกลับ ลองส่งใหม่อีกครั้ง");
        }

        setStreamingText(null);
        setIsStreaming(false);
        // แชทจบ = wallet ถูกหัก/คืนแล้ว — refresh ให้ badge พลังงานใน header ตามปัจจุบัน
        if (donePayload) router.refresh();
      }
    },
    [messages, router]
  );

  function send() {
    const content = input.trim();
    if (!content || isStreaming) return;
    setInput("");
    setMessages((prev) => [...prev, { id: `local-u-${Date.now()}`, role: "user", content }]);
    void runStream("/api/chat", { conversationId: props.conversationId, content });
  }

  function stop() {
    abortRef.current?.abort();
  }

  function regenerate(messageId: string) {
    if (isStreaming) return;
    setStreamingText("");
    void runStream(`/api/messages/${messageId}/regenerate`, {}, { replaceMessageId: messageId });
  }

  /** สลับ variant ด้วยลูกศร ‹ › */
  async function switchVariant(message: UiMessage, dir: -1 | 1) {
    if (!message.parentMessageId) return;
    try {
      const res = await fetch(`/api/messages/${message.id}/variants`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        variants: { id: string; content: string; isActiveVariant: boolean }[];
      };
      const list = data.variants;
      const idx = list.findIndex((v) => v.id === message.id);
      const next = list[(idx + dir + list.length) % list.length];
      if (!next || next.id === message.id) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, id: next.id, content: next.content } : m))
      );
      fetch(`/api/messages/${next.id}/activate`, { method: "POST" }).catch(() => {});
    } catch {
      // ปล่อย QUIET — UI ยังใช้ได้
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-2rem)] max-w-3xl flex-col md:h-[calc(100dvh-3.5rem-4rem)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link href={`/character/${props.characterId}`} aria-label="กลับไปหน้าตัวละคร">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 text-sm font-bold text-white">
            {props.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              props.characterName.slice(0, 1)
            )}
          </div>
          <p className="truncate font-semibold">{props.characterName}</p>
          {/* ความสนิท — router.refresh หลัง claim รางวัลทำให้ badge update เอง */}
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            title={`ความสนิท: ${props.intimacyLabel}`}
          >
            <Heart className="size-3 fill-current" aria-hidden />Lv.{props.intimacyLevel}
          </span>
        </div>
        <QuestPanel characterId={props.characterId} />
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {loadingHistory && <p className="text-center text-sm text-muted-foreground">กำลังโหลด...</p>}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            characterName={props.characterName}
            variantCount={m.parentMessageId ? (variantCounts[m.parentMessageId] ?? 0) : 0}
            disabled={isStreaming}
            onRegenerate={() => regenerate(m.id)}
            onSwitch={(dir) => switchVariant(m, dir)}
          />
        ))}
        {streamingText !== null && (
          <div ref={streamingRef} className="flex justify-start">
            {streamingText ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm">
                {streamingText}
                <span
                  className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground/70 align-middle"
                  aria-hidden
                />
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-4 py-3.5"
                role="status"
                aria-label="กำลังพิมพ์"
              >
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-2 animate-bounce rounded-full bg-muted-foreground/70"
                    style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <footer className="sticky bottom-16 space-y-1 border-t border-border pt-3 md:bottom-0">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`พิมพ์ข้อความถึง ${props.characterName}...`}
            className="max-h-36 flex-1 resize-none rounded-2xl"
            disabled={isStreaming}
            aria-label="ข้อความ"
          />
          {isStreaming ? (
            <Button onClick={stop} size="icon" variant="outline" className="size-11 shrink-0 rounded-full" aria-label="หยุด">
              <Square className="size-4 fill-current" aria-hidden />
            </Button>
          ) : (
            <Button
              onClick={send}
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={input.trim().length === 0}
              aria-label="ส่งข้อความ"
            >
              <Send className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          Enter ส่ง • Shift+Enter ขึ้นบรรทัดใหม่ • พลังงานถูกหักตามการใช้งานจริง (ส่วนเกินคืนอัตโนมัติ)
        </p>
      </footer>
    </div>
  );
}

function Bubble({
  message,
  characterName,
  variantCount,
  disabled,
  onRegenerate,
  onSwitch,
}: {
  message: UiMessage;
  characterName: string;
  variantCount: number;
  disabled: boolean;
  onRegenerate: () => void;
  onSwitch: (dir: -1 | 1) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm ${
          isUser
            ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-2xl rounded-bl-sm bg-muted"
        } ${message.status === "ABORTED" ? "opacity-70" : ""}`}
      >
        {message.content}
        {message.status === "ABORTED" && (
          <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">(หยุดไว้)</span>
        )}
      </div>

      {!isUser && (
        <div className="mt-1 flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {variantCount > 1 && (
            <>
              <button
                type="button"
                onClick={() => onSwitch(-1)}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="variant ก่อนหน้า"
                disabled={disabled}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="text-[10px]">{variantCount} เวอร์ชัน</span>
              <button
                type="button"
                onClick={() => onSwitch(1)}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="variant ถัดไป"
                disabled={disabled}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled}
            className="flex items-center gap-1 rounded p-0.5 text-xs hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label={`ให้ ${characterName} ตอบใหม่`}
          >
            <RefreshCw className="size-3.5" aria-hidden /> ตอบใหม่
          </button>
        </div>
      )}
    </div>
  );
}

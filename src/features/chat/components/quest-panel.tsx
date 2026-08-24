"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface QuestItem {
  id: string;
  goalType: string;
  target: number;
  title: string;
  description: string;
  rewardIntimacy: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface AffinityInfo {
  points: number;
  level: number;
  label: string;
  nextLevelAt: number | null;
}

const GOAL_UNIT: Record<string, string> = {
  MESSAGES: "ข้อความ",
  STREAK_DAYS: "วันที่แชท",
  AI_TOPIC: "ภารกิจพิเศษ",
};

/** แผงภารกิจประจำตัวละคร — เปิดจาก header หน้าแชท (รางวัล = ค่าความสนิท) */
export function QuestPanel({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quests, setQuests] = useState<QuestItem[] | null>(null);
  const [affinity, setAffinity] = useState<AffinityInfo | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/characters/${characterId}/quests`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { quests: QuestItem[]; affinity?: AffinityInfo }) => {
        setQuests(d.quests);
        setAffinity(d.affinity ?? null);
      })
      .catch(() => setQuests(null));
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load]);

  const claimableCount = quests?.filter((q) => q.completed && !q.claimed).length ?? 0;

  async function claim(quest: QuestItem) {
    setClaimingId(quest.id);
    try {
      const res = await fetch(`/api/quests/${quest.id}/claim`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { claimed?: boolean; amount?: number; affinity?: AffinityInfo; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.claimed) {
        throw new Error(data?.error?.message ?? "รับรางวัลไม่สำเร็จ ลองอีกครั้ง");
      }
      toast.success(`ความสนิท +${data.amount} ❤${data.affinity ? ` — Lv.${data.affinity.level} ${data.affinity.label}` : ""}`);
      setQuests(
        (prev) =>
          prev?.map((q) =>
            q.id === quest.id
              ? { ...q, claimed: true, progress: Math.max(q.progress, q.target) }
              : q
          ) ?? prev
      );
      if (data.affinity) setAffinity(data.affinity);
      // badge ความสนิทใน header ต้องตามยอดล่าสุด (server component)
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "รับรางวัลไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative ml-auto shrink-0 rounded-full" aria-label="เปิดแผงภารกิจ">
          <ScrollText className="size-4" aria-hidden />
          ภารกิจ
          {claimableCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-rose-500"
              aria-label={`มีภารกิจรับรางวัลได้ ${claimableCount} รายการ`}
            />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ภารกิจของตัวละคร</DialogTitle>
          <DialogDescription>
            ทำภารกิจผ่านการแชทเพื่อสะสมค่าความสนิท — ยิ่งสนิท ตัวละครยิ่งพูดให้เป็นธรรมชาติมากขึ้น
          </DialogDescription>
        </DialogHeader>

        {/* แถบความสนิทปัจจุบัน */}
        {affinity && (
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <Heart className="size-4 fill-rose-500 text-rose-500" aria-hidden />
                Lv.{affinity.level} {affinity.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {affinity.nextLevelAt !== null
                  ? `${affinity.points}/${affinity.nextLevelAt}`
                  : `${affinity.points} คะแนน`}
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={affinity.nextLevelAt !== null ? Math.min(100, Math.round((affinity.points / affinity.nextLevelAt) * 100)) : 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="ความคืบหน้าความสนิท"
            >
              <div
                className="h-full rounded-full bg-rose-500 transition-all"
                style={{
                  width:
                    affinity.nextLevelAt !== null
                      ? `${Math.min(100, Math.round((affinity.points / affinity.nextLevelAt) * 100))}%`
                      : "100%",
                }}
              />
            </div>
          </div>
        )}

        {quests === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">โหลดภารกิจไม่สำเร็จ</p>
        ) : quests.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีภารกิจสำหรับตัวละครนี้</p>
        ) : (
          <ul className="space-y-3">
            {quests.map((q) => {
              const pct = Math.min(100, Math.round((Math.min(q.progress, q.target) / q.target) * 100));
              return (
                <li key={q.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{q.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{q.description}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                      +{q.rewardIntimacy}
                      <Heart className="size-3 fill-current" aria-hidden />
                    </span>
                  </div>

                  {/* ภารกิจสายสนทนา (AI_TOPIC) — AI ตัดสินหลังแชท ไม่มีตัวเลข progress ให้ดู */}
                  {q.goalType === "AI_TOPIC" ? (
                    <p className="mt-2.5 text-[11px] text-muted-foreground">
                      {q.completed
                        ? "✓ สำเร็จแล้วจากบทสนทนาของคุณ"
                        : "✨ สนทนาไปเรื่อย ๆ AI จะตัดสินให้อัตโนมัติเมื่อทำสำเร็จ"}
                    </p>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`ความคืบหน้า ${q.title}`}
                      >
                        <div
                          className={`h-full rounded-full transition-all ${q.completed ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {Math.min(q.progress, q.target)}/{q.target} {GOAL_UNIT[q.goalType] ?? ""}
                      </span>
                    </div>
                  )}

                  <div className="mt-2.5 flex justify-end">
                    {q.claimed ? (
                      <span className="text-xs font-medium text-muted-foreground">✓ รับรางวัลแล้ว</span>
                    ) : q.completed ? (
                      <Button size="sm" onClick={() => claim(q)} disabled={claimingId === q.id}>
                        {claimingId === q.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                        รับรางวัล +{q.rewardIntimacy} ❤
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

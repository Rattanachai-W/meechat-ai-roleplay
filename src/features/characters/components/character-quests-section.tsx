import Link from "next/link";
import { Heart, Lock, ScrollText } from "lucide-react";
import type { QuestWithProgress, AffinitySummary } from "@/lib/quests/service";

const GOAL_UNIT: Record<string, string> = {
  MESSAGES: "ข้อความ",
  STREAK_DAYS: "วันที่แชท",
  AI_TOPIC: "ภารกิจพิเศษ",
};

/**
 * Section ภารกิจ + ความสนิทบนหน้าตัวละคร (server-rendered)
 * รางวัลเป็นค่าความสนิท — การทำภารกิจ/รับรางวัลเกิดในหน้าแชท (QuestPanel)
 */
export function CharacterQuestsSection({
  quests,
  affinity,
  isLoggedIn,
}: {
  quests: QuestWithProgress[];
  affinity: AffinitySummary | null;
  isLoggedIn: boolean;
}) {
  return (
    <section aria-label="ภารกิจของตัวละคร">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <ScrollText className="size-4" aria-hidden /> ภารกิจ &amp; ความสนิท
        </h2>
        {affinity && (
          <span
            className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400"
            title="ความสนิทของคุณกับตัวละครนี้"
          >
            <Heart className="size-3.5 fill-current" aria-hidden />
            ความสนิท Lv.{affinity.level} {affinity.label}
          </span>
        )}
      </div>

      {/* แถบความสนิทของผู้ใช้ (เฉพาะเมื่อล็อกอิน) */}
      {affinity && (
        <div className="mb-4 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">ระดับความสัมพันธ์ปัจจุบัน</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {affinity.nextLevelAt !== null
                ? `${affinity.points}/${affinity.nextLevelAt} คะแนน`
                : `${affinity.points} คะแนน — ระดับสูงสุด`}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={
              affinity.nextLevelAt !== null
                ? Math.min(100, Math.round((affinity.points / affinity.nextLevelAt) * 100))
                : 100
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าความสนิท"
          >
            <div
              className="h-full rounded-full bg-rose-500"
              style={{
                width:
                  affinity.nextLevelAt !== null
                    ? `${Math.min(100, Math.round((affinity.points / affinity.nextLevelAt) * 100))}%`
                    : "100%",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            ยิ่งความสนิทสูง ตัวละครยิ่งปรับน้ำเสียงการพูดให้เข้าใกล้คุณมากขึ้น
          </p>
        </div>
      )}

      {quests.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีภารกิจสำหรับตัวละครนี้</p>
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

                {q.goalType === "AI_TOPIC" ? (
                  <p className="mt-2.5 text-[11px] text-muted-foreground">
                    {q.completed
                      ? "✓ สำเร็จแล้วจากบทสนทนา"
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
                        className={`h-full rounded-full ${q.completed ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {Math.min(q.progress, q.target)}/{q.target} {GOAL_UNIT[q.goalType] ?? ""}
                    </span>
                  </div>
                )}

                {q.claimed && (
                  <p className="mt-2 text-right text-xs font-medium text-muted-foreground">✓ รับรางวัลแล้ว</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isLoggedIn && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />{" "}
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            เข้าสู่ระบบ
          </Link>{" "}
          เพื่อเริ่มทำภารกิจและสะสมความสนิทกับตัวละคร
        </p>
      )}
    </section>
  );
}

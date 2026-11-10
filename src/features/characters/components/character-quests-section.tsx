import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Heart, Lock, ScrollText } from "lucide-react";
import type { QuestWithProgress, AffinitySummary } from "@/lib/quests/service";

const GOAL_UNIT_KEY: Record<string, "unitMessages" | "unitStreakDays" | "unitAiTopic"> = {
  MESSAGES: "unitMessages",
  STREAK_DAYS: "unitStreakDays",
  AI_TOPIC: "unitAiTopic",
};

/**
 * Character quests and intimacy on the character profile (server-rendered).
 * Rewards are intimacy; claiming happens in chat (QuestPanel).
 */
export async function CharacterQuestsSection({
  quests,
  affinity,
  isLoggedIn,
}: {
  quests: QuestWithProgress[];
  affinity: AffinitySummary | null;
  isLoggedIn: boolean;
}) {
  const t = await getTranslations("Character");
  const tq = await getTranslations("Quests");
  const tNav = await getTranslations("Nav");

  return (
    <section aria-label={t("questsSectionAria")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <ScrollText className="size-4" aria-hidden /> {t("questsAndAffinity")}
        </h2>
        {affinity && (
          <span
            className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400"
            title={t("affinityLevelTitle")}
          >
            <Heart className="size-3.5 fill-current" aria-hidden />
            {t("affinityLevel", { level: affinity.level, label: affinity.label })}
          </span>
        )}
      </div>

      {affinity && (
        <div className="mb-4 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("relationshipNow")}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {affinity.nextLevelAt !== null
                ? t("pointsProgress", {
                    current: affinity.points,
                    target: affinity.nextLevelAt,
                  })
                : t("maxLevelLabel", { points: affinity.points })}
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
            aria-label={t("affinityBarAria")}
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
          <p className="mt-2 text-xs text-muted-foreground">{t("affinityHint")}</p>
        </div>
      )}

      {quests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noQuestsCharacter")}</p>
      ) : (
        <ul className="space-y-3">
          {quests.map((q) => {
            const pct = Math.min(100, Math.round((Math.min(q.progress, q.target) / q.target) * 100));
            const unitKey = GOAL_UNIT_KEY[q.goalType];
            const unitLabel = unitKey ? tq(unitKey) : "";
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
                    {q.completed ? t("aiTopicComplete") : t("aiTopicPending")}
                  </p>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${q.title}`}
                    >
                      <div
                        className={`h-full rounded-full ${q.completed ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {Math.min(q.progress, q.target)}/{q.target} {unitLabel}
                    </span>
                  </div>
                )}

                {q.claimed && (
                  <p className="mt-2 text-right text-xs font-medium text-muted-foreground">{t("questClaimed")}</p>
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
            {tNav("login")}
          </Link>{" "}
          {t("loginForQuests")}
        </p>
      )}
    </section>
  );
}

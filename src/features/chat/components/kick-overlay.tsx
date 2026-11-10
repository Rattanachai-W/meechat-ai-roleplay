"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function KickOverlay({
  characterId,
  characterName,
  avatarUrl,
  open,
  onDismiss,
}: {
  characterId: string;
  characterName: string;
  avatarUrl: string | null;
  open: boolean;
  onDismiss: () => void;
}) {
  const t = useTranslations("Chat");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!open) return null;

  async function startNew() {
    setStarting(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(err?.error?.message ?? tCommon("errorGeneric"));
      }
      const data = (await res.json()) as { conversation: { id: string } };
      router.push(`/chat/${data.conversation.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("errorGeneric"));
      setStarting(false);
    }
  }

  return (
    <div
      className={
        reduceMotion
          ? "fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          : "fixed inset-0 z-50 flex animate-in fade-in items-center justify-center bg-black/85 p-4 duration-300"
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-overlay-title"
    >
      <div
        className={
          reduceMotion
            ? "w-full max-w-md rounded-2xl border border-rose-500/50 bg-background p-6 shadow-2xl"
            : "w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-2 rounded-2xl border border-rose-500/50 bg-background p-6 shadow-2xl duration-300"
        }
      >
        <div className="mb-4 flex flex-col items-center gap-3 text-center">
          <div
            className={
              reduceMotion
                ? "grid size-20 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-rose-600 to-orange-500 text-2xl font-bold text-white ring-4 ring-rose-500/30"
                : "grid size-20 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-rose-600 to-orange-500 text-2xl font-bold text-white ring-4 ring-rose-500/40 motion-safe:animate-pulse"
            }
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              characterName.slice(0, 1)
            )}
          </div>
          <h2
            id="kick-overlay-title"
            className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400"
          >
            {t("kickOverlayTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("kickOverlayBody", { name: characterName })}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onDismiss} className="rounded-full">
            {t("kickOverlayDismiss")}
          </Button>
          <Button
            type="button"
            onClick={() => void startNew()}
            disabled={starting}
            className="rounded-full bg-rose-600 text-white hover:bg-rose-700"
          >
            {t("kickStartNew", { name: characterName })}
          </Button>
        </div>
      </div>
    </div>
  );
}

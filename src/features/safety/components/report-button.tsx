"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REASONS = [
  "spam",
  "harassment",
  "illegal",
  "underage",
  "other",
] as const;

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "CHARACTER" | "MESSAGE" | "CREATOR";
  targetId: string;
}) {
  const t = useTranslations("Report");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details: details || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed");
      toast.success(t("success"));
      setOpen(false);
      setDetails("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Flag className="size-4" aria-hidden /> {t("title")}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-border bg-background p-3 shadow-lg">
          <p className="text-sm font-medium">{t("reason")}</p>
          <div className="flex flex-wrap gap-1" role="listbox">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="option"
                aria-selected={reason === r}
                onClick={() => setReason(r)}
                className={`rounded-full border px-2 py-1 text-xs ${
                  reason === r ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Input
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t("details")}
            aria-label={t("details")}
          />
          <Button size="sm" className="w-full rounded-full" disabled={busy} onClick={submit}>
            {t("submit")}
          </Button>
        </div>
      )}
    </div>
  );
}

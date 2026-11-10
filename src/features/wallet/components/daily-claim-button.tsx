"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Gift, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DailyClaimButton({
  initialClaimedToday,
  amount,
}: {
  initialClaimedToday: boolean;
  amount: number;
}) {
  const router = useRouter();
  const t = useTranslations("Wallet");
  const [claimed, setClaimed] = useState(initialClaimedToday);
  const [loading, setLoading] = useState(false);

  async function claim() {
    setLoading(true);
    try {
      const res = await fetch("/api/energy/daily-claim", { method: "POST" });
      const data = (await res.json()) as
        | { claimed: boolean; amount: number }
        | { error: { message: string } };
      if ("error" in data) throw new Error(data.error.message);
      if (data.claimed) {
        setClaimed(true);
        toast.success(t("dailyClaimSuccess", { amount: data.amount }));
        router.refresh();
      } else {
        setClaimed(true);
        toast.info(t("dailyClaimed"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dailyClaimFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={claim} disabled={claimed || loading} className="rounded-full">
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : claimed ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Gift className="size-4" aria-hidden />
      )}
      {claimed ? t("dailyClaimed") : t("dailyClaim", { amount })}
    </Button>
  );
}

import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Metadata } from "next";
import { Zap, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrCreateWalletSummary, getDailyClaimStatus } from "@/lib/energy/service";
import { prisma } from "@/lib/db/prisma";
import { DailyClaimButton } from "@/features/wallet/components/daily-claim-button";
import { EnergyShop } from "@/features/wallet/components/energy-shop";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toBcp47, type AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Wallet" });
  return { title: t("metaTitle") };
}

function transactionTypeLabel(
  t: Awaited<ReturnType<typeof getTranslations<"Wallet">>>,
  type: string
): string {
  const map: Record<string, string> = {
    DAILY_REWARD: t("typeDaily"),
    PURCHASE: t("typePurchase"),
    CHAT_USAGE: t("typeChat"),
    REGENERATE: t("typeRegenerate"),
    REFUND: t("typeRefund"),
    ADMIN_ADJUSTMENT: t("typeAdmin"),
    PROMOTION: t("typePromotion"),
    SUBSCRIPTION: t("typeSubscription"),
    QUEST_REWARD: t("typeQuest"),
  };
  return map[type] ?? type;
}

export default async function WalletPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations("Wallet");
  const bcp47 = toBcp47(locale as AppLocale);

  const user = await getCurrentUser();
  if (!user) {
    const loc = await getLocale();
    redirect({ href: "/login", locale: loc });
    return;
  }

  const [wallet, transactions, claimStatus] = await Promise.all([
    getOrCreateWalletSummary(user.id),
    prisma.energyTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getDailyClaimStatus(user.id),
  ]);

  const fmt = (n: number) => n.toLocaleString(bcp47);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<Zap className="size-6 fill-amber-400 text-amber-400" aria-hidden />}
      />

      <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent">
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-500/15">
            <Zap className="size-7 fill-amber-400 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-3xl font-black tracking-tight tabular-nums">{fmt(wallet.totalBalance)}</p>
            <p className="text-xs text-muted-foreground">
              {t("free", { n: fmt(wallet.freeBalance) })} · {t("paid", { n: fmt(wallet.paidBalance) })} ·{" "}
              {t("spent", { n: fmt(wallet.lifetimeSpent) })}
            </p>
          </div>
          <div className="ml-auto">
            <DailyClaimButton
              initialClaimedToday={claimStatus.claimedToday}
              amount={claimStatus.amount}
            />
          </div>
        </CardContent>
      </Card>

      <EnergyShop />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-fuchsia-500" aria-hidden /> {t("historyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-5" aria-hidden />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {transactionTypeLabel(t, tx.type)}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right font-semibold tabular-nums ${
                      tx.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {fmt(tx.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("balanceAfter", { n: fmt(tx.balanceAfter) })}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleString(bcp47, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}

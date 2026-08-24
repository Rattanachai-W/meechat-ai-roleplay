import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Zap, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrCreateWalletSummary } from "@/lib/energy/service";
import { prisma } from "@/lib/db/prisma";
import { DailyClaimButton } from "@/features/wallet/components/daily-claim-button";
import { EnergyShop } from "@/features/wallet/components/energy-shop";

export const metadata: Metadata = { title: "พลังงานของฉัน — MeeChat" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  DAILY_REWARD: "รางวัลรายวัน",
  PURCHASE: "ซื้อพลังงาน",
  CHAT_USAGE: "ใช้แชท",
  REGENERATE: "ตอบใหม่",
  REFUND: "คืนพลังงาน",
  ADMIN_ADJUSTMENT: "ปรับโดยแอดมิน",
  PROMOTION: "โปรโมชั่น",
  SUBSCRIPTION: "สมาชิก",
};

/** ตรวจว่าเคลมวันนี้ (Asia/Bangkok) ไปหรือยัง — ดูจาก ledger */
async function claimedToday(userId: string): Promise<boolean> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const row = await prisma.energyTransaction.findFirst({
    where: {
      userId,
      type: "DAILY_REWARD",
      idempotencyKey: `daily:${userId}:${today}`,
    },
    select: { id: true },
  });
  return Boolean(row);
}

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [wallet, transactions, claimed] = await Promise.all([
    getOrCreateWalletSummary(user.id),
    prisma.energyTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    claimedToday(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">พลังงานของฉัน</h1>

      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
        <CardContent className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-full bg-amber-500/15">
            <Zap className="size-7 fill-amber-400 text-amber-400" aria-hidden />
          </div>
          <div>
            <p className="text-3xl font-black tabular-nums">
              {wallet.totalBalance.toLocaleString("th-TH")}
            </p>
            <p className="text-xs text-muted-foreground">
              ฟรี {wallet.freeBalance.toLocaleString("th-TH")} • ซื้อ{" "}
              {wallet.paidBalance.toLocaleString("th-TH")} • ใช้ไปแล้วรวม{" "}
              {wallet.lifetimeSpent.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="ml-auto">
            <DailyClaimButton initialClaimedToday={claimed} />
          </div>
        </CardContent>
      </Card>

      <EnergyShop />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-fuchsia-500" aria-hidden /> ประวัติการเติม/ใช้พลังงาน
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ยังไม่มีรายการ — เริ่มแชทได้เลย!
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {TYPE_LABELS[t.type] ?? t.type}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right font-semibold tabular-nums ${
                      t.amount > 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {t.amount > 0 ? "+" : ""}
                    {t.amount.toLocaleString("th-TH")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    คงเหลือ {t.balanceAfter.toLocaleString("th-TH")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("th-TH", {
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

      <p className="text-xs text-muted-foreground">
        * 1 พลังงาน ≈ 1,000 tokens ของโมเดลพื้นฐาน คูณตัวคูณตามโมเดลที่เลือก —
        ระบบจองพลังงานก่อนส่ง แล้วคืนส่วนเกินเมื่อตอบจบ
      </p>
    </div>
  );
}

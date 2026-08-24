"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Pkg {
  id: string;
  coins: number;
  priceThb: number;
  label: string;
}

/**
 * ร้านเติมพลังงาน (docs/creator-system.md §5)
 * mode = mock → ป้าย "โหมดทดสอบ" + credit ทันที; off → แจ้งว่ายังไม่เปิด; gateway จริง → TODO
 */
export function EnergyShop() {
  const router = useRouter();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [mode, setMode] = useState<"off" | "mock" | "gateway">("off");
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/energy/purchase")
      .then((r) => r.json())
      .then((d: { packages?: Pkg[]; paymentsEnabled?: boolean; mode?: string | null }) => {
        setPackages(d.packages ?? []);
        setMode(!d.paymentsEnabled ? "off" : d.mode === "mock" ? "mock" : "gateway");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function buy(pkg: Pkg) {
    setBuying(pkg.id);
    try {
      const res = await fetch("/api/energy/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const data = (await res.json()) as
        | { purchased: boolean; coins: number }
        | { error: { message: string } };
      if ("error" in data) throw new Error(data.error.message);
      toast.success(`เติม +${data.coins.toLocaleString("th-TH")} พลังงานสำเร็จ!`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เติมพลังงานไม่สำเร็จ");
    } finally {
      setBuying(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4 text-amber-500" aria-hidden /> เติมพลังงาน
          {mode === "mock" && (
            <span className="ml-auto flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
              <FlaskConical className="size-3" aria-hidden /> โหมดทดสอบ — ไม่มีการตัดเงินจริง
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">กำลังโหลดแพ็กเกจ...</p>
        ) : mode === "off" ? (
          <p className="py-2 text-sm text-muted-foreground">
            ระบบชำระเงินยังไม่เปิดใช้งาน — รับพลังงานรายวันฟรีได้จากปุ่มด้านบน
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => buy(pkg)}
                disabled={buying !== null}
                className="rounded-xl border border-border p-4 text-left transition-colors hover:border-amber-500/50 hover:bg-amber-500/5 disabled:opacity-50"
              >
                <p className="font-semibold">{pkg.label}</p>
                <p className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                  ฿{pkg.priceThb.toLocaleString("th-TH")}
                  {buying === pkg.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <span className="font-medium text-amber-500">ซื้อ</span>
                  )}
                </p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

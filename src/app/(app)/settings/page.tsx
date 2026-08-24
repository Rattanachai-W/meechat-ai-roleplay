import Link from "next/link";
import type { Metadata } from "next";
import { UserRound, Wallet, Sparkles, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { SignOutButton } from "@/features/shell/components/sign-out-button";

export const metadata: Metadata = { title: "ตั้งค่า — MeeChat" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  let dbRole = null;
  if (user) {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { displayName: true, createdAt: true } }).catch(() => null);
    dbRole = row;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">ตั้งค่า</h1>

      {!user ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่ได้เข้าสู่ระบบ —{" "}
            <Link href="/login" className="text-primary underline">
              เข้าสู่ระบบ
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-fuchsia-500" aria-hidden /> บัญชีของคุณ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>
                <span className="text-muted-foreground">อีเมล:</span> {user.email}
              </p>
              {dbRole?.createdAt && (
                <p>
                  <span className="text-muted-foreground">สมาชิกตั้งแต่:</span>{" "}
                  {new Date(dbRole.createdAt).toLocaleDateString("th-TH", { dateStyle: "long" })}
                </p>
              )}
              <div className="pt-3 flex flex-wrap gap-2">
                <Link
                  href="/wallet"
                  className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-sm font-medium text-amber-500 hover:bg-amber-500/20"
                >
                  <Wallet className="size-4" aria-hidden /> พลังงาน & ประวัติใช้งาน
                </Link>
                <Link
                  href="/persona"
                  className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm hover:bg-muted"
                >
                  <Sparkles className="size-4" aria-hidden /> Persona ของฉัน
                </Link>
                <SignOutButton />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-sky-400" aria-hidden /> ความปลอดภัย & สิทธิ์
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• บทสนทนา ความจำ และ persona เห็นได้เฉพาะคุณ (มี RLS ซ้อนอีกชั้น)</p>
              <p>• ตัวละคร PRIVATE จะไม่ปรากฏในหน้าค้นพบแก่ผู้อื่น</p>
              <p>• เจอเนื้อหาไม่เหมาะสม สามารถรายงานได้ในเวอร์ชันถัดไป</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

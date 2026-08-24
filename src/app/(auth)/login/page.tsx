import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabaseConfigured } from "@/lib/env";
import { AuthForm } from "@/features/auth/components/auth-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/discover");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        Mee<span className="text-primary">Chat</span>
      </Link>

      {isSupabaseConfigured() ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>ยินดีต้อนรับกลับมา</CardTitle>
            <CardDescription>เข้าสู่ระบบเพื่อเริ่ม Roleplay กับตัวละคร AI ของคุณ</CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm />
          </CardContent>
        </Card>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-center text-2xl font-bold">ยังไม่ได้ตั้งค่า Supabase</h1>
          <Alert>
            <AlertTitle>ต้องตั้งค่า Environment Variables ก่อนใช้งาน</AlertTitle>
            <AlertDescription>
              คัดลอก <code className="bg-muted rounded px-1 py-0.5">.env.example</code> เป็น{" "}
              <code className="bg-muted rounded px-1 py-0.5">.env</code> แล้วใส่ค่า{" "}
              <code className="bg-muted rounded px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> และ{" "}
              <code className="bg-muted rounded px-1 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              จาก Supabase Dashboard → Project Settings → API จากนั้น restart dev server
            </AlertDescription>
          </Alert>
        </div>
      )}
    </main>
  );
}

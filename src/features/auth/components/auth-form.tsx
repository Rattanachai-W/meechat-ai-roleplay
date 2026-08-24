"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({
  email: z.email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
});

type AuthMode = "signin" | "signup";

function toThaiErrorMessage(errorCode: string | undefined, fallback: string): string {
  switch (errorCode) {
    case "invalid_credentials":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "user_already_exists":
      return "อีเมลนี้ถูกใช้สมัครแล้ว";
    case "email_not_confirmed":
      return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ (เช็คกล่องจดหมายของคุณ)";
    case "over_request_rate_limit":
      return "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    case "weak_password":
      return "รหัสผ่านไม่ปลอดภัยพอ กรุณาใช้รหัสผ่านที่ยากขึ้น";
    default:
      return fallback;
  }
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        router.replace("/discover");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp(parsed.data);
        if (error) throw error;
        if (data.session) {
          router.replace("/discover");
          router.refresh();
        } else {
          // เปิด email confirmation ไว้ — Supabase จะส่งลิงก์ยืนยันไปที่อีเมล
          toast.success("สมัครสมาชิกสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันตัวตน");
        }
      }
    } catch (err) {
      const error = err as { code?: string; message?: string };
      toast.error(toThaiErrorMessage(error.code, error.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"));
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error.message ?? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as AuthMode)} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">เข้าสู่ระบบ</TabsTrigger>
        <TabsTrigger value="signup">สมัครสมาชิก</TabsTrigger>
      </TabsList>

      <TabsContent value={mode}>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </Button>
        </form>
      </TabsContent>

      <div className="my-4 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">หรือ</span>
        <Separator className="flex-1" />
      </div>

      <Button variant="outline" type="button" className="w-full" onClick={signInWithGoogle} disabled={loading}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-4">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
        ดำเนินการต่อด้วย Google
      </Button>
    </Tabs>
  );
}

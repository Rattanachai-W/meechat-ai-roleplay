"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth/auth-client";

type AuthMode = "signin" | "signup";

export function AuthForm() {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const credentialsSchema = useMemo(
    () =>
      z.object({
        email: z.email(t("invalidEmail")),
        password: z.string().min(8, t("passwordMin")),
      }),
    [t]
  );

  function toLocalizedErrorMessage(errorCode: string | undefined, fallback: string): string {
    switch (errorCode) {
      case "INVALID_EMAIL_OR_PASSWORD":
      case "invalid_credentials":
        return t("errInvalidCredentials");
      case "USER_ALREADY_EXISTS":
      case "user_already_exists":
        return t("errUserExists");
      case "email_not_confirmed":
        return t("errEmailNotConfirmed");
      case "TOO_MANY_REQUESTS":
      case "over_request_rate_limit":
        return t("errRateLimit");
      case "PASSWORD_TOO_SHORT":
      case "weak_password":
        return t("errWeakPassword");
      default:
        return fallback;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("validationError"));
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await authClient.signIn.email({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      } else {
        const { error } = await authClient.signUp.email({
          email: parsed.data.email,
          password: parsed.data.password,
          name: parsed.data.email.split("@")[0] || "user",
        });
        if (error) throw error;
      }
      router.replace("/discover");
      router.refresh();
    } catch (err) {
      const error = err as { code?: string; message?: string };
      toast.error(toLocalizedErrorMessage(error.code, error.message ?? tCommon("errorGeneric")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as AuthMode)} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">{t("signIn")}</TabsTrigger>
        <TabsTrigger value="signup">{t("signUp")}</TabsTrigger>
      </TabsList>

      <TabsContent value={mode}>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
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
            <Label htmlFor="password">{t("password")}</Label>
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
            {mode === "signin" ? t("signIn") : t("signUp")}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

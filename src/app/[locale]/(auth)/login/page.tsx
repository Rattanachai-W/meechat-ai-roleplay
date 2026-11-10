import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAuthConfigured } from "@/lib/env";
import { AuthForm } from "@/features/auth/components/auth-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");
  return { title: t("metaTitle") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  const user = await getCurrentUser();
  if (user) {
    const activeLocale = await getLocale();
    redirect({ href: "/discover", locale: activeLocale });
    return;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        Mee<span className="text-primary">Chat</span>
      </Link>

      {isAuthConfigured() ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("loginWelcome")}</CardTitle>
            <CardDescription>{t("loginWelcomeSub")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm />
          </CardContent>
        </Card>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-center text-2xl font-bold">{t("authConfigTitle")}</h1>
          <Alert>
            <AlertTitle>{t("authConfigAlertTitle")}</AlertTitle>
            <AlertDescription>{t("authConfigAlertDescription")}</AlertDescription>
          </Alert>
          <p className="text-center text-sm text-muted-foreground">{t("authConfigHint")}</p>
        </div>
      )}
    </main>
  );
}

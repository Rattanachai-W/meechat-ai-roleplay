import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserRound, Wallet, Sparkles, ShieldCheck, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { SignOutButton } from "@/features/shell/components/sign-out-button";
import { LocalePrefsForm } from "@/features/settings/components/locale-prefs-form";
import { AccountDataActions } from "@/features/settings/components/account-data-actions";
import { Link } from "@/i18n/navigation";
import { toBcp47, type AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Settings" });
  return { title: t("title") };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  const user = await getCurrentUser();

  let dbUser: {
    displayName: string | null;
    createdAt: Date;
    preferredLocale: AppLocale;
    timezone: string;
    preferredCurrency: "THB" | "USD";
  } | null = null;

  if (user) {
    const row = await prisma.user
      .findUnique({
        where: { id: user.id },
        select: {
          displayName: true,
          createdAt: true,
          preferredLocale: true,
          timezone: true,
          preferredCurrency: true,
        },
      })
      .catch(() => null);
    if (row) {
      dbUser = {
        ...row,
        preferredLocale: row.preferredLocale === "en" ? "en" : "th",
      };
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} />

      {!user ? (
        <EmptyState
          icon={<UserRound className="size-5" aria-hidden />}
          title={t("notLoggedIn")}
          action={
            <Button asChild className="rounded-full">
              <Link href="/login">{t("loginLink")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-fuchsia-500" aria-hidden /> {t("account")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>
                <span className="text-muted-foreground">{t("email")}</span> {user.email}
              </p>
              {dbUser?.createdAt && (
                <p>
                  <span className="text-muted-foreground">{t("memberSince")}</span>{" "}
                  {new Date(dbUser.createdAt).toLocaleDateString(toBcp47(locale as AppLocale), {
                    dateStyle: "long",
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-3">
                <Link
                  href="/wallet"
                  className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-sm font-medium text-amber-500 hover:bg-amber-500/20"
                >
                  <Wallet className="size-4" aria-hidden /> {t("energyLink")}
                </Link>
                <Link
                  href="/persona"
                  className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm hover:bg-muted"
                >
                  <Sparkles className="size-4" aria-hidden /> {t("personaLink")}
                </Link>
                <SignOutButton />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="size-4 text-violet-400" aria-hidden /> {t("language")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LocalePrefsForm
                initialLocale={dbUser?.preferredLocale ?? (locale as AppLocale)}
                initialTimezone={dbUser?.timezone ?? "Asia/Bangkok"}
                initialCurrency={dbUser?.preferredCurrency ?? "THB"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-sky-400" aria-hidden /> {t("security")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• {t("securityBullet1")}</p>
              <p>• {t("securityBullet2")}</p>
              <p>• {t("securityBullet3")}</p>
              <div className="pt-3">
                <AccountDataActions />
              </div>
              <p className="pt-2 text-xs">
                <Link href="/privacy" className="underline">
                  Privacy
                </Link>
                {" · "}
                <Link href="/terms" className="underline">
                  Terms
                </Link>
                {" · "}
                <Link href="/cookies" className="underline">
                  Cookies
                </Link>
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

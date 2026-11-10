"use client";

import {
  Compass,
  LibraryBig,
  UserRound,
  BookUser,
  Settings,
  Zap,
  LogOut,
  MessageCircleHeart,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { NavDailyClaim } from "@/features/shell/components/nav-daily-claim";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { toBcp47, type AppLocale } from "@/i18n/routing";

const NAV_HREFS = [
  { href: "/discover", key: "discover" as const, icon: Compass },
  { href: "/library", key: "library" as const, icon: LibraryBig },
  { href: "/persona", key: "persona" as const, icon: UserRound },
  { href: "/creator", key: "creator" as const, icon: BookUser },
  { href: "/settings", key: "settings" as const, icon: Settings },
];

export interface ShellUser {
  id: string;
  email?: string;
}

export function AppShell({
  user,
  walletTotal,
  children,
}: {
  user: ShellUser | null;
  walletTotal: number | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("Nav");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <MessageCircleHeart className="size-6 text-fuchsia-500" aria-hidden />
            <span className="bg-gradient-to-r from-fuchsia-500 via-violet-400 to-sky-400 bg-clip-text text-lg text-transparent">
              MeeChat
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 md:flex" aria-label={t("main")}>
            {NAV_HREFS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-fuchsia-500/10 font-medium text-fuchsia-600 dark:text-fuchsia-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {user && <NavDailyClaim />}

            {user && walletTotal !== null && (
              <Link
                href="/wallet"
                className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/15 dark:text-amber-400"
                title={t("energyTitle")}
              >
                <Zap className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                <span className="tabular-nums">{walletTotal.toLocaleString(toBcp47(locale))}</span>
              </Link>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full px-1.5">
                    <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 text-xs font-bold text-white">
                      {(user.email ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/create/character">{t("createCharacter")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/wallet">{t("myEnergy")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                    <LogOut className="size-4" aria-hidden /> {t("signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="rounded-full">
                <Link href="/login">{t("login")}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-5 md:pb-16">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label={t("mainMobile")}
      >
        {NAV_HREFS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-muted-foreground"
              }`}
            >
              {active ? (
                <span
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-fuchsia-500"
                  aria-hidden
                />
              ) : null}
              <item.icon className={`size-5 ${active ? "stroke-[2.25]" : ""}`} aria-hidden />
              <span className={active ? "font-medium" : undefined}>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

const NAV_ITEMS = [
  { href: "/discover", label: "ค้นพบ", icon: Compass },
  { href: "/library", label: "คลัง", icon: LibraryBig },
  { href: "/persona", label: "ตัวตน", icon: UserRound },
  { href: "/creator", label: "ครีเอเตอร์", icon: BookUser },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
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
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <MessageCircleHeart className="size-6 text-fuchsia-500" aria-hidden />
            <span className="bg-gradient-to-r from-fuchsia-500 via-violet-400 to-sky-400 bg-clip-text text-lg text-transparent">
              MeeChat
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="หลัก">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && <NavDailyClaim />}

            {user && walletTotal !== null && (
              <Link
                href="/wallet"
                className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
                title="พลังงานของคุณ"
              >
                <Zap className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                {walletTotal.toLocaleString("th-TH")}
              </Link>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 text-xs font-bold text-white">
                      {(user.email ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/create/character">สร้างตัวละคร</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/wallet">พลังงานของฉัน</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                    <LogOut className="size-4" aria-hidden /> ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="rounded-full">
                <Link href="/login">เข้าสู่ระบบ</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 md:pb-16">{children}</main>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background/90 backdrop-blur md:hidden"
        aria-label="หลัก (มือถือ)"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
              pathname.startsWith(item.href) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

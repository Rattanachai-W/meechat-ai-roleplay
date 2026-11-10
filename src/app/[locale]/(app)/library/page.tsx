import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Metadata } from "next";
import { MessageCircle, Star, Heart, LibraryBig } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { CharacterCard } from "@/features/characters/components/character-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toBcp47, type AppLocale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Library" });
  return { title: t("metaTitle") };
}

export default async function LibraryPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations("Library");
  const bcp47 = toBcp47(locale as AppLocale);

  const user = await getCurrentUser();
  if (!user) {
    const loc = await getLocale();
    redirect({ href: "/login", locale: loc });
    return;
  }
  const sp = await props.searchParams;
  const tab = sp?.tab === "favorites" || sp?.tab === "liked" ? sp.tab : "chats";

  const [conversations, favorites, likes] = await Promise.all([
    tab === "chats"
      ? prisma.conversation.findMany({
          where: { userId: user.id },
          orderBy: { lastMessageAt: "desc" },
          take: 30,
          include: {
            character: {
              select: { id: true, name: true, slug: true, avatarUrl: true, creator: { select: { username: true } } },
            },
          },
        })
      : Promise.resolve([]),
    tab === "favorites"
      ? prisma.favorite.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 48,
          include: {
            character: {
              select: {
                id: true, slug: true, name: true, tagline: true, avatarUrl: true, contentRating: true,
                chatCount: true, likeCount: true, favoriteCount: true,
                creator: { select: { username: true } },
                characterTags: { select: { tag: { select: { slug: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    tab === "liked"
      ? prisma.characterLike.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 48,
          include: {
            character: {
              select: {
                id: true, slug: true, name: true, tagline: true, avatarUrl: true, contentRating: true,
                chatCount: true, likeCount: true, favoriteCount: true,
                creator: { select: { username: true } },
                characterTags: { select: { tag: { select: { slug: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<LibraryBig className="size-6 text-fuchsia-500" aria-hidden />}
      />

      <nav className="flex flex-wrap gap-2" aria-label={t("tabsLabel")}>
        <TabLink href="/library?tab=chats" active={tab === "chats"} icon={<MessageCircle className="size-4" aria-hidden />}>
          {t("tabChats")}
        </TabLink>
        <TabLink href="/library?tab=favorites" active={tab === "favorites"} icon={<Star className="size-4" aria-hidden />}>
          {t("tabFavorites")}
        </TabLink>
        <TabLink href="/library?tab=liked" active={tab === "liked"} icon={<Heart className="size-4" aria-hidden />}>
          {t("tabLiked")}
        </TabLink>
      </nav>

      {tab === "chats" &&
        (conversations.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="size-5" aria-hidden />}
            title={t("emptyChatsTitle")}
            description={t("emptyChatsBody")}
            action={
              <Button asChild className="rounded-full">
                <Link href="/discover">{t("goDiscover")}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 transition-colors hover:border-fuchsia-500/35 hover:bg-muted/20"
                >
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-500/70 to-sky-500/70 font-bold text-white">
                    {c.character.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.character.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      c.character.name.slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium tracking-tight">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.character.name} ·{" "}
                      {new Date(c.lastMessageAt).toLocaleString(bcp47, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {(tab === "favorites" || tab === "liked") && (
        <>
          {(tab === "favorites" ? favorites : likes).length === 0 ? (
            <EmptyState
              icon={
                tab === "favorites" ? (
                  <Star className="size-5" aria-hidden />
                ) : (
                  <Heart className="size-5" aria-hidden />
                )
              }
              title={tab === "favorites" ? t("emptyFavoritesTitle") : t("emptyLikedTitle")}
              description={t("emptySavedBody")}
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/discover">{t("goDiscover")}</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {(tab === "favorites" ? favorites : likes).map((f) => (
                <CharacterCard key={f.character.slug} character={{ ...f.character, tags: [] }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-fuchsia-500/40 bg-fuchsia-500/10 font-medium text-fuchsia-600 dark:text-fuchsia-400"
          : "border-border/80 text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

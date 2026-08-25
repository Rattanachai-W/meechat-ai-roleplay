import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle, Star, Heart, LibraryBig } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { CharacterCard } from "@/features/characters/components/character-card";

export const metadata: Metadata = { title: "คลังของฉัน — MeeChat" };
export const dynamic = "force-dynamic";

export default async function LibraryPage(props: PageProps<"/library">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <LibraryBig className="size-6 text-fuchsia-500" aria-hidden /> คลังของฉัน
      </h1>

      <nav className="flex gap-2" aria-label="แท็บคลัง">
        <TabLink href="/library?tab=chats" active={tab === "chats"} icon={<MessageCircle className="size-4" aria-hidden />}>แชทของฉัน</TabLink>
        <TabLink href="/library?tab=favorites" active={tab === "favorites"} icon={<Star className="size-4" aria-hidden />}>รายการโปรด</TabLink>
        <TabLink href="/library?tab=liked" active={tab === "liked"} icon={<Heart className="size-4" aria-hidden />}>ถูกใจ</TabLink>
      </nav>

      {tab === "chats" &&
        (conversations.length === 0 ? (
          <Empty text="ยังไม่มีบทสนทนา — เริ่มคุยกับตัวละครจากหน้าค้นพบได้เลย" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-fuchsia-500/40"
                >
                  <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-500/70 to-sky-500/70 font-bold text-white">
                    {c.character.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.character.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      c.character.name.slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.character.name} • {new Date(c.lastMessageAt).toLocaleString("th-TH", {
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
            <Empty text={tab === "favorites" ? "ยังไม่มีรายการโปรด" : "ยังไม่มีตัวละครที่ถูกใจ"} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
          ? "border-fuchsia-500/50 bg-fuchsia-500/10 font-medium text-fuchsia-500"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

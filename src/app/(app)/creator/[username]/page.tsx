import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookUser, Users } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CharacterCard } from "@/features/characters/components/character-card";
import { FollowButton } from "@/features/creators/components/follow-button";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/creator/[username]">): Promise<Metadata> {
  const { username } = await props.params;
  return { title: `@${username} — MeeChat` };
}

export default async function CreatorPage(props: PageProps<"/creator/[username]">) {
  const { username } = await props.params;
  const viewer = await getCurrentUser();

  const creator = await prisma.creatorProfile.findUnique({
    where: { username },
    include: {
      user: { select: { displayName: true, avatarUrl: true } },
      _count: {
        select: {
          followers: true,
          characters: { where: { status: "PUBLISHED", visibility: "PUBLIC" } },
        },
      },
    },
  });
  if (!creator) notFound();

  const [characters, isFollowing] = await Promise.all([
    prisma.character.findMany({
      where: { creatorId: creator.id, visibility: "PUBLIC", status: "PUBLISHED" },
      orderBy: { chatCount: "desc" },
      take: 48,
      select: {
        id: true, slug: true, name: true, tagline: true, avatarUrl: true, contentRating: true,
        chatCount: true, likeCount: true, favoriteCount: true,
        creator: { select: { username: true } },
        characterTags: { select: { tag: { select: { slug: true } } } },
      },
    }),
    viewer
      ? prisma.creatorFollow.findUnique({
          where: { userId_creatorId: { userId: viewer.id, creatorId: creator.id } },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-500/70 to-sky-500/70 text-3xl font-black text-white">
          {creator.avatarUrl ?? creator.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatarUrl ?? creator.user.avatarUrl ?? ""}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            creator.username.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookUser className="size-6 text-fuchsia-500" aria-hidden />@{creator.username}
          </h1>
          <p className="text-sm text-muted-foreground">{creator.user.displayName ?? ""}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden />
            {creator._count.followers.toLocaleString("th-TH")} ผู้ติดตาม •{" "}
            {creator._count.characters.toLocaleString("th-TH")} ตัวละคร
          </p>
          {creator.bio && <p className="mt-2 max-w-xl text-sm">{creator.bio}</p>}
        </div>
        {viewer && viewer.id !== creator.userId && (
          <FollowButton
            username={creator.username}
            initialFollowing={Boolean(isFollowing)}
            isLoggedIn={Boolean(viewer)}
          />
        )}
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">ตัวละครของครีเอเตอร์นี้</h2>
        {characters.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            ยังไม่มีตัวละครสาธารณะ
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {characters.map((c) => (
              <CharacterCard key={c.slug} character={{ ...c, tags: [] }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle, Heart, Star, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCharacterDetail } from "@/lib/characters/queries";
import { getQuestsWithProgress, getAffinitySummary } from "@/lib/quests/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CharacterActions } from "@/features/characters/components/character-actions";
import { CharacterQuestsSection } from "@/features/characters/components/character-quests-section";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/character/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const result = await getCharacterDetail(id, null);
  return { title: result ? `${result.character.name} — MeeChat` : "ไม่พบตัวละคร" };
}

export default async function CharacterPage(props: PageProps<"/character/[id]">) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  const result = await getCharacterDetail(id, user?.id ?? null);
  if (!result) notFound();

  const { character, viewer } = result;
  const isOwner = viewer.isOwner;
  // ภารกิจ + ความสนิทของผู้ชม — ยังไม่ล็อกอินเห็นภารกิจแบบไม่มี progress
  const [quests, affinity] = await Promise.all([
    getQuestsWithProgress(user?.id ?? null, character.id),
    user ? getAffinitySummary(user.id, character.id) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row">
        <div
          className={`relative aspect-[3/4] w-full max-w-48 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-sky-600/60 ${
            character.avatarUrl ? "" : "grid place-items-center"
          }`}
        >
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatarUrl} alt={character.name} className="size-full object-cover" />
          ) : (
            <span className="text-7xl font-black text-white/90">{character.name.slice(0, 1)}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{character.name}</h1>
            {character.contentRating === "MATURE" && (
              <Badge variant="destructive">
                <ShieldAlert aria-hidden /> 18+
              </Badge>
            )}
            {character.visibility !== "PUBLIC" && (
              <Badge variant="outline">
                {character.visibility === "PRIVATE" ? "ส่วนตัว" : "ไม่ลิสต์"}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground">{character.tagline}</p>
          <p className="text-sm text-muted-foreground">
            โดย{" "}
            <Link href={`/creator/${character.creator.username}`} className="text-primary underline-offset-2 hover:underline">
              @{character.creator.username}
            </Link>
          </p>

          <div className="mt-1 flex flex-wrap gap-1.5">
            {character.characterTags.map((ct) => (
              <Link key={ct.tagId} href={`/discover?q=${encodeURIComponent(ct.tag.name)}`}>
                <Badge variant="secondary" className="font-normal">
                  #{ct.tag.name}
                </Badge>
              </Link>
            ))}
          </div>

          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageCircle className="size-4" aria-hidden /> {character.chatCount.toLocaleString("th-TH")}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-4" aria-hidden /> {character.likeCount.toLocaleString("th-TH")}
            </span>
            <span className="flex items-center gap-1">
              <Star className="size-4" aria-hidden /> {character.favoriteCount.toLocaleString("th-TH")}
            </span>
          </div>
        </div>
      </div>

      <CharacterActions
        characterId={character.id}
        isLoggedIn={Boolean(user)}
        isOwner={isOwner}
        initial={{
          liked: viewer.liked,
          favorited: viewer.favorited,
          likeCount: character.likeCount,
          favoriteCount: character.favoriteCount,
        }}
      />

      <Separator />

      {/* Details */}
      <div className="space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="mb-1 font-semibold">เรื่องราว</h2>
          <p className="whitespace-pre-line text-muted-foreground">{character.description}</p>
        </section>
        {character.personality && (
          <section>
            <h2 className="mb-1 font-semibold">นิสัย</h2>
            <p className="whitespace-pre-line text-muted-foreground">{character.personality}</p>
          </section>
        )}
        {character.scenario && (
          <section>
            <h2 className="mb-1 font-semibold">ฉาก</h2>
            <p className="whitespace-pre-line text-muted-foreground">{character.scenario}</p>
          </section>
        )}
        {character.speakingStyle && (
          <section>
            <h2 className="mb-1 font-semibold">สไตล์การพูด</h2>
            <p className="whitespace-pre-line text-muted-foreground">{character.speakingStyle}</p>
          </section>
        )}

        {character.examples.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">ตัวอย่างบทสนทนา</h2>
            <div className="space-y-3">
              {character.examples.map((ex) => (
                <div key={ex.id} className="space-y-1.5 rounded-xl border border-border p-3">
                  <p className="rounded-lg bg-muted px-3 py-2">
                    <span className="mr-1 font-medium">คุณ:</span>
                    {ex.userTurn}
                  </p>
                  <p className="rounded-lg bg-primary/10 px-3 py-2">
                    <span className="mr-1 font-medium">{character.name}:</span>
                    {ex.characterTurn}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isOwner && character.firstMessage && (
          <section>
            <h2 className="mb-1 font-semibold">ข้อความเปิด</h2>
            <p className="rounded-xl border border-border bg-card p-3 italic text-muted-foreground">
              &ldquo;{character.firstMessage}&rdquo;
            </p>
          </section>
        )}
      </div>

      <Separator />

      {/* ภารกิจ + ความสนิท — ทำภารกิจ/รับรางวัลเกิดในหน้าแชท */}
      <CharacterQuestsSection quests={quests} affinity={affinity} isLoggedIn={Boolean(user)} />
    </div>
  );
}

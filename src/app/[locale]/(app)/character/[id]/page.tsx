import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircle, Heart, Star, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCharacterDetail } from "@/lib/characters/queries";
import { getQuestsWithProgress, getAffinitySummary } from "@/lib/quests/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CharacterActions } from "@/features/characters/components/character-actions";
import { CharacterQuestsSection } from "@/features/characters/components/character-quests-section";
import { AgeGate } from "@/features/safety/components/age-gate";
import { ReportButton } from "@/features/safety/components/report-button";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const t = await getTranslations("Character");
  const result = await getCharacterDetail(id, null);
  return {
    title: result ? t("metaNameTitle", { name: result.character.name }) : t("notFoundMeta"),
  };
}

export default async function CharacterPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations("Character");
  const tCommon = await getTranslations("Common");
  const numberLocale = locale === "th" ? "th-TH" : "en-US";

  const user = await getCurrentUser();
  const result = await getCharacterDetail(id, user?.id ?? null);
  if (!result) notFound();

  const { character, viewer } = result;
  const isOwner = viewer.isOwner;
  const matureConfirmed = user
    ? Boolean(
        (
          await prisma.user.findUnique({
            where: { id: user.id },
            select: { matureConfirmedAt: true },
          })
        )?.matureConfirmedAt
      )
    : false;

  const [quests, affinity] = await Promise.all([
    getQuestsWithProgress(user?.id ?? null, character.id),
    user
      ? getAffinitySummary(user.id, character.id, locale === "en" ? "en" : "th")
      : Promise.resolve(null),
  ]);

  return (
    <AgeGate required={character.contentRating === "MATURE"} alreadyConfirmed={matureConfirmed || isOwner}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex justify-end">
          <ReportButton targetType="CHARACTER" targetId={character.id} />
        </div>
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
                  <ShieldAlert aria-hidden /> {tCommon("matureBadge")}
                </Badge>
              )}
              {character.visibility !== "PUBLIC" && (
                <Badge variant="outline">
                  {character.visibility === "PRIVATE" ? t("visibilityPrivate") : t("visibilityUnlisted")}
                </Badge>
              )}
            </div>

            <p className="text-muted-foreground">{character.tagline}</p>
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/creator/${character.creator.username}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {t("byCreator", { username: character.creator.username })}
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
                <MessageCircle className="size-4" aria-hidden /> {character.chatCount.toLocaleString(numberLocale)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="size-4" aria-hidden /> {character.likeCount.toLocaleString(numberLocale)}
              </span>
              <span className="flex items-center gap-1">
                <Star className="size-4" aria-hidden /> {character.favoriteCount.toLocaleString(numberLocale)}
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

        <div className="space-y-5 text-sm leading-relaxed">
          <section>
            <h2 className="mb-1 font-semibold">{t("sectionStory")}</h2>
            <p className="whitespace-pre-line text-muted-foreground">{character.description}</p>
          </section>
          {character.personality && (
            <section>
              <h2 className="mb-1 font-semibold">{t("sectionPersonality")}</h2>
              <p className="whitespace-pre-line text-muted-foreground">{character.personality}</p>
            </section>
          )}
          {character.scenario && (
            <section>
              <h2 className="mb-1 font-semibold">{t("sectionScene")}</h2>
              <p className="whitespace-pre-line text-muted-foreground">{character.scenario}</p>
            </section>
          )}
          {character.speakingStyle && (
            <section>
              <h2 className="mb-1 font-semibold">{t("sectionStyle")}</h2>
              <p className="whitespace-pre-line text-muted-foreground">{character.speakingStyle}</p>
            </section>
          )}

          {character.examples.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">{t("sectionExamples")}</h2>
              <div className="space-y-3">
                {character.examples.map((ex) => (
                  <div key={ex.id} className="space-y-1.5 rounded-xl border border-border p-3">
                    <p className="rounded-lg bg-muted px-3 py-2">
                      <span className="mr-1 font-medium">{t("youLabel")}</span>
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
              <h2 className="mb-1 font-semibold">{t("sectionFirstMessage")}</h2>
              <p className="rounded-xl border border-border bg-card p-3 italic text-muted-foreground">
                &ldquo;{character.firstMessage}&rdquo;
              </p>
            </section>
          )}
        </div>

        <Separator />

        <CharacterQuestsSection quests={quests} affinity={affinity} isLoggedIn={Boolean(user)} />
      </div>
    </AgeGate>
  );
}

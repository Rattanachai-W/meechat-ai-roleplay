import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/utils";
import { pointsToLevel } from "@/lib/quests/intimacy";
import { ChatView } from "@/features/chat/components/chat-view";

export const dynamic = "force-dynamic";

export default async function ChatPage(props: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { conversationId } = await props.params;
  if (!isUuid(conversationId)) notFound();
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
    return;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      character: { select: { id: true, name: true, avatarUrl: true } },
      // ความสนิทปัจจุบัน (อาจยังไม่มีแถวถ้าไม่เคย claim อะไร)
    },
  });
  // ownership — Prisma bypass RLS จึงตรวจเองเสมอ
  if (!conversation || conversation.userId !== user.id) notFound();

  const affinityRow = await prisma.characterAffinity.findUnique({
    where: { userId_characterId: { userId: user.id, characterId: conversation.character.id } },
    select: { points: true },
  });
  const affinityLv = pointsToLevel(affinityRow?.points ?? 0);

  return (
    <ChatView
      conversationId={conversation.id}
      characterId={conversation.character.id}
      characterName={conversation.character.name}
      avatarUrl={conversation.character.avatarUrl}
      intimacyLevel={affinityLv.level}
      intimacyLabel={affinityLv.label}
    />
  );
}

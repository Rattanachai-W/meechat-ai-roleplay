import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CreatorStudio } from "@/features/creators/components/creator-studio";

export const metadata: Metadata = { title: "Creator Studio — MeeChat" };
export const dynamic = "force-dynamic";

export default async function CreatorStudioPage() {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
    return;
  }
  return <CreatorStudio />;
}

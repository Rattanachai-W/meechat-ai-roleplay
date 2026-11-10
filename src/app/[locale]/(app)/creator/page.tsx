import type { Metadata } from "next";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CreatorStudio } from "@/features/creators/components/creator-studio";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Creator" });
  return { title: t("metaTitle") };
}

export default async function CreatorStudioPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) {
    const current = await getLocale();
    redirect({ href: "/login", locale: current });
    return;
  }
  return <CreatorStudio />;
}

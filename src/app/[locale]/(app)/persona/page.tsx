import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PersonaManager } from "@/features/persona/components/persona-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Persona" });
  return { title: t("metaTitle") };
}

export default async function PersonaPage(props: {
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
  return <PersonaManager />;
}

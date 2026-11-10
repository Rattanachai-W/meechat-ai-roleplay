import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const tCommon = await getTranslations("Common");

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-primary underline">
        {tCommon("brand")}
      </Link>
      <h1 className="text-3xl font-bold">{t("privacyTitle")}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>{t("privacyP1")}</p>
        <p>{t("privacyP2")}</p>
        <p>{t("privacyP3")}</p>
        <p>{t("privacyP4")}</p>
        <p>{t("privacyP5")}</p>
      </div>
    </main>
  );
}

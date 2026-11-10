import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function TermsPage({
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
      <h1 className="text-3xl font-bold">{t("termsTitle")}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>{t("termsP4")}</p>
        <p>{t("termsP5")}</p>
        <p>{t("termsP6")}</p>
      </div>
    </main>
  );
}

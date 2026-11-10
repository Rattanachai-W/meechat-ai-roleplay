import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-primary underline">
        MeeChat
      </Link>
      <h1 className="text-3xl font-bold">{t("cookiesTitle")}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Necessary cookies keep you signed in (Supabase session) and remember your interface
          language (`NEXT_LOCALE`).
        </p>
        <p>
          If you accept analytics, Vercel Analytics may collect anonymized usage metrics to
          improve the product.
        </p>
      </div>
    </main>
  );
}

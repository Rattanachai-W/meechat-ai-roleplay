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

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-primary underline">
        MeeChat
      </Link>
      <h1 className="text-3xl font-bold">{t("termsTitle")}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          By using MeeChat you agree to use the service lawfully, respect other creators, and not
          attempt to abuse energy rewards, payments, or moderation systems.
        </p>
        <p>
          MATURE-rated characters require age confirmation (18+). You are responsible for the
          content you publish and the roleplay you request.
        </p>
        <p>
          Energy packs are digital goods. Creator earnings currently accrue as in-app coins; cash
          payouts require KYC and become available only when payout status is READY.
        </p>
      </div>
    </main>
  );
}

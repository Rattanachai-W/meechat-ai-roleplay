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

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-primary underline">
        MeeChat
      </Link>
      <h1 className="text-3xl font-bold">{t("privacyTitle")}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          MeeChat stores account data (email, display name), personas, conversations, memories,
          energy ledger rows, and creator profiles to operate the service.
        </p>
        <p>
          Chat content and memories are retained while your account exists. You can export a
          summary of your data or delete your account from Settings. Deletion removes app data
          cascaded from your user row and removes the auth user when possible.
        </p>
        <p>
          We process data under Thailand PDPA principles and, for users in the EEA/UK, GDPR-like
          rights of access, rectification, and erasure via Settings export/delete.
        </p>
        <p>
          Payments are handled by Stripe. We store payment session references for idempotent
          energy credit, not full card numbers.
        </p>
      </div>
    </main>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Flame, Sparkles, TrendingUp, Search } from "lucide-react";
import type { Metadata } from "next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CharacterCard, type CharacterCardProps } from "@/features/characters/components/character-card";
import {
  getDiscoverSections,
  searchCharacters,
  type CharacterLanguageFilter,
} from "@/lib/characters/queries";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "Discover" });
  return { title: t("title") };
}

function parseLang(raw: unknown, fallback: CharacterLanguageFilter): CharacterLanguageFilter {
  if (raw === "TH" || raw === "EN" || raw === "BILINGUAL" || raw === "ALL") return raw;
  return fallback;
}

export default async function DiscoverPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations("Discover");
  const sp = await props.searchParams;
  const q = typeof sp?.q === "string" ? sp.q.trim() : "";
  const defaultLang: CharacterLanguageFilter = locale === "en" ? "EN" : "TH";
  const lang = parseLang(sp?.lang, defaultLang);

  const results = q ? await searchCharacters(q, 30, lang) : null;
  const sections = results ? null : await getDiscoverSections(lang);

  const chips: { value: CharacterLanguageFilter; label: string }[] = [
    { value: "ALL", label: t("languageAll") },
    { value: "TH", label: t("languageTh") },
    { value: "EN", label: t("languageEn") },
    { value: "BILINGUAL", label: t("languageBilingual") },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <form action="" method="GET" className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="h-11 rounded-full border-border/80 bg-muted/30 pl-9 shadow-none"
              aria-label={t("searchPlaceholder")}
            />
          </div>
          <input type="hidden" name="lang" value={lang} />
          <Button type="submit" className="h-11 rounded-full px-5">
            {t("title")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label={t("languageFilter")}>
          <span className="text-xs text-muted-foreground">{t("languageFilter")}</span>
          {chips.map((chip) => (
            <Link
              key={chip.value}
              href={q ? `/discover?q=${encodeURIComponent(q)}&lang=${chip.value}` : `/discover?lang=${chip.value}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                lang === chip.value
                  ? "border-fuchsia-500/40 bg-fuchsia-500/10 font-medium text-fuchsia-600 dark:text-fuchsia-400"
                  : "border-border/80 text-muted-foreground hover:bg-muted"
              }`}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </form>

      {results ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("searchResults", { query: q, count: results.length })}
          </h2>
          {results.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" aria-hidden />}
              title={t("emptyTitle")}
              description={q}
              action={
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/create/character">{t("emptyAction")}</Link>
                </Button>
              }
            />
          ) : (
            <Grid items={results} locale={locale} />
          )}
        </section>
      ) : (
        sections && (
          <>
            <Section title={t("trending")} icon={<TrendingUp className="size-5 text-fuchsia-500" aria-hidden />} items={sections.trending} locale={locale} />
            <Section title={t("new")} icon={<Sparkles className="size-5 text-sky-400" aria-hidden />} items={sections.new} locale={locale} />
            <Section title={t("popular")} icon={<Flame className="size-5 text-orange-500" aria-hidden />} items={sections.popular} locale={locale} />
            {sections.categories.map((cat) => (
              <Section key={cat.tag.slug} title={cat.tag.name} items={cat.items} locale={locale} />
            ))}
          </>
        )
      )}
    </div>
  );
}

function localizedTagline(
  item: CharacterCardProps & { taglineEn?: string | null; primaryLanguage?: string },
  locale: string
) {
  if (locale === "en" && item.taglineEn) return item.taglineEn;
  return item.tagline;
}

function Section({
  title,
  icon,
  items,
  locale,
}: {
  title: string;
  icon?: React.ReactNode;
  items: CharacterCardProps[];
  locale: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {icon}
        {title}
      </h2>
      <Grid items={items} locale={locale} />
    </section>
  );
}

function Grid({
  items,
  locale,
}: {
  items: Array<CharacterCardProps & { taglineEn?: string | null }>;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
      {items.map((item) => (
        <CharacterCard
          key={item.id}
          character={{ ...item, tagline: localizedTagline(item, locale) }}
        />
      ))}
    </div>
  );
}

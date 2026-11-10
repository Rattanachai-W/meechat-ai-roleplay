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

export const metadata: Metadata = { title: "Discover — MeeChat" };
export const dynamic = "force-dynamic";

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
              className="rounded-full pl-9"
              aria-label={t("searchPlaceholder")}
            />
          </div>
          <input type="hidden" name="lang" value={lang} />
          <Button type="submit" className="rounded-full">
            {t("title")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label={t("languageFilter")}>
          <span className="text-xs text-muted-foreground">{t("languageFilter")}:</span>
          {chips.map((chip) => (
            <Link
              key={chip.value}
              href={q ? `/discover?q=${encodeURIComponent(q)}&lang=${chip.value}` : `/discover?lang=${chip.value}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                lang === chip.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </form>

      {results ? (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">
            &ldquo;{q}&rdquo; ({results.length})
          </h1>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/create/character" className="text-primary underline">
                Create a character
              </Link>
            </p>
          ) : (
            <Grid items={results} locale={locale} />
          )}
        </section>
      ) : (
        sections && (
          <>
            <Section title="Trending" icon={<TrendingUp className="size-5 text-fuchsia-500" aria-hidden />} items={sections.trending} locale={locale} />
            <Section title="New" icon={<Sparkles className="size-5 text-sky-400" aria-hidden />} items={sections.new} locale={locale} />
            <Section title="Popular" icon={<Flame className="size-5 text-orange-500" aria-hidden />} items={sections.popular} locale={locale} />
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
      <h2 className="flex items-center gap-2 text-lg font-semibold">
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => (
        <CharacterCard
          key={item.id}
          character={{ ...item, tagline: localizedTagline(item, locale) }}
        />
      ))}
    </div>
  );
}

import Link from "next/link";
import { Flame, Sparkles, TrendingUp, Search } from "lucide-react";
import type { Metadata } from "next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CharacterCard, type CharacterCardProps } from "@/features/characters/components/character-card";
import { getDiscoverSections, searchCharacters } from "@/lib/characters/queries";

export const metadata: Metadata = { title: "สำรวจตัวละคร — MeeChat" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage(props: PageProps<"/discover">) {
  const sp = await props.searchParams;
  const q = typeof sp?.q === "string" ? sp.q.trim() : "";

  const results = q ? await searchCharacters(q) : null;
  const sections = results ? null : await getDiscoverSections();

  return (
    <div className="space-y-8">
      <form action="/discover" method="GET" className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาตัวละคร แท็ก หรือครีเอเตอร์..."
            className="rounded-full pl-9"
            aria-label="ค้นหาตัวละคร"
          />
        </div>
        <Button type="submit" className="rounded-full">
          ค้นหา
        </Button>
      </form>

      {results ? (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">
            ผลการค้นหา &ldquo;{q}&rdquo; ({results.length})
          </h1>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ไม่พบตัวละครที่ตรงกัน — ลองคำอื่น หรือ{" "}
              <Link href="/create/character" className="text-primary underline">
                สร้างเองเลย
              </Link>
            </p>
          ) : (
            <Grid items={results} />
          )}
        </section>
      ) : (
        sections && (
          <>
            <Section title="กำลังฮิต" icon={<TrendingUp className="size-5 text-fuchsia-500" aria-hidden />} items={sections.trending} />
            <Section title="มาใหม่" icon={<Sparkles className="size-5 text-sky-400" aria-hidden />} items={sections.new} />
            <Section title="ยอดนิยม" icon={<Flame className="size-5 text-orange-500" aria-hidden />} items={sections.popular} />
            {sections.categories.map((cat) => (
              <Section key={cat.tag.slug} title={`หมวด ${cat.tag.name}`} items={cat.items} />
            ))}
          </>
        )
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  items,
}: {
  title: string;
  icon?: React.ReactNode;
  items: CharacterCardProps[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h2>
      <Grid items={items} />
    </section>
  );
}

function Grid({ items }: { items: CharacterCardProps[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
      {items.map((c) => (
        <CharacterCard key={c.slug} character={c} />
      ))}
    </div>
  );
}

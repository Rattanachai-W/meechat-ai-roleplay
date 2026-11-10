import { getTranslations, setRequestLocale } from "next-intl/server";
import { Brain, Coins, Globe, MessageSquare, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

const FEATURE_KEYS = [
  { icon: MessageSquare, titleKey: "featChatTitle", bodyKey: "featChatBody", highlight: false },
  { icon: Brain, titleKey: "featMemoryTitle", bodyKey: "featMemoryBody", highlight: false },
  { icon: Sparkles, titleKey: "featCreateTitle", bodyKey: "featCreateBody", highlight: false },
  { icon: Coins, titleKey: "featEnergyTitle", bodyKey: "featEnergyBody", highlight: true },
  { icon: Users, titleKey: "featCreatorTitle", bodyKey: "featCreatorBody", highlight: false },
  { icon: Globe, titleKey: "featLocaleTitle", bodyKey: "featLocaleBody", highlight: false },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const nav = await getTranslations("Nav");

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-border/60 sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <span className="text-lg font-bold tracking-tight">
            Mee<span className="text-primary">Chat</span>
          </span>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/discover">{nav("discover")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">{t("ctaLogin")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-[560px] flex-col items-center justify-center gap-6 overflow-hidden px-4 py-24 text-center md:min-h-[660px]">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
          <img
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover object-[center_34%] opacity-70 md:object-[center_12%]"
            draggable={false}
            src="/landing/characters/hero-investigation-background.png"
          />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute top-1/2 left-1/2 h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6">
          <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
            <Sparkles className="size-3.5" />
            {t("eyebrow")}
          </Badge>
          <h1 className="max-w-[22rem] text-balance text-3xl leading-[1.18] font-extrabold tracking-tight sm:max-w-2xl sm:text-4xl md:max-w-3xl md:text-5xl md:leading-[1.16] xl:text-6xl">
            {t.rich("headline", {
              accent: (chunks) => <span className="text-primary">{chunks}</span>,
            })}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-balance text-base leading-8 md:text-[1.05rem] md:leading-8">
            {t("sub")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/login">{t("ctaStart")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-8">
              <Link href="/discover">{nav("discover")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_KEYS.map((feature) => (
          <Card
            key={feature.titleKey}
            className={
              feature.highlight
                ? "border-red-400/70 bg-red-500/15 shadow-[0_0_38px_rgba(239,68,68,0.22)]"
                : "border-border/60 bg-card/50"
            }
          >
            <CardHeader>
              <div
                className={
                  feature.highlight
                    ? "mb-2 flex size-10 items-center justify-center rounded-lg bg-red-500 text-white shadow-[0_0_22px_rgba(239,68,68,0.32)]"
                    : "bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg"
                }
              >
                <feature.icon className="size-5" />
              </div>
              <CardTitle className="text-lg">{t(feature.titleKey)}</CardTitle>
              <CardDescription>{t(feature.bodyKey)}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      <footer className="border-border/60 border-t py-8">
        <div className="text-muted-foreground mx-auto w-full max-w-5xl px-4 text-center text-sm">
          {t("footer")}
        </div>
      </footer>
    </main>
  );
}

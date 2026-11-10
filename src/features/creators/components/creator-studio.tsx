"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BookUser,
  Coins,
  Heart,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuestManagerDialog } from "@/features/creators/components/quest-manager-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface CreatorProfile {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  totalEarned: number;
  payoutStatus?: "NONE" | "PENDING_KYC" | "READY" | "SUSPENDED";
  kycNote?: string | null;
}

interface StudioStats {
  characterCount: number;
  characterCountByStatus: Record<string, number>;
  totalChats: number;
  totalLikes: number;
  followerCount: number;
  totalEarned: number;
}

interface MyCharacter {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  status: string;
  reviewNote: string | null;
  visibility: string;
  chatCount: number;
  likeCount: number;
}

interface EarningRow {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  note: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING: "bg-amber-500/15 text-amber-600",
  PUBLISHED: "bg-emerald-500/15 text-emerald-600",
  REJECTED: "bg-red-500/15 text-red-600",
};

export function CreatorStudio() {
  const t = useTranslations("Creator");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [stats, setStats] = useState<StudioStats | null>(null);
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);

  // onboarding form
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const statusLabel = useMemo(
    () => ({
      DRAFT: t("statusDraft"),
      PENDING: t("statusPending"),
      PUBLISHED: t("statusPublished"),
      REJECTED: t("statusRejected"),
    }),
    [t]
  );

  function payoutLabel(status?: CreatorProfile["payoutStatus"]) {
    if (status === "READY") return t("payoutReady");
    if (status === "PENDING_KYC") return t("payoutPending");
    if (status === "SUSPENDED") return t("payoutSuspended");
    return t("payoutNone");
  }

  const reload = useCallback(async () => {
    const [meRes, charRes, earnRes] = await Promise.all([
      fetch("/api/creator/me").then((r) => r.json()),
      fetch("/api/creator/me/characters").then((r) => r.json()),
      fetch("/api/creator/me/earnings?limit=8").then((r) => r.json()),
    ]);
    setProfile(meRes.profile ?? null);
    setStats(meRes.stats ?? null);
    setCharacters(charRes.characters ?? []);
    setEarnings(earnRes.earnings ?? []);
  }, []);

  useEffect(() => {
    reload()
      .catch(() => toast.error(t("loadFailed")))
      .finally(() => setLoading(false));
  }, [reload, t]);

  async function saveProfile() {
    if (!username.trim()) {
      toast.error(t("usernameRequired"));
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/creator/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), bio: bio || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { profile?: CreatorProfile; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? tCommon("saveFailed"));
      toast.success(t("onboardSuccess"));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("errorGeneric"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function publishCharacter(id: string) {
    const res = await fetch(`/api/characters/${id}/submit`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    if (!res.ok) {
      toast.error(data?.error?.message ?? t("publishFailed"));
      return;
    }
    toast.success(t("publishSuccess"));
    await reload();
  }

  async function deleteCharacter(id: string) {
    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast.error(t("deleteFailed"));
      return;
    }
    toast.success(t("deleteSuccess"));
    await reload();
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  // ── onboarding ──
  if (!profile) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-6">
        <div className="space-y-1 text-center">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
            <BookUser className="size-6 text-fuchsia-500" aria-hidden /> {t("studioOnboardTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("studioOnboardBody", { username: username || "username" })}
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label>{t("username")} *</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder={t("usernamePlaceholder")}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("bio")}</Label>
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bioPlaceholder")}
                maxLength={500}
              />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile} className="w-full rounded-full">
              {savingProfile && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submitOnboard")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── dashboard ──
  const statCards = stats
    ? [
        { icon: MessageSquare, label: t("statChats"), value: stats.totalChats },
        { icon: Heart, label: t("statLikes"), value: stats.totalLikes },
        { icon: Users, label: t("statFollowers"), value: stats.followerCount },
        { icon: Coins, label: t("statEarned"), value: stats.totalEarned },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <header className="space-y-4">
        <PageHeader
          title={t("studioTitle")}
          description={t("earningsLine", {
            username: profile.username,
            coins: (stats?.totalEarned ?? 0).toLocaleString(locale),
            payout: payoutLabel(profile.payoutStatus),
          })}
          icon={<BookUser className="size-6 text-fuchsia-500" aria-hidden />}
          actions={
            <div className="flex flex-wrap gap-2">
              {(!profile.payoutStatus || profile.payoutStatus === "NONE") && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={async () => {
                    const res = await fetch("/api/creator/me/payout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "request_kyc" }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      toast.error(data?.error?.message ?? t("kycFailed"));
                      return;
                    }
                    toast.success(t("kycSent"));
                    window.location.reload();
                  }}
                >
                  {t("requestKyc")}
                </Button>
              )}
              <Button asChild className="rounded-full">
                <Link href="/create/character">{t("createCharacter")}</Link>
              </Button>
            </div>
          }
        />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                <Icon className="size-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums">{value.toLocaleString(locale)}</p>
                <p className="truncate text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("myCharacters", { count: stats?.characterCount ?? 0 })}</h2>
        {characters.length === 0 ? (
          <EmptyState
            icon={<BookUser className="size-5" aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Button asChild className="rounded-full">
                <Link href="/create/character">{t("createCharacter")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {characters.map((c) => {
              const statusKey = c.status in statusLabel ? c.status : "DRAFT";
              const statusText = statusLabel[statusKey as keyof typeof statusLabel];
              const statusClass = STATUS_CLASS[statusKey] ?? STATUS_CLASS.DRAFT;
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/character/${c.slug}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>
                        <Badge variant="secondary" className={`rounded-full ${statusClass}`}>
                          {statusText}
                        </Badge>
                        {c.visibility !== "PUBLIC" && (
                          <Badge variant="outline" className="rounded-full">
                            {c.visibility === "PRIVATE" ? t("visibilityPrivate") : t("visibilityUnlisted")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.tagline}</p>
                      {c.reviewNote && (
                        <p className="mt-1 text-xs text-red-500">{t("reviewNote", { note: c.reviewNote })}</p>
                      )}
                    </div>
                    <div className="text-right text-xs tabular-nums text-muted-foreground">
                      {t("characterStats", {
                        chats: c.chatCount.toLocaleString(locale),
                        likes: c.likeCount.toLocaleString(locale),
                      })}
                    </div>
                    <div className="flex items-center gap-1">
                      {(c.status === "DRAFT" || c.status === "REJECTED") && (
                        <Button size="sm" variant="default" className="rounded-full" onClick={() => publishCharacter(c.id)}>
                          <Send className="size-4" aria-hidden /> {t("publish")}
                        </Button>
                      )}
                      <QuestManagerDialog characterId={c.id} characterName={c.name} />
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link href={`/create/character?edit=${c.id}`}>
                          <Pencil className="size-4" aria-hidden /> {tCommon("edit")}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-destructive"
                        onClick={() => deleteCharacter(c.id)}
                        aria-label={t("deleteAria", { name: c.name })}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {earnings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t("recentEarnings")}</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("recentEarningsSubtitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {earnings.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-600">+{e.amount}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

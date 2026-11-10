"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TagOption {
  id: string;
  name: string;
  slug: string;
}
interface ExampleRow {
  userTurn: string;
  characterTurn: string;
}

const EMPTY = {
  name: "",
  tagline: "",
  description: "",
  taglineEn: "",
  descriptionEn: "",
  primaryLanguage: "TH",
  personality: "",
  scenario: "",
  speakingStyle: "",
  firstMessage: "",
  visibility: "PUBLIC",
  contentRating: "GENERAL",
};

export function CharacterForm() {
  const t = useTranslations("Character");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [form, setForm] = useState({ ...EMPTY });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d: { tags?: TagOption[] }) => setTags(d.tags ?? []))
      .catch(() => {});

    if (editId) {
      fetch(`/api/characters/${editId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { character?: Record<string, unknown> } | null) => {
          if (!d?.character) return;
          const c = d.character as Record<string, string | null>;
          setForm({
            name: String(c.name ?? ""),
            tagline: String(c.tagline ?? ""),
            description: String(c.description ?? ""),
            taglineEn: String(c.taglineEn ?? ""),
            descriptionEn: String(c.descriptionEn ?? ""),
            primaryLanguage: String(c.primaryLanguage ?? "TH"),
            personality: String(c.personality ?? ""),
            scenario: String(c.scenario ?? ""),
            speakingStyle: String(c.speakingStyle ?? ""),
            firstMessage: String(c.firstMessage ?? ""),
            visibility: String((c.visibility as string) ?? "PUBLIC"),
            contentRating: String((c.contentRating as string) ?? "GENERAL"),
          });
          const cts = (d.character as { characterTags?: { tag: TagOption }[] }).characterTags ?? [];
          setSelectedTags(cts.map((ct) => ct.tag.slug));
          const exs = (d.character as { examples?: ExampleRow[] }).examples ?? [];
          setExamples(exs.map((e) => ({ userTurn: e.userTurn, characterTurn: e.characterTurn })));
        })
        .finally(() => setLoading(false));
    }
  }, [editId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const characterTurnPlaceholder = useMemo(
    () => t("characterSaysPlaceholder", { name: form.name || t("characterFallback") }),
    [form.name, t]
  );

  async function submit(publish: boolean) {
    setSaving(true);
    try {
      const payload = {
        ...form,
        taglineEn: form.taglineEn || undefined,
        descriptionEn: form.descriptionEn || undefined,
        personality: form.personality || undefined,
        scenario: form.scenario || undefined,
        speakingStyle: form.speakingStyle || undefined,
        tagSlugs: selectedTags,
        examples,
        publish,
      };
      const res = await fetch(editId ? `/api/characters/${editId}` : "/api/characters", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: { message?: string; code?: string } }
          | null;
        throw new Error(err?.error?.message ?? t("saveFailed"));
      }
      const data = (await res.json()) as { character: { slug: string; id: string; status?: string } };

      if (editId && publish) {
        const sub = await fetch(`/api/characters/${data.character.id}/submit`, { method: "POST" });
        if (!sub.ok) {
          const err = (await sub.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          toast.error(err?.error?.message ?? t("toastSaveOkPublishFailed"));
          router.push("/creator");
          return;
        }
      }

      toast.success(
        publish
          ? t("toastPublished")
          : editId
            ? t("toastDraftSaved")
            : t("toastDraftSavedStudio")
      );
      router.push(publish ? `/character/${data.character.id}` : "/creator");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">{tCommon("loading")}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{editId ? t("editTitle") : t("createTitleNew")}</h1>
        <p className="text-sm text-muted-foreground">{t("formIntro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sectionBasic")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t("nameRequired")} hint={t("nameHint")}>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={60}
              placeholder={t("namePlaceholder")}
            />
          </Field>
          <Field label={t("primaryLanguage")}>
            <Select value={form.primaryLanguage} onValueChange={(v) => set("primaryLanguage", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TH">{t("langTh")}</SelectItem>
                <SelectItem value="EN">{t("langEn")}</SelectItem>
                <SelectItem value="BILINGUAL">{t("langBilingual")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("taglineRequired")} hint={t("taglineHint")}>
            <Input
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={120}
              placeholder={t("taglinePlaceholder")}
            />
          </Field>
          <Field label={t("taglineEn")} optional optionalLabel={tCommon("optional")}>
            <Input value={form.taglineEn} onChange={(e) => set("taglineEn", e.target.value)} maxLength={120} />
          </Field>
          <Field label={`${t("description")} *`} hint={t("descriptionHint")}>
            <Textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
          </Field>
          <Field label={t("descriptionEn")} optional optionalLabel={tCommon("optional")}>
            <Textarea rows={4} value={form.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("personality")} optional optionalLabel={tCommon("optional")}>
              <Textarea rows={3} value={form.personality} onChange={(e) => set("personality", e.target.value)} />
            </Field>
            <Field label={t("scenarioWorld")} optional optionalLabel={tCommon("optional")}>
              <Textarea rows={3} value={form.scenario} onChange={(e) => set("scenario", e.target.value)} />
            </Field>
          </div>
          <Field label={t("speakingStyle")} optional optionalLabel={tCommon("optional")} hint={t("speakingStyleHint")}>
            <Input value={form.speakingStyle} onChange={(e) => set("speakingStyle", e.target.value)} />
          </Field>
          <Field label={`${t("firstMessage")} *`} hint={t("firstMessageHint")}>
            <Textarea rows={3} value={form.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sectionFormSettings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("visibility")}>
              <Select value={form.visibility} onValueChange={(v) => set("visibility", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">{t("visibilityPublic")}</SelectItem>
                  <SelectItem value="UNLISTED">{t("visibilityUnlistedDetail")}</SelectItem>
                  <SelectItem value="PRIVATE">{t("visibilityPrivate")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("contentRating")}>
              <Select value={form.contentRating} onValueChange={(v) => set("contentRating", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">{t("ratingGeneral")}</SelectItem>
                  <SelectItem value="MATURE">{t("ratingMature")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={t("tags", { count: selectedTags.length })}>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.slug}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag.slug)
                        ? prev.filter((s) => s !== tag.slug)
                        : prev.length >= 6
                          ? prev
                          : [...prev, tag.slug]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedTags.includes(tag.slug)
                      ? "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-500"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{t("examplesWithCount", { count: examples.length })}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => examples.length < 5 && setExamples((ex) => [...ex, { userTurn: "", characterTurn: "" }])}
          >
            <Plus className="size-4" aria-hidden /> {t("addExample")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {examples.length === 0 && <p className="text-xs text-muted-foreground">{t("examplesHelp")}</p>}
          {examples.map((ex, i) => (
            <div key={i} className="relative space-y-2 rounded-xl border border-border p-3">
              <button
                type="button"
                onClick={() => setExamples((arr) => arr.filter((_, j) => j !== i))}
                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                aria-label={t("removeExampleAria")}
              >
                <X className="size-4" aria-hidden />
              </button>
              <Textarea
                rows={2}
                placeholder={t("userSaysPlaceholder")}
                value={ex.userTurn}
                onChange={(e) => setExamples((arr) => arr.map((r, j) => (j === i ? { ...r, userTurn: e.target.value } : r)))}
              />
              <Textarea
                rows={2}
                placeholder={characterTurnPlaceholder}
                value={ex.characterTurn}
                onChange={(e) => setExamples((arr) => arr.map((r, j) => (j === i ? { ...r, characterTurn: e.target.value } : r)))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 pb-10">
        <Button variant="outline" onClick={() => submit(false)} disabled={saving} size="lg" className="rounded-full">
          {t("saveDraft")}
        </Button>
        <Button onClick={() => submit(true)} disabled={saving} size="lg" className="rounded-full">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {editId ? t("saveAndPublish") : t("publishCharacter")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  optionalLabel,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}{" "}
        {optional && optionalLabel && <span className="text-xs text-muted-foreground">({optionalLabel})</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

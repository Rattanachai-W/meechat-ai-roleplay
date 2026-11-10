"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Loader2, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CreatorQuest {
  id: string;
  goalType: "MESSAGES" | "STREAK_DAYS" | "AI_TOPIC";
  target: number;
  title: string;
  description: string;
  criteriaPrompt: string | null;
  rewardIntimacy: number;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  goalType: "MESSAGES" as CreatorQuest["goalType"],
  target: 10,
  criteriaPrompt: "",
  rewardIntimacy: 10,
};

/** Dialog จัดการภารกิจของตัวละคร (Creator Studio) — เพิ่ม/แก้/ลบ + ตั้งรางวัลความสนิท */
export function QuestManagerDialog({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const t = useTranslations("Quests");
  const tCreator = useTranslations("Creator");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [quests, setQuests] = useState<CreatorQuest[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const goalLabel = useMemo(
    () => ({
      MESSAGES: t("goalMessages"),
      STREAK_DAYS: t("goalStreak"),
      AI_TOPIC: t("goalAiTopic"),
    }),
    [t]
  );

  const load = useCallback(() => {
    fetch(`/api/characters/${characterId}/quests`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { quests: CreatorQuest[] }) => setQuests(d.quests))
      .catch(() => setQuests(null));
  }, [characterId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function startEdit(q: CreatorQuest) {
    setEditingId(q.id);
    setForm({
      title: q.title,
      description: q.description,
      goalType: q.goalType,
      target: q.target || 1,
      criteriaPrompt: q.criteriaPrompt ?? "",
      rewardIntimacy: q.rewardIntimacy,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        goalType: form.goalType,
        title: form.title.trim(),
        description: form.description.trim(),
        target: form.target,
        rewardIntimacy: form.rewardIntimacy,
        ...(form.goalType === "AI_TOPIC" ? { criteriaPrompt: form.criteriaPrompt.trim() } : {}),
      };
      const res = await fetch(
        editingId
          ? `/api/characters/${characterId}/quests/${editingId}`
          : `/api/characters/${characterId}/quests`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; quest?: { id: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? t("saveFailed"));
      toast.success(editingId ? t("savedEdit") : t("savedAdd"));
      resetForm();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/characters/${characterId}/quests/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast.error(data?.error?.message ?? t("deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    if (editingId === id) resetForm();
    load();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <ScrollText className="size-4" aria-hidden /> {tCreator("quests")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("forCharacter", { name: characterName })}</DialogTitle>
          <DialogDescription>{t("panelDescription")}</DialogDescription>
        </DialogHeader>

        {quests === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("loadFailed")}</p>
        ) : (
          <ul className="space-y-2">
            {quests.map((q) => (
              <li key={q.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{q.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{q.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {q.goalType !== "AI_TOPIC"
                        ? t("goalWithTarget", { goal: goalLabel[q.goalType], target: q.target })
                        : goalLabel[q.goalType]}
                      {q.rewardIntimacy > 0 && (
                        <>
                          {" · "}
                          <span className="inline-flex items-center gap-0.5">
                            {t("rewardLine", { n: q.rewardIntimacy })}
                            <Heart className="size-3 fill-current" aria-hidden />
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => startEdit(q)}
                      aria-label={t("editQuestAria", { title: q.title })}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      onClick={() => remove(q.id)}
                      aria-label={t("deleteQuestAria", { title: q.title })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {quests.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</li>
            )}
          </ul>
        )}

        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {editingId ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            {editingId ? t("edit") : t("addNew")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>{t("titleRequired")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={60}
                placeholder={t("titlePlaceholder")}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("descriptionRequired")}</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={200}
                placeholder={t("descPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("goalType")}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={form.goalType}
                onChange={(e) => setForm({ ...form, goalType: e.target.value as CreatorQuest["goalType"] })}
              >
                <option value="MESSAGES">{t("goalMessages")}</option>
                <option value="STREAK_DAYS">{t("goalStreak")}</option>
                <option value="AI_TOPIC">{t("goalAiTopicOption")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                {t("rewardIntimacyHearts")}
                <Heart className="size-3 fill-current" aria-hidden />
              </Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.rewardIntimacy}
                onChange={(e) => setForm({ ...form, rewardIntimacy: Number(e.target.value) })}
              />
            </div>
            {form.goalType !== "AI_TOPIC" && (
              <div className="space-y-1.5">
                <Label>{form.goalType === "STREAK_DAYS" ? t("targetDays") : t("targetMessages")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
                />
              </div>
            )}
            {form.goalType === "AI_TOPIC" && (
              <div className="col-span-2 space-y-1.5">
                <Label>{t("criteriaPrompt")} *</Label>
                <Textarea
                  rows={3}
                  value={form.criteriaPrompt}
                  onChange={(e) => setForm({ ...form, criteriaPrompt: e.target.value })}
                  maxLength={500}
                  placeholder={t("criteriaPlaceholder")}
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                {tCommon("cancel")}
              </Button>
            )}
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.description.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editingId ? t("saveChanges") : t("add")}
            </Button>
          </div>
        </div>

        <p className="flex items-center justify-end gap-1 pb-1 text-xs text-muted-foreground">
          <Heart className="size-3 fill-current" aria-hidden /> {t("footerHint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}

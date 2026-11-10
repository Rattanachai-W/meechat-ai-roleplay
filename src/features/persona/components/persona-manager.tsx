"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface Persona {
  id: string;
  name: string;
  gender?: string | null;
  age?: number | null;
  description?: string | null;
  personality?: string | null;
  appearance?: string | null;
  additionalContext?: string | null;
  isDefault: boolean;
}

const EMPTY = {
  name: "",
  gender: "",
  age: "",
  description: "",
  personality: "",
  appearance: "",
  additionalContext: "",
};

export function PersonaManager() {
  const t = useTranslations("Persona");
  const tCommon = useTranslations("Common");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/personas");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { personas: Persona[] };
      setPersonas(data.personas);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // setState อยู่ใน .then callback — ไม่ใช่ sync ใน effect body
    fetch("/api/personas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { personas: Persona[] }) => setPersonas(d.personas))
      .catch(() => toast.error(t("loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY });
    setIsDefault(personas.length === 0);
    setDialogOpen(true);
  }

  function openEdit(p: Persona) {
    setEditId(p.id);
    setForm({
      name: p.name,
      gender: p.gender ?? "",
      age: p.age != null ? String(p.age) : "",
      description: p.description ?? "",
      personality: p.personality ?? "",
      appearance: p.appearance ?? "",
      additionalContext: p.additionalContext ?? "",
    });
    setIsDefault(p.isDefault);
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        age: form.age ? Number(form.age) : undefined,
        gender: form.gender || undefined,
        description: form.description || undefined,
        personality: form.personality || undefined,
        appearance: form.appearance || undefined,
        additionalContext: form.additionalContext || undefined,
        isDefault,
      };
      const res = await fetch(editId ? `/api/personas/${editId}` : "/api/personas", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(err?.error?.message ?? tCommon("saveFailed"));
      }
      toast.success(editId ? tCommon("saved") : t("created"));
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Persona) {
    if (!confirm(t("deleteConfirm", { name: p.name }))) return;
    const res = await fetch(`/api/personas/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tCommon("deleted"));
      await load();
    } else {
      toast.error(t("deleteFailed"));
    }
  }

  async function makeDefault(p: Persona) {
    await fetch(`/api/personas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button onClick={openCreate} className="rounded-full">
            <Plus className="size-4" aria-hidden /> {t("create")}
          </Button>
        }
      />

      {personas.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-5" aria-hidden />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button onClick={openCreate} className="rounded-full">
              <Plus className="size-4" aria-hidden /> {t("create")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {personas.map((p) => (
            <Card key={p.id} className={p.isDefault ? "border-fuchsia-500/50" : ""}>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {p.isDefault && (
                    <span className="flex items-center gap-0.5 text-xs text-fuchsia-500">
                      <Star className="size-3 fill-current" aria-hidden /> {t("default")}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {!p.isDefault && (
                      <button
                        type="button"
                        onClick={() => makeDefault(p)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-fuchsia-500"
                        aria-label={t("setDefault")}
                      >
                        <Star className="size-4" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={tCommon("edit")}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={tCommon("delete")}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                </div>
                {(p.gender || p.age) && (
                  <p className="text-xs text-muted-foreground">
                    {[p.gender, p.age ? t("yearsOld", { age: p.age }) : null].filter(Boolean).join(" • ")}
                  </p>
                )}
                {p.description && <p className="line-clamp-3 text-sm">{p.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? t("editTitle") : t("createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("name")} *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gender")}</Label>
                <Input value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} placeholder={t("genderPlaceholder")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("age")}</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("appearance")}</Label>
              <Textarea rows={2} value={form.appearance} onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("personality")}</Label>
              <Textarea rows={2} value={form.personality} onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("description")}</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("context")}</Label>
              <Textarea rows={2} value={form.additionalContext} onChange={(e) => setForm((f) => ({ ...f, additionalContext: e.target.value }))} />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">{t("isDefault")}</span>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editId ? tCommon("save") : tCommon("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

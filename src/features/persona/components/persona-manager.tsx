"use client";

import { useEffect, useState } from "react";
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
      toast.error("โหลด persona ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // setState อยู่ใน .then callback — ไม่ใช่ sync ใน effect body
    fetch("/api/personas")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { personas: Persona[] }) => setPersonas(d.personas))
      .catch(() => toast.error("โหลด persona ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

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
      toast.error("กรอกชื่อ persona ก่อน");
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
        throw new Error(err?.error?.message ?? "บันทึกไม่สำเร็จ");
      }
      toast.success(editId ? "บันทึกแล้ว" : "สร้าง persona แล้ว");
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Persona) {
    if (!confirm(`ลบ persona "${p.name}"?`)) return;
    const res = await fetch(`/api/personas/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("ลบแล้ว");
      await load();
    } else {
      toast.error("ลบไม่สำเร็จ");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ตัวตนของฉัน (Persona)</h1>
          <p className="text-sm text-muted-foreground">
            สร้างตัวตนประจำตัวไว้ใช้ในบทสนทนา — AI จะจำและเรียกคุณตามนี้
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-full">
          <Plus className="size-4" aria-hidden /> สร้าง
        </Button>
      </div>

      {personas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            ยังไม่มี persona — กด &ldquo;สร้าง&rdquo; เพื่อเพิ่มตัวตนแรกของคุณ
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {personas.map((p) => (
            <Card key={p.id} className={p.isDefault ? "border-fuchsia-500/50" : ""}>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {p.isDefault && (
                    <span className="flex items-center gap-0.5 text-xs text-fuchsia-500">
                      <Star className="size-3 fill-current" aria-hidden /> ค่าเริ่มต้น
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {!p.isDefault && (
                      <button
                        type="button"
                        onClick={() => makeDefault(p)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-fuchsia-500"
                        aria-label="ตั้งเป็นค่าเริ่มต้น"
                      >
                        <Star className="size-4" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="แก้ไข"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="ลบ"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                </div>
                {(p.gender || p.age) && (
                  <p className="text-xs text-muted-foreground">
                    {[p.gender, p.age ? `${p.age} ปี` : null].filter(Boolean).join(" • ")}
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
            <DialogTitle>{editId ? "แก้ไข persona" : "สร้าง persona ใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ชื่อ *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ชื่อเล่นของคุณ" />
              </div>
              <div className="space-y-1.5">
                <Label>เพศ</Label>
                <Input value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} placeholder="ไม่ระบุก็ได้" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>อายุ</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ลักษณะ / หน้าตา</Label>
              <Textarea rows={2} value={form.appearance} onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>นิสัย</Label>
              <Textarea rows={2} value={form.personality} onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>เรื่องย่อ</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>อื่น ๆ ที่อยากให้ AI รู้</Label>
              <Textarea rows={2} value={form.additionalContext} onChange={(e) => setForm((f) => ({ ...f, additionalContext: e.target.value }))} />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">ตั้งเป็น persona เริ่มต้น</span>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editId ? "บันทึก" : "สร้าง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

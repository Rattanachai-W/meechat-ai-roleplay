"use client";

import { useCallback, useEffect, useState } from "react";
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

const GOAL_LABEL: Record<CreatorQuest["goalType"], string> = {
  MESSAGES: "จำนวนข้อความ",
  STREAK_DAYS: "จำนวนวันที่แชท",
  AI_TOPIC: "AI ตัดสินจากบทสนทนา",
};

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
  const [open, setOpen] = useState(false);
  const [quests, setQuests] = useState<CreatorQuest[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
      toast.success(editingId ? "แก้ภารกิจแล้ว" : "เพิ่มภารกิจแล้ว");
      resetForm();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/characters/${characterId}/quests/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast.error(data?.error?.message ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบภารกิจแล้ว");
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
          <ScrollText className="size-4" aria-hidden /> ภารกิจ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ภารกิจของ {characterName}</DialogTitle>
          <DialogDescription>
            ผู้เล่นทำภารกิจสำเร็จจะได้ค่าความสนิท ❤ ไม่ใช่เหรียญ — ความสนิททำให้ตัวละครพูดสนิทขึ้น (สูงสุด 10 ภารกิจ)
          </DialogDescription>
        </DialogHeader>

        {/* รายการภารกิจ */}
        {quests === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">โหลดภารกิจไม่สำเร็จ</p>
        ) : (
          <ul className="space-y-2">
            {quests.map((q) => (
              <li key={q.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{q.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{q.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {GOAL_LABEL[q.goalType]}
                      {q.goalType !== "AI_TOPIC" && ` · เป้า ${q.target}`}
                      {q.rewardIntimacy > 0 && " · "}
                      {q.rewardIntimacy > 0 && `รางวัล +${q.rewardIntimacy}❤`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => startEdit(q)} aria-label={`แก้ภารกิจ ${q.title}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      onClick={() => remove(q.id)}
                      aria-label={`ลบภารกิจ ${q.title}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {quests.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีภารกิจ</li>
            )}
          </ul>
        )}

        {/* ฟอร์มเพิ่ม/แก้ */}
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {editingId ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            {editingId ? "แก้ไขภารกิจ" : "เพิ่มภารกิจใหม่"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>ชื่อภารกิจ *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={60} placeholder="เช่น ชวนฉันไปเดินเล่นตอนเย็น" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>คำอธิบาย *</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="บอกผู้เล่นว่าต้องทำอะไร" />
            </div>
            <div className="space-y-1.5">
              <Label>ประเภท</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={form.goalType}
                onChange={(e) => setForm({ ...form, goalType: e.target.value as CreatorQuest["goalType"] })}
              >
                <option value="MESSAGES">จำนวนข้อความ</option>
                <option value="STREAK_DAYS">จำนวนวันที่แชท</option>
                <option value="AI_TOPIC">AI ตัดสิน (ภารกิจพิเศษ)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>รางวัลความสนิท (❤)</Label>
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
                <Label>เป้า {form.goalType === "STREAK_DAYS" ? "(วัน)" : "(ข้อความ)"}</Label>
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
                <Label>เกณฑ์ให้ AI ตัดสิน *</Label>
                <Textarea
                  rows={3}
                  value={form.criteriaPrompt}
                  onChange={(e) => setForm({ ...form, criteriaPrompt: e.target.value })}
                  maxLength={500}
                  placeholder="เช่น ผู้ใช้ชวนตัวละครไปดูดาวและตัวละครตอบตกลงอย่างจริงใจ"
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                ยกเลิก
              </Button>
            )}
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.description.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {editingId ? "บันทึกการแก้ไข" : "เพิ่มภารกิจ"}
            </Button>
          </div>
        </div>

        <p className="flex items-center justify-end gap-1 pb-1 text-xs text-muted-foreground">
          <Heart className="size-3 fill-current" aria-hidden /> ความสนิทสะสมของผู้เล่นช่วยให้ตัวละครเปิดใจและพูดจาสนิทสนมขึ้น
        </p>
      </DialogContent>
    </Dialog>
  );
}

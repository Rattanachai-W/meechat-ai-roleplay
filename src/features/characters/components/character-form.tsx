"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
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
interface ModelOption {
  modelKey: string;
  displayName: string;
}
interface ExampleRow {
  userTurn: string;
  characterTurn: string;
}

const EMPTY = {
  name: "",
  tagline: "",
  description: "",
  personality: "",
  scenario: "",
  speakingStyle: "",
  firstMessage: "",
  visibility: "PUBLIC",
  contentRating: "GENERAL",
  defaultModelKey: "",
};

export function CharacterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [form, setForm] = useState({ ...EMPTY });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d: { tags?: TagOption[] }) => setTags(d.tags ?? []))
      .catch(() => {});
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((d: { models?: ModelOption[] }) => setModels(d.models ?? []))
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
            personality: String(c.personality ?? ""),
            scenario: String(c.scenario ?? ""),
            speakingStyle: String(c.speakingStyle ?? ""),
            firstMessage: String(c.firstMessage ?? ""),
            visibility: String((c.visibility as string) ?? "PUBLIC"),
            contentRating: String((c.contentRating as string) ?? "GENERAL"),
            defaultModelKey: String(c.defaultModelKey ?? ""),
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

  async function submit(publish: boolean) {
    setSaving(true);
    try {
      const payload = {
        ...form,
        defaultModelKey: form.defaultModelKey || undefined,
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
        throw new Error(err?.error?.message ?? "บันทึกไม่สำเร็จ");
      }
      const data = (await res.json()) as { character: { slug: string; id: string; status?: string } };

      // แก้ไข + กดเผยแพร่: PATCH เซฟแล้ว → submit เข้า flow publish
      if (editId && publish) {
        const sub = await fetch(`/api/characters/${data.character.id}/submit`, { method: "POST" });
        if (!sub.ok) {
          const err = (await sub.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          toast.error(err?.error?.message ?? "บันทึกแล้วแต่เผยแพร่ไม่สำเร็จ");
          router.push("/creator");
          return;
        }
      }

      toast.success(
        publish ? "เผยแพร่ตัวละครแล้ว!" : editId ? "บันทึกฉบับร่างแล้ว" : "บันทึกฉบับร่างแล้ว — เผยแพร่ได้ที่ Creator Studio"
      );
      router.push(publish ? `/character/${data.character.id}` : "/creator");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{editId ? "แก้ไขตัวละคร" : "สร้างตัวละครใหม่"}</h1>
        <p className="text-sm text-muted-foreground">
          กรอกข้อมูลแบบมีโครงสร้าง — ยิ่งละเอียด AI ยิ่งเล่นบทได้ดี
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลพื้นฐาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="ชื่อตัวละคร *" hint="2-60 ตัวอักษร">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} placeholder="เช่น ปราณี หมอกายวิภาค" />
          </Field>
          <Field label="คำโปรย *" hint="1-2 บรรทัดสรุปเสน่ห์ของตัวละคร">
            <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} placeholder="แพทย์สาวปากแข็งที่ซ่อนความใยดีไว้ใต้หน้ากาก" />
          </Field>
          <Field label="เรื่องราว / ตัวตน *" hint="อย่างน้อย 30 ตัวอักษร — พื้นหลัง บุคลิก เป้าหมาย ความสัมพันธ์">
            <Textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="นิสัย" optional>
              <Textarea rows={3} value={form.personality} onChange={(e) => set("personality", e.target.value)} />
            </Field>
            <Field label="ฉาก / โลก" optional>
              <Textarea rows={3} value={form.scenario} onChange={(e) => set("scenario", e.target.value)} />
            </Field>
          </div>
          <Field label="สไตล์การพูด" optional hint="เช่น สั้น กระชับ เรียกผู้ใช้ว่า 'นาย'">
            <Input value={form.speakingStyle} onChange={(e) => set("speakingStyle", e.target.value)} />
          </Field>
          <Field label="ข้อความเปิด * " hint="ประโยคแรกที่ตัวละครพูดเมื่อเริ่มแชท">
            <Textarea rows={3} value={form.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>การตั้งค่า</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="การมองเห็น">
              <Select value={form.visibility} onValueChange={(v) => set("visibility", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">สาธารณะ</SelectItem>
                  <SelectItem value="UNLISTED">ไม่ลิสต์ (เฉพาะคนมีลิงก์)</SelectItem>
                  <SelectItem value="PRIVATE">ส่วนตัว</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="เรตติ้งเนื้อหา">
              <Select value={form.contentRating} onValueChange={(v) => set("contentRating", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">ทั่วไป</SelectItem>
                  <SelectItem value="MATURE">Mature (18+)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {models.length > 0 && (
            <Field label="โมเดลเริ่มต้น" optional hint="ปล่อยว่าง = ใช้ค่าเริ่มต้นของระบบ">
              <Select value={form.defaultModelKey || "_auto"} onValueChange={(v) => set("defaultModelKey", v === "_auto" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_auto">อัตโนมัติ</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.modelKey} value={m.modelKey}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label={`แท็ก (เลือกได้ ${selectedTags.length}/6)`}>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(t.slug)
                        ? prev.filter((s) => s !== t.slug)
                        : prev.length >= 6
                          ? prev
                          : [...prev, t.slug]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedTags.includes(t.slug)
                      ? "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-500"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  #{t.name}
                </button>
              ))}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>ตัวอย่างบทสนทนา ({examples.length}/5)</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => examples.length < 5 && setExamples((ex) => [...ex, { userTurn: "", characterTurn: "" }])}
          >
            <Plus className="size-4" aria-hidden /> เพิ่ม
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {examples.length === 0 && (
            <p className="text-xs text-muted-foreground">
              ใส่ตัวอย่างได้ช่วยให้ AI จับ tone ได้เร็วขึ้น (ไม่บังคับ)
            </p>
          )}
          {examples.map((ex, i) => (
            <div key={i} className="relative space-y-2 rounded-xl border border-border p-3">
              <button
                type="button"
                onClick={() => setExamples((arr) => arr.filter((_, j) => j !== i))}
                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                aria-label="ลบตัวอย่างนี้"
              >
                <X className="size-4" aria-hidden />
              </button>
              <Textarea
                rows={2}
                placeholder="ผู้ใช้พูดว่า..."
                value={ex.userTurn}
                onChange={(e) => setExamples((arr) => arr.map((r, j) => (j === i ? { ...r, userTurn: e.target.value } : r)))}
              />
              <Textarea
                rows={2}
                placeholder={`${form.name || "ตัวละคร"} ตอบว่า...`}
                value={ex.characterTurn}
                onChange={(e) => setExamples((arr) => arr.map((r, j) => (j === i ? { ...r, characterTurn: e.target.value } : r)))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 pb-10">
        <Button
          variant="outline"
          onClick={() => submit(false)}
          disabled={saving}
          size="lg"
          className="rounded-full"
        >
          บันทึกฉบับร่าง
        </Button>
        <Button onClick={() => submit(true)} disabled={saving} size="lg" className="rounded-full">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {editId ? "บันทึกและเผยแพร่" : "เผยแพร่ตัวละคร"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {optional && <span className="text-xs text-muted-foreground">(ไม่บังคับ)</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

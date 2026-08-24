"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

interface CreatorProfile {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  totalEarned: number;
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

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  DRAFT: { text: "ฉบับร่าง", className: "bg-muted text-muted-foreground" },
  PENDING: { text: "รอตรวจสอบ", className: "bg-amber-500/15 text-amber-600" },
  PUBLISHED: { text: "เผยแพร่แล้ว", className: "bg-emerald-500/15 text-emerald-600" },
  REJECTED: { text: "ถูกปฏิเสธ", className: "bg-red-500/15 text-red-600" },
};

export function CreatorStudio() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [stats, setStats] = useState<StudioStats | null>(null);
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);

  // onboarding form
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

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
      .catch(() => toast.error("โหลดข้อมูล studio ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [reload]);

  async function saveProfile() {
    if (!username.trim()) {
      toast.error("กรุณาระบุ username");
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
      if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
      toast.success("พร้อมเป็นครีเอเตอร์แล้ว! เริ่มสร้างตัวละครได้เลย");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
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
      toast.error(data?.error?.message ?? "เผยแพร่ไม่สำเร็จ");
      return;
    }
    toast.success("เผยแพร่แล้ว!");
    await reload();
  }

  async function deleteCharacter(id: string) {
    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast.error("ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบตัวละครแล้ว");
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
            <BookUser className="size-6 text-fuchsia-500" aria-hidden /> เปิด Creator Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            ตั้งชื่อครีเอเตอร์ของคุณ — หน้าโปรไฟล์สาธารณะจะอยู่ที่ /creator/{username || "username"}
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label>username *</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="a-z 0-9 _ (3-20 ตัว)"
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label>แนะนำตัว</Label>
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="เล่าให้ผู้เล่นรู้จักคุณ (ไม่บังคับ)"
                maxLength={500}
              />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile} className="w-full rounded-full">
              {savingProfile && <Loader2 className="size-4 animate-spin" aria-hidden />}
              เริ่มเลย
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── dashboard ──
  const statCards = stats
    ? [
        { icon: MessageSquare, label: "แชททั้งหมด", value: stats.totalChats },
        { icon: Heart, label: "ยอดไลก์รวม", value: stats.totalLikes },
        { icon: Users, label: "ผู้ติดตาม", value: stats.followerCount },
        { icon: Coins, label: "รายได้สะสม (coin)", value: stats.totalEarned },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookUser className="size-6 text-fuchsia-500" aria-hidden /> Creator Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            @{profile.username} • ได้รับ {stats?.totalEarned.toLocaleString("th-TH") ?? 0} coin จากการถูกแชท (10% ของพลังงานที่ใช้)
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link href="/create/character">+ สร้างตัวละครใหม่</Link>
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                <Icon className="size-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</p>
                <p className="truncate text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">ตัวละครของฉัน ({stats?.characterCount ?? 0})</h2>
        {characters.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            ยังไม่มีตัวละคร — เริ่มจากปุ่ม &quot;สร้างตัวละครใหม่&quot; ได้เลย
          </p>
        ) : (
          <div className="space-y-2">
            {characters.map((c) => {
              const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.DRAFT;
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/character/${c.slug}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>
                        <Badge variant="secondary" className={`rounded-full ${st.className}`}>
                          {st.text}
                        </Badge>
                        {c.visibility !== "PUBLIC" && (
                          <Badge variant="outline" className="rounded-full">
                            {c.visibility === "PRIVATE" ? "ส่วนตัว" : "ซ่อนจาก list"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.tagline}</p>
                      {c.reviewNote && (
                        <p className="mt-1 text-xs text-red-500">ผู้ตรวจ: {c.reviewNote}</p>
                      )}
                    </div>
                    <div className="text-right text-xs tabular-nums text-muted-foreground">
                      💬 {c.chatCount.toLocaleString("th-TH")} · ❤️ {c.likeCount.toLocaleString("th-TH")}
                    </div>
                    <div className="flex items-center gap-1">
                      {(c.status === "DRAFT" || c.status === "REJECTED") && (
                        <Button size="sm" variant="default" className="rounded-full" onClick={() => publishCharacter(c.id)}>
                          <Send className="size-4" aria-hidden /> เผยแพร่
                        </Button>
                      )}
                      <QuestManagerDialog characterId={c.id} characterName={c.name} />
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link href={`/create/character?edit=${c.id}`}>
                          <Pencil className="size-4" aria-hidden /> แก้ไข
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-destructive"
                        onClick={() => deleteCharacter(c.id)}
                        aria-label={`ลบ ${c.name}`}
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
          <h2 className="text-lg font-bold">รายได้ล่าสุด</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coin เข้าจากการที่ผู้เล่นแชทกับตัวละครของคุณ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {earnings.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
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

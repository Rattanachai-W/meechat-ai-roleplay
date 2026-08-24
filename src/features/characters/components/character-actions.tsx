"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Star, Play, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PersonaOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/** แถวปุ่ม action ของหน้าตัวละคร: เริ่มแชท / ถูกใจ / รายการโปรด / แก้ไข (owner) */
export function CharacterActions({
  characterId,
  isLoggedIn,
  isOwner,
  initial,
}: {
  characterId: string;
  isLoggedIn: boolean;
  isOwner: boolean;
  initial: { liked: boolean; favorited: boolean; likeCount: number; favoriteCount: number };
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initial.liked);
  const [favorited, setFavorited] = useState(initial.favorited);
  const [likeCount, setLikeCount] = useState(initial.likeCount);
  const [favoriteCount, setFavoriteCount] = useState(initial.favoriteCount);
  const [personaId, setPersonaId] = useState<string>("");
  const [personas, setPersonas] = useState<PersonaOption[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [pending, startTransition] = useTransition();

  async function ensurePersonas(): Promise<PersonaOption[]> {
    if (personas) return personas;
    const res = await fetch("/api/personas");
    if (!res.ok) return [];
    const data = (await res.json()) as { personas: PersonaOption[] };
    setPersonas(data.personas);
    return data.personas;
  }

  async function startChat() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setStarting(true);
    try {
      const list = await ensurePersonas();
      const chosenDefault = list.find((p) => p.isDefault)?.id ?? "";
      const chosen = personaId && personaId !== "_none" ? personaId : chosenDefault || null;
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          personaId: chosen,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(err?.error?.message ?? "เริ่มบทสนทนาไม่สำเร็จ");
      }
      const data = (await res.json()) as { conversation: { id: string } };
      router.push(`/chat/${data.conversation.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      setStarting(false);
    }
  }

  async function toggle(kind: "like" | "favorite") {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    const endpoint = kind === "like" ? "like" : "favorite";
    // optimistic
    if (kind === "like") {
      setLiked((v) => !v);
      setLikeCount((n) => n + (liked ? -1 : 1));
    } else {
      setFavorited((v) => !v);
      setFavoriteCount((n) => n + (favorited ? -1 : 1));
    }
    startTransition(async () => {
      const res = await fetch(`/api/characters/${characterId}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        // rollback
        if (kind === "like") {
          setLiked(liked);
          setLikeCount((n) => n + (liked ? 1 : -1));
        } else {
          setFavorited(favorited);
          setFavoriteCount((n) => n + (favorited ? 1 : -1));
        }
        toast.error("ทำรายการไม่สำเร็จ");
        return;
      }
      const data = (await res.json()) as { liked?: boolean; likeCount?: number; favorited?: boolean; favoriteCount?: number };
      if (kind === "like" && typeof data.liked === "boolean") {
        setLiked(data.liked);
        if (typeof data.likeCount === "number") setLikeCount(data.likeCount);
      }
      if (kind === "favorite" && typeof data.favorited === "boolean") {
        setFavorited(data.favorited);
        if (typeof data.favoriteCount === "number") setFavoriteCount(data.favoriteCount);
      }
    });
  }

  async function removeCharacter() {
    if (!confirm("ลบตัวละครนี้ถาวร? บทสนทนาที่เกี่ยวข้องจะถูกลบด้วย")) return;
    const res = await fetch(`/api/characters/${characterId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("ลบแล้ว");
      router.push("/discover");
    } else {
      toast.error("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startChat} disabled={starting || pending} className="rounded-full">
          <Play className="size-4" aria-hidden />
          {starting ? "กำลังเริ่ม..." : "เริ่มบทสนทนา"}
        </Button>

        <Button
          variant={liked ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => toggle("like")}
        >
          <Heart className={`size-4 ${liked ? "fill-current" : ""}`} aria-hidden />
          {likeCount.toLocaleString("th-TH")}
        </Button>
        <Button
          variant={favorited ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => toggle("favorite")}
        >
          <Star className={`size-4 ${favorited ? "fill-current" : ""}`} aria-hidden />
          {favoriteCount.toLocaleString("th-TH")}
        </Button>

        {isOwner && (
          <>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href={`/create/character?id=${characterId}`}>
                <Pencil className="size-4" aria-hidden /> แก้ไข
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-destructive hover:text-destructive"
              onClick={removeCharacter}
            >
              <Trash2 className="size-4" aria-hidden /> ลบ
            </Button>
          </>
        )}
      </div>

      {isLoggedIn && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">เล่นเป็น:</span>
          <Select value={personaId} onValueChange={setPersonaId}>
            <SelectTrigger size="sm" className="w-52 rounded-full">
              <SelectValue placeholder="(ไม่ระบุ — เป็นตัวเอง)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">(ไม่ระบุ — เป็นตัวเอง)</SelectItem>
              {(personas ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " ★" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/persona" className="text-xs underline hover:text-foreground">
            จัดการ persona
          </Link>
        </div>
      )}
      {!isLoggedIn && (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline">
            เข้าสู่ระบบ
          </Link>{" "}
          เพื่อเริ่มคุยได้ทันที
        </p>
      )}
    </div>
  );
}

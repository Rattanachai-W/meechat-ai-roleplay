"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function FollowButton({
  username,
  initialFollowing,
  isLoggedIn,
}: {
  username: string;
  initialFollowing: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setFollowing((v) => !v);
    setLoading(true);
    try {
      const res = await fetch(`/api/creators/${username}/follow`, { method: "POST" });
      const data = (await res.json()) as { following?: boolean };
      if (typeof data.following === "boolean") setFollowing(data.following);
      else throw new Error();
    } catch {
      setFollowing((v) => !v);
      toast.error("ทำรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={toggle}
      disabled={loading}
      variant={following ? "secondary" : "default"}
      size="sm"
      className="rounded-full"
    >
      {following ? (
        <>
          <UserCheck className="size-4" aria-hidden /> ติดตามอยู่
        </>
      ) : (
        <>
          <UserPlus className="size-4" aria-hidden /> ติดตาม
        </>
      )}
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <Button variant="outline" onClick={signOut} className="rounded-full">
      <LogOut className="size-4" aria-hidden /> ออกจากระบบ
    </Button>
  );
}

"use client";

import { useRouter } from "@/i18n/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="outline" onClick={signOut} className="rounded-full">
      <LogOut className="size-4" aria-hidden /> ออกจากระบบ
    </Button>
  );
}

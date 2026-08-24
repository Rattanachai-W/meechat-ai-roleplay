import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email?: string;
}

/** User ปัจจุบันจาก Supabase session (cached ต่อ request) — null ถ้ายังไม่ login */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
});

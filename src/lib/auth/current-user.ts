import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

export interface CurrentUser {
  id: string;
  email?: string;
}

/** User ปัจจุบันจาก Better Auth session (cached ต่อ request) — null ถ้ายังไม่ login */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email };
  } catch {
    return null;
  }
});

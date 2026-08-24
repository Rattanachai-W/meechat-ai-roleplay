import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Static assets / internal routes ไม่ต้องผ่าน session refresh
function shouldSkip(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$/.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  if (shouldSkip(request)) return;
  return await updateSession(request);
}

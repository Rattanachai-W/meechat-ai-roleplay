import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, requireSupabaseConfig } from "@/lib/env";

/**
 * Server client สำหรับ Server Components / Route Handlers / Server Actions
 * อ่าน-เขียน session cookies ผ่าน next/headers
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // เรียกจาก Server Component ที่ set cookie ไม่ได้ — session refresh
          // จะถูกจัดการโดย proxy middleware แทน
        }
      },
    },
  });
}

/**
 * Admin client ใช้ service_role key — bypass RLS
 * ห้าม import module นี้เข้า client component เด็ดขาด
 */
export function createSupabaseAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin config missing: ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

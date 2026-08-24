import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/env";

/** Browser client สำหรับ Client Components — เรียกภายใน event handlers / effects */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey);
}

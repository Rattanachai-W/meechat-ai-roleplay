import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUser } from "@/lib/api/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const bodySchema = z.object({
  confirm: z.literal("DELETE"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    bodySchema.parse(await request.json());

    // App data cascade via users FK
    await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
      // If mirror row missing, still try auth delete
    });

    // Best-effort auth user delete via admin API when service role is configured
    if (env.SUPABASE_SERVICE_ROLE_KEY && env.NEXT_PUBLIC_SUPABASE_URL) {
      await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }).catch(() => null);
    }

    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut().catch(() => null);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof ApiError) return jsonErrorResponseLocalized(error);
    return jsonErrorResponseLocalized(error);
  }
}

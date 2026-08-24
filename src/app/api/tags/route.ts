import { NextResponse } from "next/server";
import { jsonErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/** GET /api/tags — tag ทั้งหมดสำหรับฟอร์มสร้างตัวละคร/ตัวกรอง */
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";

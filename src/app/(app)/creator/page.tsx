import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CreatorStudio } from "@/features/creators/components/creator-studio";

export const metadata: Metadata = { title: "Creator Studio — MeeChat" };
export const dynamic = "force-dynamic";

export default async function CreatorStudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <CreatorStudio />;
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PersonaManager } from "@/features/persona/components/persona-manager";

export const metadata: Metadata = { title: "Persona ของฉัน — MeeChat" };
export const dynamic = "force-dynamic";

export default async function PersonaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <PersonaManager />;
}

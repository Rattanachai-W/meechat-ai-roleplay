import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterForm } from "@/features/characters/components/character-form";

export const metadata: Metadata = { title: "สร้างตัวละคร — MeeChat" };

export default function CreateCharacterPage() {
  return (
    <Suspense>
      <CharacterForm />
    </Suspense>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";

interface PlaceholderPageProps {
  title: string;
}

/** หน้า placeholder สำหรับ route ที่จะ implement ใน milestone ถัดไป */
export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground max-w-md">
        หน้านี้อยู่ระหว่างการพัฒนา จะพร้อมใช้งานใน milestone ถัดไป
      </p>
      <Button asChild variant="outline">
        <Link href="/">กลับหน้าหลัก</Link>
      </Button>
    </main>
  );
}

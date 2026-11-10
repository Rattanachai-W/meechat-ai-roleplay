import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ฟอนต์ไทยหลักของแพลตฟอร์ม — Thai-first typography
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MeeChat — AI Roleplay ภาษาไทย",
    template: "%s | MeeChat",
  },
  description:
    "แพลตฟอร์ม AI Roleplay Chatbot ที่ออกแบบมาเพื่อภาษาไทยโดยเฉพาะ คุยกับตัวละคร AI สร้างตัวละครและ Persona ของคุณเอง",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      // Dark-first UX; theme switcher จะมาแทน class ตรงนี้ในภายหลัง
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansThai.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        {children}
        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}

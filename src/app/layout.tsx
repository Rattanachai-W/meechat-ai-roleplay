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

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MeeChat — AI Roleplay",
    template: "%s | MeeChat",
  },
  description:
    "AI roleplay chat for Thai and global players. Talk with characters, create personas, and publish your own cast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
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

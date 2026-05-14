import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { profile } from "@/lib/data";
import "./globals.css";

// self-host JetBrains Mono via next/font。build 时下载到 _next/static/media，
// 运行时不再访问 Google，跨 Mac/Windows 字体完全一致。
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-mono-jetbrains",
});

export const metadata: Metadata = {
  title: `${profile.name} · ${profile.tagline}`,
  description: `${profile.name}${profile.aka ? ` / ${profile.aka}` : ""} · ${profile.bio}`,
};

export const viewport: Viewport = {
  themeColor: "#050608",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${jetbrains.variable} dark`}>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { profile } from "@/lib/data";
// Iosevka (拉丁等宽，瘦窄复古终端字形) + Sarasa Mono J (subset 后的 CJK)
// 共同构成站点的等宽字体栈。Iosevka 通过 fontsource 自托管，CJK 由
// scripts/gen-fonts.ts 从 Sarasa-Regular.ttc 抽出本站实际用到的字符。
import "@fontsource/iosevka/400.css";
import "@fontsource/iosevka/500.css";
import "@fontsource/iosevka/600.css";
import "./globals.css";

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
    <html lang="zh-CN" className="dark">
      <head>
        {/* 自托管 CJK subset (~80KB)，preload 避免首屏中日字符 FOUT */}
        <link
          rel="preload"
          href="/fonts/cjk-mono.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}

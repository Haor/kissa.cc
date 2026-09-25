import type { Metadata, Viewport } from "next";
import { profile } from "@/lib/data";
// 字体全部是 scripts/gen-fonts.ts subset 出的自托管 woff2，@font-face 在 globals.css：
//   Kissa Mono (Iosevka) / Kissa Serif (Cormorant Italic) / CJK Mono (Sarasa Mono J)
import "./globals.css";

export const metadata: Metadata = {
  title: `${profile.name} · ${profile.tagline}`,
  description: `${profile.name}${profile.aka ? ` / ${profile.aka}` : ""} · ${profile.title} · ${profile.bio}`,
};

export const viewport: Viewport = {
  themeColor: "#09090a",
  viewportFit: "cover",
};

const PRELOAD = [
  "/fonts/iosevka-400.woff2",
  "/fonts/iosevka-500.woff2",
  "/fonts/cormorant-400-italic.woff2",
  "/fonts/cjk-mono.woff2",
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {PRELOAD.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      <body className="min-h-screen bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}

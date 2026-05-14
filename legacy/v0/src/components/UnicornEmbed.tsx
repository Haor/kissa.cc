"use client";

/**
 * Unicorn Studio 叠加层。两种模式：
 *
 *   mode="sdk"    通过官方 SDK 加载（推荐用于自己 Legend 账号发布的作品）
 *   mode="iframe" 直接 <iframe> 嵌入 https://www.unicorn.studio/embed/<id>
 *                 适合临时调研／引用他人公开 embed
 *
 * 关于版权：他人的 projectId 受 Unicorn Studio 版权保护，仅可用于临时引用，
 * 不能把 JSON 下载下来自托管或再分发。商用请在自己账号下重做并导出 JSON。
 */
import Script from "next/script";

type Props = {
  projectId?: string;
  className?: string;
  blend?: "screen" | "lighten" | "plus-lighter" | "normal";
  mode?: "sdk" | "iframe";
};

export default function UnicornEmbed({
  projectId,
  className,
  blend = "screen",
  mode = "sdk",
}: Props) {
  if (!projectId) return null;

  if (mode === "iframe") {
    return (
      <iframe
        title="Unicorn Studio scene"
        src={`https://www.unicorn.studio/embed/${projectId}`}
        className={className}
        style={{
          border: 0,
          mixBlendMode: blend,
          pointerEvents: "none",
        }}
        allow="autoplay"
        loading="lazy"
      />
    );
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.12/dist/unicornStudio.umd.js"
        strategy="lazyOnload"
      />
      <div
        data-us-project={projectId}
        className={className}
        style={{ mixBlendMode: blend, pointerEvents: "none" }}
      />
    </>
  );
}

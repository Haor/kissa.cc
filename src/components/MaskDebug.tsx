"use client";

/**
 * DEV-ONLY 调试组件：把所有 5 个 mask（预渲染 PNG，加载为 ImageBitmap）显示在
 * 左上角，让 Safari/Chrome 可以并排截图对比加载链路输出。
 *
 * Bug 2 已通过将 SVG → PNG 改为 build-time 预渲染解决；此组件保留作为后续 mask
 * 改动时的视觉回归保护，确认 PNG 解码 + ImageBitmap 跨浏览器一致。
 */

import { useEffect, useRef, useState } from "react";
import { MASK_URLS, type MaskId } from "@/assets/masks";

const MASK_IDS: MaskId[] = ["x", "instagram", "github", "huggingface", "steam"];
const THUMB_PX = 96;

export function MaskDebug() {
  const [canvases, setCanvases] = useState<Record<string, HTMLCanvasElement>>(
    {},
  );
  const [ua, setUa] = useState<string>("");

  useEffect(() => {
    setUa(navigator.userAgent);
    let cancelled = false;
    (async () => {
      const out: Record<string, HTMLCanvasElement> = {};
      for (const id of MASK_IDS) {
        try {
          const res = await fetch(MASK_URLS[id]);
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob, {
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
            imageOrientation: "from-image",
          });
          if (cancelled) return;
          const c = document.createElement("canvas");
          c.width = bitmap.width;
          c.height = bitmap.height;
          c.getContext("2d")!.drawImage(bitmap, 0, 0);
          bitmap.close();
          out[id] = c;
          setCanvases({ ...out });
        } catch (err) {
          console.error("[mask-debug] load failed", id, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const browser =
    ua.includes("Chrome") && !ua.includes("Edg")
      ? "CHROME"
      : ua.includes("Safari") && !ua.includes("Chrome")
        ? "SAFARI"
        : ua.includes("Firefox")
          ? "FIREFOX"
          : "OTHER";

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: 12,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "rgba(0,0,0,0.92)",
        padding: 10,
        border: "1px solid rgba(255,255,255,0.35)",
        borderRadius: 6,
        fontFamily: "monospace",
        color: "#fff",
        fontSize: 10,
        pointerEvents: "none",
      }}
      data-no-drag
    >
      <div style={{ opacity: 0.7 }}>mask debug v2 · {browser}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {MASK_IDS.map((id) => (
          <MaskThumb key={id} id={id} src={canvases[id] ?? null} />
        ))}
      </div>
    </div>
  );
}

function MaskThumb({
  id,
  src,
}: {
  id: string;
  src: HTMLCanvasElement | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!src || !ref.current) return;
    const dst = ref.current;
    const ctx = dst.getContext("2d")!;
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, dst.width, dst.height);
  }, [src]);

  return (
    <div style={{ textAlign: "center" }}>
      <canvas
        ref={ref}
        width={THUMB_PX}
        height={THUMB_PX}
        style={{
          background: "#1a1a1a",
          display: "block",
          imageRendering: "pixelated",
        }}
      />
      <div style={{ marginTop: 4, opacity: 0.85 }}>
        {id}
        {src && <span style={{ opacity: 0.5 }}> · {src.width}</span>}
      </div>
    </div>
  );
}

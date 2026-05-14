"use client";

import { useEffect, useState } from "react";
import { MASK_URLS, type MaskId } from "@/assets/masks";

/**
 * Mask 加载 hook。
 *
 * 演进史：
 * 1. 旧路径（已废弃）：运行时 SVG → canvas → texture。Chrome 对复杂 path
 *    rasterize 不稳定（GitHub Octocat 的相对坐标 path 在 Chrome 上整片透明）。
 * 2. 中间路径：fetch 预渲染 PNG → ImageBitmap → texImage2D(ImageBitmap)。
 *    PNG 数据本身正确（MaskDebug 验证），但 Chrome 对 ImageBitmap 作为
 *    WebGL TexImageSource 实现有问题，texture 内容近似全 0。
 * 3. 当前路径：fetch PNG → ImageBitmap → drawImage 到 HTMLCanvasElement →
 *    texImage2D(canvas)。和 atlas 完全相同的上传路径，atlas 在 Chrome 上
 *    工作正常，所以 mask 也一定 work。MaskDebug 用 canvas2D 显示 5 个 PNG
 *    完美——证明 ImageBitmap→canvas 这一步是确定性的。
 *
 * 这里返回 HTMLCanvasElement 而不是 ImageBitmap 是关键修复点。
 */
const cache: Partial<Record<MaskId, HTMLCanvasElement>> = {};
const inflight: Partial<Record<MaskId, Promise<HTMLCanvasElement>>> = {};

async function loadMask(id: MaskId): Promise<HTMLCanvasElement> {
  const res = await fetch(MASK_URLS[id]);
  if (!res.ok) throw new Error(`mask ${id}: HTTP ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    imageOrientation: "from-image",
  });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export function useMask(id: MaskId | undefined): HTMLCanvasElement | null {
  const [tex, setTex] = useState<HTMLCanvasElement | null>(
    id ? cache[id] ?? null : null,
  );

  useEffect(() => {
    if (!id) {
      setTex(null);
      return;
    }
    if (cache[id]) {
      setTex(cache[id]!);
      return;
    }
    let cancelled = false;
    const p =
      inflight[id] ??
      (inflight[id] = loadMask(id).then((bitmap) => {
        cache[id] = bitmap;
        return bitmap;
      }));
    p.then((b) => {
      if (!cancelled) setTex(b);
    }).catch((err) => {
      console.error("[mask] load failed", id, err);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return tex;
}

#!/usr/bin/env tsx
/**
 * Build-time mask generator.
 *
 * 把每个 mask 的源（SVG 或 PNG）离线渲染成 1024×1024 灰度 mask PNG，
 * 输出到 public/masks/{id}.png。
 *
 * 为什么离线？运行时浏览器 SVG 解码（尤其 Chrome）对含子像素相对坐标的 path
 * 不可靠（典型的就是 GitHub octocat），且 canvas→texture 上传跨浏览器有 alpha
 * 预乘差异。改用预渲染的 PNG 后：
 *   - SVG 光栅化在 Node + @resvg/resvg-js（Rust）里做，跨平台 deterministic
 *   - PNG 源直接 pngjs decode，灰度阈值化
 *   - 运行时只需 fetch + createImageBitmap，浏览器 PNG 解码 100% 一致
 *
 * 渲染参数（保持视觉效果不变）：
 *   - size = 1024×1024
 *   - padding = 10%（源居中放在 80% 内框）
 *   - boxMax dilation r ≈ size * 0.6%（约 6 px）
 *   - boxBlur r ≈ size * 1.0%（约 10 px）
 *   - 输出像素 = (density, density, density, 255)，alpha 恒 255 消除预乘歧义
 *
 * 运行：`npm run gen-masks`
 */
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MASKS, type MaskId } from "../src/assets/masks.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "public", "masks");
const SOURCES_DIR = join(__dirname, "mask-sources");

const SIZE = 1024;
const PADDING = 0.1;

/**
 * Mask 源描述。每个 MaskId 选一种：
 *  - svg: 从 src/assets/masks.ts 取字符串，resvg 渲染
 *  - png: 从 scripts/mask-sources/{file} 读 PNG（任意尺寸，白色剪影 + 透明背景）
 */
type MaskSource =
  | { kind: "svg" }
  | { kind: "png"; file: string };

const MASK_SOURCES: Record<MaskId, MaskSource> = {
  x: { kind: "svg" },
  instagram: { kind: "svg" },
  github: { kind: "svg" },
  huggingface: { kind: "png", file: "huggingface.png" },
  steam: { kind: "svg" },
};

function boxMax(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1; i++) if (src[row + i] > m) m = src[row + i];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let i = y0; i <= y1; i++) {
        const v = tmp[i * w + x];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++)
      acc += src[row + Math.max(0, Math.min(w - 1, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = Math.round(acc / k);
      const xAdd = Math.min(w - 1, x + r + 1);
      const xSub = Math.max(0, x - r);
      acc += src[row + xAdd] - src[row + xSub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++)
      acc += tmp[Math.max(0, Math.min(h - 1, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(acc / k);
      const yAdd = Math.min(h - 1, y + r + 1);
      const ySub = Math.max(0, y - r);
      acc += tmp[yAdd * w + x] - tmp[ySub * w + x];
    }
  }
  return out;
}

/** 把 (innerPixels RGBA, innerW, innerH) 居中合成到 SIZE×SIZE alpha buffer。 */
function composeBinary(
  innerPixels: Uint8Array | Buffer,
  innerW: number,
  innerH: number,
): Uint8Array {
  const w = SIZE;
  const h = SIZE;
  const binary = new Uint8Array(w * h);
  const dx = ((SIZE - innerW) / 2) | 0;
  const dy = ((SIZE - innerH) / 2) | 0;
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const a = innerPixels[(y * innerW + x) * 4 + 3];
      if (a > 0) binary[(dy + y) * w + (dx + x)] = 255;
    }
  }
  return binary;
}

/** 把 PNG buffer 解码并等比缩放到指定 inner 框（保留宽高比、居中），返回 RGBA。 */
async function decodeAndFitPng(
  buf: Buffer,
  innerSize: number,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const decoded = PNG.sync.read(buf);
  const sw = decoded.width;
  const sh = decoded.height;
  const scale = Math.min(innerSize / sw, innerSize / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const out = new Uint8Array(dw * dh * 4);
  // 最近邻取样：mask 不需要重采样质量，binary 阈值化稳定就够
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x / scale));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = decoded.data[si];
      out[di + 1] = decoded.data[si + 1];
      out[di + 2] = decoded.data[si + 2];
      out[di + 3] = decoded.data[si + 3];
    }
  }
  return { pixels: out, width: dw, height: dh };
}

async function renderMask(id: MaskId): Promise<void> {
  const innerSize = Math.round(SIZE * (1 - PADDING * 2));
  const source = MASK_SOURCES[id];
  let binary: Uint8Array;

  if (source.kind === "svg") {
    const svg = MASKS[id];
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: innerSize },
      background: "rgba(0,0,0,0)",
    });
    const rendered = resvg.render();
    binary = composeBinary(
      rendered.pixels,
      rendered.width,
      rendered.height,
    );
  } else {
    const buf = await readFile(join(SOURCES_DIR, source.file));
    const fitted = await decodeAndFitPng(buf, innerSize);
    binary = composeBinary(fitted.pixels, fitted.width, fitted.height);
  }

  const dilateR = Math.max(2, Math.round(SIZE * 0.006));
  const blurR = Math.max(2, Math.round(SIZE * 0.01));
  const dilated = boxMax(binary, SIZE, SIZE, dilateR);
  const blurred = boxBlur(dilated, SIZE, SIZE, blurR);

  const png = new PNG({ width: SIZE, height: SIZE, colorType: 6 });
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = blurred[i];
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  const outPath = join(OUT_DIR, `${id}.png`);
  const buf = PNG.sync.write(png, { colorType: 6 });
  await writeFile(outPath, buf);

  let nonZero = 0;
  let solid = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (blurred[i] > 0) nonZero++;
    if (blurred[i] >= 224) solid++;
  }
  const nzPct = ((nonZero / (SIZE * SIZE)) * 100).toFixed(1);
  const solidPct = ((solid / (SIZE * SIZE)) * 100).toFixed(1);
  const kind = source.kind.toUpperCase();
  console.log(
    `  ${id.padEnd(12)} [${kind}] → ${outPath.replace(REPO_ROOT + "/", "")}  ` +
      `(${(buf.length / 1024).toFixed(1)} KB, nonZero=${nzPct}%, solid=${solidPct}%)`,
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating masks → ${OUT_DIR.replace(REPO_ROOT + "/", "")}/`);
  const ids = Object.keys(MASK_SOURCES) as MaskId[];
  for (const id of ids) {
    await renderMask(id);
  }
  console.log(`✓ ${ids.length} masks generated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

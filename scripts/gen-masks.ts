#!/usr/bin/env tsx
/**
 * Build-time mask generator.
 *
 * 把 src/assets/masks.ts 里的 5 个内嵌 SVG 离线渲染成 PNG 静态资源，输出到
 * public/masks/{id}.png。
 *
 * 为什么离线？运行时浏览器 SVG 解码（尤其 Chrome）对含子像素相对坐标的 path
 * 不可靠（典型的就是 GitHub octocat），且 canvas→texture 上传跨浏览器有 alpha
 * 预乘差异。改用预渲染的 PNG 后：
 *   - SVG 光栅化在 Node + @resvg/resvg-js（Rust）里做，跨平台 deterministic
 *   - 运行时只需 fetch + createImageBitmap，浏览器 PNG 解码 100% 一致
 *
 * 渲染参数（保持视觉效果不变）：
 *   - size = 1024×1024
 *   - padding = 10%（SVG 居中放在 80% 内框）
 *   - boxMax dilation r ≈ size * 0.6%（约 6 px）
 *   - boxBlur r ≈ size * 1.0%（约 10 px）
 *   - 输出像素 = (density, density, density, 255)，alpha 恒 255 消除预乘歧义
 *
 * 运行：`npm run gen-masks`
 */
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MASKS, type MaskId } from "../src/assets/masks.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "public", "masks");

const SIZE = 1024;
const PADDING = 0.1;

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

async function renderMask(id: MaskId, svg: string): Promise<void> {
  // 先用 resvg 渲染到一个"内框"大小（应用 padding），居中合成到 SIZE×SIZE。
  const innerSize = Math.round(SIZE * (1 - PADDING * 2));
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: innerSize },
    background: "rgba(0,0,0,0)",
  });
  const rendered = resvg.render();
  const innerW = rendered.width;
  const innerH = rendered.height;
  const innerPixels = rendered.pixels;

  // 1024×1024 alpha buffer（单通道，binary：> 0 即为 255）
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

  // dilation + blur，参数与原 svg-mask.ts 一致
  const dilateR = Math.max(2, Math.round(SIZE * 0.006));
  const blurR = Math.max(2, Math.round(SIZE * 0.01));
  const dilated = boxMax(binary, w, h, dilateR);
  const blurred = boxBlur(dilated, w, h, blurR);

  // 写到 RGBA buffer：(v, v, v, 255)。alpha 恒 255 消除任何预乘歧义。
  const png = new PNG({ width: w, height: h, colorType: 6 });
  for (let i = 0; i < w * h; i++) {
    const v = blurred[i];
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  const outPath = join(OUT_DIR, `${id}.png`);
  const buf = PNG.sync.write(png, { colorType: 6 });
  await writeFile(outPath, buf);

  // 简要 stats
  let nonZero = 0;
  let solid = 0;
  for (let i = 0; i < w * h; i++) {
    if (blurred[i] > 0) nonZero++;
    if (blurred[i] >= 224) solid++;
  }
  const nzPct = ((nonZero / (w * h)) * 100).toFixed(1);
  const solidPct = ((solid / (w * h)) * 100).toFixed(1);
  console.log(
    `  ${id.padEnd(12)} → ${outPath.replace(REPO_ROOT + "/", "")}  ` +
      `(${(buf.length / 1024).toFixed(1)} KB, nonZero=${nzPct}%, solid=${solidPct}%)`,
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating masks → ${OUT_DIR.replace(REPO_ROOT + "/", "")}/`);
  const ids = Object.keys(MASKS) as MaskId[];
  for (const id of ids) {
    await renderMask(id, MASKS[id]);
  }
  console.log(`✓ ${ids.length} masks generated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

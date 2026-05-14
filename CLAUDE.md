# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ASCII carousel 个人主页 — 8 屏横向全屏翻页，每屏代表一个身份/社交名片。全站使用 WebGL2 fragment shader 渲染 ASCII 字符场，SVG mask 控制品牌 logo 密度，字符散开/凝聚实现转场。

## Commands

```bash
npm run dev            # 本地开发 (http://localhost:3000)
npm run build          # 静态导出到 out/
npm run deploy         # 构建 + CF Pages production 部署
npm run deploy:preview # 构建 + CF Pages preview 部署
npx tsc --noEmit       # 类型检查（无 lint / 无测试套件）
```

部署注意：`npx wrangler` 不要带 `@latest`（npm 会把它当 script name 报错），直接 `wrangler pages deploy out --project-name=profile --commit-dirty=true`。

## Tech Stack

- Next.js 15 + React 19 + TypeScript，`output: "export"` 纯静态导出
- Tailwind CSS v4（PostCSS 插件模式，`@import "tailwindcss"` 写法）
- WebGL2 fragment shader（内联 GLSL，字符 atlas + 程序化噪声 + SVG mask）
- framer-motion（动画）、zustand（carousel 状态）
- Cloudflare Pages 部署（wrangler）

## Architecture

### 渲染管线

```
page.tsx → Carousel → SlideShell × 8 → AsciiStage (WebGL2)
```

- **Carousel** (`src/components/Carousel.tsx`): 翻页核心。聚合 wheel / touch / pointer drag / keyboard / URL hash 输入，驱动 RAF 缓动（600ms easeInOutExpo），控制 strip 的 `translate3d`。
- **SlideShell** (`src/components/SlideShell.tsx`): 每屏壳。根据 `slide.id` 分发到 4 种内容模板（cover / about / brand / contact），叠加顶底渐变蒙层。
- **AsciiStage** (`src/components/AsciiStage.tsx`): WebGL2 字符渲染器。整个 fragment shader 内联在文件顶部（`FRAG` 常量）。包含 7 种 effect（mushroom / wave / orbit / chaos / grid / drift / starfield）、鼠标交互、SVG mask 密度增强、scatter 转场。仅 active 屏和 warm 邻屏运行 RAF；active 60fps，warm 30fps。

### 状态管理

- **useCarousel** (`src/lib/use-carousel.ts`): zustand store。`goto(delta)` / `gotoIndex(n)` 触发翻页，transition 期间 busy=true 时缓存最后一次输入到 `pending`。COOLDOWN_MS=720ms。

### 数据层（纯声明式，无 API）

- `src/lib/data.ts` — 个人基础信息
- `src/lib/slides.ts` — 8 屏定义：id / theme / effect / cellSize / speed / maskId / handle / intent / CTA / contacts
- `src/lib/theme.ts` — 每屏主题色（CSS hex + 0-1 归一化 RGB 供 shader uniform）
- `src/assets/masks.ts` — 品牌 SVG 字符串（x / instagram / github / huggingface / steam）

### SVG Mask 管线

`masks.ts`(SVG 字符串) → `use-mask.ts`(异步加载+缓存) → `svg-mask.ts`(Blob URL 光栅化为 canvas，box-max dilation + box-blur 边缘羝化) → `AsciiStage`(texImage2D 上传为 u_mask)

shader 中 mask 是**密度增强场，不是裁剪**（`AsciiStage.tsx:272-296`）：满屏始终跑 effect；mask 内推高亮度 floor + 略微 boost；mask 外保持原 effect 但小幅 attenuate 让中心聚焦。用户已明确否决"裁剪"模式（图标内有字符、外部全黑），**绝对不要回退成裁剪**。

### Shader 注意事项

- 全部 GLSL 内联在 `AsciiStage.tsx` 的 `FRAG` 常量中，不是外部文件
- mask 纹理 Y 轴在 shader 中显式翻转（`1.0 - maskPx.y`），不依赖 `UNPACK_FLIP_Y_WEBGL`，跨 Safari/Chrome 一致
- fbm 统一 3 octaves、1-warp，牺牲微小视觉换性能
- bloom 仅在 `lum > 0.18` 时计算（跳过暗区节省 ~80% 调用）
- 每种 effect 有独立的字符集（`CHARSETS_BY_EFFECT`）和 glow 强度（`GLOW_BY_EFFECT`）

## Cross-Browser Bug Status

1. **[已修复] Chrome mask Y 翻转**：Safari 有隐式 Y flip quirk，Chrome 严格按规范。修复：shader 中显式 `1.0 - maskPx.y`（`AsciiStage.tsx:282`），不依赖 `UNPACK_FLIP_Y_WEBGL`。**不要**改回用 `UNPACK_FLIP_Y_WEBGL`。

2. **[已修复] Chrome 上品牌 mask 屏内部过暗**：mask texture、`u_useMask` 和 UV 采样均正常；早期问题的关键是 GitHub 源 SVG 是 inverse mark（外圆为高密度区、Octocat 为低密度洞），违反 shader 的“bright mask = dense ASCII”契约。`scripts/gen-masks.ts` 现在会把 GitHub 源转换成 positive Octocat density mask，并过滤离散负形噪声。不要简单 `gl.disable(gl.BLEND)`，那会让 Safari/整体视觉过硬。当前修复保持 blending + `premultipliedAlpha: true`。

## Do NOT

- 不要在 `AsciiStage` 的 useEffect 依赖里加 `targetTransition`——它每帧变化，会导致 GL context 每帧重建。当前用 `targetTransitionRef` 绕开。
- 不要把 `legacy/v0/` 拉回 tsconfig include。
- 不要改 `next.config.ts` 的 `output: "export"` / `images: { unoptimized: true }` / `trailingSlash: true`——任意一个都可能破 CF Pages 部署。
- 不要在 `src/assets/masks.ts` 的 SVG 里手动加 `width`/`height`，让 `ensureSvgDimensions` 处理。
- 改文案/账号只改数据文件（`data.ts` / `slides.ts` / `theme.ts` / `masks.ts`），不要改组件。

## Conventions

- 路径别名 `@/*` → `./src/*`
- 所有组件都是 `"use client"`
- 全站只用等宽字体（JetBrains Mono / Fira Code / IBM Plex Mono）
- 每屏主题色通过 CSS 变量 `--bg / --fg / --accent` 传递到 SlideShell 子树
- `docs/HANDOFF.md` 是上一个 agent 的交接文档，架构描述可参考，但其中的 bug 修复结论不可靠——需基于代码事实验证

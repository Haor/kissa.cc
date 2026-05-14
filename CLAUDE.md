# CLAUDE.md

给 Claude Code / Cursor agent 在本仓库工作时的指引。**信息可能滞后；优先以代码和最近 commit 为准。**

## 当前基线

v1（2026-05-14 起）—— 单 GL stage 架构 + 字符散开重组转场 + JSON 文案解耦。
首个基线 commit：见 `git log` 第一条非自描述的提交。

## What This Is

ASCII carousel 个人主页 —— **10 屏**横向全屏翻页，每屏一个身份/社交名片。WebGL2 fragment shader 渲染全屏字符场，brand mask 控制 logo 密度，字符散开 / 凝聚实现转场。

## Commands

```bash
npm run dev            # 本地开发 (http://localhost:3000)
npm run build          # gen-masks + next build → out/
npm run deploy         # build + CF Pages production (branch=main)
npm run deploy:preview # build + CF Pages preview
npx tsc --noEmit       # 类型检查（无 lint / 无测试套件）
```

`gen-masks` 会重生 `public/masks/*.png`，commit 时这些 PNG 视为构建产物。

## Tech Stack

- Next.js 15 + React 19 + TypeScript，`output: "export"` 纯静态导出
- Tailwind CSS v4（PostCSS 插件模式，`@import "tailwindcss"`）
- WebGL2 fragment shader（GLSL 字符串 + 字符 atlas + 程序化噪声 + mask 纹理）
- zustand（carousel 状态）
- next/font/google · JetBrains Mono 跨平台一致

## Architecture (v1)

### 组件树

```
page.tsx → Carousel
            ├─ SceneStage          单实例 GL 渲染器（常驻 fixed canvas）
            └─ SlideShell × 10     纯 DOM 内容层（chrome + content + gradient）
```

- **Carousel** (`src/components/Carousel.tsx`)
  - 聚合输入：wheel / pointer drag / keyboard / URL hash
  - 10 个 SlideShell 绝对叠放（无 strip translate），用 opacity 跟 `transition` 进度做 cross-fade
  - 700ms easeInOutExpo（`prefers-reduced-motion` 时降到 200ms）
- **SceneStage** (`src/components/SceneStage.tsx`)
  - **1 个 GL context、1 个 RAF**，10 个 effect 的字符 atlas 在 mount 时全部预建好、纹理常驻 GPU
  - 切 slide 只更新 uniform + 切 atlas / mask 纹理绑定，**不重建 context**
  - 转场分两段：`progress < 0.5` 渲染旧屏 + `u_transition: 0→+1` 散开；`>= 0.5` 渲染新屏 + `u_transition: -1→0` 聚合
  - DPR cap = 1.0 + 总像素上限 1.2M，60fps，`document.hidden` 时暂停 RAF
- **SlideShell** (`src/components/SlideShell.tsx`)
  - 不再持有 GL；只渲染 chrome（左上 label/index、右上 `kissa.cc`）+ 内容模板（cover / about / brand / hardware / links / contact）+ 顶底柔化 gradient
- **`src/lib/ascii-gl.ts`** —— shader 字符串、charsets / glow 表、`buildAtlas` / `linkProgram` 工具，让 SceneStage 单点消费

### 状态

- **useCarousel** (`src/lib/use-carousel.ts`): zustand store。`goto / gotoIndex / gotoId` 触发翻页，busy 期间最后一次输入存到 `pending`。`transition` 0..1 由 Carousel 的 RAF 推进，SceneStage 直接 `useCarousel.getState()` 每帧读取，不重建 effect。

### 数据 / 文案分层（重要）

```
src/content/site.json          ←  文案层：所有文字 / 链接 / handle / 硬件清单
src/lib/slides.ts              ←  视觉层：每屏 id / label / theme / effect / cellSize / speed / maskId
                                  模块加载时合并两层 → 导出 SLIDES
src/lib/data.ts                ←  从 site.json 转发 profile object
src/lib/theme.ts               ←  每屏主题色（hex + 0-1 RGB 供 shader uniform）
```

**改文字 → 只动 `src/content/site.json`**。schema 在 `site.schema.json`，README 在 `src/content/README.md`。

### Mask 管线（离线预生成）

```
scripts/mask-sources/*.{svg,png}
  → scripts/gen-masks.ts (resvg-js / pngjs + boxMax dilation + boxBlur feather)
  → public/masks/*.png
  → src/lib/use-mask.ts (fetch + decode → HTMLCanvasElement，模块级缓存)
  → SceneStage 单个 mask 纹理对象，切 slide 时 texImage2D 重新上传
```

shader 中 mask 是**密度增强场，不是裁剪**（满屏始终跑 effect；mask 内推高 floor + 略微 boost；mask 外保持原 effect 略 attenuate 让中心聚焦）。用户已明确否决"裁剪"模式，**绝对不要回退**。

### Shader 注意

- 全部 GLSL 在 `src/lib/ascii-gl.ts` 的 `FRAG` 常量；不是外部文件
- mask 纹理 Y 翻转在 shader 内做（`1.0 - maskPx.y`），不依赖 `UNPACK_FLIP_Y_WEBGL`
- fbm 3 octaves、1-warp
- bloom 仅在 `lum > 0.18` 时计算
- 每个 effect 有独立 charset（`CHARSETS_BY_EFFECT`）和 glow（`GLOW_BY_EFFECT`）
- 阅读带：`v_uv.y < 0.42` 区间内 finalRgb 和 alpha 渐进 attenuate，专门为底部文案让位
- 散开重组：`hashDir(cellId) * u_transition * 0.7` + 围绕 0.5 的小旋转 + 字符 idx 随机抖动

### 10 个 effect

| id | name | 用于 |
|---|---|---|
| 1 | mushroom | instagram |
| 2 | wave | steam |
| 3 | orbit | huggingface |
| 4 | chaos | x |
| 5 | grid | github |
| 6 | drift | cover |
| 7 | starfield | contact |
| 8 | circuit | about |
| 9 | matrix | hardware |
| 10 | constellation | links |

## Do NOT

- 不要在 SceneStage 的 useEffect 依赖里加每帧变化的 zustand 字段，会导致 GL 重建。当前用 `useCarousel.getState()` 在 RAF 内读取绕开
- 不要恢复每屏一个 AsciiStage / 多 GL context 的旧架构
- 不要恢复 strip translate3d 水平平移转场
- 不要改 `next.config.ts` 的 `output: "export"` / `images.unoptimized` / `trailingSlash`
- 不要在 `scripts/mask-sources/*.svg` 里手动写死宽高之外的尺寸；让 `gen-masks.ts` 处理光栅化
- 不要直接改 `data.ts` / `slides.ts` 的文案字段；它们从 `site.json` 读
- 不要让 `tsconfig` include 进 `legacy/v0/`

## Cross-Browser 注意

1. **Chrome mask Y 翻转**：已通过 shader 内 `1.0 - maskPx.y` 修复。不要改回 `UNPACK_FLIP_Y_WEBGL`
2. **Chrome GitHub mask 过暗 / inverse**：`gen-masks.ts` 已把 GitHub 源转成 positive Octocat density mask。不要 `gl.disable(gl.BLEND)`
3. **Windows / Mac 字体差异**：通过 `next/font/google` 自托管 JetBrains Mono；atlas 在 `document.fonts.ready` 后重建一次

## Conventions

- 路径别名 `@/*` → `./src/*`
- 所有组件 `"use client"`
- 等宽字体由 `--font-mono` CSS 变量驱动（layout.tsx 注入 `JetBrains_Mono` variable）
- 每屏主题色通过 CSS 变量 `--bg / --fg / --accent` 传递到 SlideShell 子树
- `docs/archive/*` 是历史快照，与当前架构可能不符

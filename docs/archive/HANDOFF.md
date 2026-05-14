# Handoff — ASCII Carousel Personal Homepage

> 把下一会话需要的所有上下文写在这里。已经在 `README.md` / 源码里能找到的内容用引用，不重复正文。

## 0 · 一句话项目状态

8 屏全屏横向 ASCII carousel，跑在 Next.js 静态导出 + Cloudflare Pages，已经过两轮"完整规划→执行"。最新一次部署 `https://profile-9hk.pages.dev`，所有用户反馈（about 风格、音效、图标稀疏、性能、Chrome 兼容）都已闭环。下一会话进来的人可以直接读 `README.md` 跑起来，然后按 § 8 的"潜在改进"接活。

---

## 1 · 仓库 / 部署速查

| 项 | 值 |
|---|---|
| 仓库根 | `/Users/harukishiina/workspace/codex/profile` |
| Stack | Next.js 15 / React 19 / TS 5.7 / Tailwind v4 / WebGL2 / zustand 5 / framer-motion 11 |
| 入口 | `src/app/page.tsx` → `<Carousel />` |
| 构建 | `npm run build`（产物 `out/`，纯静态） |
| 部署 | `npm run deploy`（= `next build && wrangler pages deploy out --project-name=profile`） |
| 生产 URL | https://profile-9hk.pages.dev |
| 上次 deploy 短链 | `https://a5155739.profile-9hk.pages.dev` |
| Wrangler | brew 装的 `wrangler@3.92.0` 在 `/opt/homebrew/bin/wrangler`；`npx wrangler` 不要带 `@latest`（npm 把它当 script name 报错），直接 `wrangler pages deploy out --project-name=profile --commit-dirty=true` 即可 |
| 旧版本 | `legacy/v0/`（Litlink 风格初版，`tsconfig.json` 已 `exclude` 它） |

---

## 2 · 架构地图

### 数据流

```
src/lib/data.ts      ← 基础 profile（name/handle/aka/...）
src/lib/slides.ts    ← 8 屏配置（content + theme key + effect id + maskId + cellSize + speed + cursorIntensity）
src/lib/theme.ts     ← per-slide 主题色（CSS string + 0..1 RGB 三元组，shader 用）
src/assets/masks.ts  ← 5 个内联品牌 SVG
src/lib/svg-mask.ts  ← SVG → HTMLCanvasElement 光栅化（含 dilation + blur + dimension 注入）
src/lib/use-mask.ts  ← 异步 hook，进程内 cache
src/lib/use-carousel.ts ← zustand store：index / direction / transition / busy / pending
src/lib/sound.ts     ← soft click 音效（白噪声 burst，opt-in）
```

### 视图层

```
<Carousel> (src/components/Carousel.tsx)
  - 全局输入聚合：wheel / pointer drag / keyboard / hashchange / resize
  - RAF 缓动驱动 strip transform；lastIndexRef 记录"上次稳定 index"，多屏跳转时 fromX 才正确
  - 渲染 8 个 <SlideShell>
  - 顶层挂 <SoundToggle> + <DotNav>

<SlideShell> (src/components/SlideShell.tsx)
  - 注入 --bg/--fg/--accent CSS 变量
  - 渲染 <AsciiStage> 作为背景
  - 顶/底 gradient overlay（增强 chrome 文字可读性）
  - <SlideChrome>: 左上 "01/08 · LABEL"，右上 "kissa.dev"
  - <SlideContent>: 按 slide.id 路由到
      CoverContent / AboutContent / BrandContent / ContactContent

<AsciiStage> (src/components/AsciiStage.tsx)
  - WebGL2 fragment shader，单 draw call、单 quad
  - 字符 atlas (TEXTURE0) + SVG mask (TEXTURE1)
  - shouldRender = isActive || isWarm，离开屏的 stage 不 raf
  - useCarousel 的 transition/index/direction/busy 映射成 u_transition uniform
```

### 输入聚合细节（`Carousel.tsx`）

- Wheel：`Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY` 累加；超过 60 触发 goto，250ms 内的连续事件视为同一 gesture，触发后 lock 直到下一次 idle。
- Pointer drag：超过视口宽度 18% 才翻页；两端有 0.35x 阻尼。`button/a/input/[data-no-drag]` 直接放行原生点击。
- Keyboard：`← →`、`PageUp/Down`、`Home/End`、`1..8` 直跳；带 meta/ctrl/alt 时不拦截。
- Hash：双向同步。`gotoIndex` 完成后 `replaceState` 写回 `#cover` 等。

### Cooldown / pending

`useCarousel.gotoIndex` 在 `busy=true` 时只把最新目标存到 `pending`；`finishTransition()` 里若 `pending !== null` 通过 `setTimeout(0)` 立刻触发，从而支持"连按"被吃成"跳到最终目标"。

---

## 3 · Shader 重点（`AsciiStage.tsx`）

### Uniforms 全表

| Uniform | 类型 | 说明 |
|---|---|---|
| `u_resolution` | vec2 | canvas 像素尺寸 |
| `u_time` | float | 秒 |
| `u_cellSize` | float | 字符 cell 像素 |
| `u_speed` | float | 时间乘子（来自 slide.speed） |
| `u_colorDark/Bright/Glow` | vec3 | 0..1 RGB，来自 theme.bgRgb/fgRgb/accentRgb |
| `u_glow` | float | per-effect glow 乘子（见 `GLOW_BY_EFFECT`） |
| `u_effect` | int | 1=mushroom 2=wave 3=orbit 4=chaos 5=grid 6=drift 7=starfield |
| `u_chars` / `u_atlasCols` / `u_atlasRows` | int/float/float | 字符 atlas 元数据 |
| `u_atlas` (TEXTURE0) | sampler2D | 字符图集 |
| `u_mask` (TEXTURE1) | sampler2D | 品牌 mask（满屏方形，居中铺） |
| `u_useMask` | float | 0/1 |
| `u_mouse` / `u_mouseVel` / `u_mouseActive` | vec2/vec2/float | 鼠标 |
| `u_mouseIntensity` | float | per-slide 调制（来自 slide.cursorIntensity） |
| `u_transition` | float | -1..0..+1，-1=即将进入 0=稳态 +1=完全离开 |
| `u_quality` | float | 1.0 active / 0.5 warm |

### Mask 渲染模式（密度增强场，**非裁剪**）

这是本项目最关键的设计点。`AsciiStage.tsx:272-296` 实现：

- 满屏始终跑 effect。
- mask 内 `litInside = clamp(max(lit, m*0.55) + m*0.25, 0, 1)`：相当于给最低亮度托底 + 略微 boost。
- mask 外 `litOutside = lit * (1 - u_useMask * 0.30)`：整屏 ASCII 字符密度小幅 attenuate，让中心更聚焦。
- `lit = mix(litOutside, litInside, smoothstep(0, 0.85, m))` 平滑过渡。
- bloom 在 mask 内乘 `(1 + m * 0.6)`。

视觉效果：cover/contact 满屏 ASCII 的氛围被保留，品牌屏在此基础上"中心隐约浮现 logo 轮廓"。**绝对不要**回退成"裁剪"模式（图标内有字符、外部全黑）——用户已经否决过这种风格。

### Mask 采样坐标

```glsl
float side = min(u_resolution.x, u_resolution.y);
vec2 center = u_resolution * 0.5;
vec2 maskPx = (cellCenterPx - center) / side + 0.5;
vec2 maskUv = vec2(maskPx.x, 1.0 - maskPx.y);   // 显式 Y 反转
```

`side = min(w, h)` 保证 mask 永远是居中正方形，不会被画面长宽比拉伸。
显式 `1.0 - y` 反转是为了绕开 `UNPACK_FLIP_Y_WEBGL` 在 Safari/Chrome 上的默认行为差异（见 § 5）。

### Scatter 转场

```glsl
vec2 dir = hashDir(cellId);
cellUv += dir * u_transition * 0.4;
// ... 后面 alpha 末端：
a *= 1.0 - abs(u_transition);
```

每个字符 cell 沿伪随机方向漂移，alpha 同步淡出。`u_transition` 由 React 端按 `easeInOutExpo` 进度映射成：

```ts
if (i === carouselIndex - direction) → +progress     // 离开屏
if (i === carouselIndex)              → -1 + progress  // 进入屏
```

### Per-effect 鼠标交互

`AsciiStage.tsx:227-253`，按 `u_effect` 切：
- mushroom (1)：推开 + 拖尾 + 旋转
- orbit (3)：吸引 + 反向旋转
- chaos (4)：注入噪声方向 + 强拖尾
- drift (6)：极弱推 + 慢拖尾
- starfield (7)：仅吸引一点
- 其余：仅 brightness boost

强度统一乘 `u_mouseIntensity`（来自 `slide.cursorIntensity`，0..1）。

---

## 4 · `svg-mask.ts` rasterize pipeline

读 `src/lib/svg-mask.ts` 配合下面这张图理解：

```
input SVG string
  ↓ ensureSvgDimensions()       ← 关键！给只有 viewBox 的 SVG 注入 width/height
  ↓ Blob URL + <img>.decode()
  ↓ ctx.drawImage(居中等比)
  ↓ source-in + fillRect(white)  ← 把任意颜色 SVG 变成"白色剪影"
  ↓ getImageData → 单通道 Uint8ClampedArray
  ↓ boxMax(r ≈ size*0.6%)        ← dilation，把图标内部加厚
  ↓ boxBlur(r ≈ size*1.0%)       ← 边缘羝化，避免 mask 内字符密度阶梯
  ↓ 写回 RGBA（R=G=B=A=density）
output HTMLCanvasElement
```

**绝对不要**改回 `ctx.filter = "blur(...)"`：Chrome 在 `source-in` 合成路径之后对 filter 的行为与 Safari 不同，会导致 Chrome 上结果几乎全透明（用户已验证过 bug，详情 § 5 Bug 2）。当前实现是纯 ImageData 算法，跨浏览器 deterministic。

---

## 5 · 已修过的两个跨浏览器 bug（**重要：不要回退**）

### Bug 1 · Chrome 上 mask 上下颠倒

- **现象**：Safari 正常，Chrome 里 GitHub octocat 头部朝下。
- **根因**：Canvas 2D 是 Y-down 坐标系，`gl_FragCoord` 是 Y-up；`UNPACK_FLIP_Y_WEBGL` 默认是 false，但 Safari 在某些 canvas→texture 路径有隐式翻 Y 的 WebKit quirk，Chrome 严格按规范。
- **修复**：不依赖 `UNPACK_FLIP_Y_WEBGL`，在 shader 里显式 `vec2 maskUv = vec2(maskPx.x, 1.0 - maskPx.y)`。位置：`AsciiStage.tsx:282`。

### Bug 2 · Chrome 上 mask 内部几乎全黑

- **现象**：Safari 里图标内部填满绿色 ASCII；Chrome 里只有边缘几块零星亮点，图标"空心"。
- **根因**：所有 SVG 资产只声明 `viewBox` 而没声明 `width/height`。Chrome 的 `<img>` 解码这种 SVG 时 `naturalWidth = naturalHeight = 0`，`drawImage(img, dx, dy, 0, 0)` 把图画成 0 尺寸 → mask canvas 几乎全空 → dilation 只能膨胀偶然的一两个非零像素。Safari 从 viewBox 推断尺寸所以正常。
- **修复**：`src/lib/svg-mask.ts` 加 `ensureSvgDimensions(svg, size)`，在传给 `<img>` 前给 `<svg>` 根标签注入 `width/height`（按 viewBox 比例换算到 1024）。
- **不要**改 SVG 源（`src/assets/masks.ts` 里所有 SVG 仍然只写 viewBox，源保持简洁；注入只发生在 raster 入口处）。

---

## 6 · 性能预算（已落地）

`AsciiStage.tsx` 内已经做的优化，下次如果还要再压：

| 维度 | 当前值 | 备注 |
|---|---|---|
| fbm octaves | 3（原 4） | 视觉差几乎不可见，省 ~25% noise lookups |
| domain warp | 1-warp（原 active 跑 2） | `wfbm` 内 |
| bloom 计算 | 仅 `lum > 0.18` 才算 | 跳过暗区，省 ~80% effect 二次调用 |
| DPR cap | active ≤ 1.0 / warm ≤ 0.85 | `qualityScale` 默认 1.0 |
| maxPixels | active 1_000_000 / warm 700_000 | 大窗口下强制 downsample |
| FPS cap | active 60 / warm 30 | `frameInterval = 1000/fpsCap` |
| Visibility | `document.hidden` 时 raf 空转 return | 切 tab 不烧 GPU |
| Render gate | 只 active + warm 邻屏才有 GL context | 离屏 stage 直接不创建 |

最近一次 build 产物：`Route / 15.2 kB / First Load 118 kB`。

---

## 7 · 内容数据全表（如果要改文案/账号）

改这里，**不要**改组件：

- `src/lib/data.ts` → `profile.{handle, name, aka, title, tagline, bio, location}`
- `src/lib/slides.ts` → `SLIDES[]`，每屏字段：
  - `id`（URL hash）/ `label`（chrome 显示）/ `theme`（→ `THEMES[key]`）
  - `effect`（1..7）/ `cellSize`（px）/ `speed`（时间乘子）
  - `maskId`（5 个品牌 logo id）/ `cursorIntensity`（0..1）
  - `sentence`（cover/contact 大标题）/ `intent`（brand/about 副文案）
  - `handle`（brand 屏 @xxx）/ `cta` / `contacts`（contact 屏列表）

当前 8 屏：

| # | id | effect | maskId | theme key | 备注 |
|---|---|---|---|---|---|
| 0 | cover | drift (6) | — | cover | "as i dreamed." |
| 1 | about | mushroom (1) | — | about | Engineer · Daydreamer |
| 2 | x | chaos (4) | x | x | X 蓝信息流 |
| 3 | instagram | mushroom (1) | instagram | instagram | 橙红渐变 |
| 4 | github | grid (5) | github | github | 翠绿格 |
| 5 | huggingface | orbit (3) | huggingface | huggingface | 黄/棕环抱 |
| 6 | steam | wave (2) | steam | steam | 蒸汽波 |
| 7 | contact | starfield (7) | — | contact | "until we meet again" |

---

## 8 · 潜在改进 / 已知待办

排序按"用户提反馈的可能性"：

1. **再次跨浏览器验证**：上次 Chrome 修复部署后用户没回 ack。下一会话开始时建议先用 `webapp-testing` 或手动 Chrome+Safari 双开比对所有 8 屏，特别是 §5 提到的 4 个品牌 mask 屏（X / Instagram / GitHub / HF / Steam）。
2. **Carousel 横向 transform 没接 `prefers-reduced-motion`**：`globals.css` 设了全局 `transition-duration: 0.01ms`，但 `Carousel.tsx` 里 RAF 缓动是用 JS 跑的，需要在那里显式短路成 `dur = REDUCED_TRANSITION_MS`（已有这个常量，逻辑也写了，但要 review 是否生效）。
3. **`document.visibilitychange` 每个 stage 各加一个监听器**：多 slide 共存时会有 8 个监听，量级 OK 但可以提到 `Carousel` 层共享一个，通过 zustand 派发。
4. **Touch 体验微调**：拖动阈值 18% 在窄屏可能偏小，可以做 `min(viewport_width, 360)` 的归一化。
5. **首屏 LCP**：当前 `AsciiStage` 在客户端 mount 后才有内容，cover 文案有 mt-auto 推到底部。如果 SEO/分享卡片重要，考虑给 cover 加 SSR 文案兜底。
6. **可选：mask debug 工具**：临时 hook 把 raster 后的 canvas 挂到 DOM 一角，方便排查跨浏览器差异。

---

## 9 · 容易踩的坑

- **不要**用 `cat`/`echo`/`sed` 编辑文件（用户的 rules 明确要求用 specialized tools；本项目也按这条走）。
- **不要**在 `src/assets/masks.ts` 的 SVG 里加 `width`/`height`，让 `ensureSvgDimensions` 处理。如果 SVG 源里就有，注入会跳过，但也意味着比例必须由作者手动算好。
- **不要**在 `AsciiStage` 的 useEffect 依赖里加 `targetTransition`——它是每帧变的，会让 GL context 每帧重建。当前用 `targetTransitionRef` 绕开，已有 `eslint-disable-next-line react-hooks/exhaustive-deps`。
- **不要**把 `legacy/v0/` 拉回 tsconfig 的 include 里。
- **`next.config.ts`** 用了 `output: "export"` + `images: { unoptimized: true }` + `trailingSlash: true`，CF Pages 直接吃 `out/`。改这三项任意一个都可能破部署。
- **Mask 修改流程**：改 SVG → 不需要重新 raster 缓存代码，`useMask` 是按 `maskId` 缓存的；改 ID 或换内容都会自动 raster。但 raster 是按 `size=1024` 写死的，HiDPI 4K 屏极放大可能有锯齿。

---

## 10 · 下一会话推荐使用的 skills

- **`webapp-testing`** (`~/.claude/skills/webapp-testing/SKILL.md`)：跨浏览器实测视觉差异。如果用户继续报兼容 bug 优先用这个。
- **`hunt`** (`~/.claude/skills/hunt/SKILL.md`)：任何"渲染怪"的现象先 root-cause 再改，§5 的两个 bug 都是这种类型。
- **`canvas`** (`/Users/harukishiina/.cursor/skills-cursor/canvas/SKILL.md`)：如果想做 mask 调试可视化（多浏览器 raster 输出对比），用 canvas 渲染。
- **`first-principles`** (`~/.claude/skills/first-principles/SKILL.md`)：如果用户提出"彻底重做某模块"（例如把 mask pipeline 改成 OffscreenCanvas + bitmaprenderer，或 SVG → Path2D 在 GL 里 tessellate 而不是 raster），用这个评估是否值得。
- **`check`** (`~/.claude/skills/check/SKILL.md`)：提交前快速过一遍 diff。

参考：仓库 `README.md` 已经写了运行/部署/8 屏概览，下一会话先看 README 再看本文件即可。

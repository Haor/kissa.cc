# kissa.cc · ASCII Carousel

横向全屏的 ASCII 个人主页 —— 10 屏每屏代表一个身份名片（首屏 / 自述 / 5 个社交账号 / 硬件 / 外链 / 联络），SVG / PNG mask 和 WebGL 字符密度共同构成品牌 logo，翻页时字符散开重组。

## 技术栈

- **Next.js 15** + **React 19** + **TypeScript** · `output: "export"` 纯静态
- **Tailwind CSS v4**（PostCSS 插件模式）· per-page CSS 变量主题色
- 自写 **WebGL2 fragment shader** · 字符 atlas + 程序化噪声场 + brand mask
- **zustand**（carousel 状态）· **next/font/google**（JetBrains Mono 跨平台）
- 部署：**Cloudflare Pages**（零月费、全球边缘缓存）

## 本地开发

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 输出到 out/
npx tsc --noEmit # 类型检查（无 lint / 无测试套件）
```

## 自定义内容

**所有文字、链接、handle、硬件清单、外链分组都集中在一个 JSON：**

→ [`src/content/site.json`](src/content/site.json)

字段说明见 [`src/content/README.md`](src/content/README.md)，编辑器会用 `site.schema.json` 自动校验。

视觉相关（每屏的 effect、主题色、字符密度、品牌 mask）：

| 路径 | 作用 |
|---|---|
| [`src/lib/slides.ts`](src/lib/slides.ts) | 10 屏的视觉配置层（id / theme / effect / cellSize / ...） |
| [`src/lib/theme.ts`](src/lib/theme.ts) | 每屏主题色（hex + 0-1 RGB） |
| [`scripts/mask-sources/`](scripts/mask-sources/) | brand mask 源（SVG 或 PNG），构建时由 `scripts/gen-masks.ts` 离线生成到 `public/masks/` |

## 关键文件

| 路径 | 作用 |
|---|---|
| [`src/components/Carousel.tsx`](src/components/Carousel.tsx) | 翻页核心：wheel / pointer drag / keyboard / hash 聚合，stack 叠放 + opacity cross-fade |
| [`src/components/SceneStage.tsx`](src/components/SceneStage.tsx) | 全局单实例 ASCII 渲染器（1 个 GL context + 1 个 RAF） |
| [`src/components/SlideShell.tsx`](src/components/SlideShell.tsx) | 每屏 chrome + 内容模板（cover / about / brand / hardware / links / contact） |
| [`src/lib/ascii-gl.ts`](src/lib/ascii-gl.ts) | GLSL / atlas builder / charsets / glow / shader 编译器 |
| [`src/lib/use-carousel.ts`](src/lib/use-carousel.ts) | zustand store + transition cooldown |

## 10 屏顺序

```
00 cover         drift           (无 mask)           米白 / 黑
01 about         circuit         (无 mask)           雾蓝 / 深蓝
02 x             chaos           X mask              X 蓝 / 深
03 instagram     mushroom        camera mask         橙红渐变 / 暗紫
04 github        grid            octocat mask        翠绿 / 黑
05 huggingface   orbit           🤗 mask             黄 / 深棕
06 steam         wave            steam gear          蒸汽蓝 / 深
07 hardware      matrix          (无 mask)           冷绿 / 深
08 links         constellation   (无 mask)           靛蓝 / 深
09 contact       starfield       (无 mask)           米白 / 黑
```

## 输入方式

| 桌面 | 移动 | 备用 |
|---|---|---|
| 触控板横扫 / 鼠标滚轮 | 横向 swipe（≥18% 屏宽触发） | `← →` 翻页 |
| `Home` / `End` 直跳首末 | 点击底部数字 (00–09) | `0-9` 数字直跳 |
| URL `/#x` 等 hash 直链 | — | — |

## 架构要点（v1 基线）

```
page → Carousel
        ├─ SceneStage         (单 GL context，常驻全屏 canvas)
        └─ SlideShell × 10    (chrome + 内容；叠放，opacity cross-fade)
```

- **单 stage**：之前每屏一个 GL context，切换时新 context 临时创建 → "突然变一下" + Windows 卡顿。现在所有 effect 的 atlas mount 时预建好、纹理常驻 GPU，切 slide 只动 uniform。
- **转场**：不再 strip 水平平移；改为 shader 内 `u_transition` 驱动字符散开/重组（前半段旧屏散开、后半段新屏聚合），文本层 opacity 同步 cross-fade。
- **mask 管线**：build 时 `npm run gen-masks` 把 `scripts/mask-sources/*` 离线光栅化 + dilation + box-blur，输出到 `public/masks/*.png`，运行时直接 `fetch` —— 跨浏览器零 quirk。
- **字体**：JetBrains Mono 通过 `next/font/google` 自托管，Windows / Mac 字符宽度一致；atlas 在 `document.fonts.ready` 后重建一次保证渲染稳定。


# Profile · ASCII Carousel

横向全屏的 ASCII 个人主页：8 屏每屏代表一个身份名片（介绍 / 社交账号 / 联络），SVG 形状 + WebGL 字符密度共同构成品牌 logo，字符散开/凝聚的转场。

## 技术栈

- **Next.js 15** + **React 19** + **TypeScript** · 静态导出
- **Tailwind CSS v4** · per-page 主题色
- 自写 **WebGL2 fragment shader** · 字符 atlas + 程序化噪声场 + SVG mask
- **framer-motion / zustand** · 输入聚合 + 缓动
- 部署：**Cloudflare Pages**（零月费、全球边缘缓存）

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 自定义内容

- 编辑 [`src/lib/data.ts`](src/lib/data.ts) 修改基础信息（名字、handle、tagline、location）
- 编辑 [`src/lib/slides.ts`](src/lib/slides.ts) 增减/调整 8 屏顺序、文案、CTA、effect 选型
- 编辑 [`src/lib/theme.ts`](src/lib/theme.ts) 调整每屏主题色
- 编辑 [`src/assets/masks.ts`](src/assets/masks.ts) 替换品牌 SVG

## 关键文件

| 路径 | 作用 |
|---|---|
| [`src/components/Carousel.tsx`](src/components/Carousel.tsx) | 翻页核心：wheel / touch / pointer drag / keyboard / hash 输入聚合 |
| [`src/components/AsciiStage.tsx`](src/components/AsciiStage.tsx) | WebGL 字符渲染器 + mask + scatter 转场 |
| [`src/components/SlideShell.tsx`](src/components/SlideShell.tsx) | 每屏壳：4 个内容模板（cover / about / brand / contact） |
| [`src/lib/use-carousel.ts`](src/lib/use-carousel.ts) | zustand store + cooldown |
| [`src/lib/sound.ts`](src/lib/sound.ts) | 切屏音效（800Hz tick，opt-in） |

## 8 屏顺序

```
00 cover         drift          (无 mask)        米白 / 黑
01 about         mushroom       (无 mask)        雾蓝 / 深蓝
02 x             chaos          X mask           X 蓝 / 深
03 instagram     mushroom       camera mask      橙红渐变 / 暗紫
04 github        grid           octocat mask     翠绿 / 黑
05 huggingface   orbit          🤗 mask          黄 / 深棕
06 steam         wave           steam gear       蒸汽蓝 / 深
07 contact       starfield      (reading panel)  米白 / 黑
```

## 输入方式

| 桌面 | 移动 | 备用 |
|---|---|---|
| 触控板横扫 / 鼠标滚轮 | 横向 swipe | 拖拽 |
| `← →` 翻页 | — | `1-8` 直跳 |
| 点击底部 dot | 点击 dot | URL `/#x` 直链 |

## 部署

```bash
npm run deploy           # CF Pages production
npm run deploy:preview   # CF Pages preview branch
```

预览：https://profile-9hk.pages.dev

## 旧版本（参考）

Litlink 风格的初版完整保留在 [`legacy/v0/`](legacy/v0/)，可独立 `npm install && npm run dev` 运行作为视觉参考。

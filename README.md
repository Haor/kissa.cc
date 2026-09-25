# kissa.cc · An Index of Selves

横向全屏的个人主页 —— 10 屏，每屏一个「自我」：首屏 / 自述 / 5 个社交账号 / 硬件 / 外链 / 联络。
整页是一个 WebGL2 字符场：每一屏的 figure（品牌 logo 或一个汉字）由字符凝聚而成，翻页时旧
figure 沿方向性 wipe 解体成乱码、新 figure 从另一侧重新凝聚。

**Engineer × Daydreamer** —— 两种排版声音贯穿全站：
等宽 Iosevka 是「工程师」（HUD / 标签 / 数据），Cormorant Italic 是「做梦的人」（诗性的展示标题）。

## 技术栈

- **Next.js 15** + **React 19** + **TypeScript** · `output: "export"` 纯静态
- **Tailwind CSS v4**（PostCSS 插件模式）
- 自写 **WebGL2 多 pass 渲染管线**（cell 分辨率 effect / MRT / 高斯光晕 / 全分辨率字形合成）
- **zustand**（carousel 状态）
- 字体全部 subset 自托管：Iosevka / Cormorant Italic / Sarasa Mono J，合计 ~250 KB

## 本地开发

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # prebuild(gen-masks + gen-fonts) → next build → out/
npx tsc --noEmit # 类型检查（无 lint / 无测试套件）
```

`gen-fonts` 需要本地 `pyftsubset`（见 `scripts/gen-fonts.ts` 顶部注释），没有时自动 skip，
用 commit 进 git 的 woff2。

## 自定义内容

**所有文字、链接、handle、硬件清单、外链分组、figure 注释都集中在一个 JSON：**

→ [`src/content/site.json`](src/content/site.json)

字段说明见 [`src/content/README.md`](src/content/README.md)，编辑器会用 `site.schema.json` 自动校验。

视觉相关：

| 路径 | 作用 |
|---|---|
| [`src/lib/slides.ts`](src/lib/slides.ts) | 10 屏的视觉配置（effect / theme / speed / figure / 文案在哪一侧） |
| [`src/lib/theme.ts`](src/lib/theme.ts) | 每屏的墨色 / 字符色 / 光晕色 |
| [`src/assets/masks.ts`](src/assets/masks.ts) | figure 源：品牌 SVG + 汉字轮廓（Noto Serif JP 900，`scripts/extract-glyph-paths.py` 抽取） |
| [`scripts/gen-masks.ts`](scripts/gen-masks.ts) | 构建时把 figure 源光栅化成 512² 灰度密度 mask → `public/masks/` |

## 关键文件

| 路径 | 作用 |
|---|---|
| [`src/lib/glyph/engine.ts`](src/lib/glyph/engine.ts) | 字符场引擎：GL 资源、morph 状态机、帧循环 |
| [`src/lib/glyph/shaders.ts`](src/lib/glyph/shaders.ts) | 全部 GLSL（ENERGY / FIELD / BLUR / COMPOSE 四个 pass + 10 个 effect） |
| [`src/lib/glyph/atlas.ts`](src/lib/glyph/atlas.ts) | 合并字符 atlas（每个 effect 一行 + 转场乱码行） |
| [`src/lib/glyph/invaders.ts`](src/lib/glyph/invaders.ts) | Steam 屏小游戏的 CPU 端状态（编队 / 击落 / 子弹 / 飞船） |
| [`src/components/Carousel.tsx`](src/components/Carousel.tsx) | 顶层编排 + 输入聚合（wheel / drag / keyboard / hash），手势预览 |
| [`src/components/SlideShell.tsx`](src/components/SlideShell.tsx) | 每屏的文案模板 + figure 展签 |
| [`src/components/Kinetic.tsx`](src/components/Kinetic.tsx) | 动态排版：逐词升起 / 等宽 decode / 磁吸 |
| [`src/components/Hud.tsx`](src/components/Hud.tsx) · [`IndexNav.tsx`](src/components/IndexNav.tsx) · [`IndexMenu.tsx`](src/components/IndexMenu.tsx) | 取景框 HUD / 刻度尺导航 / 全屏目录 |
| [`src/components/Intro.tsx`](src/components/Intro.tsx) · [`Cursor.tsx`](src/components/Cursor.tsx) | 开场 loader / 自定义光标 |

## 10 屏

每屏的背景动效都取自这个主题「自己的东西」—— 就像 GitHub 屏画的就是贡献图：

```
00 cover         drift      泡沫质感的云团（° o O 实心填充）  夢 yume — dream
01 about         circuit    走线汇向「私」，外侧散成飘点    私 watashi — i, myself
02 x             timeline   几列时间线往下刷，新帖在打字    X mark
03 instagram     film       胶片穿过镜头：快门、推进、显影  camera mark
04 github        grid       贡献图方块                    octocat mark
05 huggingface   neural     6 层网络前向传播，输出接 🤗     🤗 mark
06 steam         invaders   太空侵略者，飞船跟着光标开火    steam mark
07 hardware      meters     16 核负载柱 + 峰值保持          機 ki — machine
08 links         web        蛛网：放射丝 + 螺旋丝 + 露珠      網 ami — net, web
09 contact       thread     赤い糸：两段红线差一点接上      縁 en — a bond, fated
```

## 交互

| 输入 | 行为 |
|---|---|
| 触控板横扫 / 滚轮 / 拖拽 | 翻页；**提交前**字符场就会跟手预览 wipe，没过阈值松手回弹 |
| `← →` · `PageUp/Down` · `Home/End` · `0–9` | 翻页 / 直跳 |
| `I` / 右上角 INDEX | 全屏目录；悬停某一行，背后字符场直接 morph 成那一屏 |
| 移动光标 | 字符场里留下会衰减的乱码尾迹；Steam 屏飞船跟着走，Links 屏蛛丝会颤，Contact 屏线头朝光标伸 |
| 点击空白处 | 字符场涟漪 |
| URL `/#github` 等 | hash 直链 |

`prefers-reduced-motion` 下转场缩短到 ~300ms，关掉尾迹 / 涟漪 / 文案位移。

## 架构要点（v2）

```
page → Carousel
        ├─ SceneStage      单 WebGL2 context，GlyphEngine 常驻
        ├─ SlideShell × 10 data-pos = before / active / after → CSS 进出场
        ├─ Hud / IndexNav / IndexMenu / Cursor
        └─ Intro           计数器 loader → 径向凝聚开场
```

- **两段式渲染**：effect / mask / 转场全部在「字符格分辨率」算（1440×900 ≈ 1.3 万个 cell），
  再用全分辨率 pass 从 atlas `texelFetch` 出字形。逐像素开销极低，所以可以吃满 Retina（2x），
  字形 1:1 像素对齐。
- **morph 状态机**：屏幕上永远是「scene A → scene B，进度 p」。翻页、目录悬停预览、拖拽预览、
  开场都复用同一套；半路折返时交换 A/B、p 取补，wipe 直接倒放。
- **mask 是密度增强场，不是裁剪**：满屏始终跑 effect，figure 区域托底 + boost。
- **store 只管「现在是哪一屏」**：字符场的动画由引擎自己计时，DOM 进出场由 CSS transition 驱动，
  每次翻页只触发一次 React 渲染；高频信号（手势、涟漪、scrim）走 `glyphBus` 直连引擎。

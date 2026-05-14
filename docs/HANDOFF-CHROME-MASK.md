# Handoff — Chrome mask 屏内部不渲染字符

**Repo**: `/Users/harukishiina/workspace/codex/profile`
**Branch**: `master` (无 commits，git init 已做但还没 commit)
**Stack**: Next.js 15 + React 19 + WebGL2 fragment shader
**Date**: 2026-05-14

## 你的任务

用 codex 排查一个 **Safari 正常 / Chrome 异常** 的 WebGL mask 渲染 bug。当前修复尝试似乎仍未解决，请独立核实。

## 现象（必读，别跳）

8 屏 ASCII 轮播主页。其中 5 屏（X / Instagram / GitHub / HuggingFace / Steam）使用 SVG mask 来增强品牌 logo 区域的字符密度。

- **Safari**：logo 形状满字符（密集 # 等），mask 外有较稀疏的背景字符，颜色按主题色（如 GitHub 屏是绿色）。
- **Chrome**：logo 内部和外部都几乎看不到字符聚集；五个 mask 屏看起来"全屏稀疏"，没有 logo 形状感。早期截图里 logo 内是"白色 ####"——后来加了 bloom clamp 改善了饱和但密度还是不对。
- 项目里有 `src/components/MaskDebug.tsx` 调试组件渲染在左上角，把 5 个 mask 源以缩略图显示出来——**Chrome 和 Safari 在 MaskDebug 里都看到完美的 logo 图**，证明 mask 数据本身解码正确。

## 关键文件

- `src/components/AsciiStage.tsx` — WebGL2 渲染器，FRAG shader 内联，mask 上传逻辑在 `useEffect` 里
- `src/lib/use-mask.ts` — Mask 加载 hook
- `src/components/MaskDebug.tsx` — Dev-only 调试可视化
- `src/assets/masks.ts` — SVG 源 + `MASK_URLS` 指向预渲染 PNG
- `scripts/gen-masks.ts` — 用 `@resvg/resvg-js` 把 SVG 渲染成 1024×1024 PNG，加 dilation+blur
- `public/masks/*.png` — 已生成的 5 个 PNG（npm run gen-masks）
- `CLAUDE.md` — 项目根的 agent 指南，**注意里面写了 HANDOFF.md 不可靠**
- `docs/HANDOFF.md` — 上一个 agent 留下的，**bug 修复结论不可靠，仅供架构参考**

## 已确认事实（基于代码核查，不要重复验证）

1. **Bug 1（Chrome mask Y 翻转）已修复**：shader 内显式 `1.0 - maskPx.y`（`AsciiStage.tsx:282`）。**不要改回 `UNPACK_FLIP_Y_WEBGL`**。
2. **PNG 解码正确**：MaskDebug 走 `fetch → createImageBitmap → canvas2D.drawImage` 在 Chrome 上完美显示 5 个 logo。
3. **Atlas 上传正确**：字符 atlas 走 `HTMLCanvasElement → texImage2D` 在 Chrome 上工作正常。
4. **SVG 运行时 rasterize 已废弃**：`src/lib/svg-mask.ts` 已删除。运行时不解码 SVG。
5. **Codex 2026-05-14 结论更新**：主因不是 mask 数据、uniform、UV 或 texture 上传；直接输出 `maskValue` 时 Chrome 采样正常。GitHub 源 SVG 是官方负空间 mark：外圆是高密度区，Octocat 是低密度洞。后续尝试把它转成 positive Octocat density mask 后被用户否决为“反相猫”。当前方向是保留官方 GitHub mask，`AsciiStage` 对 grid effect 不再压暗 mask 外区域，只增强 mask 亮区。简单禁用 `BLEND` 会让 Safari/整体画面变硬，已否决。当前修复保持 blending + `premultipliedAlpha: true`。

## 已尝试过的修复（按时间顺序）

1. **ImageData 上传**（4/5 work，GitHub 不行）—— 当时还是 runtime SVG rasterize
2. **2x 分辨率 + threshold > 0** —— 仍然不行
3. **结构性修复：预渲染 PNG**（`prebuild` hook + `scripts/gen-masks.ts`） —— mask 数据 100% 确定性，**但 Chrome 上仍然不对**
4. **Shader bloom clamp**（`AsciiStage.tsx:314,317`） —— 解决了"字符变白"症状但密度问题独立存在
5. **最后一次改动（未验证）**：`useMask` 改为返回 `HTMLCanvasElement` 而不是 `ImageBitmap`，让 mask 走和 atlas 完全相同的上传路径。理论根因是 Chrome 对 `texImage2D(ImageBitmap)` 实现有问题，但**用户尚未验证这次改动是否生效**。
6. **验证记录（Codex）**：当前 GitHub PNG 中心 50% 区域暗像素约 66.2%、实亮像素约 23.0%、中心像素为 0，符合官方 GitHub mark 的负空间语义。开发时不要依赖 Next watcher，目前本机有 `EMFILE`，应优先 `npm run build` 后静态服务 `out/` 验证。

7. **透明 canvas 合成解释**：旧配置 `premultipliedAlpha: false` 加 `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` 会让颜色乘一次 alpha，同时 alpha 通道也被乘一次 alpha。浏览器再把透明 WebGL drawing buffer 合成到页面背景时，低 alpha 字符会被进一步压暗；在 Chrome 上这会把 mask 密度增强压到几乎看不出来。改为 `premultipliedAlpha: true` 后，同一批 glyph 的可见亮度不再被二次压暗，所以 Chrome 中 logo 会突然恢复。

## 我（上个 agent）的最新假设

`texImage2D(ImageBitmap)` 在 Chrome 上不可靠 —— 即使设了 `UNPACK_PREMULTIPLY_ALPHA_WEBGL=false` + `UNPACK_COLORSPACE_CONVERSION_WEBGL=NONE` + `createImageBitmap(...{premultiplyAlpha:"none", colorSpaceConversion:"none"})`，Chrome 仍可能产出全 0 texture。

证据链：
- Atlas（HTMLCanvasElement）→ Chrome work
- Mask（ImageBitmap）→ Chrome 不 work
- 唯一差别就是 TexImageSource 类型

最后一次改动让 mask 也走 HTMLCanvasElement，理论上应该 fix。但需要独立验证。

## 这个假设可能是错的，你应该独立排查

可能的别的根因：

1. **mask UV 计算 bug**（`AsciiStage.tsx:277-285`）：用 `min(w, h)` 居中铺正方形，可能在某些视口下采样到边界外
2. **mask 数据其实有问题**：MaskDebug 用 canvas2D 显示对，不能 100% 证明 PNG 像素布局是 shader 期望的（R 通道是亮度）。看 `scripts/gen-masks.ts:writeFile` 确认 PNG 字节布局是 (v,v,v,255)
3. **Shader 里的 `bound` 计算**（`AsciiStage.tsx:283-285`）：`step` 边界外把 maskValue 强制为 0，可能 Chrome 上 maskUv 计算结果整体在 bound 外
4. **u_useMask uniform 没设置**：检查 `gl.uniform1f(U.useMask, mask ? 1 : 0)` 这条 `AsciiStage.tsx:536` 是否真的传了 1
5. **Texture binding / unit 串了**：atlas 在 TEXTURE0，mask 在 TEXTURE1，确认 `gl.uniform1i(U.mask, 1)` 没被覆盖
6. **Cell size 太大**：GitHub 屏 `slide.cellSize` 看 `src/lib/slides.ts`，如果 cell 太大 mask 内可能落不到几个 cell

## 推荐的诊断方法

不要先去改代码。先**直接看 Chrome 实际 texture 内容**：

```js
// 在 AsciiStage 的 draw() 里第一帧添加：
const pixels = new Uint8Array(4);
gl.readPixels(maskTex.width / 2, maskTex.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
console.log("mask center px:", pixels);
```

但 readPixels 只能从 framebuffer 读，不能直接读 texture。改成：
1. 用 framebuffer 绑定 maskTex 作为 color attachment
2. readPixels 读出来
3. 比对 Safari vs Chrome

或者更简单：在 shader 里临时把 `outColor = vec4(maskValue, maskValue, maskValue, 1.0)` 直接输出 mask，看屏幕上是不是白色 logo + 黑色背景。这能立刻定位 mask 是否到 GPU。

## 必读约束（来自用户原话）

- "所有结论要基于基础的代码事实"
- "handoff里面的内容作为了解,不要完全当成事实,之前的 agent 太笨了"——意思也包括 **这份 handoff**，请独立验证我说的"事实"
- "用最优解一步到位"——倾向于结构性修复，不要 stack 多次试错性 patch
- 不要回退到"裁剪"模式（mask 外全黑）——用户明确否决
- 不要在 useEffect 依赖里加 `targetTransition`（每帧变化导致 GL context 重建）

## 验证步骤

```bash
unset NODE_OPTIONS && npm run dev
# 打开 http://localhost:3000，导航到 GitHub 屏（按 5 或滚轮到 05/08）
# Safari 和 Chrome 都开，对比
# 左上角 MaskDebug 应显示 "mask debug v2 · CHROME" 才是最新代码
```

## 不要改

- `next.config.ts` 的 `output: "export"` / `images: { unoptimized: true }` / `trailingSlash: true`
- `legacy/` 不要拉回 tsconfig include
- mask SVG 不要手加 width/height
- 不要把 mask 改成裁剪模式

## 建议下个 session 用的 skills

无需特殊 skill。这是纯前端 WebGL 调试，需要的能力：
- 读 GLSL shader 代码
- 理解 WebGL2 texture 上传 pipeline 和 pixelStorei
- 跨浏览器 (Chrome/Safari) WebGL 实现差异
- 浏览器 DevTools (console / Network / WebGL Inspector if available)

## 当前 git 状态

```
Branch: master
Status: 大量 untracked（项目从 0 起步，还没有过 commit）
未 commit 文件：所有源码 + CLAUDE.md + 生成的 PNG
```

不要 commit。等 bug 真正修好再一次性 commit。

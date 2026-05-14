# Handoff — Chrome mask bug 已修复，但旧视觉效果未能还原

**Repo**: `/Users/harukishiina/workspace/codex/profile`
**Branch**: `master`（仍是初始状态，从未 commit）
**当前状态**：bug 已修；opaque WebGL buffer + shader 内合成试验已被用户否决；当前正确方向是 GitHub mask 资产层修复
**写这份 handoff 的 agent**：Claude (claude-opus-4-7)，承认在这一轮试错中失败，请你（codex）接手

## 这一轮（在你之后）发生了什么

上一份 codex 调试报告：`docs/DEBUG-CHROME-MASK-2026-05-14.md`（这是你之前写的，必读）
项目指南：`CLAUDE.md`
旧的 handoff 给我的：`docs/HANDOFF-CHROME-MASK.md`（我之前给你的那份）

你修复 bug 后，用户反馈视觉效果"不如以前好看"：
- **mask 外的游离方块**变成了模糊灰色矩形，看不到字符纹理（图 16）
- **mask 内的字符**发白而不是绿色
- 用户希望恢复你修复前的视觉风格（图 17：清晰绿色字符方块、字符不发白）

我尝试了两次还原都失败，**每次都让 Chrome bug 复发**。当前代码已回退到你修好的完整状态（4 处改动全部保留）。

## Codex 后续试验结果（2026-05-14，已否决）

Codex 曾尝试第三条路径，但用户明确反馈“更错误，变成模糊且不显眼的马赛克”，所以该路径不要继续。

1. WebGL context 增加 `alpha: false`，让 drawing buffer 不再依赖页面透明合成。
2. shader 不再输出透明 `vec4(finalRgb, a)`，而是在 shader 内执行 `mix(u_colorDark, glyphRgb, ink)`，最终输出 `vec4(finalRgb, 1.0)`。
3. `ink = pow(a, 1.75)`，用受控覆盖率曲线恢复旧版低 alpha 清爽感。
4. 给品牌屏 glyph 加主题色上限 `hueCeiling = u_colorBright * 1.15`，避免 bloom 加法把 RGB 三通道一起顶到 1 而发白。

当时验证结果：

- `npm run build` 通过。
- `./node_modules/.bin/tsc --noEmit --incremental false` 通过。
- Chromium 静态页 `http://localhost:3000/#github` 截图中 GitHub logo 没有复发消失。
- 但用户视觉验收否决：整体变成模糊且不显眼的马赛克，不符合目标。

结论：不要再沿着 opaque buffer / shader 内整体合成继续调。下一步应回到第一性原理，先解释为什么只有 GitHub 页表现特殊，再决定是否应改 GitHub mask 源、GitHub slide effect，或通用 shader。

## 第一性原理重审后的结论（2026-05-14）

只有 GitHub 特殊的原因不是 React、不是 Chrome、也不是通用 shader，而是 GitHub mark 本身是负空间图标：外圆/mark 是亮区，Octocat 是洞。

当前 shader 契约：

```text
maskValue 越亮 -> ASCII 越密、越亮
maskValue 越暗 -> ASCII 越稀、越暗
```

GitHub PNG 的中心区域约 66.2% 是暗像素、中心像素为 0；Octocat 本体是低密度负空间。把它反相成 positive Octocat 会得到“实心猫”，已被用户否决为反相。

当前采用的修复：保留官方 GitHub mask 语义，在 `AsciiStage` 中让 grid effect 的 mask 外区域不再被 attenuate，只让 mask 亮区叠加密度；同时把 grid 最终颜色限制在浅绿色域，避免游离方块或 logo 高亮洗白。

后续不要再把 GitHub mask 生成成 positive Octocat，除非明确决定放弃官方 mark 负空间视觉。

## 我的两次失败尝试（你不需要重做，只看推理是否有破绽）

### 失败尝试 #1：标准预乘路径

我推理："你的 pa=true + 不改 blendFunc + 不改 shader 输出 = 非标准合成（drawing_a = a²）。我改为标准预乘路径应该更对。"

改动：
1. `blendFunc(SRC_ALPHA, ONE-SRC)` → `(ONE, ONE-SRC)`
2. shader 末尾 `vec4(rgb, a)` → `vec4(rgb*a, a)`
3. 回退你的 3 个数值补偿到原值（0.82/0.36/1.0 → 0.55/0.25/0.6）

结果：bug 复发，logo 在 Chrome 上又看不见了。

教训：你的 4 处改动是耦合的局部最优——pa=true + 三个数值补偿一起锚定了视觉。我同时动了三条路径，每条都"看起来更对"，但合在一起破坏了你找到的视觉点。

### 失败尝试 #2：shader 内显式 alpha 幂衰减

我推理："旧版 pa=false 路径下，最终像素是 `rgb*a³ + bg*(1-a²)`，a³ 衰减才是旧版清爽视觉的物理来源。我在 shader 里加 `pow(a, 2.5)` 模拟这条曲线，保持你的 pa=true bug 修复不动。"

改动：
1. shader 末尾加 `a = pow(clamp(a, 0.0, 1.0), 2.5);`
2. 回退你的 3 个数值补偿

结果：bug 复发。

我的事后分析（不确定是否对）：`pow(a, 2.5)` 让 drawing_a 变成 `a^5`，这是个极低的 alpha 值。Chrome compositor 在极低 alpha 区间又出现暗压——原 bug 复发。alpha 不能动，否则触发 Chrome compositor 暗压。

## 我对这个 bug 物理来源的当前理解（请你核验）

我的认知（可能错）：

1. 旧 pa=false 路径下，单次绘制后浏览器看到的像素：
   - `drawing_rgb = rgb * a`（blendFunc SRC_ALPHA 乘了一次）
   - `drawing_a = a²`（同一个 blendFunc 也作用在 alpha 通道上）
   - 浏览器 pa=false 合成：`final = drawing_rgb * drawing_a + bg*(1-drawing_a)` = `rgb*a³ + bg*(1-a²)`

2. 这条 `a³` 衰减曲线**同时**：
   - 塑造了旧版清爽视觉（低 alpha 像素几乎不可见）
   - 是 Chrome compositor bug 的触发条件（你 DEBUG 报告说"Chrome / Safari 对低 alpha 区间呈现不一致"）

3. 你的修法 pa=true 让 Chrome compositor 走预乘合成路径，绕开它在 straight alpha 路径上的 bug。代价：`a³` 变成 `a¹`，飘块变模糊，所以你又用 3 个数值补偿强行把视觉拉回来。

**核心怀疑（已被后续资产层修复推翻）**：旧视觉物理来源（a³）和 bug 是同一个东西。在 pa=true 路径下完全还原旧视觉**可能根本不存在解**——除非有第三条路径我没看到。后续第一性原理对比证明真正特殊点在 GitHub mask 语义，而不是必须继续求解全局 alpha 曲线。

如果这个认知对，那"还原旧视觉"应该承认边界，转向**在 pa=true 锁定路径上做精细数值微调**，让飘块没那么糊、字符没那么白——但接受不会和旧版完全一样。

如果这个认知错，请指出我哪一步推理破绽，并给出可工作的方案。

## 当前代码状态（已 build 验证）

`src/components/AsciiStage.tsx`：
- WebGL context 使用 `premultipliedAlpha: true` ✓
- L289 `litInside = clamp(max(lit, m * 0.82) + m * 0.36, 0.0, 1.0)` ✓
- L291 `litOutside = lit * (1.0 - u_useMask * 0.42)` ✓
- L296 `bloom *= (1.0 + m * 1.0)` ✓
- blendFunc 仍是 `SRC_ALPHA, ONE-SRC` ✓
- shader 输出透明颜色：`vec4(finalRgb, clamp(a, 0.0, 1.0))` ✓

已回到最初 Codex 修复后的透明输出状态。继续前必须先比较 GitHub 与其他页的根本差异，不要继续堆 shader patch。

## 用户希望的目标（按优先级）

1. Chrome mask 屏 logo 可见（**bug 不能复发**）
2. mask 外游离方块清爽（看到字符纹理，不要模糊一团）—— 接近 `docs/...md` 里描述的图 17 旧版
3. mask 内字符是绿色（不发白）

## 用户对我的明确指示（适用于你）

- "所有结论要基于基础的代码事实"
- "用最优解一步到位"
- 不接受继续在 Chrome bug 状态下挂着

## 验证方式

用户在用 `python3 -m http.server -d out`（你 DEBUG 报告里写过的）。每次代码改动必须：

```bash
unset NODE_OPTIONS && rm -rf .next out && npm run build
```

然后浏览器 Cmd+Shift+R 硬刷。`next dev` 不可靠（EMFILE）。

## 不要改

- 不要回退 pa=true
- 不要在 useEffect 依赖加 `targetTransition`
- 不要碰 `next.config.ts` 的 export / unoptimized / trailingSlash
- 不要把 mask 变成裁剪模式（外部全黑）
- 不要重新走 SVG runtime rasterize

## 建议下一个 session 用的 skills

无需特殊 skill。需要的能力：
- WebGL 预乘 alpha vs straight alpha 合成数学
- Chrome / Safari compositor 实现差异的实测经验
- shader 端做 alpha/RGB 衰减的工程技巧
- 不要凭推理 ship，必须每次只动一个变量后实测

## 推荐的下一步

不要尝试"完全还原旧视觉"。**先用 shader probe 验证我的物理来源认知**：

在 shader 末尾加一段诊断输出，把 `a` 值映射到颜色，看 Chrome / Safari 上低 alpha 像素的 alpha 实际分布。然后判断：

- 如果旧版美感真的是 a³ 衰减的副产物 → 接受边界，做小数值微调
- 如果有其他物理来源（例如旧版字符 atlas 的某个 alpha 通道处理）→ 我漏掉了一条路径，请你指出

## 当前 git 状态

```
Branch: master
状态：从未 commit，全部源码、配置、CLAUDE.md、docs/、public/masks/*.png 均 untracked
根目录还有 3 个调试截图（chrome.png / safari.png / 6be2d...png）应在 commit 前清理
```

不要 commit。等 bug 真正修好（不光修，还要视觉接受）再一次性 commit。

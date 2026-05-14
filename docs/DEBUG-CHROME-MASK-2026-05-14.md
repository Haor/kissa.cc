# 调试报告：Chrome / Safari WebGL Mask 差异

**日期**：2026-05-14  
**仓库**：`/Users/harukishiina/workspace/codex/profile`  
**范围**：`AsciiStage` WebGL2 shader、品牌 mask texture、透明 canvas 合成  
**状态**：Chrome 可见问题已修复；根因、调试路径和最终资产层修复已记录。

## 最终更新：回到官方 GitHub Mark，不再做正形猫

后续视觉验证确认：把 GitHub 生成成 positive Octocat density mask 会变成“实心猫”，用户认为这是反相，不是目标视觉。当前目标是把官方 GitHub mark 叠到 grid 上：外圆/mark 为高密度 ASCII，Octocat 保持负空间。

当前实现：

- `scripts/gen-masks.ts` 不再对 GitHub 做 polarity 特例。
- GitHub slide 重新启用 `maskId: "github"`。
- `AsciiStage` 对 grid effect 保持 mask 外基线不压暗，只在 mask 亮区加密/增强。
- grid 最终颜色被限制在浅绿色域，避免高亮字符洗成白色。

当前 `public/masks/github.png` 保留官方负空间语义：中心 50% 区域暗像素约 `66.2%`，实亮约 `23.0%`，中心像素为 `0`。这不是 GPU 反相，而是官方 mark 的输入语义。

## 结论摘要

Chrome 的问题不是 mask 数据丢失、texture 上传失败、UV 算错，也不是 Chrome 把 texture 全局反相。

真正叠在一起的是两件事：

1. **GitHub mask 本身是负空间 mark**：GitHub PNG/SVG 是“外圆高密度、Octocat 低密度洞”。这是官方 GitHub mark 的视觉语义，不应再在生成阶段反相成实心猫。
2. **透明 WebGL canvas 的 alpha 合成让 Chrome 更暗**：旧路径使用透明 WebGL canvas、普通 alpha blending、低 alpha ASCII glyph。Chrome 下这些 glyph 被压到很暗的区间，导致 logo 看起来像没出现或像反了。改为 `premultipliedAlpha: true` 并提高 mask 区域亮度 floor 后，Chrome 里 logo 恢复可见。

不要用 `gl.disable(gl.BLEND)` 当最终修复。它只能绕开透明合成问题，会让 Safari 和整体视觉变硬。

## 用户可见现象

页面：`http://localhost:3000/#github`

- Safari 中 GitHub mask 形状更明显。
- Chrome 中 GitHub logo 区域很弱，早期看起来像没有图标。
- 仔细看后，Chrome 不是完全没有图标，而是更像“图标被挖空 / 反相”。
- 截图调试时曾短暂看到图标出现，这提示问题可能在透明合成/亮度阈值，而不是 texture 完全没上传。

## 重要运行约束

本次排查中，`next dev` 不是可靠反馈回路。本机出现过 watcher / 文件描述符问题（`EMFILE`），可能导致浏览器吃旧 bundle。

可靠验证方式：

```bash
npm run build
python3 -m http.server 3000 -d out
```

然后访问：

```text
http://localhost:3000/#github
```

当时 3000 端口由静态服务提供：

```text
Python SimpleHTTPServer -> out/
```

不是 `next dev`。

## 调试方法

这次采用单变量排查：

1. 确认浏览器实际加载的是哪个 bundle。
2. 确认 PNG mask 是否能在 Chrome 中解码。
3. 确认 WebGL 是否采样到了同一份 mask。
4. 绕过正常 shader，直接输出 `maskValue`。
5. 分别测试 blend / compositor 假设。
6. 量化生成后的 PNG mask 语义。
7. 记录被否决的修复方向。

## 1. 确认当前服务的是新代码

使用命令：

```bash
curl -I http://localhost:3000/#github
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

证据：

- `curl` 返回 `HTTP/1.0 200 OK`。
- `Server: SimpleHTTP/0.6 Python/...` 证明浏览器看到的是 `out/` 静态构建。

意义：

- 早期“修了但没变化”的判断可能来自旧 bundle。
- 先排除服务层缓存/热更新问题，后续视觉判断才可信。

## 2. 确认 mask 数据没有丢

运行时链路：

```text
public/masks/*.png
  -> fetch()
  -> createImageBitmap()
  -> canvas2D.drawImage()
  -> HTMLCanvasElement
  -> gl.texImage2D(TEXTURE_2D, ..., maskSource)
```

相关文件：

- `src/lib/use-mask.ts`
- `src/components/MaskDebug.tsx`
- `src/components/AsciiStage.tsx`

证据：

- `MaskDebug` 在 Chrome 中能显示 5 个 mask PNG。
- `useMask` 返回 `HTMLCanvasElement`，和字符 atlas 是同类上传路径。
- 字符 atlas 在 Chrome 中一直正常，说明 `HTMLCanvasElement -> texImage2D` 路径可用。

结论：

- PNG 解码正常。
- mask source canvas 正常。
- 问题不在最基础的图片加载。

## 3. 直接输出 GPU 采样到的 mask

临时 shader 探针：

```glsl
outColor = vec4(maskValue, maskValue, maskValue, 1.0);
```

这一步绕过了：

- scene 亮度
- 字符 atlas 选择
- bloom
- 主题色
- 字符 alpha
- 页面 compositor

Chromium 中观察到：

- GitHub 显示为白色外圆 + 黑色 Octocat 洞。
- 这和 PNG/source mask 一致。

结论：

- `u_mask` 已绑定。
- `u_useMask` 生效。
- UV 在有效范围内。
- TEXTURE1 不是全 0。
- Chrome 没有把 texture 全局反相。

## 4. 测试“是不是应该全局反相”

临时 probe：

```glsl
float m = (1.0 - maskValue) * u_useMask;
```

结果：

- logo 外部/背景区域也会被点亮。
- 不符合当前“mask 是密度增强场，而不是裁剪场”的设计。

原因：

- mask 外部是黑色。
- GitHub Octocat 洞也是黑色。
- 全局反相会同时点亮“猫洞”和“外部背景”，不是只把猫本体变亮。

结论：

- 全局 invert 不是正确修复。
- 如果要“Octocat 本体是高密度”，应在生成阶段做 GitHub 专用 mask，而不是在 shader 里全局反相。当前项目已经采用生成阶段修复。

## 5. 量化 GitHub mask 的负形语义

使用命令：

```bash
python3 - <<'PY'
from PIL import Image

for name in ["x", "instagram", "github", "huggingface", "steam"]:
    im = Image.open(f"public/masks/{name}.png").convert("L")
    w, h = im.size
    total = w * h
    hist = im.histogram()
    crop = im.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    ch = crop.histogram()
    ctot = crop.size[0] * crop.size[1]
    print(
        f"{name:12} "
        f"all dark<32={sum(hist[:32]) / total:.3f} "
        f"solid>=224={sum(hist[224:]) / total:.3f} | "
        f"center dark<32={sum(ch[:32]) / ctot:.3f} "
        f"solid>=224={sum(ch[224:]) / ctot:.3f}"
    )
PY
```

关键输出：

```text
github center dark<32=0.662 solid>=224=0.230
huggingface center dark<32=0.026 solid>=224=0.918
steam center dark<32=0.259 solid>=224=0.562
```

解释：

- GitHub 中心区域约 `66.2%` 是暗像素，实亮像素只有约 `23.0%`。
- HuggingFace 中心区域约 `91.8%` 是实亮像素。
- 所以 GitHub 和其他 mask 结构完全不同，它本身就是负形。

这个结果也和 `github.png` 的 ASCII 粗采样一致：外圆亮，Octocat 主体大面积为空/暗。

## 6. 定位浏览器差异所在层

当前 shader 输出：

```glsl
vec3 finalRgb = base * charMask + bloomCol * (0.30 + charMask * 0.70);
float a = charMask * (0.6 + lit * 0.55) + bloom * 0.18;
outColor = vec4(finalRgb, clamp(a, 0.0, 1.0));
```

旧的脆弱路径：

```ts
canvas.getContext("webgl2", {
  premultipliedAlpha: false,
  antialias: false,
});

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

问题点：

- `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` 同时作用在 RGB 和 alpha 上。
- 绘制到透明 framebuffer 时，低 alpha glyph 的颜色会乘 alpha，alpha 通道自己也会乘 alpha。
- 浏览器再把透明 WebGL drawing buffer 合成到 CSS 背景时，Chrome / Safari 对这个低 alpha 区间的呈现并不完全一致。

简化数学示意：

```text
glyph alpha = 0.25
stored rgb   ~= 0.25
stored alpha ~= 0.25 * 0.25 = 0.0625
```

如果后续页面合成再按 straight alpha 处理，最终可见贡献会比预期低很多。

当前修复：

```ts
canvas.getContext("webgl2", {
  premultipliedAlpha: true,
  antialias: false,
});
```

同时提高 mask 区域对比：

```glsl
float litInside = clamp(max(lit, m * 0.82) + m * 0.36, 0.0, 1.0);
float litOutside = lit * (1.0 - u_useMask * 0.42);
bloom *= (1.0 + m * 1.0);
```

为什么有效：

- mask 区域不再落在浏览器 compositor 最敏感的暗 alpha 区间。
- 保持 blending，不破坏 Safari 的柔和视觉。
- 不依赖 `UNPACK_FLIP_Y_WEBGL` 这类跨浏览器行为。

## 被否决的修复方向

### 1. 禁用 blending

尝试：

```ts
gl.disable(gl.BLEND);
```

结果：

- Chrome 某些截图里 logo 变明显。
- Safari 和整体画面变硬、变差。

结论：

- 否决。它不是修复透明合成，只是移除了原设计的半透明渲染模型。

### 2. Shader 内全局反相 mask

尝试：

```glsl
float m = (1.0 - maskValue) * u_useMask;
```

结果：

- 会点亮 logo 外部背景。
- 不符合“mask 作为密度增强场”的设计。

结论：

- 否决。GitHub 正形已经在 mask 生成阶段处理。

### 3. 把 `ImageBitmap` 上传当成最终根因

历史假设：

- Chrome 可能对 `texImage2D(ImageBitmap)` 有问题。

当前证据：

- 当前 mask 已经通过 `HTMLCanvasElement` 上传。
- 直接输出 `maskValue` 证明 Chrome 能采样到正确 GitHub mask。

结论：

- 这不是当前剩余视觉差异的根因。

## 最终根因链

可见差异来自这个组合：

```text
GitHub 负形 mask
  + 低 alpha ASCII glyph
  + 透明 WebGL canvas
  + 普通 alpha blending
  + 浏览器 compositor 差异
```

Chrome 没有丢 mask，也没有反相 texture。它是把 mask 增强后的 ASCII 区域压得太暗；由于 GitHub 刚好是负形 mask，就显得像“没有图标”或“反了”。

## 验证记录

命令：

```bash
npm run build
python3 -m http.server 3000 -d out
curl -I http://localhost:3000/#github
./node_modules/.bin/tsc --noEmit --incremental false
```

浏览器验证：

- Chromium 打开 `http://localhost:3000/#github`。
- 截图中 GitHub mask field 可见。
- 直接 `maskValue` shader probe 显示 GPU 采样正确。

清理：

- 临时 Playwright 截图和日志已删除。
- 临时 debug shader 分支未保留在源码。
- `rg` 未发现 `debugMask`、`u_debugMask` 或 `gl.disable(gl.BLEND)` 调试路径残留。

## 当前代码状态

关键点：

- `src/components/AsciiStage.tsx` 使用 `premultipliedAlpha: true`。
- `src/components/AsciiStage.tsx` 保持 blending 启用。
- `src/components/AsciiStage.tsx` 在 shader 内显式做 mask Y 翻转。
- `src/assets/masks.ts` 已标注 GitHub 是 inverse mark。
- `docs/HANDOFF-CHROME-MASK.md` 和 `CLAUDE.md` 已记录不要回到被否决的方向。

## 后续建议

如果未来需要调整 GitHub 的 Octocat 本体高密度/高亮，不要在 fragment shader 里直接全局反相。

更合理的选择：

1. 优先调整 `scripts/gen-masks.ts` 的 GitHub positive mask 生成逻辑。
2. 如果未来新增类似 inverse source 的品牌，给 mask 增加元数据，例如 `polarity: "positive" | "inverse"`，在生成阶段处理 polarity。
3. 不要在运行时 shader 添加品牌特例。

如果未来再次出现浏览器差异，按这个顺序排查：

1. 用静态 build 验证，不依赖 `next dev`。
2. 用 `MaskDebug` 检查 PNG 解码。
3. 直接输出 `maskValue` 检查 GPU 采样。
4. 单变量测试 blend / compositor。
5. 跑 PNG luminance histogram 检查 mask 语义。

不要在 `maskValue` 直出证明 GPU 采样错误之前，优先改 SVG rasterize 或 texture 上传路径。

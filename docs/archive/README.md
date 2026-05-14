# docs/archive

历史交接和调试快照。**仅作研究参考，不再代表当前架构。**

当前基线见仓库根的 [`README.md`](../../README.md) 和 [`CLAUDE.md`](../../CLAUDE.md)。

| 文件 | 时期 | 主要内容 | 与当前架构的关系 |
|---|---|---|---|
| [`HANDOFF.md`](./HANDOFF.md) | 2026-05 早期 | v0 → v1 过渡阶段交接 | 描述的"每屏一个 AsciiStage / strip translate / 8 屏"已废弃 |
| [`HANDOFF-CHROME-MASK.md`](./HANDOFF-CHROME-MASK.md) | 2026-05 | Chrome 上 brand mask 倒置 / 过暗 bug | 修复已固化到 `scripts/gen-masks.ts` 与 shader 内 Y 翻转 |
| [`HANDOFF-VISUAL-RESTORE-2026-05-14.md`](./HANDOFF-VISUAL-RESTORE-2026-05-14.md) | 2026-05-14 | v0 视觉风格还原方案 | 部分结论已合并；不要重新走"裁剪式 mask" |
| [`DEBUG-CHROME-MASK-2026-05-14.md`](./DEBUG-CHROME-MASK-2026-05-14.md) | 2026-05-14 | Chrome mask debug 记录 | 现象已修复，过程记录可作复盘 |

### 已废弃的关键概念（如再次出现请忽略）

- "每屏一个 AsciiStage / 每屏一个 GL context" → 已合并为单实例 `SceneStage`
- "strip translate3d 水平滑动" → 已改为字符散开 / 重组转场
- "ensureSvgDimensions 客户端光栅化" → 已改为 build 时离线 `gen-masks.ts`
- "切屏音效 / SoundToggle" → 已移除
- "8 屏布局" → 现为 10 屏（新增 `hardware` / `links`）
- "改文案改 data.ts / slides.ts" → 改 `src/content/site.json`

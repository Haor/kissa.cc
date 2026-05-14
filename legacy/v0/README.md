# Profile v0 · Litlink-Style Reference Build

> **Archived 2026-05-14.** 这是第一版 Litlink 风格的实现，已被新的"全屏画册"版本（仓库根目录）取代。
> 此目录纯作参考保留：复用了 `AsciiCanvas` 的 atlas + shader 思路。
>
> 启动这版历史快照：
> ```bash
> cd legacy/v0
> npm install
> npm run dev
> ```

---

一个 Litlink 风格的个人主页，首屏与卡片缩略图均为实时渲染的 WebGL ASCII 动效。
完全自托管，零月费，可二次开发。

## 技术栈

- **Next.js 15** + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- 自写 **WebGL2 fragment shader** 渲染 ASCII（字符 atlas + 程序化噪声场）
- 可选：内嵌 **Unicorn Studio** runtime 叠加辉光/景深

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 自定义内容

- 编辑 `src/lib/data.ts` 修改 bio、链接、项目列表
- 编辑 `src/lib/ascii-presets.ts` 增减/调整 ASCII 动画预设

## 关键文件

| 路径 | 作用 |
|---|---|
| `src/components/AsciiCanvas.tsx` | 核心 WebGL ASCII 渲染器 |
| `src/lib/ascii-presets.ts` | 各种动效（mushroom / wave / chaos / grid / orbit） |
| `src/app/page.tsx` | 首页装配 |
| `src/components/UnicornEmbed.tsx` | 可选：Unicorn Studio 嵌入层 |

## 部署

推荐 Vercel（一键 `vercel deploy`）。

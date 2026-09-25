# `src/content/` —— 唯一的"可编辑文案源"

所有页面里出现的**文字、链接、handle、硬件清单、外链分组**都集中在
[`site.json`](./site.json) 里。**这是唯一需要手动改的文件。**

视觉层的配置（每屏用哪种 ASCII 效果、字符密度、颜色主题等）在
`src/lib/slides.ts` 里，与文案完全解耦。普通情况下不需要改它。

---

## 修改流程

1. 打开 `src/content/site.json`
2. 找到对应的字段改值即可
3. 保存。dev server 热重载；生产部署只要 push 到 `master`（Cloudflare Pages 自动构建）

---

## 字段速查

```jsonc
{
  "profile": {
    "handle":   "@kissa",           // cover/卡片右上角的 @ id
    "name":     "Kissa",            // 全名
    "aka":      "椎名晴樹",          // 别名（可改成任何文本，留空字符串隐藏）
    "title":    "Engineer · ...",
    "tagline":  "As I Dreamed",
    "bio":      "As I Dreamed.",
    "location": "Shenzhen"          // 显示在 cover 卡片底部
  },

  "slides": {
    // ── 首屏 ─────────────────────────────
    "cover":  {
      "kicker":   "...",            // 主标语上方的小字
      "sentence": "...",            // 主标语（Cormorant Italic 大字）
      "figure":   { "fig": "drift", "mark": "夢", "reading": "yume", "gloss": "dream" }
                                    // 右下角图注：fig = 背景画的是什么；mark / reading /
                                    // gloss = 汉字、读音、释义。品牌屏只写 fig + gloss。
                                    // 汉字本身的字形在 src/assets/masks.ts，改字需要重抽轮廓
    },

    // ── About（个人介绍）────────────────
    "about":  {
      "eyebrow":  "who",            // 小标题（每屏都可选；不填用 slide label）
      "sentence": "Engineer · Daydreamer",
                                    // 以 "·" 分两半：前半等宽大写，后半 serif 斜体
      "intent":   "...",            // 副本
      "figure":   { "fig": "wiring", "mark": "私", "reading": "watashi", "gloss": "i, myself" },
      "cta":      { "label": "...", "href": "mailto:..." }
    },

    // ── 社交品牌屏（5 个）───────────────
    "x" | "instagram" | "github" | "huggingface" | "steam": {
      "handle": "@xxx",             // 进场时从乱码 decode 出来
      "intent": "...",              // 这一屏的大字标题
      "figure": { "fig": "film", "gloss": "one frame every three seconds" },
      "cta":    { "label": "...", "href": "https://..." }
    },

    // ── Hardware（硬件清单）────────────
    "hardware": {
      "sentence": "...",
      "hardware": [
        { "group": "CPU", "value": "..." },
        { "group": "GPU", "value": "..." }
        // 任意多行；group 是左侧标签，value 是右侧内容
      ]
    },

    // ── Links（外链聚合）───────────────
    "links": {
      "sentence": "...",
      "links": {
        "projects": [{ "label": "...", "href": "https://...", "note": "可选" }],
        "tools":    [...],
        "friends":  [...]
      }
    },

    // ── Contact（联系方式）─────────────
    "contact": {
      "sentence": "...",
      "contacts": [
        // label 必须是以下值之一（决定显示哪个图标）：
        //   "email" / "discord" / "telegram" / "vrchat" / "back"
        { "label": "email",    "value": "...", "href": "mailto:..." },

        // action: "copy" → 点击按钮把 href 字段复制到剪贴板（不会跳转）
        { "label": "discord",  "value": "@...", "href": "haor233", "action": "copy" },

        { "label": "telegram", "value": "@...", "href": "https://t.me/..." },
        { "label": "vrchat",   "value": "...",  "href": "https://vrchat.com/home/user/..." },
        { "label": "back",     "value": "to the start", "href": "#cover" }
      ]
    }
  }
}
```

---

## 注意事项

- **不要改 slide 的 key**（`cover` / `about` / `x` / ...）——它们是 URL hash
  和视觉绑定的稳定 id；改 key 会破坏路由。
- 想换 effect / 主题色 / figure / 增删整屏 → 编辑 `src/lib/slides.ts`（视觉配置层）。
- 文案里出现新的中日文字符后，本地跑一次 `npm run build`（或 `npx tsx scripts/gen-fonts.ts`）
  重新 subset 字体，并把 `public/fonts/*.woff2` 一起 commit；否则线上会回落到系统字体。
- JSON 不支持注释，但允许 `$schema` 字段（已配置 `site.schema.json`）。

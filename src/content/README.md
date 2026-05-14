# `src/content/` —— 唯一的"可编辑文案源"

所有页面里出现的**文字、链接、handle、硬件清单、外链分组**都集中在
[`site.json`](./site.json) 里。**这是唯一需要手动改的文件。**

视觉层的配置（每屏用哪种 ASCII 效果、字符密度、颜色主题等）在
`src/lib/slides.ts` 里，与文案完全解耦。普通情况下不需要改它。

---

## 修改流程

1. 打开 `src/content/site.json`
2. 找到对应的字段改值即可
3. 保存。dev server 热重载；生产部署只要 `npm run deploy`

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
      "kicker":   "...",            // 顶部小字（可选；不填则自动用 "name · index"）
      "sentence": "..."             // 主标语
    },

    // ── About（个人介绍）────────────────
    "about":  {
      "sentence": "...",            // 主语
      "intent":   "...",            // 副本
      "cta":      { "label": "...", "href": "mailto:..." }
    },

    // ── 社交品牌屏（5 个）───────────────
    "x" | "instagram" | "github" | "huggingface" | "steam": {
      "handle": "@xxx",
      "intent": "...",
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
- 想换 effect / 主题色 / 增删整屏 → 编辑 `src/lib/slides.ts`（视觉配置层）。
- JSON 不支持注释，但允许 `$schema` 字段（已配置 `site.schema.json`）。

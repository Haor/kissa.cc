import type { ThemeKey } from "./theme";

/**
 * 一屏卡片的描述。每屏的内容布局根据 id 切换到不同模板：
 *   - cover/contact: 自定义模板
 *   - about: 散文式
 *   - 其余: brand 模板（mask + handle + intent + CTA）
 */
export type Slide = {
  /** URL hash 的稳定 id */
  id: string;
  /** 顶部 label / SR 标题 */
  label: string;
  /** 主题 key（对应 THEMES） */
  theme: ThemeKey;
  /** Shader effect id：1 mushroom / 2 wave / 3 orbit / 4 chaos / 5 grid / 6 drift / 7 starfield */
  effect: number;
  /** 字符密度 cell size（px） */
  cellSize: number;
  /** 动画速度乘子 */
  speed: number;
  /** 启用品牌 SVG mask */
  maskId?: "x" | "instagram" | "github" | "huggingface" | "steam";
  /** 居中主文（cover/contact 用） */
  sentence?: string;
  /** 平台 handle / 邮箱 */
  handle?: string;
  /** 一句"在那儿干什么" */
  intent?: string;
  /** 主 CTA */
  cta?: { label: string; href: string };
  /** contact 屏的多组联系方式 */
  contacts?: { label: string; value: string; href: string }[];
  /** 鼠标交互强度（0=完全不动 1=v0 默认） */
  cursorIntensity: number;
};

export const SLIDES: Slide[] = [
  {
    id: "cover",
    label: "Index",
    theme: "cover",
    effect: 6, // drift
    cellSize: 8,
    speed: 0.18,
    sentence: "as i dreamed.",
    cursorIntensity: 0.3,
  },
  {
    id: "about",
    label: "About",
    theme: "about",
    effect: 1, // mushroom
    cellSize: 9,
    speed: 0.45,
    sentence: "Engineer · Daydreamer",
    intent: "based in Shenzhen / 深圳 — building things that mostly only I care about.",
    cta: { label: "Email me →", href: "mailto:i@haor.cc" },
    cursorIntensity: 0.8,
  },
  {
    id: "x",
    label: "X",
    theme: "x",
    effect: 4, // chaos · 流动的信息流
    cellSize: 9,
    speed: 0.55,
    maskId: "x",
    handle: "@haor233_re",
    intent: "thoughts in real time.",
    cta: { label: "Open X →", href: "https://x.com/haor233_re" },
    cursorIntensity: 0.6,
  },
  {
    id: "instagram",
    label: "Instagram",
    theme: "instagram",
    effect: 1, // mushroom · 暖色氛围
    cellSize: 9,
    speed: 0.4,
    maskId: "instagram",
    handle: "@haor233",
    intent: "frames i keep.",
    cta: { label: "Open Instagram →", href: "https://www.instagram.com/haor233/" },
    cursorIntensity: 0.6,
  },
  {
    id: "github",
    label: "GitHub",
    theme: "github",
    effect: 5, // grid · 代码格
    cellSize: 10,
    speed: 0.9,
    maskId: "github",
    handle: "@Haor",
    intent: "commits speak louder.",
    cta: { label: "Open GitHub →", href: "https://github.com/Haor" },
    cursorIntensity: 0.5,
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    theme: "huggingface",
    effect: 3, // orbit · 环抱感
    cellSize: 10,
    speed: 0.6,
    maskId: "huggingface",
    handle: "@haor",
    intent: "models i tinker with.",
    cta: { label: "Open HF →", href: "https://huggingface.co/haor" },
    cursorIntensity: 0.7,
  },
  {
    id: "steam",
    label: "Steam",
    theme: "steam",
    effect: 2, // wave · 蒸汽流
    cellSize: 10,
    speed: 0.8,
    maskId: "steam",
    handle: "haor233",
    intent: "what i'm playing.",
    cta: { label: "Open Steam →", href: "https://steamcommunity.com/id/haor233/" },
    cursorIntensity: 0.5,
  },
  {
    id: "contact",
    label: "Contact",
    theme: "contact",
    effect: 7, // starfield
    cellSize: 11,
    speed: 0.3,
    sentence: "until we meet again",
    contacts: [
      { label: "email", value: "i@haor.cc", href: "mailto:i@haor.cc" },
      { label: "discord", value: "@haor233", href: "https://discord.com/users/402097792681508865" },
      { label: "back", value: "to the start", href: "#cover" },
    ],
    cursorIntensity: 0.4,
  },
];

export const SLIDE_INDEX_BY_ID: Record<string, number> = SLIDES.reduce(
  (acc, slide, i) => {
    acc[slide.id] = i;
    return acc;
  },
  {} as Record<string, number>,
);

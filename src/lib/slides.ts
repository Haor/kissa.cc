import type { ThemeKey } from "./theme";
import type { MaskId } from "@/assets/masks";
import site from "@/content/site.json";

/**
 * 一屏卡片的描述。
 *
 * 内容分两层：
 *   - 视觉层：每屏的 effect / theme / speed / figure / text 侧
 *     —— 写在本文件下方的 `SLIDE_VISUALS` 数组里，与文案完全无关。
 *   - 文案层：eyebrow / sentence / handle / intent / cta / figure 注释 / ...
 *     —— 集中在 `src/content/site.json`，普通改动只需要编辑这一个 JSON。
 *
 * 最终对外导出的 `SLIDES` 由两层在模块加载时合并而成。
 */

export type LinkItem = { label: string; href: string; note?: string };

export type Slide = {
  /** URL hash 的稳定 id；同时也是 site.json 里 slides.<id> 的 key */
  id: string;
  /** 顶部 label / SR 标题 */
  label: string;
  /** 主题 key（对应 THEMES） */
  theme: ThemeKey;
  /** Shader effect id：1 film / 2 invaders / 3 neural / 4 chaos / 5 grid
   *  6 drift / 7 thread / 8 circuit / 9 meters / 10 web */
  effect: number;
  /** 动画速度乘子 */
  speed: number;
  /** 字符场里凝聚出的 figure（品牌 logo 或汉字） */
  figure: MaskId;
  /** 文案在哪一侧；figure 自动放到另一侧 */
  text: "left" | "right";
  /** figure 尺寸倍率（默认 1） */
  figureScale?: number;
  /** 竖屏 figure 摆位覆盖（中心高度 + 占屏宽比例 + 上限），见 GlyphEngine.place */
  figurePortrait?: { y: number; w: number; max: number };
  /** 小标题（"who" / "rig" ...） */
  eyebrow?: string;
  /** 主文 */
  sentence?: string;
  /** cover 顶部小字 */
  kicker?: string;
  /** 平台 handle / 邮箱 */
  handle?: string;
  /** 一句"在那儿干什么" */
  intent?: string;
  /** 主 CTA */
  cta?: { label: string; href: string };
  /** 右下角图注：fig = 背景画的是什么；汉字屏再加 mark / reading */
  figureNote?: { fig?: string; mark?: string; reading?: string; gloss: string };
  /** contact 屏的多组联系方式。action: "copy" 时点击复制 href 内容 */
  contacts?: {
    label: string;
    value: string;
    href: string;
    action?: "copy";
  }[];
  /** hardware 屏的硬件清单 */
  hardware?: { group: string; value: string }[];
  /** links 屏的外链分组 */
  links?: {
    projects: LinkItem[];
    tools: LinkItem[];
    friends: LinkItem[];
  };
};

/** 视觉层配置：每屏的 id + label + 渲染参数。普通用户无需修改。 */
type SlideVisual = Pick<
  Slide,
  "id" | "label" | "theme" | "effect" | "speed" | "figure" | "text" | "figureScale" | "figurePortrait"
>;

const SLIDE_VISUALS: SlideVisual[] = [
  { id: "cover", label: "Index", theme: "cover", effect: 6, speed: 0.22, figure: "dream", text: "left" },
  { id: "about", label: "About", theme: "about", effect: 8, speed: 0.45, figure: "self", text: "left" },
  { id: "x", label: "X", theme: "x", effect: 4, speed: 0.55, figure: "x", text: "left" },
  { id: "instagram", label: "Instagram", theme: "instagram", effect: 1, speed: 1, figure: "instagram", text: "left" },
  { id: "github", label: "GitHub", theme: "github", effect: 5, speed: 0.9, figure: "github", text: "left" },
  { id: "huggingface", label: "Hugging Face", theme: "huggingface", effect: 3, speed: 1, figure: "huggingface", text: "left" },
  {
    id: "steam", label: "Steam", theme: "steam", effect: 2, speed: 1, figure: "steam", text: "left",
    // 竖屏：图标缩小下移，上方让给侵略者编队，图标自己当炮台
    figurePortrait: { y: 0.555, w: 0.56, max: 0.28 },
  },
  { id: "hardware", label: "Hardware", theme: "hardware", effect: 9, speed: 1, figure: "machine", text: "right" },
  { id: "links", label: "Links", theme: "links", effect: 10, speed: 1, figure: "web", text: "right", figureScale: 0.72 },
  { id: "contact", label: "Contact", theme: "contact", effect: 7, speed: 1, figure: "bond", text: "right" },
];

/** 文案层：site.json 里 slides.<id> 的所有字段都允许是 optional。 */
type SlideCopy = Partial<Omit<Slide, keyof SlideVisual>> & {
  figure?: Slide["figureNote"];
};

const SLIDE_COPY = site.slides as unknown as Record<string, SlideCopy>;

/** 把视觉配置和 site.json 里的文案合成最终 Slide 列表。 */
export const SLIDES: Slide[] = SLIDE_VISUALS.map((visual) => {
  const { figure, ...copy } = SLIDE_COPY[visual.id] ?? {};
  return { ...visual, ...copy, figureNote: figure };
});

export const SLIDE_INDEX_BY_ID: Record<string, number> = SLIDES.reduce(
  (acc, slide, i) => {
    acc[slide.id] = i;
    return acc;
  },
  {} as Record<string, number>,
);

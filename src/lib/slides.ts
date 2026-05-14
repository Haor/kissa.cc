import type { ThemeKey } from "./theme";
import site from "@/content/site.json";

/**
 * 一屏卡片的描述。
 *
 * 内容分两层：
 *   - 视觉层：每屏的 effect / theme / cellSize / speed / maskId / cursorIntensity
 *     —— 写在本文件下方的 `SLIDE_VISUALS` 数组里，与文案完全无关。
 *   - 文案层：sentence / handle / intent / cta / contacts / hardware / links
 *     —— 集中在 `src/content/site.json`，普通改动只需要编辑这一个 JSON。
 *
 * 最终对外导出的 `SLIDES` 由两层在模块加载时合并而成。
 */

export type Slide = {
  /** URL hash 的稳定 id；同时也是 site.json 里 slides.<id> 的 key */
  id: string;
  /** 顶部 label / SR 标题 */
  label: string;
  /** 主题 key（对应 THEMES） */
  theme: ThemeKey;
  /** Shader effect id：1 mushroom / 2 wave / 3 orbit / 4 chaos / 5 grid
   *  6 drift / 7 starfield / 8 circuit / 9 matrix / 10 constellation */
  effect: number;
  /** 字符密度 cell size（px） */
  cellSize: number;
  /** 动画速度乘子 */
  speed: number;
  /** 启用品牌 SVG mask */
  maskId?: "x" | "instagram" | "github" | "huggingface" | "steam";
  /** 居中主文（cover/about/hardware/links/contact 用） */
  sentence?: string;
  /** 平台 handle / 邮箱 */
  handle?: string;
  /** 一句"在那儿干什么" */
  intent?: string;
  /** 主 CTA */
  cta?: { label: string; href: string };
  /** contact 屏的多组联系方式 */
  contacts?: { label: string; value: string; href: string }[];
  /** hardware 屏的硬件清单 */
  hardware?: { group: string; value: string }[];
  /** links 屏的外链分组 */
  links?: {
    projects: { label: string; href: string; note?: string }[];
    tools: { label: string; href: string; note?: string }[];
    friends: { label: string; href: string; note?: string }[];
  };
  /** 鼠标交互强度（0=完全不动 1=v0 默认） */
  cursorIntensity: number;
};

/** 视觉层配置：每屏的 id + label + 渲染参数。普通用户无需修改。 */
type SlideVisual = Pick<
  Slide,
  | "id"
  | "label"
  | "theme"
  | "effect"
  | "cellSize"
  | "speed"
  | "maskId"
  | "cursorIntensity"
>;

const SLIDE_VISUALS: SlideVisual[] = [
  {
    id: "cover",
    label: "Index",
    theme: "cover",
    effect: 6,
    cellSize: 8,
    speed: 0.18,
    cursorIntensity: 0.3,
  },
  {
    id: "about",
    label: "About",
    theme: "about",
    effect: 8,
    cellSize: 9,
    speed: 0.45,
    cursorIntensity: 0.8,
  },
  {
    id: "x",
    label: "X",
    theme: "x",
    effect: 4,
    cellSize: 9,
    speed: 0.55,
    maskId: "x",
    cursorIntensity: 0.6,
  },
  {
    id: "instagram",
    label: "Instagram",
    theme: "instagram",
    effect: 1,
    cellSize: 9,
    speed: 0.4,
    maskId: "instagram",
    cursorIntensity: 0.6,
  },
  {
    id: "github",
    label: "GitHub",
    theme: "github",
    effect: 5,
    cellSize: 10,
    speed: 0.9,
    maskId: "github",
    cursorIntensity: 0.5,
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    theme: "huggingface",
    effect: 3,
    cellSize: 10,
    speed: 0.6,
    maskId: "huggingface",
    cursorIntensity: 0.7,
  },
  {
    id: "steam",
    label: "Steam",
    theme: "steam",
    effect: 2,
    cellSize: 10,
    speed: 0.8,
    maskId: "steam",
    cursorIntensity: 0.5,
  },
  {
    id: "hardware",
    label: "Hardware",
    theme: "hardware",
    effect: 9,
    cellSize: 10,
    speed: 0.65,
    cursorIntensity: 0.6,
  },
  {
    id: "links",
    label: "Links",
    theme: "links",
    effect: 10,
    cellSize: 10,
    speed: 0.35,
    cursorIntensity: 0.5,
  },
  {
    id: "contact",
    label: "Contact",
    theme: "contact",
    effect: 7,
    cellSize: 11,
    speed: 0.3,
    cursorIntensity: 0.4,
  },
];

/** 文案层：site.json 里 slides.<id> 的所有字段都允许是 optional。 */
type SlideCopy = Partial<
  Pick<
    Slide,
    | "sentence"
    | "handle"
    | "intent"
    | "cta"
    | "contacts"
    | "hardware"
    | "links"
  >
>;

const SLIDE_COPY = site.slides as unknown as Record<string, SlideCopy>;

/** 把视觉配置和 site.json 里的文案合成最终 Slide 列表。 */
export const SLIDES: Slide[] = SLIDE_VISUALS.map((visual) => {
  const copy = SLIDE_COPY[visual.id] ?? {};
  return { ...visual, ...copy };
});

export const SLIDE_INDEX_BY_ID: Record<string, number> = SLIDES.reduce(
  (acc, slide, i) => {
    acc[slide.id] = i;
    return acc;
  },
  {} as Record<string, number>,
);

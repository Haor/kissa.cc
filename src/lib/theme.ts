/**
 * 每屏的色彩。整站只有一种纸色（DOM 文字），每屏换的是字符场：
 *   ink   底色（极暗，带一点点该屏色相）
 *   glyph 字符主色
 *   glow  光晕 / 热点 / 转场乱码的描边色
 * DOM 里 `--accent` = glyph，用于小方块、刻度、箭头这种点缀。
 */
export type SlideTheme = {
  ink: string;
  glyph: string;
  glow: string;
  /** effect 点名要「描边」的字符用的颜色，默认同 glow（Contact 的红线用它） */
  accent?: string;
  /** 光晕强度乘子 */
  glowAmt: number;
};

export const PAPER = "#ece6d8";

export const THEMES = {
  cover: { ink: "#09090a", glyph: "#ece6d8", glow: "#b8ab92", glowAmt: 0.9 },
  about: { ink: "#08091a", glyph: "#aab8ff", glow: "#5d6be0", glowAmt: 1.1 },
  x: { ink: "#070b10", glyph: "#3ea7f5", glow: "#8fd4ff", glowAmt: 1.1 },
  instagram: { ink: "#10070f", glyph: "#ff8a4c", glow: "#e2327b", glowAmt: 1.35 },
  github: { ink: "#060b08", glyph: "#7ce38b", glow: "#2ea043", glowAmt: 1.2 },
  huggingface: { ink: "#0f0c06", glyph: "#ffd21e", glow: "#ff9d1c", glowAmt: 1.2 },
  steam: { ink: "#08101a", glyph: "#66c0f4", glow: "#c7d5e0", glowAmt: 1.0 },
  hardware: { ink: "#0d0905", glyph: "#ffb347", glow: "#ff7a1a", accent: "#ff5a2a", glowAmt: 1.25 },
  links: { ink: "#050d0d", glyph: "#7fe3d2", glow: "#2fb5a8", glowAmt: 1.1 },
  // 全站最后一屏：纸白之外只有一根朱红的线（赤い糸）
  contact: { ink: "#08080a", glyph: "#ece6d8", glow: "#a89c85", accent: "#e8412c", glowAmt: 0.9 },
} as const satisfies Record<string, SlideTheme>;

export type ThemeKey = keyof typeof THEMES;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

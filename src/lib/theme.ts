/**
 * 每屏的主题色。背景在 `--bg`、主色（高亮 / 字符 / CTA）在 `--fg`，
 * 辅色（点缀 / 边线）在 `--accent`。也包含 RGB 三元组供 shader 使用。
 */
export type SlideTheme = {
  bg: string;
  fg: string;
  accent: string;
  /** 0-1 归一化 RGB，供 shader uniform */
  fgRgb: [number, number, number];
  accentRgb: [number, number, number];
  bgRgb: [number, number, number];
};

const t = (
  bg: string,
  fg: string,
  accent: string,
  bgRgb: [number, number, number],
  fgRgb: [number, number, number],
  accentRgb: [number, number, number]
): SlideTheme => ({ bg, fg, accent, bgRgb, fgRgb, accentRgb });

export const THEMES = {
  cover: t(
    "#0a0a0c",
    "#e8e6df",
    "#a09a8a",
    [0.04, 0.04, 0.05],
    [0.91, 0.9, 0.87],
    [0.63, 0.6, 0.54],
  ),
  about: t(
    "#0e1124",
    "#a3b8ff",
    "#5a6db8",
    [0.05, 0.07, 0.14],
    [0.64, 0.72, 1.0],
    [0.35, 0.43, 0.72],
  ),
  x: t(
    "#0f1419",
    "#1d9bf0",
    "#71c8ff",
    [0.06, 0.08, 0.1],
    [0.11, 0.61, 0.94],
    [0.44, 0.78, 1.0],
  ),
  instagram: t(
    "#1a0d1a",
    "#fd7e3a",
    "#d2266b",
    [0.1, 0.05, 0.1],
    [0.99, 0.49, 0.23],
    [0.82, 0.15, 0.42],
  ),
  github: t(
    "#0d1117",
    "#7ce38b",
    "#3fb950",
    [0.05, 0.07, 0.09],
    [0.49, 0.89, 0.55],
    [0.25, 0.73, 0.31],
  ),
  huggingface: t(
    "#1a1611",
    "#ffd21e",
    "#ff9b1c",
    [0.1, 0.09, 0.07],
    [1.0, 0.82, 0.12],
    [1.0, 0.61, 0.11],
  ),
  steam: t(
    "#1b2838",
    "#66c0f4",
    "#c7d5e0",
    [0.11, 0.16, 0.22],
    [0.4, 0.75, 0.96],
    [0.78, 0.84, 0.88],
  ),
  hardware: t(
    "#0d1014",
    "#9ec5ff",
    "#5a8fd4",
    [0.05, 0.06, 0.08],
    [0.62, 0.77, 1.0],
    [0.35, 0.56, 0.83],
  ),
  links: t(
    "#0a0a12",
    "#b8c7e0",
    "#8a9bcc",
    [0.04, 0.04, 0.07],
    [0.72, 0.78, 0.88],
    [0.54, 0.61, 0.80],
  ),
  contact: t(
    "#050608",
    "#e8e6df",
    "#a09a8a",
    [0.02, 0.02, 0.03],
    [0.91, 0.9, 0.87],
    [0.63, 0.6, 0.54],
  ),
} as const;

export type ThemeKey = keyof typeof THEMES;

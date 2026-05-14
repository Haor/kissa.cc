/**
 * ASCII 动画预设：每个预设描述
 *  - 在 shader 里调用哪个 effect 分支（effectId）
 *  - 默认色 / 字符密度 / 速度 / 字符集
 *
 * 预设思路来源：原图 hero（mushroom cloud）、Wave Stats（waveform）、
 *   Overview Profits（点阵环 orbit）、Market Downfall（混沌噪声）。
 */
export type AsciiPreset = {
  id: string;
  label: string;
  effectId: number;
  charset: string;
  cellSize: number;
  speed: number;
  /** 暗部 / 低亮度区域颜色（冷色） */
  colorDark: [number, number, number];
  /** 高亮区域颜色（暖色 / 主色） */
  colorBright: [number, number, number];
  /** 辉光颜色（通常更亮、更饱和） */
  colorGlow: [number, number, number];
  glow: number;
  description: string;
};

export const PRESETS: Record<string, AsciiPreset> = {
  // 深紫 → 品红 · 核爆冷光
  mushroom: {
    id: "mushroom",
    label: "Mushroom Cloud",
    effectId: 1,
    charset: " .,:;-=+*xX#%@",
    cellSize: 9,
    speed: 0.55,
    colorDark: [0.25, 0.1, 0.55],
    colorBright: [0.95, 0.45, 0.95],
    colorGlow: [0.85, 0.3, 1.0],
    glow: 1.4,
    description: "Autonomous signal · 主视觉",
  },
  // 深蓝 → 青绿 · 示波器
  wave: {
    id: "wave",
    label: "Wave",
    effectId: 2,
    charset: " .:-=+*#",
    cellSize: 10,
    speed: 1.2,
    colorDark: [0.05, 0.2, 0.45],
    colorBright: [0.35, 1.0, 0.85],
    colorGlow: [0.15, 0.95, 0.75],
    glow: 1.2,
    description: "Real-time insight · 极简波形",
  },
  // 紫红 → 金橙 · 等离子环
  orbit: {
    id: "orbit",
    label: "Orbit",
    effectId: 3,
    charset: " ·∙•●○◎",
    cellSize: 12,
    speed: 0.7,
    colorDark: [0.5, 0.08, 0.5],
    colorBright: [1.0, 0.65, 0.3],
    colorGlow: [1.0, 0.35, 0.6],
    glow: 1.3,
    description: "Adaptive infrastructure · 点阵环",
  },
  // 青 → 琥珀 · 数据风暴
  chaos: {
    id: "chaos",
    label: "Chaos",
    effectId: 4,
    charset: " .,;-+*#%@",
    cellSize: 8,
    speed: 0.9,
    colorDark: [0.05, 0.4, 0.5],
    colorBright: [1.0, 0.7, 0.25],
    colorGlow: [1.0, 0.45, 0.15],
    glow: 1.05,
    description: "Predictive systems · 混沌噪声",
  },
  // 深绿 → 荧光绿 · 终端
  grid: {
    id: "grid",
    label: "Signal Grid",
    effectId: 5,
    charset: " .:|+#",
    cellSize: 10,
    speed: 0.9,
    colorDark: [0.0, 0.3, 0.18],
    colorBright: [0.45, 1.0, 0.55],
    colorGlow: [0.2, 1.0, 0.4],
    glow: 1.25,
    description: "Signal-first analytics · 信号网格",
  },
};

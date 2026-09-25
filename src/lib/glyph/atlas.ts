/**
 * 合并字符 atlas：一张纹理，每个 effect 一行字符集 + 最后一行转场乱码。
 *
 * tile 边长 = 实际设备像素下的 cell 边长（整数），shader 用 texelFetch
 * 1:1 取字形 —— 没有缩放采样，字形像终端一样锐利。
 */

/** 每个 effect 的字符集，按亮度从暗到亮排列；第 0 位必须是空格。 */
export const CHARSETS: Record<number, string> = {
  0: " ",
  1: " .,:;-=+*xX#%@", // film：照片的明暗阶
  2: " .·:-=+*#%", //     invaders：像素精灵落在 #
  3: " ·∙•○◎●", //        neural：连线 ·，脉冲 •，节点待命 ○ / 激活 ●
  4: " .,;-+*#%@", //     timeline：正文是 -，名字 *，头像 %
  5: " .:-=+#",
  6: " ·.,:-=+*#", //     drift：v1 的云雾
  7: " ·.:-~+*#", //      thread：线身是 * / #
  8: " .:_=-|+*#", //     circuit：走线 -，焊盘 / 数据包 #
  9: " ·.:-=+|#", //      meters：负载柱是 |，柱顶 #
  10: " .·:•*◇◆", //      web：丝是 · : •，露珠是 ◆
};

/** 转场 / 光标尾迹时的乱码（第 0 位是占位空格，shader 从 1 起取） */
export const SCRAMBLE = " !#$%&*+-/<=>?@[]\\^_{|}~01";

export const SCRAMBLE_ROW = Object.keys(CHARSETS).length;

/** 泡泡字符行：effect 写 g_alt 的格子改用这一行取字形（首屏漂浮的泡泡云团） */
export const BUBBLE = " ·°oO";

export const BUBBLE_ROW = SCRAMBLE_ROW + 1;

export type Atlas = {
  canvas: HTMLCanvasElement;
  tile: number;
  cols: number;
  rows: number;
};

export function monoFontStack(): string {
  const fallback = '"Kissa Mono", ui-monospace, SFMono-Regular, monospace';
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return v || fallback;
}

export function buildAtlas(tile: number): Atlas {
  const rowsSrc = [
    ...Object.keys(CHARSETS)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => CHARSETS[k]),
    SCRAMBLE,
    BUBBLE,
  ];
  const cols = Math.max(...rowsSrc.map((r) => [...r].length));
  const rows = rowsSrc.length;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tile;
  canvas.height = rows * tile;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.round(tile * 0.92)}px ${monoFontStack()}`;
  rowsSrc.forEach((chars, r) => {
    [...chars].forEach((c, i) => {
      ctx.fillText(c, i * tile + tile / 2, r * tile + tile / 2 + tile * 0.04);
    });
  });
  return { canvas, tile, cols, rows };
}

export function charsetLength(effect: number): number {
  return [...(CHARSETS[effect] ?? " ")].length;
}

"use client";

import { useEffect, useRef } from "react";
import type { Slide } from "@/lib/slides";
import type { SlideTheme } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";

type Props = {
  slide: Slide;
  theme: SlideTheme;
  /** 本屏在画册中的索引，用于推断 transition 阶段 */
  index: number;
  /** 可选 mask 纹理：useMask 加载的 PNG 解码后绘制到 canvas */
  mask?: HTMLCanvasElement | null;
  /** 性能档位：1.5 高（active）/ 0.8 低（warm 邻屏） */
  qualityScale?: number;
};

const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_cellSize;
uniform float u_speed;
uniform vec3  u_colorDark;
uniform vec3  u_colorBright;
uniform vec3  u_colorGlow;
uniform float u_glow;
uniform int   u_effect;
uniform int   u_chars;
uniform float u_atlasCols;
uniform float u_atlasRows;
uniform sampler2D u_atlas;
uniform sampler2D u_mask;
uniform float u_useMask;
uniform vec2  u_mouse;
uniform vec2  u_mouseVel;
uniform float u_mouseActive;
uniform float u_mouseIntensity;
/** 转场进度：-1=即将进入 0=稳态 +1=完全离开。alpha = 1-|t|；位移 = dir * t * 0.4 */
uniform float u_transition;
uniform float u_quality;

// --- noise / fbm ---
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hashDir(vec2 p) {
  float a = hash(p) * 6.2831853;
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),            hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0,1)),hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  // 3 octaves（之前 4），节省 ~25% noise lookups
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float wfbm(vec2 p, float t) {
  // 全员 1-warp（之前 active 跑 2-warp）；视觉差异极小，性能显著提升
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.20)),
                fbm(p + vec2(5.2, 1.3) + t * 0.15));
  return fbm(p + 3.0 * q);
}

// --- effects ---
float effectMushroom(vec2 uv, float t) {
  vec2 p = (uv - vec2(0.5, 0.42)) * vec2(2.2, 2.0);
  float stemWobble = sin(p.y * 3.0 + t * 0.6) * 0.05
                   + fbm(vec2(p.y * 4.0, t * 0.5)) * 0.08;
  float stem = smoothstep(0.22, 0.0, abs(p.x + stemWobble))
             * smoothstep(-0.6, 0.05, p.y) * smoothstep(0.65, 0.0, p.y);
  vec2 cap = p - vec2(0.0, 0.48);
  float capN = wfbm(cap * 3.2 + vec2(0.0, t * 0.4), t * 0.4);
  float capDist = length(cap * vec2(1.0, 1.55));
  float capM = smoothstep(0.62, 0.10, capDist - capN * 0.32);
  float rising = wfbm(vec2(p.x * 5.0, p.y * 2.0 - t * 1.6), t * 0.6);
  rising *= smoothstep(0.65, -0.05, p.y) * smoothstep(0.45, 0.0, abs(p.x));
  float halo = smoothstep(0.55, 0.0, length(cap)) * 0.35;
  float ground = smoothstep(-0.6, -0.45, p.y) * smoothstep(-0.3, -0.5, p.y) * 0.4;
  float v = max(max(stem * 0.9, capM), rising * 0.85);
  v = max(v, halo);
  v += ground * 0.5;
  v += smoothstep(0.18, 0.0, length(p - vec2(0.0, 0.45))) * 0.5;
  return clamp(v, 0.0, 1.0);
}

float effectWave(vec2 uv, float t) {
  vec2 p = uv - 0.5;
  float baseline =
      0.06 * sin(uv.x * 14.0 + t * 2.0)
    + 0.04 * sin(uv.x * 33.0 - t * 1.4)
    + 0.025 * sin(uv.x * 71.0 + t * 0.7);
  baseline += (fbm(vec2(uv.x * 8.0, t * 0.5)) - 0.5) * 0.05;
  float dx = uv.x - u_mouse.x;
  float hump = (u_mouse.y - 0.5) * exp(-dx * dx * 80.0)
             * u_mouseActive * u_mouseIntensity;
  baseline += hump;
  float d = abs(p.y - baseline);
  float line = smoothstep(0.05, 0.0, d);
  float glow_ = smoothstep(0.22, 0.0, d) * 0.45;
  float env = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x);
  return clamp((line + glow_) * env, 0.0, 1.0);
}

float effectOrbit(vec2 uv, float t) {
  vec2 p = uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ring = smoothstep(0.05, 0.0, abs(r - 0.34));
  float dots = pow(sin(a * 28.0 + t * 1.4) * 0.5 + 0.5, 12.0);
  ring *= dots * 0.85 + 0.25;
  float ring2 = smoothstep(0.03, 0.0, abs(r - 0.20));
  float dots2 = pow(sin(a * 18.0 - t * 0.9) * 0.5 + 0.5, 10.0);
  ring2 *= dots2 * 0.9 + 0.2;
  float drift = fbm(vec2(cos(a) * 4.0 + t * 0.2, sin(a) * 4.0 - t * 0.15));
  drift = step(0.78, drift) * smoothstep(0.5, 0.18, abs(r - 0.27)) * 0.7;
  float coreN = wfbm(p * 5.0, t * 0.6);
  float core = smoothstep(0.10, 0.0, r) * (0.6 + coreN * 0.6);
  return clamp(ring + ring2 + drift + core, 0.0, 1.0);
}

float effectChaos(vec2 uv, float t) {
  vec2 p = uv * vec2(3.2, 2.2);
  float n = wfbm(p + vec2(t * 0.35, -t * 0.22), t * 0.3);
  n = smoothstep(0.30, 0.78, n);
  n *= 0.85 + 0.15 * sin(t * 0.6);
  n += (hash(floor(uv * 90.0) + floor(t * 14.0)) - 0.5) * 0.12;
  return clamp(n, 0.0, 1.0);
}

float effectGrid(vec2 uv, float t) {
  // Keep the first visible horizontal grid row below the fixed top fade on
  // shorter browser viewports. Without this phase offset, Chrome can hide the
  // row under the top overlay while Safari still shows it.
  vec2 gridUv = uv * vec2(28.0, 16.0) + vec2(0.0, 0.25);
  vec2 g = fract(gridUv);
  float gx = smoothstep(0.45, 0.5, g.x) * smoothstep(0.55, 0.5, g.x);
  float gy = smoothstep(0.45, 0.5, g.y) * smoothstep(0.55, 0.5, g.y);
  float line = max(gx, gy);
  float pulse = smoothstep(0.0, 0.05, abs(fract(uv.y * 4.0 - t * 0.3) - 0.5));
  line *= 1.0 - pulse * 0.55;
  vec2 cell = floor(gridUv);
  float blockOn = step(0.92, hash(cell + floor(t * 2.0)));
  float edgeFade =
    smoothstep(0.02, 0.14, g.x) *
    smoothstep(0.98, 0.84, g.x) *
    smoothstep(0.02, 0.14, g.y) *
    smoothstep(0.98, 0.84, g.y);
  float ramp = smoothstep(1.05, 0.10, g.x * 0.82 + g.y * 0.28);
  float stepLayer = floor(ramp * 4.0) / 3.0;
  float block = blockOn * edgeFade * (0.45 + stepLayer * 0.50);
  float probe = smoothstep(0.04, 0.0, abs(uv.x + uv.y - 1.0 - sin(t * 0.4) * 0.6));
  return clamp(line * 0.55 + block + probe * 0.3, 0.0, 1.0);
}

float gridBlockSignal(vec2 uv, float t) {
  vec2 gridUv = uv * vec2(28.0, 16.0) + vec2(0.0, 0.25);
  vec2 g = fract(gridUv);
  vec2 cell = floor(gridUv);
  float blockOn = step(0.92, hash(cell + floor(t * 2.0)));
  float edgeFade =
    smoothstep(0.02, 0.14, g.x) *
    smoothstep(0.98, 0.84, g.x) *
    smoothstep(0.02, 0.14, g.y) *
    smoothstep(0.98, 0.84, g.y);
  float ramp = smoothstep(1.05, 0.10, g.x * 0.82 + g.y * 0.28);
  float stepLayer = floor(ramp * 4.0) / 3.0;
  return blockOn * edgeFade * stepLayer;
}

float gridBlockPresence(vec2 uv, float t) {
  vec2 gridUv = uv * vec2(28.0, 16.0) + vec2(0.0, 0.25);
  vec2 g = fract(gridUv);
  vec2 cell = floor(gridUv);
  float blockOn = step(0.92, hash(cell + floor(t * 2.0)));
  float edgeFade =
    smoothstep(0.02, 0.14, g.x) *
    smoothstep(0.98, 0.84, g.x) *
    smoothstep(0.02, 0.14, g.y) *
    smoothstep(0.98, 0.84, g.y);
  return blockOn * edgeFade;
}

// 新增：drift（cover），慢漂流体
float effectDrift(vec2 uv, float t) {
  vec2 p = uv * vec2(2.6, 1.8) + vec2(t * 0.04, -t * 0.025);
  float n = wfbm(p, t * 0.18);
  n = smoothstep(0.32, 0.82, n);
  // 远距离弱化对比
  float vignette = smoothstep(1.05, 0.55, length(uv - 0.5));
  n *= vignette;
  // 极轻颗粒
  n += (hash(floor(uv * 60.0) + floor(t * 6.0)) - 0.5) * 0.05;
  return clamp(n, 0.0, 1.0);
}

// 新增：starfield（contact），光点向中心缓慢聚拢，整体克制
float effectStarfield(vec2 uv, float t) {
  vec2 p = uv - 0.5;
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  // 旋转 & 内收：让点随时间向内卷（更慢、更稀）
  float warpR = r - t * 0.025 + sin(a * 3.0 + t * 0.3) * 0.015;
  float bands = abs(fract(warpR * 5.0) - 0.5);
  // 仅最锐利的"环线"显示，且整体衰减到边缘
  float lit = smoothstep(0.06, 0.0, bands) * smoothstep(0.5, 0.08, r);
  // 极稀散点
  vec2 cell = floor(uv * vec2(28.0, 16.0));
  float twinkle = step(0.96, hash(cell + floor(t * 1.0)))
                * smoothstep(0.6, 0.1, r);
  float core = smoothstep(0.04, 0.0, r) * 0.5;
  return clamp(lit * 0.35 + twinkle * 0.7 + core, 0.0, 1.0);
}

float scene(vec2 uv, float t) {
  if (u_effect == 1) return effectMushroom(uv, t);
  if (u_effect == 2) return effectWave(uv, t);
  if (u_effect == 3) return effectOrbit(uv, t);
  if (u_effect == 4) return effectChaos(uv, t);
  if (u_effect == 5) return effectGrid(uv, t);
  if (u_effect == 6) return effectDrift(uv, t);
  if (u_effect == 7) return effectStarfield(uv, t);
  return 0.0;
}

float cellGlowNeighbors(vec2 cellUv, float t) {
  float dx = u_cellSize / u_resolution.x * 1.5;
  float dy = u_cellSize / u_resolution.y * 1.5;
  float g = 0.0;
  g += scene(cellUv + vec2(-dx, 0.0), t);
  g += scene(cellUv + vec2( dx, 0.0), t);
  g += scene(cellUv + vec2(0.0, -dy), t);
  g += scene(cellUv + vec2(0.0,  dy), t);
  return g * 0.25;
}

void main() {
  vec2 fragPx = v_uv * u_resolution;
  vec2 cellId = floor(fragPx / u_cellSize);
  vec2 cellCenterPx = (cellId + 0.5) * u_cellSize;
  vec2 cellUv = cellCenterPx / u_resolution;

  // ===== 鼠标交互（按 effect 风味），强度受 u_mouseIntensity 调制 =====
  float aspect = u_resolution.x / u_resolution.y;
  vec2 dm = (cellUv - u_mouse) * vec2(aspect, 1.0);
  float r = length(dm);
  float reach = exp(-r * r * 30.0) * u_mouseActive * u_mouseIntensity;
  vec2 dirAway = normalize(dm + 1e-4) / vec2(aspect, 1.0);

  if (u_effect == 1) {
    cellUv += dirAway * reach * 0.04;
    cellUv -= u_mouseVel * reach * 0.18;
    float ang = reach * 0.9;
    float ca = cos(ang), sa = sin(ang);
    cellUv = u_mouse + mat2(ca, -sa, sa, ca) * (cellUv - u_mouse);
  } else if (u_effect == 3) {
    cellUv -= dirAway * reach * 0.06;
    cellUv -= u_mouseVel * reach * 0.25;
    float ang = -reach * 1.5;
    float ca = cos(ang), sa = sin(ang);
    cellUv = u_mouse + mat2(ca, -sa, sa, ca) * (cellUv - u_mouse);
  } else if (u_effect == 4) {
    vec2 stir = vec2(
      noise(cellUv * 24.0 + u_time * 0.6),
      noise(cellUv * 24.0 - u_time * 0.5)
    ) - 0.5;
    cellUv += stir * reach * 0.12;
    cellUv -= u_mouseVel * reach * 0.30;
  } else if (u_effect == 6) {
    // drift：轻微推动 + 慢拖尾，保留漂浮感
    cellUv += dirAway * reach * 0.02;
    cellUv -= u_mouseVel * reach * 0.10;
  } else if (u_effect == 7) {
    // starfield：吸向中心的同时被鼠标短暂吸引一点
    cellUv -= dirAway * reach * 0.03;
  }

  // ===== Scatter 转场位移 =====
  vec2 dir = hashDir(cellId);
  cellUv += dir * u_transition * 0.4;

  float t = u_time * u_speed;
  float lum = scene(cellUv, t);
  float boost = (u_effect == 5) ? 0.5 : 0.32;
  lum = clamp(lum + reach * boost, 0.0, 1.0);

  // bloom 仅在亮度足够时计算（跳过暗区可省 80% effect 调用）
  float bloom = 0.0;
  if (lum > 0.18) {
    bloom = cellGlowNeighbors(cellUv, t) + lum * 0.25;
  }
  float lit = clamp(lum + bloom * 0.5, 0.0, 1.0);
  lit = pow(lit, 0.85);

  // ===== Mask（密度增强场，非裁剪）=====
  // 满屏始终保留 effect 字符。mask 仅作为"高密度/高亮"叠加场：
  //   mask 内：lit 推到一个 floor + 略微 boost + 用 glow 色调
  //   mask 外：保持原 effect，整体略微 attenuate（让中心聚焦）
  // 用 min(w,h) 居中铺成正方形避免拉伸；外部用 0 而非 clamp。
  float side = min(u_resolution.x, u_resolution.y);
  vec2 center = u_resolution * 0.5;
  vec2 maskPx = (cellCenterPx - center) / side + 0.5;
  // Canvas 像素是 Y-down，WebGL 默认不翻 Y；这里在 shader 里显式反转 Y 采样坐标，
  // 让 mask 的视觉朝向与 SVG 源一致，跨浏览器表现统一。
  vec2 maskUv = vec2(maskPx.x, 1.0 - maskPx.y);
  vec2 inBounds = step(vec2(0.0), maskUv) * step(maskUv, vec2(1.0));
  float bound = inBounds.x * inBounds.y;
  float maskValue = texture(u_mask, clamp(maskUv, 0.0, 1.0)).r * bound;
  float m = maskValue * u_useMask;

  // Grid keeps the tuned base field intact outside the icon; other brand
  // slides still attenuate outside the mask to focus the center.
  float maskFloor = (u_effect == 5) ? 0.58 : 0.82;
  float maskBoost = (u_effect == 5) ? 0.18 : 0.36;
  float maskOutside = (u_effect == 5) ? 1.0 : (1.0 - u_useMask * 0.42);
  float litInside = clamp(max(lit, m * maskFloor) + m * maskBoost, 0.0, 1.0);
  float litOutside = lit * maskOutside;
  // 用 mask 值平滑过渡，smoothstep 让边缘自然羝化
  lit = mix(litOutside, litInside, smoothstep(0.0, 0.85, m));

  // bloom 在 mask 内增强（带 glow 色调），外部不变
  bloom *= (1.0 + m * ((u_effect == 5) ? 0.45 : 1.0));

  // 字符索引。Grid 页把 glyph 档位和亮度解耦：普通高亮块停在横杠档，
  // 进入 GitHub mark 后再抬到更重的字符，恢复“方块穿过 logo 会变字形”的层次。
  float glyphLit = lit;
  if (u_effect == 5) {
    float mark = smoothstep(0.12, 0.72, m);
    float hotCell = smoothstep(0.58, 0.92, lum);
    float cap = mix(0.86, 1.0, mark);
    glyphLit = min(glyphLit, cap);
    glyphLit = clamp(glyphLit + mark * (0.10 + hotCell * 0.24), 0.0, 1.0);
  }
  float idxF = glyphLit * float(u_chars - 1);
  int idx = int(floor(idxF + 0.5));
  float col = mod(float(idx), u_atlasCols);
  float row = floor(float(idx) / u_atlasCols);

  vec2 local = fract(fragPx / u_cellSize);
  vec2 atlasUv = (vec2(col, row) + local) / vec2(u_atlasCols, u_atlasRows);
  float charMask = texture(u_atlas, atlasUv).a;

  float colorMix = pow(clamp(lit, 0.0, 1.0), 1.4);
  vec3 base = mix(u_colorDark, u_colorBright, colorMix);
  base *= 0.7 + lit * 0.6;
  // bloomCol 在 mask 内会被乘 (1 + m) 进一步放大；u_colorGlow 任一通道偏高时
  // 容易把 bloom*u_glow*1.6 推过 1.0，sRGB 输出截断后视觉上变白（用户在 GitHub 屏
  // 看到的"白色 ####"症状）。clamp 一下保住主题色。
  vec3 bloomCol = clamp(u_colorGlow * bloom * u_glow * 1.6, 0.0, 1.0);

  vec3 finalRgb = base * charMask + bloomCol * (0.30 + charMask * 0.70);
  if (u_effect == 5) {
    float mark = smoothstep(0.10, 0.74, m);
    float blockPresence = gridBlockPresence(cellUv, t);
    float blockTier = gridBlockSignal(cellUv, t);
    float gridEnergy = clamp(max(finalRgb.r, max(finalRgb.g, finalRgb.b)) + mark * 0.10, 0.0, 0.90);
    vec3 gridGreen = mix(vec3(0.24, 0.84, 0.36), vec3(0.34, 0.96, 0.48), mark * 0.45);
    vec3 greenGlyph = gridGreen * gridEnergy;

    vec3 blockBg = mix(vec3(0.025, 0.12, 0.07), vec3(0.10, 0.28, 0.15), blockTier);
    blockBg *= mix(1.0, 0.72, mark);
    float bgStrength = blockPresence * (0.38 + blockTier * 0.28);

    vec3 silverGlyph = mix(vec3(0.68, 0.78, 0.74), vec3(0.88, 0.94, 0.90), blockTier);
    float silverGlyphMix = blockPresence * charMask * (1.0 - mark * 0.15);
    vec3 glyphLayer = mix(greenGlyph, silverGlyph * clamp(gridEnergy + 0.22, 0.0, 1.0), silverGlyphMix);

    finalRgb = glyphLayer + blockBg * bgStrength * (1.0 - charMask * 0.45);
  }
  finalRgb = clamp(finalRgb, 0.0, 1.0);
  float a = charMask * (0.6 + lit * 0.55) + bloom * 0.18;
  if (u_effect == 5) {
    float mark = smoothstep(0.10, 0.74, m);
    float blockPresence = gridBlockPresence(cellUv, t);
    float blockTier = gridBlockSignal(cellUv, t);
    a += mark * 0.08 + blockPresence * (0.10 + blockTier * 0.08);
  }

  // ===== Scatter 透明度 =====
  a *= 1.0 - abs(u_transition);

  outColor = vec4(finalRgb, clamp(a, 0.0, 1.0));
}`;

// ---- 字符 atlas ----
const CHARSETS_BY_EFFECT: Record<number, string> = {
  1: " .,:;-=+*xX#%@",
  2: " .:-=+*#",
  3: " ·∙•●○◎",
  4: " .,;-+*#%@",
  5: " .:-=+#",
  6: " ·.,:'\"`-_",
  7: " ·.•*+#",
};

const GLOW_BY_EFFECT: Record<number, number> = {
  1: 1.4,
  2: 1.2,
  3: 1.3,
  4: 1.05,
  5: 1.25,
  6: 0.85,
  7: 1.15,
};

function buildAtlas(charset: string, tileSize: number) {
  const dpr =
    Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const px = Math.round(tileSize * dpr);
  const cols = Math.ceil(Math.sqrt(charset.length));
  const rows = Math.ceil(charset.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * px;
  canvas.height = rows * px;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(
    px * 0.9,
  )}px "JetBrains Mono", "Fira Code", "IBM Plex Mono", monospace`;
  for (let i = 0; i < charset.length; i++) {
    const c = charset[i];
    const cx = (i % cols) * px + px / 2;
    const cy = Math.floor(i / cols) * px + px / 2 + px * 0.04;
    ctx.fillText(c, cx, cy);
  }
  return { canvas, cols, rows };
}

/** 4×4 全白 canvas，仅供无 mask 屏作为 sampler 占位（u_useMask=0 时不会真采样）。 */
function buildBlankMask(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 4, 4);
  return canvas;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

export function AsciiStage({
  slide,
  theme,
  index,
  mask = null,
  qualityScale = 1.0,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const carouselIndex = useCarousel((s) => s.index);
  const direction = useCarousel((s) => s.direction);
  const transitionProgress = useCarousel((s) => s.transition);
  const busy = useCarousel((s) => s.busy);

  // 把 React 端的 transition 进度转成 shader 用的 u_transition (-1..0..+1)
  // 当 busy=true 且 direction !== 0 时：
  //   - 当前正在播放: 当前屏(this.index === carouselIndex - direction): t = +progress（散开）
  //                 → 等等，carouselIndex 在 goto() 那一刻就被设为目标 index
  //   - 也就是说：carouselIndex 已经是"目标"，上一屏 = carouselIndex - direction
  //              下一屏 = carouselIndex
  // 因此对每个 stage 的 index i：
  //   - i === carouselIndex - direction → 离开屏 → t = +progress
  //   - i === carouselIndex             → 进入屏 → t = -1 + progress
  //   - 其他                            → t = 0（仅作为安全冗余）
  const targetTransition = (() => {
    if (!busy || direction === 0) return 0;
    if (index === carouselIndex - direction) return transitionProgress;
    if (index === carouselIndex) return -1 + transitionProgress;
    return 0;
  })();

  // 仅 active + warm（active 邻居）的 stage 真正 raf；其他保持空白
  const isActive = index === carouselIndex;
  const isWarm = busy && (index === carouselIndex - direction || index === carouselIndex);
  const shouldRender = isActive || isWarm;

  // transition 每帧需要最新值；用 ref 避免重建 GL context
  const targetTransitionRef = useRef(targetTransition);
  targetTransitionRef.current = targetTransition;

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link failed: " + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // 字符 atlas (TEXTURE0)。atlas 是程序化坐标采样，不需要 Y flip。
    const charset = CHARSETS_BY_EFFECT[slide.effect] ?? " .:+#";
    const atlas = buildAtlas(charset, 64);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // mask 纹理 (TEXTURE1)。
    // 源是 useMask 返回的 HTMLCanvasElement（PNG 已 drawImage 进去），和 atlas 完全
    // 同一上传路径。Chrome 对 ImageBitmap 作为 TexImageSource 的实现不可靠（导致
    // texture 全 0），但 HTMLCanvasElement 路径在两个浏览器都稳定——atlas 已经
    // 证明这一点。Y 翻转由 shader 内显式处理（`1.0 - maskPx.y`）。
    // 无 mask 屏走 buildBlankMask 占位（u_useMask=0 时 shader 不真采样）。
    const maskTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const maskSource: HTMLCanvasElement = mask ?? buildBlankMask();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      maskSource,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const U = {
      res: gl.getUniformLocation(prog, "u_resolution"),
      time: gl.getUniformLocation(prog, "u_time"),
      cell: gl.getUniformLocation(prog, "u_cellSize"),
      speed: gl.getUniformLocation(prog, "u_speed"),
      colorDark: gl.getUniformLocation(prog, "u_colorDark"),
      colorBright: gl.getUniformLocation(prog, "u_colorBright"),
      colorGlow: gl.getUniformLocation(prog, "u_colorGlow"),
      glow: gl.getUniformLocation(prog, "u_glow"),
      effect: gl.getUniformLocation(prog, "u_effect"),
      chars: gl.getUniformLocation(prog, "u_chars"),
      cols: gl.getUniformLocation(prog, "u_atlasCols"),
      rows: gl.getUniformLocation(prog, "u_atlasRows"),
      atlas: gl.getUniformLocation(prog, "u_atlas"),
      mask: gl.getUniformLocation(prog, "u_mask"),
      useMask: gl.getUniformLocation(prog, "u_useMask"),
      mouse: gl.getUniformLocation(prog, "u_mouse"),
      mouseVel: gl.getUniformLocation(prog, "u_mouseVel"),
      mouseActive: gl.getUniformLocation(prog, "u_mouseActive"),
      mouseIntensity: gl.getUniformLocation(prog, "u_mouseIntensity"),
      transition: gl.getUniformLocation(prog, "u_transition"),
      quality: gl.getUniformLocation(prog, "u_quality"),
    };

    gl.uniform1i(U.atlas, 0);
    gl.uniform1i(U.mask, 1);
    gl.uniform1f(U.useMask, mask ? 1 : 0);
    gl.uniform1i(U.chars, charset.length);
    gl.uniform1f(U.cols, atlas.cols);
    gl.uniform1f(U.rows, atlas.rows);
    gl.uniform1f(U.speed, slide.speed);
    gl.uniform3f(U.colorDark, theme.bgRgb[0], theme.bgRgb[1], theme.bgRgb[2]);
    gl.uniform3f(U.colorBright, theme.fgRgb[0], theme.fgRgb[1], theme.fgRgb[2]);
    gl.uniform3f(
      U.colorGlow,
      theme.accentRgb[0],
      theme.accentRgb[1],
      theme.accentRgb[2],
    );
    gl.uniform1f(U.glow, GLOW_BY_EFFECT[slide.effect] ?? 1.0);
    gl.uniform1i(U.effect, slide.effect);
    gl.uniform1f(U.cell, slide.cellSize);
    gl.uniform1f(U.quality, isActive ? 1.0 : 0.5);
    gl.uniform1f(U.mouseIntensity, slide.cursorIntensity);

    // 鼠标
    const mouseTarget = { x: 0.5, y: 0.5 };
    const mouseSmooth = { x: 0.5, y: 0.5 };
    const mouseVel = { x: 0, y: 0 };
    let mouseActive = 0;
    let mouseActiveTarget = 0;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1.0 - (e.clientY - rect.top) / rect.height;
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        mouseTarget.x = nx;
        mouseTarget.y = ny;
        mouseActiveTarget = 1;
      } else {
        mouseActiveTarget = 0;
      }
    };
    const onLeave = () => {
      mouseActiveTarget = 0;
    };
    if (isActive) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseout", onLeave, { passive: true });
    }

    // 性能：active 屏 DPR ≤ qualityScale，warm 屏强制 0.85；max pixels 收紧
    const effectiveQuality = isActive ? qualityScale : Math.min(qualityScale, 0.85);
    const maxPixels = isActive ? 1_000_000 : 700_000;

    const resize = () => {
      const dpr = Math.min(effectiveQuality, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const pixels = w * h;
      if (pixels > maxPixels) {
        const s = Math.sqrt(maxPixels / pixels);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // FPS cap：active 60，warm 30；省 ~50% 邻屏开销
    const fpsCap = isActive ? 60 : 30;
    const frameInterval = 1000 / fpsCap;
    let lastFrame = 0;

    // Page visibility：tab 不可见时直接停 raf
    let pageHidden = typeof document !== "undefined" && document.hidden;
    const onVis = () => {
      pageHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (pageHidden) return;
      if (now - lastFrame < frameInterval) return;
      lastFrame = now;

      const prevX = mouseSmooth.x;
      const prevY = mouseSmooth.y;
      mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * 0.18;
      mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * 0.18;
      mouseVel.x = mouseSmooth.x - prevX;
      mouseVel.y = mouseSmooth.y - prevY;
      mouseActive += (mouseActiveTarget - mouseActive) * 0.12;

      const t = (now - start) / 1000;
      gl.uniform1f(U.time, t);
      gl.uniform2f(U.mouse, mouseSmooth.x, mouseSmooth.y);
      gl.uniform2f(U.mouseVel, mouseVel.x, mouseVel.y);
      gl.uniform1f(U.mouseActive, mouseActive);
      gl.uniform1f(U.transition, targetTransitionRef.current);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    draw(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (isActive) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseout", onLeave);
      }
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
      gl.deleteTexture(maskTex);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, slide.id, slide.effect, slide.cellSize, slide.speed, theme, mask, isActive]);

  if (!shouldRender) {
    return <div className="absolute inset-0" style={{ background: theme.bg }} />;
  }
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      style={{ background: theme.bg }}
    />
  );
}

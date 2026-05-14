"use client";

import { useEffect, useRef } from "react";
import type { AsciiPreset } from "@/lib/ascii-presets";

type Props = {
  preset: AsciiPreset;
  className?: string;
  /** 是否启用鼠标视差（hero 用 true，缩略图用 false 省 CPU） */
  interactive?: boolean;
  /** 设备像素比上限，缩略图可降到 1 */
  maxDpr?: number;
  /** 帧率上限 (0 = 不限). 卡片用 30 足够 */
  fpsCap?: number;
  /** 像素上限：超过则等比缩小 canvas 内部分辨率 */
  maxPixels?: number;
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
uniform vec2  u_mouse;       // 鼠标在 [0,1] uv 空间的位置
uniform vec2  u_mouseVel;    // 缓动差分得到的鼠标速度（拖尾用）
uniform float u_mouseActive; // 鼠标在画布内 = 1, 离开 = 0
uniform float u_quality;     // 1.0 = 高质（wfbm 2-warp）, 0.0 = 降级

// ----- value noise + fbm（降阶版：高质 4 octaves，低质 3 octaves）-----
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),            hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0,1)),hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
// 域形变 FBM —— 高质 2-warp（hero），低质 1-warp（卡片）
float wfbm(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.20)),
                fbm(p + vec2(5.2, 1.3) + t * 0.15));
  vec2 ofs = 3.0 * q;
  if (u_quality > 0.5) {
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) - t * 0.12),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.10));
    ofs = 4.0 * r;
  }
  return fbm(p + ofs);
}

// ===== effects =====
float effectMushroom(vec2 uv, float t) {
  vec2 p = (uv - vec2(0.5, 0.42)) * vec2(2.2, 2.0);

  // 茎：垂直能量柱（被噪声扰动）
  float stemWobble = sin(p.y * 3.0 + t * 0.6) * 0.05
                   + fbm(vec2(p.y * 4.0, t * 0.5)) * 0.08;
  float stem = smoothstep(0.22, 0.0, abs(p.x + stemWobble))
             * smoothstep(-0.6, 0.05, p.y) * smoothstep(0.65, 0.0, p.y);

  // 头部：被卷积噪声捏出来的不规则球
  vec2 cap = p - vec2(0.0, 0.48);
  float capN = wfbm(cap * 3.2 + vec2(0.0, t * 0.4), t * 0.4);
  float capDist = length(cap * vec2(1.0, 1.55));
  float capM = smoothstep(0.62, 0.10, capDist - capN * 0.32);

  // 上升羽流：用 y 向流速的 fbm 模拟粒子
  float rising = wfbm(vec2(p.x * 5.0, p.y * 2.0 - t * 1.6), t * 0.6);
  rising *= smoothstep(0.65, -0.05, p.y) * smoothstep(0.45, 0.0, abs(p.x));

  // 顶部光晕
  float halo = smoothstep(0.55, 0.0, length(cap)) * 0.35;

  // 底部地面残影
  float ground = smoothstep(-0.6, -0.45, p.y) * smoothstep(-0.3, -0.5, p.y) * 0.4;

  float v = max(max(stem * 0.9, capM), rising * 0.85);
  v = max(v, halo);
  v += ground * 0.5;
  // 中心闪点
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
  // 鼠标交互：让 baseline 在光标 x 附近被拉向光标 y（形成隆起）
  float dx = uv.x - u_mouse.x;
  float hump = (u_mouse.y - 0.5) * exp(-dx * dx * 80.0) * u_mouseActive;
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

  // 主环 + 沿环的脉冲点
  float ring = smoothstep(0.05, 0.0, abs(r - 0.34));
  float dots = pow(sin(a * 28.0 + t * 1.4) * 0.5 + 0.5, 12.0);
  ring *= dots * 0.85 + 0.25;

  // 内环（反向旋转）
  float ring2 = smoothstep(0.03, 0.0, abs(r - 0.20));
  float dots2 = pow(sin(a * 18.0 - t * 0.9) * 0.5 + 0.5, 10.0);
  ring2 *= dots2 * 0.9 + 0.2;

  // 漂浮散点：周围的次级粒子
  float drift = fbm(vec2(cos(a) * 4.0 + t * 0.2, sin(a) * 4.0 - t * 0.15));
  drift = step(0.78, drift) * smoothstep(0.5, 0.18, abs(r - 0.27)) * 0.7;

  // 中心球：fbm 调制的发光体
  float coreN = wfbm(p * 5.0, t * 0.6);
  float core = smoothstep(0.10, 0.0, r) * (0.6 + coreN * 0.6);

  return clamp(ring + ring2 + drift + core, 0.0, 1.0);
}

float effectChaos(vec2 uv, float t) {
  vec2 p = uv * vec2(3.2, 2.2);
  // 流体感：域形变 + 缓慢漂移
  float n = wfbm(p + vec2(t * 0.35, -t * 0.22), t * 0.3);
  n = smoothstep(0.30, 0.78, n);
  // 慢呼吸
  n *= 0.85 + 0.15 * sin(t * 0.6);
  // 极细颗粒
  n += (hash(floor(uv * 90.0) + floor(t * 14.0)) - 0.5) * 0.12;
  return clamp(n, 0.0, 1.0);
}

float effectGrid(vec2 uv, float t) {
  vec2 g = fract(uv * vec2(28.0, 16.0));
  float gx = smoothstep(0.45, 0.5, g.x) * smoothstep(0.55, 0.5, g.x);
  float gy = smoothstep(0.45, 0.5, g.y) * smoothstep(0.55, 0.5, g.y);
  float line = max(gx, gy);
  // 行扫描
  float pulse = smoothstep(0.0, 0.05, abs(fract(uv.y * 4.0 - t * 0.3) - 0.5));
  line *= 1.0 - pulse * 0.55;
  // 随机点亮的格子
  vec2 cell = floor(uv * vec2(28.0, 16.0));
  float lit = step(0.92, hash(cell + floor(t * 2.0)));
  // 沿对角线扫过的"探针"
  float probe = smoothstep(0.04, 0.0, abs(uv.x + uv.y - 1.0 - sin(t * 0.4) * 0.6));
  return clamp(line * 0.55 + lit * 0.95 + probe * 0.3, 0.0, 1.0);
}

float scene(vec2 uv, float t) {
  if (u_effect == 1) return effectMushroom(uv, t);
  if (u_effect == 2) return effectWave(uv, t);
  if (u_effect == 3) return effectOrbit(uv, t);
  if (u_effect == 4) return effectChaos(uv, t);
  if (u_effect == 5) return effectGrid(uv, t);
  return 0.0;
}

// ===== cheap bloom: 仅 4 个十字方向邻居，半径 1.5 cell =====
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

  // ===== 鼠标交互：按 effect 风味分别处理 =====
  float aspect = u_resolution.x / u_resolution.y;
  vec2 dm = (cellUv - u_mouse) * vec2(aspect, 1.0);
  float r = length(dm);
  float reach = exp(-r * r * 30.0) * u_mouseActive;
  vec2 dirAway = normalize(dm + 1e-4) / vec2(aspect, 1.0);

  if (u_effect == 1) {
    // [mushroom · 核爆] 排斥 + 涡旋 + 拖尾
    cellUv += dirAway * reach * 0.04;
    cellUv -= u_mouseVel * reach * 0.18;
    float ang = reach * 0.9;
    float ca = cos(ang), sa = sin(ang);
    cellUv = u_mouse + mat2(ca, -sa, sa, ca) * (cellUv - u_mouse);
  }
  else if (u_effect == 3) {
    // [orbit · 黑洞引力] 朝鼠标吸引 + 反向加速旋转
    cellUv -= dirAway * reach * 0.06;
    cellUv -= u_mouseVel * reach * 0.25;
    float ang = -reach * 1.5;  // 比 mushroom 更强、反向
    float ca = cos(ang), sa = sin(ang);
    cellUv = u_mouse + mat2(ca, -sa, sa, ca) * (cellUv - u_mouse);
  }
  else if (u_effect == 4) {
    // [chaos · 搅水] 局部加扰流场，方向不规则
    vec2 stir = vec2(
      noise(cellUv * 24.0 + u_time * 0.6),
      noise(cellUv * 24.0 - u_time * 0.5)
    ) - 0.5;
    cellUv += stir * reach * 0.12;
    cellUv -= u_mouseVel * reach * 0.30;
  }
  // [wave · effect == 2] 在 effectWave 内部处理 baseline hump，这里不动 cellUv
  // [grid · effect == 5] 保持网格规整，不形变，只靠 reach 加亮

  float t = u_time * u_speed;
  float lum = scene(cellUv, t);
  // 通用亮度增益（所有 effect 都点亮鼠标周围）
  float boost = (u_effect == 5) ? 0.5 : 0.32;  // grid 没有形变，提高亮度补偿
  lum = clamp(lum + reach * boost, 0.0, 1.0);

  // 邻域辉光（廉价 bloom）+ 中心权重 0.25
  float bloom = cellGlowNeighbors(cellUv, t) + lum * 0.25;
  float lit = clamp(lum + bloom * 0.5, 0.0, 1.0);
  lit = pow(lit, 0.85);

  // 字符索引
  float idxF = lit * float(u_chars - 1);
  int idx = int(floor(idxF + 0.5));
  float col = mod(float(idx), u_atlasCols);
  float row = floor(float(idx) / u_atlasCols);

  vec2 local = fract(fragPx / u_cellSize);
  vec2 atlasUv = (vec2(col, row) + local) / vec2(u_atlasCols, u_atlasRows);
  float mask = texture(u_atlas, atlasUv).a;

  // 双色渐变：暗部冷色 → 亮部暖色
  // 用 pow 拉伸暗部权重，让中间亮度也能呈现明显色相
  float colorMix = pow(clamp(lit, 0.0, 1.0), 1.4);
  vec3 base = mix(u_colorDark, u_colorBright, colorMix);
  // 明度调制：暗部不要乘得太低，否则颜色看不见
  base *= 0.7 + lit * 0.6;

  // bloom 用 colorGlow 着色，加上轻微的色相外溢
  vec3 bloomCol = u_colorGlow * bloom * u_glow * 1.6;

  vec3 finalRgb = base * mask + bloomCol * (0.30 + mask * 0.70);
  float a = mask * (0.6 + lit * 0.55) + bloom * 0.18;

  outColor = vec4(finalRgb, clamp(a, 0.0, 1.0));
}`;

/**
 * 用离屏 canvas 把 charset 渲染成一张白色字符 atlas。
 * 每个 tile 大小 = tileSize，字符按行优先排布。
 */
function buildAtlas(charset: string, tileSize: number) {
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
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
  ctx.font = `${Math.round(px * 0.9)}px "JetBrains Mono", "Fira Code", "IBM Plex Mono", monospace`;
  for (let i = 0; i < charset.length; i++) {
    const c = charset[i];
    const cx = (i % cols) * px + px / 2;
    const cy = Math.floor(i / cols) * px + px / 2 + px * 0.04;
    ctx.fillText(c, cx, cy);
  }
  return { canvas, cols, rows };
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

export default function AsciiCanvas({
  preset,
  className,
  interactive = false,
  maxDpr = 1.5,
  fpsCap = 0,
  maxPixels = 1_200_000,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: false });
    if (!gl) {
      canvas.style.background = "#0a0c10";
      return;
    }

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

    // fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // atlas
    const atlas = buildAtlas(preset.charset, 64);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // uniforms
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
      mouse: gl.getUniformLocation(prog, "u_mouse"),
      mouseVel: gl.getUniformLocation(prog, "u_mouseVel"),
      mouseActive: gl.getUniformLocation(prog, "u_mouseActive"),
      quality: gl.getUniformLocation(prog, "u_quality"),
    };

    gl.uniform1i(U.atlas, 0);
    gl.uniform1i(U.chars, preset.charset.length);
    gl.uniform1f(U.cols, atlas.cols);
    gl.uniform1f(U.rows, atlas.rows);
    gl.uniform1f(U.speed, preset.speed);
    gl.uniform3f(U.colorDark, preset.colorDark[0], preset.colorDark[1], preset.colorDark[2]);
    gl.uniform3f(U.colorBright, preset.colorBright[0], preset.colorBright[1], preset.colorBright[2]);
    gl.uniform3f(U.colorGlow, preset.colorGlow[0], preset.colorGlow[1], preset.colorGlow[2]);
    gl.uniform1f(U.glow, preset.glow);
    gl.uniform1i(U.effect, preset.effectId);
    gl.uniform1f(U.cell, preset.cellSize);
    gl.uniform1f(U.quality, interactive ? 1.0 : 0.5);

    // 鼠标状态：目标位置（raw）、缓动跟随位置（smooth）、速度、是否活跃
    const mouseTarget = { x: 0.5, y: 0.5 };
    const mouseSmooth = { x: 0.5, y: 0.5 };
    const mouseVel = { x: 0, y: 0 };
    let mouseActive = 0;
    let mouseActiveTarget = 0;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1.0 - (e.clientY - rect.top) / rect.height;
      // 仅在画布内激活
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        mouseTarget.x = nx;
        mouseTarget.y = ny;
        mouseActiveTarget = 1;
      } else {
        mouseActiveTarget = 0;
      }
    };
    const onLeave = () => { mouseActiveTarget = 0; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      mouseTarget.x = (tx - rect.left) / rect.width;
      mouseTarget.y = 1.0 - (ty - rect.top) / rect.height;
      mouseActiveTarget = 1;
    };
    if (interactive) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseout", onLeave, { passive: true });
      canvas.addEventListener("touchmove", onTouch, { passive: true });
      canvas.addEventListener("touchend", onLeave, { passive: true });
    }

    const resize = () => {
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const pixels = w * h;
      if (pixels > maxPixels) {
        const scale = Math.sqrt(maxPixels / pixels);
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
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

    // 可见性：离屏时暂停以省电
    let visible = true;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (visible = e.isIntersecting)),
      { threshold: 0 }
    );
    io.observe(canvas);

    const start = performance.now();
    const frameInterval = fpsCap > 0 ? 1000 / fpsCap : 0;
    let lastFrame = 0;
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      if (frameInterval > 0 && now - lastFrame < frameInterval) return;
      lastFrame = now;

      // 鼠标缓动：smooth 朝 target 追，velocity = 差分
      // 注意：raf 间隔不固定，但用固定 lerp 系数足够稳定
      const prevX = mouseSmooth.x;
      const prevY = mouseSmooth.y;
      mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * 0.18;
      mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * 0.18;
      mouseVel.x = mouseSmooth.x - prevX;
      mouseVel.y = mouseSmooth.y - prevY;
      // active 跟随 target（target 只在 mouseleave 时变 0），速度本身会自然衰减
      mouseActive += (mouseActiveTarget - mouseActive) * 0.12;

      const t = (now - start) / 1000;
      gl.uniform1f(U.time, t);
      gl.uniform2f(U.mouse, mouseSmooth.x, mouseSmooth.y);
      gl.uniform2f(U.mouseVel, mouseVel.x, mouseVel.y);
      gl.uniform1f(U.mouseActive, mouseActive);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    draw(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (interactive) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseout", onLeave);
        canvas.removeEventListener("touchmove", onTouch);
        canvas.removeEventListener("touchend", onLeave);
      }
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
    };
  }, [preset, interactive, maxDpr, fpsCap, maxPixels]);

  return <canvas ref={ref} className={className} />;
}

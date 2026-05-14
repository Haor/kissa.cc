/**
 * ASCII WebGL2 渲染管线的纯逻辑模块。
 *
 * 抽出 shader 字符串、字符集 / glow 配置、atlas 构建器、shader 编译器，让
 * `SceneStage` 单实例就能驱动所有 slide 的 ASCII 视觉，避免每屏一个 GL context
 * 的开销。
 */

export const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
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
/** 转场进度：-1=即将进入 0=稳态 +1=完全离开。alpha = 1-|t|；
 *  位移 = dir * t * SCATTER_AMP；字符 index 随 |t| 抖动让"重组感"更强。 */
uniform float u_transition;
uniform float u_quality;

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
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float wfbm(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.20)),
                fbm(p + vec2(5.2, 1.3) + t * 0.15));
  return fbm(p + 3.0 * q);
}

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

float effectDrift(vec2 uv, float t) {
  vec2 p = uv * vec2(2.6, 1.8) + vec2(t * 0.04, -t * 0.025);
  float n = wfbm(p, t * 0.18);
  n = smoothstep(0.32, 0.82, n);
  float vignette = smoothstep(1.05, 0.55, length(uv - 0.5));
  n *= vignette;
  n += (hash(floor(uv * 60.0) + floor(t * 6.0)) - 0.5) * 0.05;
  return clamp(n, 0.0, 1.0);
}

float effectCircuit(vec2 uv, float t) {
  float hx = fract(uv.x * 14.0 - t * 0.35);
  float hy = fract(uv.y * 9.0 + t * 0.20);
  float traceX = smoothstep(0.0, 0.05, hx) * smoothstep(0.18, 0.10, hx);
  float traceY = smoothstep(0.0, 0.05, hy) * smoothstep(0.18, 0.10, hy);
  float busY = floor(uv.x * 5.0);
  float busPhase = hash(vec2(busY, 17.0)) * 6.28;
  float bus = smoothstep(0.02, 0.0,
    abs(fract(uv.y * 3.0 + sin(busPhase + t * 0.2) * 0.1) - 0.5));
  vec2 node = floor(uv * vec2(11.0, 7.0));
  float blink = hash(node + floor(t * 1.6));
  float nodeOn = step(0.92, blink);
  vec2 ng = fract(uv * vec2(11.0, 7.0)) - 0.5;
  float nodeLit = nodeOn * smoothstep(0.18, 0.0, length(ng));
  float bg = wfbm(uv * 2.5, t * 0.15) * 0.18;
  float v = max(max(traceX, traceY) * 0.55, bus * 0.5);
  v = max(v, nodeLit * 1.1);
  v += bg;
  return clamp(v, 0.0, 1.0);
}

float effectMatrix(vec2 uv, float t) {
  float colId = floor(uv.x * 22.0);
  float colSpeed = 0.6 + hash(vec2(colId, 3.0)) * 1.6;
  float colPhase = hash(vec2(colId, 7.0)) * 20.0;
  float yStream = fract(uv.y * 2.8 + t * colSpeed * 0.25 + colPhase);
  float head = smoothstep(0.0, 0.08, 1.0 - yStream)
             * smoothstep(0.55, 0.95, 1.0 - yStream);
  float trail = smoothstep(0.0, 0.30, 1.0 - yStream) * 0.45;
  float hot = step(0.88, hash(vec2(colId, floor(t * 0.5))));
  float boost = hot * smoothstep(0.0, 0.7, 1.0 - yStream) * 0.35;
  float jitter = hash(vec2(colId, floor(uv.y * 30.0 + t * colSpeed * 8.0)));
  float ch = step(0.55, jitter) * trail;
  return clamp(head * 1.1 + ch + boost, 0.0, 1.0);
}

// 用 cellId 求"漂移后的星点位置"。每帧调用 4 次（self + 3 邻居），抽函数复用。
vec2 constellationStarPos(vec2 cellId, float t) {
  vec2 base = vec2(hash(cellId + 1.7), hash(cellId + 9.1));
  float phase = hash(cellId + 21.5) * 6.28;
  // 每个星点绕自己的"基点"画小椭圆 → 整张星图轻微浮动
  vec2 drift = vec2(
    cos(t * 0.35 + phase),
    sin(t * 0.42 + phase * 1.3)
  ) * 0.18;
  return clamp(base + drift, 0.05, 0.95);
}

float effectConstellation(vec2 uv, float t) {
  // 密度提升（20×12 → 26×16），星图视觉密度近 1.7×
  vec2 grid = vec2(26.0, 16.0);
  // 整张星图轻微"呼吸"位移，让 cell 边界感弱化
  vec2 breath = vec2(sin(t * 0.18), cos(t * 0.13)) * 0.015;
  vec2 sampleUv = uv + breath;
  vec2 cellId = floor(sampleUv * grid);
  vec2 cellLocal = fract(sampleUv * grid);

  vec2 starPos = constellationStarPos(cellId, t);
  // 概率密度抬高（0.78 → 0.62），更多星点亮起
  float starOn = step(0.62, hash(cellId + 4.3));
  // 闪烁频率拉高 + 范围变宽，更"活"
  float pulse = 0.45 + 0.55 * sin(t * 1.1 + hash(cellId) * 6.28);
  float starLit = starOn
    * smoothstep(0.16, 0.0, length(cellLocal - starPos))
    * pulse;

  // 4 邻居全扫（之前只扫右/下两个），连线密度翻倍
  float line = 0.0;
  for (int dxI = -1; dxI <= 1; dxI++) {
    for (int dyI = -1; dyI <= 1; dyI++) {
      if (dxI == 0 && dyI == 0) continue;
      vec2 nId = cellId + vec2(float(dxI), float(dyI));
      float nOn = step(0.62, hash(nId + 4.3));
      if (nOn < 0.5) continue;
      vec2 nPosLocal = constellationStarPos(nId, t);
      vec2 a = starPos;
      vec2 b = nPosLocal + vec2(float(dxI), float(dyI));
      vec2 pa = cellLocal - a;
      vec2 ba = b - a;
      float tt = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
      float dist = length(pa - ba * tt);
      // 沿线流动的"信号"：tt 跟时间偏移取 sin，让连线像有数据在跑
      float flow = 0.5 + 0.5 * sin((tt - t * 0.45) * 12.5 + hash(cellId) * 6.28);
      float strength = smoothstep(0.05, 0.0, dist) * starOn * nOn;
      line = max(line, strength * (0.32 + 0.42 * flow));
    }
  }

  // 流星：每 ~3 秒一次，沿斜线划过屏幕
  float meteorSeed = floor(t * 0.35);
  float meteorOn = step(0.55, hash(vec2(meteorSeed, 7.3)));
  vec2 mStart = vec2(hash(vec2(meteorSeed, 11.2)) * 1.2 - 0.1,
                     0.95 + hash(vec2(meteorSeed, 5.9)) * 0.1);
  float mProg = fract(t * 0.35);
  vec2 mPos = mStart + vec2(0.9, -1.1) * mProg;
  vec2 mDelta = uv - mPos;
  // 顺着 (0.9,-1.1) 方向拖一条尾巴
  vec2 mDir = normalize(vec2(0.9, -1.1));
  float along = dot(mDelta, mDir);
  float across = length(mDelta - mDir * along);
  float meteor = meteorOn
    * smoothstep(0.015, 0.0, across)
    * smoothstep(-0.12, 0.0, along)
    * smoothstep(0.0, -0.02, along)
    * 1.2;

  // 极轻底纹（FBM）让无星区域也有低频呼吸感
  float bg = wfbm(uv * 2.2 + t * 0.06, t * 0.08) * 0.08;

  float vignette = smoothstep(1.1, 0.40, length(uv - 0.5));
  return clamp((starLit + line + meteor + bg) * vignette, 0.0, 1.0);
}

float effectStarfield(vec2 uv, float t) {
  vec2 p = uv - 0.5;
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  float warpR = r - t * 0.025 + sin(a * 3.0 + t * 0.3) * 0.015;
  float bands = abs(fract(warpR * 5.0) - 0.5);
  float lit = smoothstep(0.06, 0.0, bands) * smoothstep(0.5, 0.08, r);
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
  if (u_effect == 8) return effectCircuit(uv, t);
  if (u_effect == 9) return effectMatrix(uv, t);
  if (u_effect == 10) return effectConstellation(uv, t);
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
    cellUv += dirAway * reach * 0.02;
    cellUv -= u_mouseVel * reach * 0.10;
  } else if (u_effect == 7) {
    cellUv -= dirAway * reach * 0.03;
  } else if (u_effect == 8) {
    cellUv += dirAway * reach * 0.02;
    cellUv -= u_mouseVel * reach * 0.08;
  } else if (u_effect == 9) {
    cellUv.y -= reach * 0.05;
  } else if (u_effect == 10) {
    // 朝鼠标"吸聚" + 微旋转：模拟引力源
    cellUv -= dirAway * reach * 0.07;
    cellUv -= u_mouseVel * reach * 0.18;
    float ang = reach * 0.6;
    float ca2 = cos(ang), sa2 = sin(ang);
    cellUv = u_mouse + mat2(ca2, -sa2, sa2, ca2) * (cellUv - u_mouse);
  }

  // ===== Scatter / 重组转场位移 =====
  // 字符沿伪随机方向漂移 + 旋转抖动；|u_transition| 越大位移越远。
  vec2 dir = hashDir(cellId);
  float swirl = (hash(cellId + 13.7) - 0.5) * 1.6;
  float tAbs = abs(u_transition);
  // 位移幅度大幅提升 (0.4 → 0.7) 让"散开重组"感更明显
  cellUv += dir * u_transition * 0.7;
  // 加一个旋转分量：散开时字符整体绕屏幕中心扭一下
  vec2 toCenter = cellUv - 0.5;
  float ang = u_transition * swirl * 0.15;
  float ca = cos(ang), sa = sin(ang);
  cellUv = 0.5 + mat2(ca, -sa, sa, ca) * toCenter;

  float t = u_time * u_speed;
  float lum = scene(cellUv, t);
  float boost = (u_effect == 5) ? 0.5 : 0.32;
  lum = clamp(lum + reach * boost, 0.0, 1.0);

  float bloom = 0.0;
  if (lum > 0.18) {
    bloom = cellGlowNeighbors(cellUv, t) + lum * 0.25;
  }
  float lit = clamp(lum + bloom * 0.5, 0.0, 1.0);
  lit = pow(lit, 0.85);

  float side = min(u_resolution.x, u_resolution.y);
  vec2 center = u_resolution * 0.5;
  vec2 maskPx = (cellCenterPx - center) / side + 0.5;
  vec2 maskUv = vec2(maskPx.x, 1.0 - maskPx.y);
  vec2 inBounds = step(vec2(0.0), maskUv) * step(maskUv, vec2(1.0));
  float bound = inBounds.x * inBounds.y;
  float maskValue = texture(u_mask, clamp(maskUv, 0.0, 1.0)).r * bound;
  float m = maskValue * u_useMask;

  float maskFloor = (u_effect == 5) ? 0.72 : 0.82;
  float maskBoost = (u_effect == 5) ? 0.28 : 0.36;
  float maskOutside = (u_effect == 5) ? 1.0 : (1.0 - u_useMask * 0.42);
  float litInside = clamp(max(lit, m * maskFloor) + m * maskBoost, 0.0, 1.0);
  float litOutside = lit * maskOutside;
  lit = mix(litOutside, litInside, smoothstep(0.0, 0.85, m));

  bloom *= (1.0 + m * ((u_effect == 5) ? 0.45 : 1.0));

  float glyphLit = lit;
  if (u_effect == 5) {
    float mark = smoothstep(0.12, 0.72, m);
    float hotCell = smoothstep(0.58, 0.92, lum);
    float cap = mix(0.86, 1.0, mark);
    glyphLit = min(glyphLit, cap);
    glyphLit = clamp(glyphLit + mark * (0.10 + hotCell * 0.24), 0.0, 1.0);
  }

  // 转场期间随机抖动字符 index，制造"字符 morph 重组"的感觉
  float morphJitter = (hash(cellId + floor(u_time * 18.0)) - 0.5) * tAbs * 0.9;
  glyphLit = clamp(glyphLit + morphJitter, 0.0, 1.0);

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

  // 阅读带亮度衰减
  float readBand = smoothstep(0.42, 0.05, v_uv.y);
  float readAtten = mix(1.0, 0.32, readBand);
  finalRgb *= readAtten;
  a *= mix(1.0, 0.55, readBand);

  // 散开期间整体 alpha 衰减
  a *= 1.0 - tAbs;

  outColor = vec4(finalRgb, clamp(a, 0.0, 1.0));
}`;

export const CHARSETS_BY_EFFECT: Record<number, string> = {
  1: " .,:;-=+*xX#%@",
  2: " .:-=+*#",
  3: " ·∙•●○◎",
  4: " .,;-+*#%@",
  5: " .:-=+#",
  6: " ·.,:'\"`-_",
  7: " ·.•*+#",
  8: " .:_=-|+*#",
  9: " .·0179X#%",
  10: " .·•*◇◆",
};

export const GLOW_BY_EFFECT: Record<number, number> = {
  1: 1.4,
  2: 1.2,
  3: 1.3,
  4: 1.05,
  5: 1.35,
  6: 0.85,
  7: 1.15,
  8: 1.1,
  9: 1.3,
  10: 1.15,
};

export function getMonoFontStack(): string {
  if (typeof window === "undefined") {
    return '"JetBrains Mono", "Fira Code", "IBM Plex Mono", ui-monospace, monospace';
  }
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return (
    v || '"JetBrains Mono", "Fira Code", "IBM Plex Mono", ui-monospace, monospace'
  );
}

export type AtlasInfo = {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  charsetLen: number;
};

export function buildAtlas(charset: string, tileSize: number): AtlasInfo {
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
  ctx.font = `${Math.round(px * 0.9)}px ${getMonoFontStack()}`;
  for (let i = 0; i < charset.length; i++) {
    const c = charset[i];
    const cx = (i % cols) * px + px / 2;
    const cy = Math.floor(i / cols) * px + px / 2 + px * 0.04;
    ctx.fillText(c, cx, cy);
  }
  return { canvas, cols, rows, charsetLen: charset.length };
}

export function buildBlankMask(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 4, 4);
  return canvas;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
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

export function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("Link failed: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

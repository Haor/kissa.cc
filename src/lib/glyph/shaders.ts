/**
 * Glyph field 渲染管线的全部 GLSL。
 *
 * 四个 pass（除最后一个外都跑在「字符格分辨率」上，1 texel = 1 个字符 cell，
 * 1440×900 视口约 144×90 = 1.3 万个 cell，比逐像素算 effect 便宜两个数量级）：
 *
 *   1. ENERGY  (cell res, ping-pong)  光标尾迹：随移动速度注入能量，逐帧衰减
 *   2. FIELD   (cell res, MRT ×2)     两个 scene（A=旧屏 / B=新屏）+ 品牌/汉字 mask
 *                                     + 方向性 decode wipe 转场 + 涟漪 + 阅读区 scrim
 *   3. BLUR    (cell res, H → V)      亮度 → 高斯光晕；顺带把 wipe 进度 s 也糊开给底色用
 *   4. COMPOSE (full res)             texelFetch 字符 atlas 出字形，叠加光晕 / 底色 / 颗粒
 *
 * mask 是**密度增强场，不是裁剪**：满屏始终跑 effect，mask 内托底 + boost，
 * mask 外轻微 attenuate。这是 v1 就定下的视觉原则，不要改成裁剪。
 */

export const QUAD_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const COMMON = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hashDir(vec2 p) {
  float a = hash(p) * 6.2831853;
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float wfbm(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.20)),
                fbm(p + vec2(5.2, 1.3) + t * 0.15));
  return fbm(p + 3.0 * q);
}
`;

// ---------------------------------------------------------------------------
// 1. ENERGY —— 光标尾迹
// r = 能量，gb = 推动方向（0.5 为零点）
// ---------------------------------------------------------------------------
export const ENERGY_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_prev;
uniform vec2 u_res;
uniform float u_cellPx;
uniform float u_aspect;
uniform vec2 u_m0;       // 上一帧光标 uv
uniform vec2 u_m1;       // 本帧光标 uv
uniform float u_splat;   // 注入强度（跟随速度）
uniform float u_decay;

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) * u_cellPx / u_res;
  vec4 p = texelFetch(u_prev, ivec2(cell), 0);
  float e = max(p.r * u_decay - 0.006, 0.0);
  vec2 dir = p.gb;

  vec2 asp = vec2(u_aspect, 1.0);
  vec2 a = u_m0 * asp;
  vec2 b = u_m1 * asp;
  vec2 x = uv * asp;
  vec2 ba = b - a;
  float h = clamp(dot(x - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(x - a - ba * h);
  float splat = exp(-d * d / 0.0035) * u_splat;
  if (splat > 0.002) {
    vec2 v = length(ba) > 1e-5 ? normalize(ba) : vec2(0.0);
    dir = mix(dir, v * 0.5 + 0.5, clamp(splat * 1.5, 0.0, 1.0));
  }
  e = clamp(e + splat, 0.0, 1.0);
  o = vec4(e, dir, 1.0);
}`;

// ---------------------------------------------------------------------------
// 2. FIELD —— 两个 scene 的 effect + mask + 转场
// o0 = (lit, mask, s, heat)   s = 0 → scene A, 1 → scene B
// o1 = (fill, accent, 0, 1)   fill = 字符格底色块（GitHub grid），accent = 用光晕色描字
// ---------------------------------------------------------------------------
export const FIELD_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;

uniform vec2  u_res;
uniform float u_cellPx;
uniform float u_time;
uniform float u_aspect;

uniform int   u_effA;
uniform int   u_effB;
uniform float u_speedA;
uniform float u_speedB;
uniform float u_maskA;       // mask 层号，-1 = 无
uniform float u_maskB;
uniform vec3  u_placeA;      // figure 中心 (uv) + 边长（视口高度的比例）
uniform vec3  u_placeB;

uniform float u_progress;    // 0..1（已缓动）
uniform vec2  u_wipeDir;     // 方向 wipe：先翻转的一侧
uniform float u_wipeRadial;  // 1 = 从 u_wipeOrigin 径向扩散（开场）
uniform vec2  u_wipeOrigin;
uniform float u_turbAmt;     // reduced-motion 时压低

uniform sampler2DArray u_masks;
uniform sampler2D u_energy;

uniform vec2  u_mouse;
uniform float u_mouseActive;
uniform vec4  u_rip[4];      // x, y, t0, amp
uniform vec4  u_scrimA;      // scene A / B 各自的阅读区矩形 x0, y0, x1, y1（uv），空 = 无
uniform vec4  u_scrimB;
uniform vec4  u_scrimA2;     // 第二块：figure 图注
uniform vec4  u_scrimB2;
uniform float u_scrimAmt;
uniform float u_drag;        // 手势预览位移 -1..1

${COMMON}

// ---- effect 公共上下文（sampleScene 在调用 scene 前写入）----
vec2  g_suv;    // 屏幕 uv（已含转场 / 尾迹位移）
vec2  g_place;  // 当前 scene 的 figure 中心
float g_size;   // 当前 scene 的 figure 边长（视口高度单位）
float g_mask;   // 当前 cell 的 figure mask 值（0..1）
vec2  g_grid;   // 字符格行列数
float g_acc;    // effect 自定义：用描边色画（0..1）
float g_fill;   // effect 自定义：字符格底色块（0..1）
float g_alt;    // effect 自定义：改用泡泡字符行（0 / 1）

// ===========================================================================
// 1 · FILM —— Instagram「frames i keep.」
// 胶片带斜穿相机 logo，镜头就是片门：每 3.2 秒快门一闪、曝光一格、胶片推进一格，
// 拍下的照片一边往左（朝文案）走一边显影。片门右边是还没曝光的暗片。
// ===========================================================================
float photo(float n, vec2 q) {
  // 都做成高对比的剪影，在一格 ~40×28 个字符里也认得出来
  float h = hash(vec2(n, 3.7));
  if (h < 0.34) {
    // 日落海面：亮天空 + 白太阳 + 暗海面上一道倒影
    float hor = 0.36 + hash(vec2(n, 1.1)) * 0.12;
    vec2 sun = vec2(0.26 + hash(vec2(n, 2.2)) * 0.48, hor + 0.12 + hash(vec2(n, 5.3)) * 0.12);
    if (q.y > hor) {
      float sky = mix(0.78, 0.5, (q.y - hor) / (1.0 - hor));
      return max(sky, smoothstep(0.16, 0.12, length((q - sun) * vec2(1.35, 1.0))));
    }
    float refl = smoothstep(0.1, 0.0, abs(q.x - sun.x)) * step(0.45, fract(q.y * 14.0 + q.x * 1.5));
    return 0.06 + refl * 0.85;
  }
  if (h < 0.67) {
    // 山的剪影 + 月亮
    float r1 = 0.46 + (fbm(vec2(q.x * 2.6 + n * 1.7, n)) - 0.5) * 0.6;
    float r2 = 0.26 + (fbm(vec2(q.x * 4.3 - n, n * 2.3)) - 0.5) * 0.3;
    vec2 moon = vec2(0.22 + hash(vec2(n, 8.1)) * 0.56, 0.78);
    float moonD = smoothstep(0.11, 0.08, length((q - moon) * vec2(1.35, 1.0)));
    if (q.y > r1) return max(mix(0.8, 0.55, q.y), moonD);
    return q.y > r2 ? 0.2 : 0.05;
  }
  // 夜里的楼群：暗楼身 + 亮窗
  float bx = floor(q.x * 7.0);
  float bh = 0.3 + hash(vec2(bx, n)) * 0.5;
  if (q.y < bh) {
    vec2 wc = floor(q * vec2(14.0, 12.0));
    return 0.05 + step(0.55, hash(wc + n)) * 0.9;
  }
  return mix(0.72, 0.48, q.y);
}

float effectFilm(float t) {
  vec2 p = (g_suv - g_place) * vec2(u_aspect, 1.0);
  const float ANG = 0.2;   // 左高右低：往左走的照片从文案上方经过
  p = mat2(cos(ANG), sin(ANG), -sin(ANG), cos(ANG)) * p;
  const float P = 3.2;   // 一个快门周期
  const float F = 0.46;  // 一格（含格间）长度
  const float H = 0.5;   // 胶片总高
  float k = floor(t / P);
  float tau = t - k * P;
  float adv = tau < 0.45 ? smoothstep(0.0, 1.0, tau / 0.45) : 1.0;
  float S = k - 1.0 + adv;                     // 胶片位置（以格为单位）
  float flash = step(0.9, tau) * exp(-(tau - 0.9) * 5.0);
  float av = abs(p.y);

  if (av > H * 0.5) {
    // 胶片外：零星的浮尘
    float dust = step(0.993, hash(floor(g_suv * g_grid) + floor(t * 0.7)));
    return dust * 0.4 + flash * 0.05;
  }
  float v;
  if (av > H * 0.5 - 0.075) {
    // 齿孔带：亮的片边上一排暗的方孔
    // 背光的胶片：片基暗、齿孔透光
    float hole = fract((p.x + S * F) / 0.058);
    bool inHole = hole > 0.22 && hole < 0.72 && av > H * 0.5 - 0.058 && av < H * 0.5 - 0.02;
    v = inHole ? 0.95 : 0.1;
  } else {
    float fu = p.x / F + S;
    float n = floor(fu + 0.5);
    float lf = fu - n;
    float fh = H * 0.5 - 0.09;
    if (abs(lf) > 0.46 || av > fh) {
      v = 0.03;
    } else if (abs(lf) > 0.445 || av > fh - 0.012) {
      v = 0.5;   // 画格的细框
    } else {
      vec2 q = vec2(lf / 0.92 + 0.5, p.y / (2.0 * fh) + 0.5);
      float ex = n * P + 0.9;
      if (t < ex) {
        v = 0.1;
      } else {
        float dev = smoothstep(0.0, 1.0, (t - ex) / 1.8);
        v = mix(1.0, photo(n, q), dev);
      }
    }
  }
  return clamp(v + flash * 0.14, 0.0, 1.0);
}

// ===========================================================================
// 2 · INVADERS —— Steam「what i'm playing.」
// 编队 / 飞船 / 子弹的状态全在 CPU（lib/glyph/invaders.ts），这里按 uniform 画精灵。
// 精灵每行一个 int，高位在左；每种两帧。坐标单位 = 字符格，y 向上。
// ===========================================================================
const int SQUID[16] = int[16](0x18, 0x3C, 0x7E, 0xDB, 0xFF, 0x24, 0x5A, 0xA5,
                              0x18, 0x3C, 0x7E, 0xDB, 0xFF, 0x5A, 0x81, 0x42);
const int CRAB[16] = int[16](0x104, 0x88, 0x1FC, 0x376, 0x7FF, 0x5FD, 0x505, 0xD8,
                             0x104, 0x489, 0x5FD, 0x777, 0x7FF, 0x3FE, 0x104, 0x202);
const int OCTO[16] = int[16](0x0F0, 0x7FE, 0xFFF, 0xE67, 0xFFF, 0x198, 0x36C, 0xC03,
                             0x0F0, 0x7FE, 0xFFF, 0xE67, 0xFFF, 0x39C, 0x666, 0x30C);
const int SHIP[8] = int[8](0x40, 0xE0, 0xE0, 0xFFE, 0x1FFF, 0x1FFF, 0x1FFF, 0x1FFF);
const int BOOM[8] = int[8](0x451, 0x252, 0x104, 0x603, 0x104, 0x252, 0x451, 0x0);

uniform vec4  u_inv;       // 编队左缘 x、距顶 y、动画帧、列数
uniform vec3  u_invGap;    // 列距、行距、行数
uniform int   u_invKill;   // 已击落位掩码（bit = row * 8 + col）
uniform vec4  u_invBoom;   // 爆炸 col、row、已过秒数、是否有效
uniform vec2  u_ship;      // 飞船左下角（竖屏没有飞船，y 给到屏幕外）
uniform vec4  u_shots[4];  // 子弹：弹头 x、y + 飞行方向；方向为 0 = 空槽
uniform vec3  u_muzzle;    // 竖屏炮口（Steam 图标圆边上）x、y、距开火的秒数

float bitAt(int bits, int x, int w) {
  if (x < 0 || x >= w) return 0.0;
  return float((bits >> (w - 1 - x)) & 1);
}

float invaderBit(int row, int fr, int px, int py) {
  int i = fr * 8 + py;
  if (row == 0) return bitAt(SQUID[i], px - 2, 8);
  if (row == 3) return bitAt(OCTO[i], px, 12);
  return bitAt(CRAB[i], px, 11);
}

float effectInvaders(float t) {
  vec2 c = floor(g_suv * g_grid);
  // 背景：稀疏闪烁的星 + 飞船下方的地平线
  float v = step(0.986, hash(c + 3.1)) * (0.22 + 0.18 * sin(t * 2.0 + hash(c) * 6.28));
  if (c.y == u_ship.y - 2.0) v = max(v, 0.3);

  float topY = g_grid.y - 1.0 - u_inv.y;
  float lx = c.x - u_inv.x;
  float ly = topY - c.y;
  if (lx >= 0.0 && ly >= 0.0) {
    int col = int(lx / u_invGap.x);
    int row = int(ly / u_invGap.y);
    if (col < int(u_inv.w) && row < int(u_invGap.z)) {
      int px = int(lx) - col * int(u_invGap.x);
      int py = int(ly) - row * int(u_invGap.y);
      if (py < 8) {
        bool dead = ((u_invKill >> (row * 8 + col)) & 1) == 1;
        float b = 0.0;
        if (!dead) {
          b = invaderBit(row, int(u_inv.z), px, py);
        } else if (u_invBoom.w > 0.5 && int(u_invBoom.x) == col && int(u_invBoom.y) == row) {
          b = bitAt(BOOM[py], px, 11) * (1.0 - u_invBoom.z / 0.4);
          g_acc = max(g_acc, b);
        }
        v = max(v, b);
        g_fill = max(g_fill, b * 0.3);
      }
    }
  }

  vec2 sp = c - u_ship;
  if (sp.x >= 0.0 && sp.x < 13.0 && sp.y >= 0.0 && sp.y < 8.0) {
    float b = bitAt(SHIP[7 - int(sp.y)], int(sp.x), 13);
    v = max(v, b);
    g_acc = max(g_acc, b);
    g_fill = max(g_fill, b * 0.3);
  }
  // 子弹：从弹头往回拖三格的一道
  for (int i = 0; i < 4; i++) {
    vec4 s = u_shots[i];
    if (dot(s.zw, s.zw) < 0.5) continue;
    vec2 pc = c + 0.5 - s.xy;
    float back = -dot(pc, s.zw);
    float perp = abs(pc.x * s.w - pc.y * s.z);
    if (back > -0.5 && back < 2.6 && perp < 0.55) {
      v = 1.0;
      g_acc = 1.0;
    }
  }
  // 炮口闪光：开火那一下图标圆边上亮一小团
  float fl = exp(-u_muzzle.z * 12.0);
  float fr = length(c + 0.5 - u_muzzle.xy);
  if (fl > 0.02 && fr < 3.0) {
    float b = fl * (1.0 - fr / 3.0);
    v = max(v, b);
    g_acc = max(g_acc, b);
  }
  return v;
}

// ===========================================================================
// 3 · NEURAL —— Hugging Face「models i tinker with.」
// 一束穿过 🤗 的「透镜」：一族互不相交的曲线从左缘（竖屏是底边）铺满整个高度出发，
// 缓缓收拢，汇进笑脸，再从另一侧稍稍散开流到屏幕边缘 —— 笑脸就是网络中间的模型。
// 上游 5 列「层」上的节点 + 笑脸圆边 = six layers。线上一直有小段的光往里淌；
// 每 3.6 秒一道前向传播的波前从左推到右：扫过节点（○ → ●），穿过笑脸时笑脸整体
// 亮一下，出来以后只有一条线留着亮 —— 这一轮的「猜测」（one guess）。
// 曲线在笑脸圆内截断，五官的空隙里不画线。
// ===========================================================================
float nnXL; float nnXR; float nnR; float nnGIn; float nnGOut;

// 曲线族的横向缩放：上游 1 → 笑脸处 nnGIn → 下游 nnGOut
float nnSpread(float x) {
  if (x < 0.0) return mix(1.0, nnGIn, smoothstep(nnXL * 0.6, -nnR * 0.3, x));
  return mix(nnGIn, nnGOut, smoothstep(nnR * 0.35, nnXR, x));
}

float effectNeural(float t) {
  vec2 asp = vec2(u_aspect, 1.0);
  bool portrait = u_aspect < 0.95;
  // 流向 ax、横向 pe（竖屏自下而上）
  vec2 ax = portrait ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  vec2 pe = portrait ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 F = g_place * asp;
  nnR = g_size * 0.36;
  vec2 dd = g_suv * asp - F;
  float X = dot(dd, ax);
  float Y = dot(dd, pe);
  float r = length(dd);
  float cs = 1.0 / g_grid.y;                         // 一格的边长（视口高度单位）
  float H = portrait ? 0.5 * u_aspect : 0.5;         // 横向半宽
  nnXL = portrait ? -F.y : -F.x;
  nnXR = (portrait ? 1.0 : u_aspect) + nnXL;
  float sp = portrait ? 0.062 * u_aspect * 2.0 : 0.072;   // 上游的线距
  nnGIn = nnR * 0.9 / (H + 0.1);
  nnGOut = portrait ? 0.9 : 0.62;

  // 这一格落在哪条线上：把 Y 按缩放还原到上游，取最近的一条
  float g = nnSpread(X);
  float y0 = Y / g;
  float k = floor(y0 / sp + 0.5);
  float slope = k * sp * (nnSpread(X + 0.01) - nnSpread(X - 0.01)) / 0.02;
  float dist = abs(y0 - k * sp) * g / sqrt(1.0 + slope * slope);

  // ---- 前向传播的波前：从左缘推到右缘，u ≈ 0.62 时穿过笑脸 ----
  const float P = 3.6;
  float pass = floor(t / P);
  float u = fract(t / P);
  float front = mix(nnXL - 0.05, nnXR + 0.1, u / 0.92);
  float fu = (0.0 - (nnXL - 0.05)) / (nnXR + 0.15 - nnXL) * 0.92;   // 波前到笑脸中心的时刻

  float v = 0.0;
  float hit = smoothstep(fu - 0.08, fu, u) * exp(-max(u - fu, 0.0) * 5.0);
  float face = smoothstep(0.25, 0.6, g_mask);
  v = max(v, hit * face);
  g_acc = max(g_acc, hit * face * 0.9);
  if (r < nnR * 0.97) return v;
  // 只要上游落在屏幕内的那些线（屏幕外的会被收拢挤进笑脸上下）
  if (dist > 0.5 * cs || abs(k) * sp > H - 0.02) return v;

  vec2 md = (u_mouse - g_suv) * asp;
  float near = exp(-dot(md, md) * 60.0) * u_mouseActive;
  float kh = hash(vec2(k, 1.7));

  // ---- 线 + 一直往里淌的小段光 ----
  float line = 0.38 + 0.25 * near;
  float dash = fract(X * 7.0 - t * (0.35 + 0.25 * kh) + kh * 3.0);
  if (dash < 0.1) {
    line = max(line, dash < 0.05 ? 0.6 : 0.48);
    g_acc = max(g_acc, dash < 0.05 ? 0.7 : 0.2);
  }
  float wf = front - X;
  if (wf > 0.0 && wf < 0.12 && u < 0.95) {
    line = max(line, wf < 0.03 ? 0.62 : 0.46);
    g_acc = max(g_acc, wf < 0.03 ? 1.0 : 0.6);
  }
  // 下游：波前过去以后只剩一条线亮着
  float guess = floor((hash(vec2(pass, 3.3)) - 0.5) * H * 0.9 / sp + 0.5);
  if (X > 0.0 && k == guess && wf > 0.0) {
    line = max(line, 0.5);
    g_acc = max(g_acc, 0.8);
  }
  v = max(v, line);

  // ---- 层：上游 5 列节点 + 笑脸圆边（第 6 层） ----
  bool node = false;
  float li = 0.0;
  for (int i = 0; i < 5; i++) {
    float xi = mix(nnXL + 0.035, -nnR - 0.06, float(i) / 4.0);
    xi = (floor(xi / cs) + 0.5) * cs;
    if (abs(X - xi) < 0.5 * cs) { node = true; li = float(i); }
  }
  if (X < 0.0 && r < nnR * 0.97 + cs) { node = true; li = 5.0; }
  if (node) {
    float act = smoothstep(-0.01, 0.01, wf) * exp(-max(wf, 0.0) * 4.0);
    act *= step(0.3, hash(vec2(k * 7.0 + li, pass)));
    act = max(act, near);
    v = 0.72 + 0.28 * smoothstep(0.2, 0.6, act);
    g_acc = max(g_acc, smoothstep(0.35, 0.8, act));
  }
  return v;
}

// ===========================================================================
// 4 · TIMELINE —— X「thoughts in real time.」
// 几列时间线在往下刷：头像 / 名字 / 几行正文 / 互动图标，最新的一条刚进屏时
// 正文还在一个字一个字地「打出来」。底下垫着 v1 的噪声涌动，调得很淡。
// ===========================================================================
float effectChaos(vec2 uv, float t) {
  vec2 p = uv * vec2(3.2, 2.2);
  float n = wfbm(p + vec2(t * 0.35, -t * 0.22), t * 0.3);
  n = smoothstep(0.30, 0.78, n);
  n *= 0.85 + 0.15 * sin(t * 0.6);
  n += (hash(floor(uv * 90.0) + floor(t * 14.0)) - 0.5) * 0.12;
  return clamp(n, 0.0, 1.0);
}

float effectTimeline(vec2 uv, float t) {
  float bg = effectChaos(uv, t) * 0.28;
  vec2 c = floor(g_suv * g_grid);
  const float W = 26.0;
  const float SLOT = 33.0;
  const float CARD = 10.0;
  float ci = floor(c.x / SLOT);
  float lx = c.x - ci * SLOT - 2.0;
  if (lx < 0.0 || lx >= W) return bg;
  float speed = 1.6 + hash(vec2(ci, 1.0)) * 1.4;   // 行 / 秒
  float off = t * speed + hash(vec2(ci, 2.0)) * 97.0;
  float top = g_grid.y - 1.0 - c.y;                // 距屏幕顶的行数
  float r = top - off;
  float k = floor(r / CARD);
  float lr = r - k * CARD;
  float cardTop = k * CARD + off;                  // 这张卡片顶边在屏幕上的行号
  float v = 0.0;
  float nLines = 2.0 + floor(hash(vec2(k, ci + 3.0)) * 3.0);

  if (lr < 2.0) {
    if (lx < 2.0) v = 0.9;                                           // 头像
    else if (lr < 1.0 && lx >= 3.0) {
      float nameLen = 5.0 + floor(hash(vec2(k, ci + 5.0)) * 6.0);
      if (lx < 3.0 + nameLen) v = 0.72;                               // 名字
      else if (lx > 4.0 + nameLen && lx < 12.0 + nameLen) v = 0.3;   // @handle · 时间
    }
  } else if (lr < 2.0 + nLines) {
    float line = lr - 2.0;
    float len = line == nLines - 1.0 ? 6.0 + floor(hash(vec2(k, line)) * 14.0) : W - floor(hash(vec2(k, line + 9.0)) * 4.0);
    float word = hash(vec2(k * 7.0 + line, floor((lx + hash(vec2(k, line)) * 5.0) / 5.0)));
    bool gap = mod(lx + floor(word * 4.0), 6.0) < 1.0;
    // 打字：卡片越靠近顶部，正文露出的字越少
    float typed = (cardTop + 3.0) * 9.0 - line * W;
    if (lx < len && !gap && lx < typed) v = 0.46;
    if (abs(lx - typed) < 0.5 && lx < len) {
      v = 0.95;
      g_acc = 1.0;                                                      // 打字光标
    }
  } else if (lr == 3.0 + nLines) {
    if (mod(lx, 7.0) == 0.0) v = 0.34;                                 // 互动图标
    if (mod(lx, 7.0) == 1.0 && hash(vec2(k, lx)) > 0.5) v = 0.26;      // 计数
  } else if (lr == CARD - 1.0) {
    v = 0.12;                                                           // 分隔线
  }
  return max(v, bg);
}

// ===========================================================================
// 5 · GRID —— GitHub（保留 v1）
// ===========================================================================
vec3 gridBlocks(vec2 uv, float t) {
  vec2 gridUv = uv * vec2(28.0, 16.0) + vec2(0.0, 0.25);
  vec2 g = fract(gridUv);
  vec2 cell = floor(gridUv);
  float blockOn = step(0.92, hash(cell + floor(t * 2.0)));
  float edgeFade =
    smoothstep(0.02, 0.14, g.x) * smoothstep(0.98, 0.84, g.x) *
    smoothstep(0.02, 0.14, g.y) * smoothstep(0.98, 0.84, g.y);
  float ramp = smoothstep(1.05, 0.10, g.x * 0.82 + g.y * 0.28);
  float stepLayer = floor(ramp * 4.0) / 3.0;
  // x = 亮度贡献，y = 块存在，z = 块层级
  return vec3(blockOn * edgeFade * (0.45 + stepLayer * 0.50), blockOn * edgeFade, blockOn * edgeFade * stepLayer);
}

float effectGrid(vec2 uv, float t) {
  vec2 gridUv = uv * vec2(28.0, 16.0) + vec2(0.0, 0.25);
  vec2 g = fract(gridUv);
  float gx = smoothstep(0.45, 0.5, g.x) * smoothstep(0.55, 0.5, g.x);
  float gy = smoothstep(0.45, 0.5, g.y) * smoothstep(0.55, 0.5, g.y);
  float line = max(gx, gy);
  float pulse = smoothstep(0.0, 0.05, abs(fract(uv.y * 4.0 - t * 0.3) - 0.5));
  line *= 1.0 - pulse * 0.55;
  float probe = smoothstep(0.04, 0.0, abs(uv.x + uv.y - 1.0 - sin(t * 0.4) * 0.6));
  return clamp(line * 0.55 + gridBlocks(uv, t).x + probe * 0.3, 0.0, 1.0);
}

// ===========================================================================
// 6 · DRIFT —— cover「as i dreamed.」
// 底下是 v1 原样的云雾（右下那一大团就是它）；左上方的空处有几团泡泡质感的
// 小云慢慢从右往左漂过、渐显渐隐。每团由几个绕着转的小圆团叠成，轮廓有规律地
// 变形、一张一缩地呼吸；里面是实心的，用单独的泡泡字符行（· ° o O）来画。
// ===========================================================================
float effectDrift(vec2 uv, float t) {
  vec2 p = uv * vec2(2.6, 1.8) + vec2(t * 0.04, -t * 0.025);
  float n = wfbm(p, t * 0.18);
  n = smoothstep(0.32, 0.82, n);
  float vignette = smoothstep(1.15, 0.45, length(uv - 0.5));
  n *= vignette;
  n += (hash(floor(uv * 60.0) + floor(t * 6.0)) - 0.5) * 0.05;

  vec2 asp = vec2(u_aspect, 1.0);
  vec2 sp = g_suv * asp;
  vec2 c = floor(g_suv * g_grid);
  float puff = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float ph = u_time / 24.0 + fk / 3.0;
    float f = fract(ph);
    float seed = floor(ph) * 3.0 + fk;
    // 走左上方那片空处：右边是「夢」，左下是文案
    vec2 gc = vec2(mix(0.62, -0.12, f), 0.64 + fk * 0.1 + sin(f * 6.2831 + fk * 2.0) * 0.03) * asp;
    float sc = 0.8 + hash(vec2(seed, 1.0)) * 0.4;
    float breathe = 0.85 + 0.15 * sin(u_time * 0.9 + fk * 2.1);
    float d = 0.0;
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float ang = hash(vec2(seed, fj)) * 6.2831 + u_time * 0.35 * (mod(fj, 2.0) * 2.0 - 1.0);
      float r = (0.034 + hash(vec2(seed, fj + 4.0)) * 0.02) * sc * breathe;
      vec2 o = vec2(cos(ang) * 0.05, sin(ang) * 0.022) * sc;
      vec2 q = sp - gc - o;
      d += exp(-dot(q, q) / (r * r));
    }
    float body = smoothstep(0.3, 0.9, d + (fbm(sp * 14.0 + u_time * 0.1) - 0.5) * 0.35);
    puff = max(puff, body * sin(f * 3.14159));
  }
  if (puff > 0.05 && puff >= n) {
    g_alt = 1.0;
    // 实心的泡沫：每格在 ° o O 之间慢慢换
    float grain = hash(c + floor(u_time * 0.7 + hash(c) * 4.0));
    return clamp(puff * (0.62 + 0.38 * grain), 0.0, 1.0);
  }
  return clamp(n, 0.0, 1.0);
}

// ===========================================================================
// 8 · CIRCUIT —— about「engineer & daydreamer」
// 走线从屏幕两侧汇向「私」，端点落在焊盘上，数据包沿线流进来（工程师）；
// 越往屏幕外侧，走线越碎，散成往上飘的点（做梦的人）。
// ===========================================================================
float effectCircuit(vec2 uv, float t) {
  vec2 c = floor(g_suv * g_grid);
  float cx = floor(g_place.x * g_grid.x);
  float side = c.x < cx ? -1.0 : 1.0;
  float row = floor(c.y / 3.0);
  float bg = wfbm(uv * 2.5, t * 0.15) * 0.1;
  if (hash(vec2(row, side * 7.0)) < 0.4) return bg;

  float pad = floor(g_grid.y * (0.3 + hash(vec2(row, side * 11.0)) * 0.08));   // 焊盘离中心的距离
  float ax = abs(c.x - cx);
  if (ax < pad) return bg;
  float jog = pad + 4.0 + floor(hash(vec2(row, side * 3.0)) * 18.0);          // 45° 转折位置
  float d = (hash(vec2(row, side * 5.0)) > 0.5 ? 1.0 : -1.0);
  float base = row * 3.0 + 1.0;
  float along = ax - jog;
  float y = base + (along > 1.0 ? d : 0.0);
  if (along >= 0.0 && along <= 1.0) y = base + d * along;

  // 离 figure 越远越碎：走线掉格、散成往上飘的点
  float fray = smoothstep(0.34, 0.62, ax / g_grid.x);
  float v = 0.0;
  if (c.y == y) {
    bool keep = hash(c + floor(t * 1.5) * 0.37) > fray * 0.9;
    if (keep) v = ax == pad ? 1.0 : 0.56;                                       // 焊盘 / 走线
    // 数据包：从外往里流向焊盘
    float len = g_grid.x * 0.5;
    float head = pad + (1.0 - fract(t * 0.18 + hash(vec2(row, side))) ) * len;
    float dd = ax - head;
    if (dd >= 0.0 && dd < 4.0 && keep) {
      v = dd < 1.0 ? 1.0 : 0.7;
      g_acc = dd < 1.0 ? 1.0 : 0.5;
    }
  } else if (fray > 0.0 && c.y > y && c.y < y + 3.0) {
    float rise = fract(t * 0.25 + hash(vec2(c.x, row)));
    if (abs(c.y - y - rise * 3.0) < 0.5 && hash(vec2(c.x, row + 1.0)) < fray * 0.5) v = 0.3;
  }
  return max(v, bg);
}

// ===========================================================================
// 9 · METERS —— Hardware「the machinery.」
// 9950X3D 的 16 个核心 = 16 根负载柱，按 8Hz 采样跳动；柱顶描边色、带峰值保持
// （像电平表），一条虚线标出总体平均负载。
// ===========================================================================
float coreLoad(float i, float tq) {
  float base = 0.2 + 0.52 * noise(vec2(i * 3.1, tq * 0.09));
  float burst = step(0.88, hash(vec2(i, floor(tq / 20.0)))) * 0.38; // 某个核被打满一阵
  float jitter = (hash(vec2(i, tq)) - 0.5) * 0.1;
  return clamp(base + burst + jitter, 0.04, 0.98);
}

float effectMeters(float t) {
  vec2 c = floor(g_suv * g_grid);
  const float N = 16.0;
  float bw = g_grid.x / N;
  float i = floor(c.x / bw);
  float lx = c.x - floor(i * bw);
  float y0 = floor(g_grid.y * 0.1);
  float y1 = floor(g_grid.y * 0.9);
  if (c.y < y0 - 1.0 || c.y > y1) return 0.0;
  if (c.y == y0 - 1.0) return 0.45;                    // 基线
  float span = y1 - y0;
  float fy = (c.y - y0) / span;
  float tq = floor(t * 8.0);
  float load = coreLoad(i, tq);

  float avg = 0.0;
  for (int k = 0; k < 16; k++) avg += coreLoad(float(k), tq);
  avg /= 16.0;
  float v = abs(fy - avg) * span < 0.5 && mod(c.x, 3.0) < 1.0 ? 0.6 : 0.0;

  bool inner = lx >= floor(bw * 0.24) && lx < ceil(bw * 0.76);
  if (!inner) return v;
  float peak = 0.0;
  for (int k = 0; k < 12; k++) peak = max(peak, coreLoad(i, tq - float(k)) - float(k) * 0.025);

  if (fy <= load) {
    v = 0.8;
    if (fy > 0.8) g_acc = max(g_acc, 0.8);             // 高负载段换描边色
  } else {
    v = max(v, mod(c.y, 2.0) < 1.0 ? 0.16 : 0.0);       // 空槽：虚点
  }
  if (abs(fy - load) * span < 1.0) {
    v = 1.0;
    g_acc = 1.0;
  }
  if (abs(fy - peak) * span < 0.5) {
    v = max(v, 0.92);
    g_acc = 1.0;
  }
  return v;
}

// ===========================================================================
// 10 · WEB —— Links「the web of mine.」
// 以「網」为中心的蛛网：放射主丝 + 螺旋捕丝（每段是两根主丝之间的直弦），
// 交点上挂着会闪的露珠；整张网随风轻晃，光标碰到的地方会颤。
// ===========================================================================
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  vec2 pa = p - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

float webJit(float s) { return (hash(vec2(mod(s, 14.0), 1.3)) - 0.5) * 0.35; }

float effectWeb(float t) {
  vec2 asp = vec2(u_aspect, 1.0);
  vec2 p = (g_suv - g_place) * asp;
  vec2 dm = (g_suv - u_mouse) * asp;
  float near = exp(-dot(dm, dm) * 30.0) * u_mouseActive;
  p += vec2(sin(t * 37.0 + p.y * 90.0), cos(t * 41.0 + p.x * 90.0)) * 0.007 * near;
  p *= 1.0 + sin(t * 0.6) * 0.012;
  float r = length(p);
  float th = atan(p.y, p.x) + sin(t * 0.4 + r * 3.0) * 0.015;

  const float N = 14.0;
  const float TAU = 6.2831853;
  float si = floor(th / TAU * N);
  float s0 = mod(si, N);
  float a0 = (si + webJit(si)) / N * TAU;
  float a1 = (si + 1.0 + webJit(si + 1.0)) / N * TAU;
  vec2 d0 = vec2(cos(a0), sin(a0));
  vec2 d1 = vec2(cos(a1), sin(a1));

  float v = 0.0;
  // 主丝
  float ds = min(abs(d0.x * p.y - d0.y * p.x), abs(d1.x * p.y - d1.y * p.x));
  if (r > 0.04) v = max(v, smoothstep(0.009, 0.0035, ds) * 0.66);

  // 螺旋捕丝：半径 = R0 + (k + s/N) * SP
  const float R0 = 0.08;
  const float SP = 0.058;
  float kf = (r - R0) / SP - s0 / N;
  for (int dk = 0; dk < 2; dk++) {
    float k = floor(kf) + float(dk);
    if (k < 0.0 || k > 17.0) continue;
    if (hash(vec2(k, s0)) > 0.94) continue;           // 偶尔断一截
    float ra = R0 + (k + s0 / N) * SP;
    float rb = R0 + (k + (s0 + 1.0) / N) * SP;
    vec2 A = d0 * ra;
    vec2 B = d1 * rb;
    v = max(v, smoothstep(0.009, 0.0035, segDist(p, A, B)) * 0.58);
    // 露珠
    float dew = step(0.8, hash(vec2(k * 3.0 + 1.0, s0)));
    float tw = 0.55 + 0.45 * sin(t * 1.3 + hash(vec2(k, s0 + 5.0)) * 6.28);
    float bead = smoothstep(0.013, 0.005, length(p - A)) * dew;
    v = max(v, bead * (0.7 + 0.3 * tw));
    g_acc = max(g_acc, bead * tw);
  }
  return v;
}

// ===========================================================================
// 7 · THREAD —— Contact「until we meet again」· 赤い糸
// 两段红线：一段从左边进来绕「縁」一圈，另一段从右下角进来；两个线头慢慢
// 靠近又分开，始终差一点。光标靠近时，线头朝光标伸过去、几乎接上。
// ===========================================================================
vec2 catmull(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float s) {
  float s2 = s * s;
  float s3 = s2 * s;
  return 0.5 * (2.0 * p1 + (p2 - p0) * s + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * s2
              + (3.0 * p1 - p0 - 3.0 * p2 + p3) * s3);
}

vec2 wob(vec2 b, float i, float t) {
  return b + vec2(sin(t * 0.37 + i * 1.7), cos(t * 0.29 + i * 2.3)) * 0.03;
}

float strandDist(vec2 p, vec2 q0, vec2 q1, vec2 q2, vec2 q3, vec2 q4, vec2 q5, vec2 q6, vec2 q7) {
  vec2 Q[8] = vec2[8](q0, q1, q2, q3, q4, q5, q6, q7);
  float d = segDist(p, Q[0], Q[1]);
  for (int i = 1; i < 6; i++) {
    vec2 prev = Q[i];
    for (int k = 1; k <= 8; k++) {
      vec2 cur = catmull(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], float(k) / 8.0);
      d = min(d, segDist(p, prev, cur));
      prev = cur;
    }
  }
  return d;
}

float effectThread(float t) {
  vec2 asp = vec2(u_aspect, 1.0);
  vec2 p = g_suv * asp;
  vec2 C = g_place * asp;
  const float R = 0.37;

  vec2 M = vec2(0.5 * u_aspect, 0.16) + vec2(sin(t * 0.23), cos(t * 0.19)) * vec2(0.05, 0.025);
  vec2 mouse = u_mouse * asp;
  float pull = u_mouseActive * exp(-dot(mouse - M, mouse - M) * 5.0);
  M = mix(M, mouse, pull * 0.85);
  float gap = mix(0.06 + 0.04 * (0.5 + 0.5 * sin(t * 0.5)), 0.014, pull);
  vec2 EA = M - vec2(gap * 0.5, 0.0);
  vec2 EB = M + vec2(gap * 0.5, 0.0);

  // 左段：屏外 → 绕 figure 顺时针一圈 → 线头（回程和去程交叉，打出一个圈）
  vec2 a2 = wob(C + vec2(-0.2, R * 0.86), 1.0, t);
  vec2 a3 = wob(C + vec2(R * 0.95, R * 0.2), 2.0, t);
  vec2 a4 = wob(C + vec2(R * 0.5, -R * 0.95), 3.0, t);
  vec2 a5 = wob(C + vec2(-R * 0.55, -R * 0.5), 4.0, t);
  float dA = strandDist(p, vec2(-0.4, C.y - 0.05), vec2(-0.02, C.y + 0.08), a2, a3, a4, a5, EA,
                        EA + (EA - a5) * 0.3);
  // 右段：右下角进来 → 线头
  vec2 b0 = vec2(u_aspect * 0.9, -0.4);
  vec2 b1 = vec2(u_aspect * 0.86, -0.02);
  vec2 b2 = wob(vec2(u_aspect * 0.78, 0.2), 5.0, t);
  vec2 b3 = wob(vec2(M.x + 0.2, M.y + 0.08), 6.0, t);
  float dB = strandDist(p, b0 + vec2(0.0, -0.3), b0, b1, b2, b3, EB, EB + (EB - b3) * 0.3,
                        EB + (EB - b3) * 0.6);

  float d = min(dA, dB);
  float line = smoothstep(0.0085, 0.003, d);
  float tip = smoothstep(0.022, 0.0, min(length(p - EA), length(p - EB)));
  // 背景：极淡的星尘
  vec2 c = floor(g_suv * g_grid);
  float dust = step(0.988, hash(c + 1.7)) * (0.16 + 0.12 * sin(t * 1.4 + hash(c) * 6.28));
  float v = max(dust, max(line * 0.95, tip));
  g_acc = max(g_acc, max(line, tip));
  return v;
}

float scene(int eff, vec2 uv, float t) {
  if (eff == 1) return effectFilm(t);
  if (eff == 2) return effectInvaders(t);
  if (eff == 3) return effectNeural(t);
  if (eff == 4) return effectTimeline(uv, t);
  if (eff == 5) return effectGrid(uv, t);
  if (eff == 6) return effectDrift(uv, t);
  if (eff == 7) return effectThread(t);
  if (eff == 8) return effectCircuit(uv, t);
  if (eff == 9) return effectMeters(t);
  if (eff == 10) return effectWeb(t);
  return 0.0;
}

// 手绘类 effect（胶片 / 游戏 / 网络 / 蛛网 / 红线）本身就是画面主体，mask 外少压一点
float outsideAtten(int eff) {
  if (eff == 5 || eff == 7) return 1.0;
  if (eff == 1 || eff == 2 || eff == 3 || eff == 4 || eff == 8 || eff == 10) return 0.9;
  if (eff == 9) return 0.95;
  if (eff == 6) return 0.72;
  return 0.6;
}

// 返回 (lit, mask, fill, accent)
vec4 sampleScene(int eff, float speed, float maskLayer, vec3 place, vec2 uv) {
  if (eff == 0) return vec4(0.0);
  float t = u_time * speed + 8.0;
  // mask 先算出来：effect 可以读 g_mask 和 figure 本身联动（比如只让 🤗 的字符闪）
  float m = 0.0;
  if (maskLayer >= 0.0) {
    vec2 q = (uv - place.xy) * vec2(u_aspect, 1.0) / place.z + 0.5;
    if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) {
      m = texture(u_masks, vec3(q.x, 1.0 - q.y, maskLayer)).r;
    }
  }
  // v1 的几个 effect 以 figure 中心为原点（保持 0..1 坐标手感）；新 effect 读 g_* 上下文
  vec2 euv = uv - place.xy + 0.5;
  g_suv = uv;
  g_place = place.xy;
  g_size = place.z;
  g_grid = u_res / u_cellPx;
  g_mask = m;
  g_acc = 0.0;
  g_fill = 0.0;
  g_alt = 0.0;
  float lum = scene(eff, euv, t);

  bool isGrid = eff == 5;
  float floorV = isGrid ? 0.72 : 0.78;
  float boost = isGrid ? 0.28 : 0.3;
  float outside = maskLayer >= 0.0 ? outsideAtten(eff) : 1.0;
  float litIn = clamp(max(lum, m * floorV) + m * boost, 0.0, 1.0);
  // figure 内部慢速流动的纹理：字形在亮度梯度上来回，figure 不再是单一字符铺满
  vec2 fq = (uv - place.xy) * vec2(u_aspect, 1.0) / place.z;
  float tex = fbm(fq * 7.0 + vec2(u_time * 0.07, -u_time * 0.05)) - 0.5;
  litIn = clamp(litIn + tex * 0.5 * m, 0.0, 1.0);
  float lit = mix(lum * outside, litIn, smoothstep(0.0, 0.85, m));

  float fill = g_fill;
  if (isGrid) {
    vec3 gb = gridBlocks(euv, t);
    fill = gb.y * (0.38 + gb.z * 0.3) * (1.0 - smoothstep(0.1, 0.7, m) * 0.3);
  }
  // 最亮的一撮字符用描边色，让画面有「热点」；effect 也可以自己指定（g_acc）
  float accent = max(smoothstep(0.9, 1.0, lum) * (1.0 - m * 0.6) * 0.8, g_acc);
  return vec4(lit, m, fill, accent);
}

// 稀疏的线稿类背景（蛛网 / 侵略者 / 神经网络）压太狠会整块消失，单独调轻
float scrimStrength(int eff) {
  if (eff == 10) return 0.4;
  if (eff == 2 || eff == 3) return 0.5;
  return 0.78;
}

float scrimMask(vec4 r, vec2 uv, vec2 asp) {
  if (r.z <= r.x) return 0.0;
  vec2 c = (r.xy + r.zw) * 0.5;
  vec2 hsz = abs(r.zw - r.xy) * 0.5;
  vec2 q = abs(uv - c) - hsz;
  float sd = length(max(q * asp, 0.0)) + min(max(q.x * asp.x, q.y), 0.0);
  return smoothstep(0.14, -0.02, sd);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) * u_cellPx / u_res;
  vec2 asp = vec2(u_aspect, 1.0);

  // ---- wipe：每个 cell 的翻转时刻 w（0 = 最先翻转）----
  float w;
  if (u_wipeRadial > 0.5) {
    w = length((uv - u_wipeOrigin) * asp) / (0.75 * u_aspect + 0.25);
  } else {
    vec2 p = (uv - 0.5) * asp;
    w = 0.5 - dot(p, u_wipeDir) / (u_aspect * abs(u_wipeDir.x) + abs(u_wipeDir.y) + 1e-4);
  }
  float n = fbm(uv * asp * 2.6 + 11.0);
  w = clamp(mix(w, n, 0.34) + (hash(cell) - 0.5) * 0.06, 0.0, 1.0);
  float band = 0.24;
  float front = u_progress * (1.0 + 2.0 * band) - band;
  float s = smoothstep(w - band, w + band, front);
  float turb = 1.0 - abs(2.0 * s - 1.0);
  turb = turb * turb * (3.0 - 2.0 * turb) * u_turbAmt;

  // ---- 光标尾迹 ----
  vec4 E = texelFetch(u_energy, ivec2(cell), 0);
  float e = E.r;
  vec2 eDir = (E.gb - 0.5) * 2.0;

  // ---- 点击涟漪 ----
  float rip = 0.0;
  vec2 ripPush = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 R = u_rip[i];
    if (R.w <= 0.0) continue;
    float age = u_time - R.z;
    if (age < 0.0 || age > 3.0) continue;
    vec2 d = (uv - R.xy) * asp;
    float dist = length(d);
    float radius = age * 0.7;
    float ring = exp(-pow((dist - radius) / (0.04 + age * 0.03), 2.0)) * exp(-age * 1.3) * R.w;
    rip += ring;
    ripPush += (d / max(dist, 1e-4)) / asp * ring;
  }

  // ---- 位移：湍流 + 散开 + 尾迹推动 + 涟漪 ----
  vec2 flow = vec2(noise(uv * asp * 5.0 + u_time * 0.7),
                   noise(uv * asp * 5.0 - u_time * 0.6 + 17.0)) - 0.5;
  float agit0 = sin(3.14159 * u_progress) * u_turbAmt;
  vec2 disp = flow * (turb * 0.10 + agit0 * 0.012) + hashDir(cell) * turb * 0.03
            - u_wipeDir / asp * turb * 0.04;
  disp += eDir / asp * e * 0.03 + ripPush * 0.025;
  disp.x -= u_drag * 0.035;
  vec2 suv = uv + disp;

  vec4 A = vec4(0.0);
  vec4 B = vec4(0.0);
  float altA = 0.0;
  float altB = 0.0;
  if (s < 0.999) { A = sampleScene(u_effA, u_speedA, u_maskA, u_placeA, suv); altA = g_alt; }
  if (s > 0.001) { B = sampleScene(u_effB, u_speedB, u_maskB, u_placeB, suv); altB = g_alt; }
  vec4 R = mix(A, B, s);
  float alt = s < 0.5 ? altA : altB;
  float lit = R.x;

  // ---- 光标透镜：鼠标附近微亮 ----
  vec2 dm = (uv - u_mouse) * asp;
  float reach = exp(-dot(dm, dm) * 55.0) * u_mouseActive;

  // 转场一开始整屏就「躁动」起来（两端为 0，中段最强），不用等 wipe 前沿扫到
  float agit = sin(3.14159 * u_progress) * u_turbAmt;
  // 每 ~9 秒一道扫描线自下而上刷过 figure
  float scanY = fract(u_time / 9.0) * 1.6 - 0.3;
  float scan = exp(-pow((uv.y - scanY) / 0.018, 2.0)) * R.y;

  float spark = hash(cell + floor(u_time * 12.0));
  lit = clamp(lit + e * 0.5 + rip * 0.6 + reach * 0.16 + (turb * 0.18 + agit * 0.08) * spark + scan * 0.35, 0.0, 1.0);
  float heat = clamp(turb * 0.95 + e * 0.85 + rip * 0.9 + agit * 0.22 * step(0.72, spark) + scan * 0.5, 0.0, 1.0);

  // 上下边缘让位给 HUD / 导航
  float edge = smoothstep(0.0, 0.11, uv.y) * smoothstep(1.0, 0.9, uv.y);
  lit *= mix(0.3, 1.0, edge);

  // ---- 阅读区 scrim：文字压着的地方让字符场安静下来 ----
  // A / B 两屏各有一块，按这个 cell 的 wipe 进度 s 取用：暗区跟着转场前沿一格格换位，
  // 而不是整块矩形从左边滑到右边。
  if (u_scrimAmt > 0.0) {
    float kA = max(scrimMask(u_scrimA, uv, asp), scrimMask(u_scrimA2, uv, asp) * 0.85) * scrimStrength(u_effA);
    float kB = max(scrimMask(u_scrimB, uv, asp), scrimMask(u_scrimB2, uv, asp) * 0.85) * scrimStrength(u_effB);
    float k = mix(kA, kB, s) * u_scrimAmt;
    lit *= 1.0 - k;
    heat *= 1.0 - k * 0.64;
  }

  o0 = vec4(lit, R.y, s, heat);
  o1 = vec4(R.z, R.w, alt, 1.0);
}`;

// ---------------------------------------------------------------------------
// 3. BLUR —— 可分离高斯。首遍从 field 取 (lit², s)，次遍直接糊
// ---------------------------------------------------------------------------
export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_grid;
uniform vec2 u_step;     // (1,0) 或 (0,1)，单位 cell
uniform float u_first;

vec2 fetch(vec2 c) {
  ivec2 ic = ivec2(clamp(c, vec2(0.0), u_grid - 1.0));
  vec4 v = texelFetch(u_src, ic, 0);
  return u_first > 0.5 ? vec2(v.r * v.r, v.b) : v.rg;
}

void main() {
  vec2 c = floor(gl_FragCoord.xy);
  float wts[5] = float[](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  vec2 acc = fetch(c) * wts[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = u_step * float(i) * 1.6;
    acc += (fetch(c + off) + fetch(c - off)) * wts[i];
  }
  o = vec4(acc, 0.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// 4. COMPOSE —— 全分辨率出字形
// ---------------------------------------------------------------------------
export const COMPOSE_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_field;
uniform sampler2D u_style;
uniform sampler2D u_glowTex;
uniform sampler2D u_atlas;
uniform vec2  u_res;
uniform vec2  u_grid;
uniform float u_cellPx;
uniform float u_time;
uniform float u_aspect;

uniform vec3 u_inkA;
uniform vec3 u_inkB;
uniform vec3 u_glyphA;
uniform vec3 u_glyphB;
uniform vec3 u_glowA;
uniform vec3 u_glowB;
uniform vec3 u_accA;
uniform vec3 u_accB;
uniform float u_glowAmtA;
uniform float u_glowAmtB;
uniform vec2 u_rowLenA;      // atlas 行号, 字符数
uniform vec2 u_rowLenB;
uniform vec2 u_rowLenScr;    // 乱码行
uniform vec2 u_rowLenAlt;    // 泡泡行
uniform float u_intro;       // 0..1 开场淡入

${COMMON}

void main() {
  vec2 px = floor(gl_FragCoord.xy);
  vec2 cell = floor(px / u_cellPx);
  vec2 local = px - cell * u_cellPx;
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 guv = (cell + 0.5) / u_grid;

  vec4 F = texelFetch(u_field, ivec2(cell), 0);
  vec4 S = texelFetch(u_style, ivec2(cell), 0);
  vec2 G = texture(u_glowTex, uv * u_res / (u_grid * u_cellPx)).rg;
  float lit = F.r;
  float s = F.b;
  float heat = F.a;

  float sB = clamp(G.g, 0.0, 1.0);
  vec3 ink = mix(u_inkA, u_inkB, sB);
  vec3 glyphC = mix(u_glyphA, u_glyphB, s);
  vec3 glowC = mix(u_glowA, u_glowB, s);
  vec3 accC = mix(u_accA, u_accB, s);
  vec3 glowBg = mix(u_glowA, u_glowB, sB);
  float glowAmt = mix(u_glowAmtA, u_glowAmtB, sB);

  // ---- 字形选择 ----
  vec2 rl = s < 0.5 ? u_rowLenA : u_rowLenB;
  float gi = floor(lit * (rl.y - 1.0) + 0.5);
  if (S.b > 0.5) {
    // 泡泡行：mask 外的压暗会把亮度压低，这里放大回来，让实心处落在 o / O
    rl = u_rowLenAlt;
    gi = floor(clamp(lit * 1.4, 0.0, 1.0) * (rl.y - 1.0) + 0.5);
  }
  float tick = floor(u_time * 14.0);
  float hs = hash(cell + tick * 0.37);
  if (hs < heat * 0.8 && lit > 0.04) {
    // 乱码行没有空格，gi 从 1 起跳，保证下面的 gi >= 1 判断统一
    rl = u_rowLenScr;
    gi = 1.0 + floor(hash(cell * 1.7 + tick) * (rl.y - 1.0));
  }
  float a = 0.0;
  if (gi >= 1.0) {
    ivec2 tp = ivec2(int(gi * u_cellPx + local.x), int(rl.x * u_cellPx + (u_cellPx - 1.0 - local.y)));
    a = texelFetch(u_atlas, tp, 0).a;
  }

  // ---- 底色：墨色 + 暗角 + 极淡的纵向渐变 ----
  vec2 cp = (uv - 0.5) * vec2(u_aspect, 1.0);
  float vig = smoothstep(1.35, 0.25, length(cp));
  vec3 col = ink * (0.55 + 0.45 * vig) * (0.94 + 0.06 * uv.y);

  // 格子底色块（GitHub grid）
  col = mix(col, mix(ink, glyphC, 0.2), S.r * 0.6);

  // 光晕
  col += glowBg * G.r * 0.42 * glowAmt;

  // ---- 字形颜色 ----
  float cm = pow(clamp(lit, 0.0, 1.0), 1.25);
  vec3 gcol = mix(ink * 2.4 + 0.035, glyphC, cm) * (0.62 + lit * 0.6);
  gcol = mix(gcol, accC * 1.2, S.g);
  gcol = mix(gcol, mix(glowC, vec3(1.0), 0.4), heat * 0.6);
  float ga = a * clamp(0.3 + lit * 1.15, 0.0, 1.0);
  col = mix(col, gcol, ga);

  // 颗粒 + 开场淡入
  col += (hash(px + fract(u_time * 7.0) * 311.0) - 0.5) * 0.022;
  col *= u_intro;
  o = vec4(max(col, 0.0), 1.0);
}`;

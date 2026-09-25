import {
  QUAD_VERT,
  ENERGY_FRAG,
  FIELD_FRAG,
  BLUR_FRAG,
  COMPOSE_FRAG,
} from "./shaders";
import { buildAtlas, charsetLength, SCRAMBLE, SCRAMBLE_ROW } from "./atlas";
import { Invaders } from "./invaders";

/** Steam 屏的 effect id：它的游戏状态在 CPU 上跑，只在这一屏可见时推进 */
const EFFECT_INVADERS = 2;

export type RGB = [number, number, number];

/** 一屏在字符场里的全部描述 */
export type SceneDef = {
  effect: number;
  speed: number;
  /** mask 层号（masks 数组下标），-1 = 无 */
  mask: number;
  /** 文案在哪一侧；figure 放在另一侧 */
  text: "left" | "right";
  /** figure 尺寸倍率（默认 1）：背景本身是主角的屏把 figure 缩小一点 */
  figScale?: number;
  ink: RGB;
  glyph: RGB;
  glow: RGB;
  /** effect 指定「描边」的字符用这个色（Contact 的红线）；默认同 glow */
  accent: RGB;
  glowAmt: number;
};

type Mode = "idle" | "auto" | "gesture" | "return";

type Uniforms = Record<string, WebGLUniformLocation | null>;
type Prog = { p: WebGLProgram; u: Uniforms };

type Surface = { tex: WebGLTexture[]; fbo: WebGLFramebuffer };

const MASK_SIZE = 512;
const MORPH_MS = 1250;
const REDUCED_MORPH_MS = 320;
const INTRO_MS = 2100;

/** 前沿推进曲线：以匀速为主、两端略缓，让 wipe 在整个时长里都看得见 */
const ease = (t: number) => 0.4 * t + 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * t));

/**
 * 字符场渲染引擎。1 个 WebGL2 context、1 个 RAF。
 *
 * 状态机：屏幕上永远是「scene A → scene B，进度 p」。
 *   idle     A === B，p = 0
 *   auto     p 按时间推进到 1，然后 A := B
 *   gesture  拖拽 / 触控板横扫中：p 跟手（最多预览到 0.42），B = 手势指向的相邻屏
 *   return   手势取消：p 回弹到 0
 * 中途改目标：p < 0.5 直接换 B；否则 A := B 再重新开始（字符都在乱码态，看不出跳变）。
 */
export class GlyphEngine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private scenes: SceneDef[];

  private progs!: { energy: Prog; field: Prog; blur: Prog; compose: Prog };
  private vao!: WebGLVertexArrayObject;
  private atlasTex!: WebGLTexture;
  private maskTex!: WebGLTexture;
  private energy: Surface[] = [];
  private energyIdx = 0;
  private field!: Surface;
  private glowH!: Surface;
  private glowV!: Surface;

  private cellCss: () => number;
  private cellPx = 10;
  private gridW = 1;
  private gridH = 1;
  private scale = 1;

  // ---- 状态 ----
  private a = -1;
  private b = -1;
  private p = 0;
  private mode: Mode = "idle";
  private radial = false;
  private dirX = 1;
  private dur = MORPH_MS;
  private gestureAmt = 0;
  private dragSm = 0;
  private dragTarget = 0;
  private booted = false;
  private intro = 0;
  /** 目录打开时 figure 平移到右侧（0..1 平滑） */
  private aside = 0;
  private asideTarget = 0;

  private mouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, tx: 0.5, ty: 0.5, act: 0, tact: 0 };
  private ripples: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  private ripIdx = 0;
  private invaders = new Invaders();
  /** 每一屏文案块的矩形（uv，x0 y0 x1 y1），Carousel 一次量好全部 */
  private scrims: number[][] = [];
  private scrimAmt = 0;
  private scrimAmtTarget = 0;

  private raf = 0;
  private t0 = performance.now();
  private last = 0;
  private reduced = false;
  private disposed = false;
  private hidden = false;
  private cleanup: (() => void)[] = [];

  readonly ready: Promise<void>;

  constructor(
    canvas: HTMLCanvasElement,
    opts: { scenes: SceneDef[]; masks: string[]; cellCss: () => number },
  ) {
    this.canvas = canvas;
    this.scenes = opts.scenes;
    this.cellCss = opts.cellCss;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = mq.matches;
    const onMq = () => (this.reduced = mq.matches);
    mq.addEventListener("change", onMq);
    this.cleanup.push(() => mq.removeEventListener("change", onMq));

    this.initGl();
    this.resize();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());

    const onVis = () => (this.hidden = document.hidden);
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));

    // 字体到位后按真正的 Iosevka 重建 atlas
    const fontsReady = (async () => {
      try {
        await document.fonts.load(`500 20px "Kissa Mono"`);
        await document.fonts.ready;
      } catch {
        /* 字体失败就用 fallback 等宽 */
      }
      if (!this.disposed) this.uploadAtlas();
    })();

    const masksReady = Promise.all(
      opts.masks.map((url, layer) => this.loadMask(url, layer).catch(() => {})),
    );
    this.ready = Promise.all([fontsReady, masksReady]).then(() => undefined);

    this.raf = requestAnimationFrame(this.frame);
  }

  // ======================================================================
  // 公开 API
  // ======================================================================

  /** 开场：从虚空径向凝聚到第 index 屏 */
  boot(index: number) {
    if (this.booted) return;
    this.booted = true;
    this.a = -1;
    this.b = index;
    this.p = 0;
    this.mode = "auto";
    this.radial = true;
    this.dur = this.reduced ? REDUCED_MORPH_MS : INTRO_MS;
  }

  setTarget(i: number) {
    if (!this.booted) return;
    if (this.mode === "idle") {
      if (i === this.a) return;
      this.b = i;
      this.p = 0;
    } else if (this.mode === "gesture" || this.mode === "return") {
      if (i !== this.b) {
        if (i === this.a) {
          this.mode = "return";
          return;
        }
        this.b = i;
        this.p = 0;
      }
    } else {
      if (i === this.b) return;
      if (i === this.a) {
        // 半路折返：交换 A/B、p 取补，wipe 倒放（s' = 1 - s），视觉连续
        this.a = this.b;
        this.b = i;
        this.p = 1 - this.p;
      } else if (this.p < 0.5) {
        this.b = i;
      } else {
        this.a = this.b;
        this.b = i;
        this.p = 0;
      }
    }
    this.mode = "auto";
    this.dur = this.reduced ? REDUCED_MORPH_MS : MORPH_MS;
    this.dirX = this.b > this.a ? 1 : -1;
    // 开场的径向凝聚被打断时（A 仍是虚空）保持径向，否则切回方向 wipe
    if (this.a >= 0) this.radial = false;
  }

  /** 拖拽 / 横扫预览。target = null 表示手势结束（未提交） */
  setGesture(target: number | null, amount: number, drag: number) {
    this.dragTarget = drag;
    if (!this.booted || this.mode === "auto") return;
    if (target !== null && target !== this.a && target >= 0 && target < this.scenes.length) {
      if (this.b !== target) {
        this.b = target;
        this.p = 0;
      }
      this.mode = "gesture";
      this.gestureAmt = Math.max(0, Math.min(1, amount));
      this.dirX = target > this.a ? 1 : -1;
      this.radial = false;
    } else if (this.mode === "gesture") {
      this.mode = "return";
    }
  }

  /** 目录打开：figure 让到右侧，给左边的列表腾地方 */
  setAside(on: boolean) {
    this.asideTarget = on ? 1 : 0;
  }

  setPointer(xCss: number, yCss: number, active: boolean) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.tx = (xCss - r.left) / r.width;
    this.mouse.ty = 1 - (yCss - r.top) / r.height;
    this.mouse.tact = active ? 1 : 0;
  }

  ripple(xCss: number, yCss: number, amp = 1) {
    if (this.reduced) return;
    const r = this.canvas.getBoundingClientRect();
    this.ripples[this.ripIdx] = [
      (xCss - r.left) / r.width,
      1 - (yCss - r.top) / r.height,
      this.now(),
      amp,
    ];
    this.ripIdx = (this.ripIdx + 1) % this.ripples.length;
  }

  /** 每一屏的阅读区（CSS 像素矩形，下标 = 屏序号；null = 这屏没有） */
  setScrims(rects: ({ left: number; top: number; right: number; bottom: number } | null)[]) {
    const r = this.canvas.getBoundingClientRect();
    this.scrims = rects.map((rc) =>
      rc
        ? [
            (rc.left - r.left) / r.width,
            1 - (rc.bottom - r.top) / r.height,
            (rc.right - r.left) / r.width,
            1 - (rc.top - r.top) / r.height,
          ]
        : [0, 0, 0, 0],
    );
  }

  /** 整体开关（目录打开时关掉，figure 会让到右侧） */
  setScrimOn(on: boolean) {
    this.scrimAmtTarget = on ? 1 : 0;
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    const gl = this.gl;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // ======================================================================
  // GL 初始化
  // ======================================================================

  private compile(type: number, src: string) {
    const gl = this.gl;
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

  private program(frag: string, names: string[]): Prog {
    const gl = this.gl;
    const p = gl.createProgram()!;
    const vs = this.compile(gl.VERTEX_SHADER, QUAD_VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, frag);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Link failed: " + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const u: Uniforms = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  private initGl() {
    const gl = this.gl;
    this.progs = {
      energy: this.program(ENERGY_FRAG, [
        "u_prev", "u_res", "u_cellPx", "u_aspect", "u_m0", "u_m1", "u_splat", "u_decay",
      ]),
      field: this.program(FIELD_FRAG, [
        "u_res", "u_cellPx", "u_time", "u_aspect",
        "u_effA", "u_effB", "u_speedA", "u_speedB", "u_maskA", "u_maskB", "u_placeA", "u_placeB",
        "u_progress", "u_wipeDir", "u_wipeRadial", "u_wipeOrigin", "u_turbAmt",
        "u_masks", "u_energy", "u_mouse", "u_mouseActive", "u_rip", "u_scrimA", "u_scrimB", "u_scrimAmt", "u_drag",
        "u_inv", "u_invGap", "u_invKill", "u_invBoom", "u_ship", "u_shots",
      ]),
      blur: this.program(BLUR_FRAG, ["u_src", "u_grid", "u_step", "u_first"]),
      compose: this.program(COMPOSE_FRAG, [
        "u_field", "u_style", "u_glowTex", "u_atlas", "u_res", "u_grid", "u_cellPx", "u_time", "u_aspect",
        "u_inkA", "u_inkB", "u_glyphA", "u_glyphB", "u_glowA", "u_glowB", "u_accA", "u_accB",
        "u_glowAmtA", "u_glowAmtB",
        "u_rowLenA", "u_rowLenB", "u_rowLenScr", "u_intro",
      ]),
    };

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // mask 纹理数组：每个 figure 一层，mount 时全部常驻，切屏零上传
    this.maskTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, MASK_SIZE, MASK_SIZE, Math.max(1, this.maskCount()));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.atlasTex = gl.createTexture()!;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  private maskCount() {
    return this.scenes.reduce((m, s) => Math.max(m, s.mask + 1), 0);
  }

  private async loadMask(url: string, layer: number) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mask ${url}: HTTP ${res.status}`);
    const bitmap = await createImageBitmap(await res.blob(), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    // ImageBitmap 直接做 TexImageSource 在 Chrome 上有坑（v1 踩过），统一走 canvas
    const c = document.createElement("canvas");
    c.width = MASK_SIZE;
    c.height = MASK_SIZE;
    c.getContext("2d")!.drawImage(bitmap, 0, 0, MASK_SIZE, MASK_SIZE);
    bitmap.close();
    if (this.disposed) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, MASK_SIZE, MASK_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, c,
    );
  }

  private uploadAtlas() {
    const gl = this.gl;
    const atlas = buildAtlas(this.cellPx);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private surface(count: number, linear: boolean): Surface {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex: WebGLTexture[] = [];
    for (let i = 0; i < count; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.gridW, this.gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  private freeSurface(s?: Surface) {
    if (!s) return;
    const gl = this.gl;
    s.tex.forEach((t) => gl.deleteTexture(t));
    gl.deleteFramebuffer(s.fbo);
  }

  private resize = () => {
    const canvas = this.canvas;
    const cssW = canvas.clientWidth || window.innerWidth || 1;
    const cssH = canvas.clientHeight || window.innerHeight || 1;
    // 两段式渲染后逐像素开销很低，可以吃满 Retina（上限 2x / 420 万像素）
    let scale = Math.min(2, window.devicePixelRatio || 1);
    const MAX = 4_200_000;
    if (cssW * cssH * scale * scale > MAX) scale = Math.sqrt(MAX / (cssW * cssH));
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    const cellPx = Math.max(6, Math.round(this.cellCss() * scale));
    const gridW = Math.ceil(w / cellPx);
    const gridH = Math.ceil(h / cellPx);
    const cellChanged = cellPx !== this.cellPx;
    const gridChanged = gridW !== this.gridW || gridH !== this.gridH || !this.field;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.scale = scale;
    this.cellPx = cellPx;
    this.gridW = gridW;
    this.gridH = gridH;
    if (gridChanged) {
      this.energy.forEach((s) => this.freeSurface(s));
      this.freeSurface(this.field);
      this.freeSurface(this.glowH);
      this.freeSurface(this.glowV);
      this.energy = [this.surface(1, false), this.surface(1, false)];
      this.field = this.surface(2, false);
      this.glowH = this.surface(1, true);
      this.glowV = this.surface(1, true);
    }
    if (cellChanged || gridChanged) this.uploadAtlas();
  };

  // ======================================================================
  // 帧循环
  // ======================================================================

  private now() {
    return ((performance.now() - this.t0) / 1000) % 3600;
  }

  private place(i: number): [number, number, number] {
    const s = this.scenes[i];
    const aspect = this.canvas.width / this.canvas.height;
    if (aspect < 0.95) {
      // 竖屏：figure 在上半部，文案压在下方；文案多的屏（列表类）figure 再往上收
      return s?.text === "right"
        ? [0.5, 0.815, Math.min(0.6 * aspect, 0.3)]
        : [0.5, 0.67, Math.min(0.92 * aspect, 0.5)];
    }
    const size = Math.min(0.8, 0.5 * aspect) * (s?.figScale ?? 1);
    const cx = s?.text === "right" ? 0.3 : 0.675;
    const k = this.aside * this.aside * (3 - 2 * this.aside);
    return [cx + (0.8 - cx) * k, 0.53, size * (1 - 0.12 * k)];
  }

  private update(dt: number) {
    switch (this.mode) {
      case "auto":
        this.p += (dt * 1000) / this.dur;
        if (this.p >= 1) {
          this.a = this.b;
          this.p = 0;
          this.mode = "idle";
          this.radial = false;
        }
        break;
      case "gesture":
        this.p += (this.gestureAmt * 0.42 - this.p) * Math.min(1, dt * 14);
        break;
      case "return":
        this.p -= dt / 0.38;
        if (this.p <= 0) {
          this.p = 0;
          this.mode = "idle";
          this.b = this.a;
        }
        break;
    }
    if (this.booted) this.intro = Math.min(1, this.intro + dt / 0.5);
    const as = dt / 0.7;
    this.aside = this.asideTarget > this.aside
      ? Math.min(this.asideTarget, this.aside + as)
      : Math.max(this.asideTarget, this.aside - as);
    this.dragSm += (this.dragTarget - this.dragSm) * Math.min(1, dt * 10);

    const m = this.mouse;
    m.px = m.x;
    m.py = m.y;
    const k = Math.min(1, dt * 16);
    m.x += (m.tx - m.x) * k;
    m.y += (m.ty - m.y) * k;
    m.act += (m.tact - m.act) * Math.min(1, dt * 6);

    this.scrimAmt += (this.scrimAmtTarget - this.scrimAmt) * Math.min(1, dt * 7);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.hidden || this.disposed) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    if (this.last && now - this.last < 1000 / 61) return;
    this.last = now;
    this.update(dt);
    this.render(dt);
  };

  private render(dt: number) {
    const gl = this.gl;
    const { energy, blur, compose } = this.progs;
    const field = this.field;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const aspect = W / H;
    const t = this.now();

    gl.bindVertexArray(this.vao);

    // ---- 1. energy ----
    const src = this.energy[this.energyIdx];
    const dst = this.energy[1 - this.energyIdx];
    this.energyIdx = 1 - this.energyIdx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.gridW, this.gridH);
    gl.useProgram(energy.p);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, src.tex[0]);
    gl.uniform1i(energy.u.u_prev, 2);
    gl.uniform2f(energy.u.u_res, W, H);
    gl.uniform1f(energy.u.u_cellPx, this.cellPx);
    gl.uniform1f(energy.u.u_aspect, aspect);
    const m = this.mouse;
    gl.uniform2f(energy.u.u_m0, m.px, m.py);
    gl.uniform2f(energy.u.u_m1, m.x, m.y);
    const speed = Math.hypot((m.x - m.px) * aspect, m.y - m.py) / Math.max(dt, 1e-3);
    const splat = this.reduced ? 0 : Math.min(0.7, speed * 0.55) * m.act;
    gl.uniform1f(energy.u.u_splat, splat);
    gl.uniform1f(energy.u.u_decay, Math.pow(0.935, dt * 60));
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ---- 2. field ----
    const a = this.a;
    const b = this.mode === "idle" ? this.a : this.b;
    const sa = this.scenes[a];
    const sb = this.scenes[b] ?? sa;
    const pa = a >= 0 ? this.place(a) : this.place(b >= 0 ? b : 0);
    const pb = b >= 0 ? this.place(b) : pa;
    const prog = this.mode === "idle" ? 0 : ease(Math.max(0, Math.min(1, this.p)));

    gl.bindFramebuffer(gl.FRAMEBUFFER, field.fbo);
    gl.viewport(0, 0, this.gridW, this.gridH);
    gl.useProgram(this.progs.field.p);
    const fu = this.progs.field.u;
    gl.uniform2f(fu.u_res, W, H);
    gl.uniform1f(fu.u_cellPx, this.cellPx);
    gl.uniform1f(fu.u_time, t);
    gl.uniform1f(fu.u_aspect, aspect);
    gl.uniform1i(fu.u_effA, sa ? sa.effect : 0);
    gl.uniform1i(fu.u_effB, sb ? sb.effect : 0);
    gl.uniform1f(fu.u_speedA, sa?.speed ?? 0);
    gl.uniform1f(fu.u_speedB, sb?.speed ?? 0);
    gl.uniform1f(fu.u_maskA, sa ? sa.mask : -1);
    gl.uniform1f(fu.u_maskB, sb ? sb.mask : -1);
    gl.uniform3f(fu.u_placeA, pa[0], pa[1], pa[2]);
    gl.uniform3f(fu.u_placeB, pb[0], pb[1], pb[2]);
    gl.uniform1f(fu.u_progress, prog);
    gl.uniform2f(fu.u_wipeDir, this.dirX, 0.22);
    gl.uniform1f(fu.u_wipeRadial, this.radial ? 1 : 0);
    gl.uniform2f(fu.u_wipeOrigin, pb[0], pb[1]);
    gl.uniform1f(fu.u_turbAmt, this.reduced ? 0.25 : 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.uniform1i(fu.u_masks, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex[0]);
    gl.uniform1i(fu.u_energy, 2);
    gl.uniform2f(fu.u_mouse, m.x, m.y);
    gl.uniform1f(fu.u_mouseActive, m.act);
    gl.uniform4fv(fu.u_rip, this.ripples.flat());
    const none = [0, 0, 0, 0];
    gl.uniform4fv(fu.u_scrimA, this.scrims[a] ?? none);
    gl.uniform4fv(fu.u_scrimB, this.scrims[b] ?? none);
    gl.uniform1f(fu.u_scrimAmt, this.scrimAmt);
    gl.uniform1f(fu.u_drag, this.dragSm);
    const inv = this.invaders;
    if (sa?.effect === EFFECT_INVADERS || sb?.effect === EFFECT_INVADERS) {
      inv.layout(this.gridW, this.gridH);
      inv.update(dt, m.x, m.act > 0.5);
    }
    gl.uniform4f(fu.u_inv, inv.x, inv.yTop, inv.frame, inv.cols);
    gl.uniform2f(fu.u_invGap, inv.gapX, inv.gapY);
    gl.uniform1i(fu.u_invKill, inv.kill);
    gl.uniform4f(fu.u_invBoom, inv.boom.col, inv.boom.row, inv.boom.age, inv.boom.age < 0.4 ? 1 : 0);
    gl.uniform2f(fu.u_ship, Math.round(inv.shipX), inv.shipY);
    const shots = new Float32Array(16);
    inv.shots.slice(0, 4).forEach((sh, i) => shots.set([sh.x, Math.floor(sh.y), 1, 0], i * 4));
    gl.uniform4fv(fu.u_shots, shots);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ---- 3. blur ----
    gl.useProgram(blur.p);
    gl.uniform2f(blur.u.u_grid, this.gridW, this.gridH);
    gl.activeTexture(gl.TEXTURE3);
    gl.uniform1i(blur.u.u_src, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowH.fbo);
    gl.bindTexture(gl.TEXTURE_2D, field.tex[0]);
    gl.uniform2f(blur.u.u_step, 1, 0);
    gl.uniform1f(blur.u.u_first, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowV.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.glowH.tex[0]);
    gl.uniform2f(blur.u.u_step, 0, 1);
    gl.uniform1f(blur.u.u_first, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ---- 4. compose ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(compose.p);
    const cu = compose.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(cu.u_atlas, 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, field.tex[0]);
    gl.uniform1i(cu.u_field, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, field.tex[1]);
    gl.uniform1i(cu.u_style, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.glowV.tex[0]);
    gl.uniform1i(cu.u_glowTex, 5);
    gl.uniform2f(cu.u_res, W, H);
    gl.uniform2f(cu.u_grid, this.gridW, this.gridH);
    gl.uniform1f(cu.u_cellPx, this.cellPx);
    gl.uniform1f(cu.u_time, t);
    gl.uniform1f(cu.u_aspect, aspect);
    const ca = sa ?? sb;
    const cb = sb ?? sa;
    if (ca && cb) {
      gl.uniform3fv(cu.u_inkA, ca.ink);
      gl.uniform3fv(cu.u_inkB, cb.ink);
      gl.uniform3fv(cu.u_glyphA, ca.glyph);
      gl.uniform3fv(cu.u_glyphB, cb.glyph);
      gl.uniform3fv(cu.u_glowA, ca.glow);
      gl.uniform3fv(cu.u_glowB, cb.glow);
      gl.uniform3fv(cu.u_accA, ca.accent);
      gl.uniform3fv(cu.u_accB, cb.accent);
      gl.uniform1f(cu.u_glowAmtA, ca.glowAmt);
      gl.uniform1f(cu.u_glowAmtB, cb.glowAmt);
    }
    const ea = sa?.effect ?? 0;
    const eb = sb?.effect ?? 0;
    gl.uniform2f(cu.u_rowLenA, ea, charsetLength(ea));
    gl.uniform2f(cu.u_rowLenB, eb, charsetLength(eb));
    gl.uniform2f(cu.u_rowLenScr, SCRAMBLE_ROW, [...SCRAMBLE].length);
    gl.uniform1f(cu.u_intro, this.booted ? 0.35 + 0.65 * this.intro : 0.35);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

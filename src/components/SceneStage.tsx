"use client";

import { useEffect, useRef } from "react";
import { SLIDES, type Slide } from "@/lib/slides";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";
import { useMask } from "@/lib/use-mask";
import type { MaskId } from "@/assets/masks";
import {
  VERT,
  FRAG,
  CHARSETS_BY_EFFECT,
  GLOW_BY_EFFECT,
  buildAtlas,
  buildBlankMask,
  linkProgram,
  type AtlasInfo,
} from "@/lib/ascii-gl";

/**
 * 全屏单实例 ASCII 渲染器。
 *
 * 之前架构：N 屏 × N 个 AsciiStage，每屏一个 GL context，
 * 切换屏时新 stage mount → 创建 context → 上传 atlas/mask，肉眼可见的"突然变一下"。
 *
 * 新架构：1 个 canvas + 1 个 GL context + 1 个 RAF。
 *   - 所有 effect 的 atlas 在 mount 时预构建，纹理常驻 GPU
 *   - mask 通过 useMask 提前加载 5 个 brand 并缓存
 *   - 切换 slide 只切 uniform + 切 active atlas/mask 纹理绑定，几乎零成本
 *   - 转场分两段：
 *       progress 0..0.5 → 渲染旧屏，u_transition 0→+1 散开
 *       progress 0.5..1 → 渲染新屏，u_transition -1→0 收拢
 *     0.5 时屏内字符 alpha 接近 0，刚好掩盖 prop 切换瞬间
 */

const MASK_IDS: MaskId[] = ["x", "instagram", "github", "huggingface", "steam"];

export function SceneStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 预加载所有 5 个 brand mask（useMask 有进程内缓存，不会重复 fetch）
  const maskX = useMask("x");
  const maskIg = useMask("instagram");
  const maskGh = useMask("github");
  const maskHf = useMask("huggingface");
  const maskSt = useMask("steam");

  // 把最新的 mask 状态推到 ref，让 raf tick 内部能读取（不重新触发 effect）
  const masksRef = useRef<Partial<Record<MaskId, HTMLCanvasElement | null>>>({});
  masksRef.current = {
    x: maskX,
    instagram: maskIg,
    github: maskGh,
    huggingface: maskHf,
    steam: maskSt,
  };

  // 当前 active slide 的 theme bg —— 用 React 同步更新 canvas 背景色
  // （bg 是 CSS 设置，shader alpha=0 时显示出来）
  const carouselIndex = useCarousel((s) => s.index);
  const carouselPrev = useCarousel((s) => s.prevIndex);
  const direction = useCarousel((s) => s.direction);
  const transitionProgress = useCarousel((s) => s.transition);
  const busy = useCarousel((s) => s.busy);
  // 转场中点切 bg 色：与 shader 内 displaySlide 切换时机一致
  const bgSlide: Slide =
    busy && direction !== 0 && transitionProgress < 0.5
      ? SLIDES[carouselPrev] ?? SLIDES[carouselIndex]
      : SLIDES[carouselIndex];
  const bgColor = THEMES[bgSlide.theme].bg;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) return;

    const prog = linkProgram(gl, VERT, FRAG);
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

    // 预构建所有 effect 的 atlas 纹理
    type AtlasTex = AtlasInfo & { tex: WebGLTexture };
    const atlases: Map<number, AtlasTex> = new Map();
    const allEffects = Object.keys(CHARSETS_BY_EFFECT).map(Number);
    for (const eff of allEffects) {
      const info = buildAtlas(CHARSETS_BY_EFFECT[eff], 64);
      const tex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        info.canvas,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      atlases.set(eff, { ...info, tex });
    }

    // 单 mask 纹理：动态切换内容，避免每个 mask 一个 texture object 占内存
    const maskTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const blank = buildBlankMask();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      blank,
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
    gl.uniform1f(U.quality, 1.0);

    // 切 slide 时只更新这些 uniform + 切 atlas/mask 纹理绑定
    let currentEffect = -1;
    let currentMaskId: MaskId | null | undefined = undefined;
    let currentMaskSrc: HTMLCanvasElement | null = null;

    const uploadMask = (src: HTMLCanvasElement) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        src,
      );
    };

    const applySlide = (slide: Slide) => {
      const theme = THEMES[slide.theme];
      if (slide.effect !== currentEffect) {
        const atl = atlases.get(slide.effect);
        if (atl) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, atl.tex);
          gl.uniform1i(U.chars, atl.charsetLen);
          gl.uniform1f(U.cols, atl.cols);
          gl.uniform1f(U.rows, atl.rows);
        }
        gl.uniform1i(U.effect, slide.effect);
        gl.uniform1f(U.glow, GLOW_BY_EFFECT[slide.effect] ?? 1.0);
        currentEffect = slide.effect;
      }
      gl.uniform1f(U.cell, slide.cellSize);
      gl.uniform1f(U.speed, slide.speed);
      gl.uniform3f(U.colorDark, theme.bgRgb[0], theme.bgRgb[1], theme.bgRgb[2]);
      gl.uniform3f(
        U.colorBright,
        theme.fgRgb[0],
        theme.fgRgb[1],
        theme.fgRgb[2],
      );
      gl.uniform3f(
        U.colorGlow,
        theme.accentRgb[0],
        theme.accentRgb[1],
        theme.accentRgb[2],
      );
      gl.uniform1f(U.mouseIntensity, slide.cursorIntensity);

      const newId = slide.maskId;
      const desiredSrc = newId ? masksRef.current[newId] ?? null : null;
      if (newId !== currentMaskId || desiredSrc !== currentMaskSrc) {
        currentMaskId = newId;
        if (desiredSrc) {
          uploadMask(desiredSrc);
          gl.uniform1f(U.useMask, 1);
        } else {
          gl.uniform1f(U.useMask, 0);
        }
        currentMaskSrc = desiredSrc;
      }
    };

    // 字体异步加载完成后重建所有 atlas
    let fontReloaded = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (fontReloaded) return;
          fontReloaded = true;
          for (const eff of allEffects) {
            const info = buildAtlas(CHARSETS_BY_EFFECT[eff], 64);
            const at = atlases.get(eff);
            if (!at) continue;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, at.tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              info.canvas,
            );
            // 更新 atlas 元数据（cols/rows/charsetLen 都没变，charset 同 effect 一致）
            at.cols = info.cols;
            at.rows = info.rows;
            at.charsetLen = info.charsetLen;
          }
          // 强制下一帧 applySlide 重新设当前 effect 的 cols/rows
          currentEffect = -1;
        })
        .catch(() => {});
    }

    // 初始：先 apply 一次
    applySlide(SLIDES[useCarousel.getState().index]);

    // ===== 鼠标 =====
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
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave, { passive: true });

    // ===== Resize =====
    // 单 stage，DPR cap 到 1.0 + 最大 1.2M 像素（cover 4K 16:9 = 8.3M 太重）
    const MAX_PIXELS = 1_200_000;
    const QUALITY = 1.0;
    const resize = () => {
      const dpr = Math.min(QUALITY, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const pixels = w * h;
      if (pixels > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / pixels);
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

    // ===== RAF =====
    const fpsCap = 60;
    const frameInterval = 1000 / fpsCap;
    let lastFrame = 0;
    let pageHidden = typeof document !== "undefined" && document.hidden;
    const onVis = () => {
      pageHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    const start = performance.now();
    let raf = 0;
    let lastDisplaySlideId: string | null = null;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (pageHidden) return;
      if (now - lastFrame < frameInterval) return;
      lastFrame = now;

      // 直接从 zustand store 读最新 transition 状态（每帧最新，不重建 effect）
      const s = useCarousel.getState();
      const idx = s.index;
      const prev = s.prevIndex;
      const dir = s.direction;
      const progress = s.transition;
      const isBusy = s.busy;

      let displaySlide: Slide;
      let uTrans: number;
      if (!isBusy || dir === 0) {
        displaySlide = SLIDES[idx];
        uTrans = 0;
      } else if (progress < 0.5) {
        // 前半段：旧屏散开 (0 → +1)
        // 用 store.prevIndex 避免数字跳转 (跨度 > 1) 时错算成中间页
        displaySlide = SLIDES[prev] ?? SLIDES[idx];
        uTrans = progress * 2;
      } else {
        // 后半段：新屏聚合 (-1 → 0)
        displaySlide = SLIDES[idx];
        uTrans = -1 + (progress - 0.5) * 2;
      }

      if (displaySlide.id !== lastDisplaySlideId) {
        applySlide(displaySlide);
        lastDisplaySlideId = displaySlide.id;
      } else {
        // 同 slide 但 mask 可能刚 fetch 完成，需要 re-apply 一次切换 mask 纹理
        const desired = displaySlide.maskId
          ? masksRef.current[displaySlide.maskId] ?? null
          : null;
        if (desired !== currentMaskSrc) {
          applySlide(displaySlide);
        }
      }

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
      gl.uniform1f(U.transition, uTrans);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    draw(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      for (const at of atlases.values()) gl.deleteTexture(at.tex);
      gl.deleteTexture(maskTex);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{
        background: bgColor,
        transition: "background 200ms ease",
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}

// 让 TS 知道 MASK_IDS 是被用到的（编译时类型保留）
void MASK_IDS;

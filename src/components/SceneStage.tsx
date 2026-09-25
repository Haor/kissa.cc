"use client";

import { useEffect, useRef } from "react";
import { SLIDES } from "@/lib/slides";
import { THEMES, hexToRgb } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";
import { MASK_URLS, type MaskId } from "@/assets/masks";
import { GlyphEngine, type SceneDef } from "@/lib/glyph/engine";
import { glyphBus } from "@/lib/glyph/bus";

/**
 * 全屏单实例字符场。1 个 canvas + 1 个 WebGL2 context + 1 个 RAF，
 * 渲染细节全在 `lib/glyph/engine.ts`。
 *
 * 这里只做接线：
 *   - SLIDES / THEMES → SceneDef[]，每个 figure 一层 mask
 *   - store.index 变化 → engine.setTarget（订阅，不走 React 渲染）
 *   - 指针移动 → 光标尾迹；空白处点击 → 涟漪
 */

const FIGURES: MaskId[] = Array.from(new Set(SLIDES.map((s) => s.figure)));

const SCENES: SceneDef[] = SLIDES.map((s) => {
  const th = THEMES[s.theme];
  return {
    effect: s.effect,
    speed: s.speed,
    mask: FIGURES.indexOf(s.figure),
    text: s.text,
    figScale: s.figureScale,
    ink: hexToRgb(th.ink),
    glyph: hexToRgb(th.glyph),
    glow: hexToRgb(th.glow),
    accent: hexToRgb("accent" in th ? th.accent : th.glow),
    glowAmt: th.glowAmt,
  };
});

const cellCss = () => (window.innerWidth < 768 ? 8 : 10);

export function SceneStage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // canvas 在 effect 里创建：StrictMode 下 effect 会跑两次，丢失过 context 的
    // canvas 不能再拿到新的 WebGL context，所以每个引擎实例配一个新 canvas
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    host.appendChild(canvas);
    let engine: GlyphEngine;
    try {
      engine = new GlyphEngine(canvas, {
        scenes: SCENES,
        masks: FIGURES.map((id) => MASK_URLS[id]),
        cellCss,
      });
    } catch (err) {
      console.error("[glyph] engine init failed", err);
      host.dataset.failed = "true";
      canvas.remove();
      glyphBus.fail();
      return;
    }
    glyphBus.attach(engine);

    // booted 之后才开始跟随 index（开场由 Intro 调 boot）
    const unsub = useCarousel.subscribe((s, prev) => {
      if (s.index !== prev.index) engine.setTarget(s.index);
    });

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      engine.setPointer(e.clientX, e.clientY, true);
    };
    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) engine.setPointer(e.clientX, e.clientY, false);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, input, textarea, [data-no-ripple]")) return;
      engine.ripple(e.clientX, e.clientY, 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      unsub();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      window.removeEventListener("pointerdown", onDown);
      glyphBus.attach(null);
      engine.destroy();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="glyph-stage absolute inset-0" aria-hidden="true" />;
}

"use client";

import { useEffect, useRef } from "react";
import { SLIDES, SLIDE_INDEX_BY_ID } from "@/lib/slides";
import { useCarousel } from "@/lib/use-carousel";
import { SlideShell } from "./SlideShell";
import { DotNav } from "./DotNav";
import { SceneStage } from "./SceneStage";

function easeInOutExpo(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2;
}

const TRANSITION_MS = 700;
const REDUCED_TRANSITION_MS = 200;
const WHEEL_THRESHOLD = 60;
const DRAG_THRESHOLD_RATIO = 0.18;

/**
 * 全局 carousel 容器。
 *
 * 架构（v3，单 stage）：
 *   - 背景层：单实例 <SceneStage />，所有 ASCII 渲染统一在这里
 *   - 内容层：N 个 <SlideShell /> 绝对叠放，只渲染 chrome + content + gradient
 *     每个 shell 用 opacity 跟 carousel transition 进度做 cross-fade，
 *     与 SceneStage 内部的"散开-重组"动画同步
 *   - 不再有 strip translate；翻页 = 字符散开重组 + 文字 cross-fade
 *
 * 这同时解决：
 *   - 性能：单 GL context，单 RAF（之前最多 2-3 个 GL stage 同时活跃）
 *   - "突然变一下"：GL context 不再每屏重建，atlas 预建好后切换零成本
 *   - 跨平台一致：DPR 计算只走一份逻辑
 */
export function Carousel() {
  const animRef = useRef<number | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    deltaX: number;
    width: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, deltaX: 0, width: 0, pointerId: null });
  const wheelRef = useRef<{ accum: number; lastEvent: number; locked: boolean }>(
    { accum: 0, lastEvent: 0, locked: false },
  );

  const index = useCarousel((s) => s.index);
  const direction = useCarousel((s) => s.direction);
  const busy = useCarousel((s) => s.busy);
  const transition = useCarousel((s) => s.transition);
  const goto = useCarousel((s) => s.goto);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const gotoId = useCarousel((s) => s.gotoId);
  const setTransition = useCarousel((s) => s.setTransition);
  const finishTransition = useCarousel((s) => s.finishTransition);

  // -------- 缓动驱动：index 变化 → RAF 跑 700ms（仅推进 store.transition）----------
  useEffect(() => {
    if (direction === 0) {
      setTransition(0);
      return;
    }
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = prefersReduced ? REDUCED_TRANSITION_MS : TRANSITION_MS;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / dur);
      const eased = easeInOutExpo(p);
      setTransition(eased);
      if (p < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
        finishTransition();
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [index, direction, setTransition, finishTransition]);

  // -------- 输入：wheel ----------
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const now = performance.now();
      if (now - wheelRef.current.lastEvent > 250) {
        wheelRef.current.accum = 0;
        wheelRef.current.locked = false;
      }
      wheelRef.current.lastEvent = now;
      if (wheelRef.current.locked) return;
      wheelRef.current.accum += dx;
      if (Math.abs(wheelRef.current.accum) >= WHEEL_THRESHOLD) {
        const dir = wheelRef.current.accum > 0 ? 1 : -1;
        wheelRef.current.locked = true;
        wheelRef.current.accum = 0;
        goto(dir);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [goto]);

  // -------- 输入：键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goto(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goto(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        gotoIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        gotoIndex(SLIDES.length - 1);
      } else if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10) - 1;
        if (n < SLIDES.length) {
          e.preventDefault();
          gotoIndex(n);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goto, gotoIndex]);

  // -------- 输入：pointer drag（只决定翻页方向，不做视觉平移）----------
  useEffect(() => {
    const root = document.body;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, [data-no-drag]")) return;
      if (busy) return;
      dragRef.current.active = true;
      dragRef.current.startX = e.clientX;
      dragRef.current.deltaX = 0;
      dragRef.current.width = window.innerWidth;
      dragRef.current.pointerId = e.pointerId;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      if (e.pointerId !== dragRef.current.pointerId) return;
      dragRef.current.deltaX = e.clientX - dragRef.current.startX;
    };
    const finishDrag = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      if (
        dragRef.current.pointerId !== null &&
        e.pointerId !== dragRef.current.pointerId
      )
        return;
      const { deltaX, width } = dragRef.current;
      const ratio = Math.abs(deltaX) / Math.max(1, width);
      dragRef.current.active = false;
      dragRef.current.pointerId = null;
      if (ratio >= DRAG_THRESHOLD_RATIO) {
        const dir = deltaX < 0 ? 1 : -1;
        goto(dir);
      }
      dragRef.current.deltaX = 0;
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", finishDrag);
    root.addEventListener("pointercancel", finishDrag);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", finishDrag);
      root.removeEventListener("pointercancel", finishDrag);
    };
  }, [busy, goto]);

  // -------- URL hash 双向同步 ----------
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id && id in SLIDE_INDEX_BY_ID) gotoId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [gotoId]);

  useEffect(() => {
    const id = SLIDES[index]?.id;
    if (!id) return;
    const current = window.location.hash.replace(/^#/, "");
    if (current !== id) {
      window.history.replaceState(null, "", `#${id}`);
    }
  }, [index]);

  // -------- 内容层 opacity 计算 --------
  // 转场前半段（progress 0..0.5）：旧屏 opacity 1→0
  // 转场后半段（progress 0.5..1）：新屏 opacity 0→1
  // 稳态：只有 active 屏 opacity = 1
  const isTransitioning = busy && direction !== 0;
  const outgoingIdx = isTransitioning ? index - direction : -1;
  const incomingIdx = index;
  const opacityFor = (i: number): number => {
    if (!isTransitioning) return i === incomingIdx ? 1 : 0;
    if (i === outgoingIdx) return Math.max(0, 1 - transition * 2);
    if (i === incomingIdx) return Math.max(0, (transition - 0.5) * 2);
    return 0;
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ touchAction: "pan-y" }}
    >
      {/* 背景：单实例全屏 ASCII */}
      <SceneStage />

      {/* 内容：N 个 SlideShell 绝对叠放，opacity 跟 transition 同步 */}
      {SLIDES.map((slide, i) => {
        const op = opacityFor(i);
        const visible = op > 0.001;
        return (
          <div
            key={slide.id}
            className="absolute inset-0"
            style={{
              opacity: op,
              pointerEvents: i === incomingIdx && !isTransitioning ? "auto" : "none",
              visibility: visible ? "visible" : "hidden",
              zIndex: i === incomingIdx ? 2 : i === outgoingIdx ? 1 : 0,
              transition: "none",
            }}
            aria-hidden={i === incomingIdx && !isTransitioning ? undefined : true}
          >
            <SlideShell slide={slide} index={i} total={SLIDES.length} />
          </div>
        );
      })}

      <DotNav />
    </div>
  );
}

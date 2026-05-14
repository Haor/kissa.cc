"use client";

import { useEffect, useRef } from "react";
import { SLIDES, SLIDE_INDEX_BY_ID } from "@/lib/slides";
import { useCarousel } from "@/lib/use-carousel";
import { playTick } from "@/lib/sound";
import { SlideShell } from "./SlideShell";
import { DotNav } from "./DotNav";
import { SoundToggle } from "./SoundToggle";
import { MaskDebug } from "./MaskDebug";

// in-out expo: cubic-bezier(0.83, 0, 0.17, 1)
function easeInOutExpo(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2;
}

const TRANSITION_MS = 600;
const WHEEL_THRESHOLD = 60; // 单次累积超过此值触发翻页
const DRAG_THRESHOLD_RATIO = 0.18; // 拖动超过视口 18% 翻页
const REDUCED_TRANSITION_MS = 200;

export function Carousel() {
  const stripRef = useRef<HTMLDivElement>(null);
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
  const goto = useCarousel((s) => s.goto);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const gotoId = useCarousel((s) => s.gotoId);
  const setTransition = useCarousel((s) => s.setTransition);
  const finishTransition = useCarousel((s) => s.finishTransition);

  // -------- 缓动驱动：index 变化 → RAF 跑 600ms ----------
  const lastIndexRef = useRef(index);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = prefersReduced ? REDUCED_TRANSITION_MS : TRANSITION_MS;

    // 当前 transform 起点：上一次稳定的 index 位置 + 拖动 delta（如果有）
    const w = strip.parentElement?.clientWidth ?? window.innerWidth;
    const prevIndex = lastIndexRef.current;
    const fromX = -prevIndex * w + dragRef.current.deltaX;
    const toX = -index * w;
    dragRef.current.deltaX = 0;
    lastIndexRef.current = index;

    if (direction === 0) {
      strip.style.transform = `translate3d(${toX}px, 0, 0)`;
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / dur);
      const eased = easeInOutExpo(p);
      const x = fromX + (toX - fromX) * eased;
      strip.style.transform = `translate3d(${x}px, 0, 0)`;
      setTransition(eased);
      if (p < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
        // 播 tick：转场启动瞬间也行，但放在结束更不抢手感
        playTick();
        finishTransition();
      }
    };
    // 转场启动时立刻播一次提示
    playTick();
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

  // -------- 输入：pointer drag（含 touch）----------
  useEffect(() => {
    const strip = stripRef.current;
    const parent = strip?.parentElement;
    if (!strip || !parent) return;

    const onPointerDown = (e: PointerEvent) => {
      // 让 button / a / input 自己处理点击
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, [data-no-drag]")) return;
      if (busy) return;
      dragRef.current.active = true;
      dragRef.current.startX = e.clientX;
      dragRef.current.deltaX = 0;
      dragRef.current.width = parent.clientWidth;
      dragRef.current.pointerId = e.pointerId;
      parent.setPointerCapture?.(e.pointerId);
      strip.style.transition = "none";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      if (e.pointerId !== dragRef.current.pointerId) return;
      const dx = e.clientX - dragRef.current.startX;
      dragRef.current.deltaX = dx;
      const baseX = -index * dragRef.current.width;
      // 在两端加阻尼
      const isEdge =
        (index === 0 && dx > 0) || (index === SLIDES.length - 1 && dx < 0);
      const damped = isEdge ? dx * 0.35 : dx;
      strip.style.transform = `translate3d(${baseX + damped}px, 0, 0)`;
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
      try {
        parent.releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      strip.style.transition = "";
      if (ratio >= DRAG_THRESHOLD_RATIO) {
        const dir = deltaX < 0 ? 1 : -1;
        goto(dir);
      } else {
        // 回弹到当前 index
        const x = -index * width;
        strip.style.transform = `translate3d(${x}px, 0, 0)`;
        dragRef.current.deltaX = 0;
      }
    };

    parent.addEventListener("pointerdown", onPointerDown);
    parent.addEventListener("pointermove", onPointerMove);
    parent.addEventListener("pointerup", finishDrag);
    parent.addEventListener("pointercancel", finishDrag);
    return () => {
      parent.removeEventListener("pointerdown", onPointerDown);
      parent.removeEventListener("pointermove", onPointerMove);
      parent.removeEventListener("pointerup", finishDrag);
      parent.removeEventListener("pointercancel", finishDrag);
    };
  }, [index, busy, goto]);

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

  // -------- 窗口尺寸变化：重新对齐 ----------
  useEffect(() => {
    const onResize = () => {
      const strip = stripRef.current;
      if (!strip) return;
      const w = strip.parentElement?.clientWidth ?? window.innerWidth;
      strip.style.transform = `translate3d(${-index * w}px, 0, 0)`;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index]);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ touchAction: "pan-y" }}
    >
      <div
        ref={stripRef}
        className="flex h-full will-change-transform"
        style={{
          width: `${SLIDES.length * 100}vw`,
          transform: `translate3d(${-index * 100}vw, 0, 0)`,
        }}
      >
        {SLIDES.map((slide, i) => (
          <div key={slide.id} className="h-full w-screen flex-shrink-0">
            <SlideShell slide={slide} index={i} total={SLIDES.length} />
          </div>
        ))}
      </div>

      <SoundToggle />
      <DotNav />
      {process.env.NODE_ENV === "development" && <MaskDebug />}
    </div>
  );
}

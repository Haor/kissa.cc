"use client";

import { useEffect, useRef, useState } from "react";
import { useCarousel } from "@/lib/use-carousel";
import { glyphBus } from "@/lib/glyph/bus";

/**
 * 开场：计数器 000 → 100（真实等待字体 + 10 张 mask），随后遮罩向上擦除，
 * 同时字符场从虚空径向凝聚出第一屏的 figure，DOM 文案再依次入场。
 */

const RAMP = " .:-=+*#%@";
const MIN_MS = 1150;
const MAX_WAIT_MS = 4500;

export function Intro() {
  const setBooted = useCarousel((s) => s.setBooted);
  const [phase, setPhase] = useState<"load" | "exit" | "gone">("load");
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rampRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let ready = false;
    let raf = 0;
    let shown = 0;
    let finished = false;
    glyphBus.ready.then(() => (ready = true));
    const timeout = window.setTimeout(() => (ready = true), MAX_WAIT_MS);

    const tick = (now: number) => {
      const t = now - t0;
      // 没 ready 前渐近 90%，ready 且过了最短时长后冲到 100%
      const soft = 90 * (1 - Math.exp(-t / 520));
      const target = ready && t > (reduced ? 200 : MIN_MS) ? 100 : soft;
      shown += (target - shown) * (target === 100 ? 0.22 : 0.5);
      if (target === 100 && 100 - shown < 0.6) shown = 100;
      const v = Math.floor(shown);
      if (countRef.current) countRef.current.textContent = String(v).padStart(3, "0");
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown / 100})`;
      if (rampRef.current) {
        const k = Math.floor(t / 70);
        rampRef.current.textContent = Array.from(
          { length: 12 },
          (_, i) => RAMP[(k + i * 3) % RAMP.length],
        ).join("");
      }
      if (shown >= 100 && !finished) {
        finished = true;
        const idx = useCarousel.getState().index;
        glyphBus.boot(idx);
        setPhase("exit");
        window.setTimeout(() => setBooted(), reduced ? 0 : 380);
        window.setTimeout(() => setPhase("gone"), reduced ? 50 : 1300);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [setBooted]);

  if (phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink"
      style={{
        clipPath: phase === "exit" ? "inset(0 0 100% 0)" : "inset(0 0 0% 0)",
        transition: "clip-path 1.05s var(--ease-in-out-quart)",
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-x-[var(--gutter)] top-[22px] flex justify-between">
        <span className="text-[13px] font-medium tracking-[0.2em]">KISSA.CC</span>
        <span className="tag opacity-45">loading</span>
      </div>
      <div className="absolute inset-x-[var(--gutter)] bottom-[calc(28px+env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between gap-6">
          <span
            ref={countRef}
            className="text-[clamp(72px,14vw,220px)] font-normal leading-[0.8] tabular-nums tracking-[-0.04em]"
          >
            000
          </span>
          <div className="mb-2 text-right">
            <span ref={rampRef} className="block whitespace-pre text-[13px] tracking-[0.3em] opacity-60">
              {" "}
            </span>
            <span className="tag mt-3 block opacity-40">glyphs · masks · type</span>
          </div>
        </div>
        <div className="mt-6 h-px bg-current/15">
          <div ref={barRef} className="h-px origin-left bg-current" style={{ transform: "scaleX(0)" }} />
        </div>
      </div>
    </div>
  );
}

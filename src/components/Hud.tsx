"use client";

import { useEffect, useRef, useState } from "react";
import { SLIDES } from "@/lib/slides";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";

/**
 * 常驻取景框：四角裁切标、顶栏（品牌 / 本地时间 / 目录按钮）、左右竖排注记。
 * 高频变化的读数（光标坐标、spinner）直接写 textContent，不走 React 渲染。
 */

const SPIN = ["|", "/", "—", "\\"];

function useShenzhenClock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function Hud() {
  const index = useCarousel((s) => s.index);
  const menuOpen = useCarousel((s) => s.menuOpen);
  const setMenu = useCarousel((s) => s.setMenu);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const clock = useShenzhenClock();
  const spinRef = useRef<HTMLSpanElement>(null);
  const coordRef = useRef<HTMLSpanElement>(null);
  const accent = THEMES[SLIDES[index].theme].glyph;

  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % SPIN.length;
      if (spinRef.current) spinRef.current.textContent = SPIN[i];
    }, 160);
    const onMove = (e: PointerEvent) => {
      if (!coordRef.current) return;
      const x = (e.clientX / window.innerWidth).toFixed(3);
      const y = (1 - e.clientY / window.innerHeight).toFixed(3);
      coordRef.current.textContent = `x ${x}  y ${y}`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="hud pointer-events-none fixed inset-0 z-[45]" style={{ color: "var(--color-paper)" }}>
      {/* 四角裁切标 */}
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span
          key={c}
          aria-hidden="true"
          className={`absolute size-[11px] opacity-40 ${c[0] === "t" ? "top-3 border-t" : "bottom-3 border-b"} ${
            c[1] === "l" ? "left-3 border-l" : "right-3 border-r"
          } border-current`}
        />
      ))}

      {/* 顶栏 */}
      <header className="ink-shadow absolute inset-x-[var(--gutter)] top-[22px] flex items-start justify-between">
        <button
          type="button"
          onClick={() => gotoIndex(0)}
          className="pointer-events-auto group flex items-baseline gap-3 text-left"
          data-cursor="home"
        >
          <span className="w-[1ch] text-[12px] opacity-70" ref={spinRef} style={{ color: accent }}>
            |
          </span>
          <span className="block text-[13px] font-medium tracking-[0.2em]">KISSA.CC</span>
        </button>

        <div className="flex items-start gap-8">
          <div className="tag hidden text-right leading-[1.5] sm:block">
            <span className="opacity-45">gmt+8</span>
            <span className="ml-3 tabular-nums tracking-[0.2em] opacity-80">{clock}</span>
          </div>
          <button
            type="button"
            onClick={() => setMenu(!menuOpen)}
            className="pointer-events-auto tag group flex items-center gap-3 py-1"
            aria-expanded={menuOpen}
            aria-controls="index-menu"
            data-cursor={menuOpen ? "close" : "index"}
          >
            <span className="opacity-80">{menuOpen ? "close" : "index"}</span>
            <span className="relative block h-[9px] w-[18px]" aria-hidden="true">
              <span
                className="absolute inset-x-0 top-0 h-px bg-current transition-transform duration-500"
                style={{ transform: menuOpen ? "translateY(4px) rotate(45deg)" : "none" }}
              />
              <span
                className="absolute inset-x-0 bottom-0 h-px bg-current transition-transform duration-500"
                style={{ transform: menuOpen ? "translateY(-4px) rotate(-45deg)" : "scaleX(0.6)", transformOrigin: "100% 50%" }}
              />
            </span>
          </button>
        </div>
      </header>

      {/* 左右竖排注记 */}
      <div className="tag absolute left-[14px] top-1/2 hidden -translate-y-1/2 opacity-30 lg:block" style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}>
        vol. ii <span className="opacity-60">—</span> mmxxvi
      </div>
      <div className="tag absolute right-[14px] top-1/2 hidden -translate-y-1/2 tabular-nums opacity-30 lg:block" style={{ writingMode: "vertical-rl" }}>
        <span ref={coordRef}>x 0.500  y 0.500</span>
      </div>
    </div>
  );
}

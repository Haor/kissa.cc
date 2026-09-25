"use client";

import { useEffect, useRef, useState } from "react";
import { SLIDES } from "@/lib/slides";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";

/**
 * 常驻取景框：四角裁切标、顶栏（品牌 / 本地时间 / 目录按钮）、右侧竖排的光标坐标。
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

      {/* 顶栏：左右两组都按行高居中对齐 */}
      <header className="ink-shadow absolute inset-x-[var(--gutter)] top-[20px] flex h-6 items-center justify-between">
        <button
          type="button"
          onClick={() => gotoIndex(0)}
          className="pointer-events-auto group flex items-center gap-3 text-left leading-none"
          data-cursor="home"
        >
          <span className="w-[1ch] text-[12px] opacity-70" ref={spinRef} style={{ color: accent }}>
            |
          </span>
          <span className="block text-[13px] font-medium tracking-[0.2em]">KISSA.CC</span>
        </button>

        <div className="flex items-center gap-8">
          <div className="tag hidden items-center gap-3 sm:flex">
            <span className="opacity-45">gmt+8</span>
            <span className="tabular-nums tracking-[0.2em] opacity-80">{clock}</span>
          </div>
          <button
            type="button"
            onClick={() => setMenu(!menuOpen)}
            className="pointer-events-auto tag group flex h-6 items-center gap-3"
            aria-expanded={menuOpen}
            aria-controls="index-menu"
            data-cursor={menuOpen ? "close" : "index"}
          >
            <span className="opacity-80">{menuOpen ? "close" : "index"}</span>
            <MenuGlyph open={menuOpen} />
          </button>
        </div>
      </header>

      {/* 右侧竖排：光标坐标读数 */}
      <div className="tag absolute right-[14px] top-1/2 hidden -translate-y-1/2 tabular-nums opacity-30 lg:block" style={{ writingMode: "vertical-rl" }}>
        <span ref={coordRef}>x 0.500  y 0.500</span>
      </div>
    </div>
  );
}

/**
 * 目录按钮的两道横线 ⇄ 叉。
 * 经典的两段式：打开时两条线先向中线靠拢，再各自转 45°；关闭时倒过来先转回再分开。
 * 外层 span 只管上下位移、内层只管旋转，两段各自有 transition-delay，
 * 所以叉永远是两条等长、围绕同一个中心的线（之前单层 transform 插值会歪）。
 */
function MenuGlyph({ open }: { open: boolean }) {
  const ease = "cubic-bezier(0.65, 0, 0.35, 1)";
  const line = (dir: 1 | -1) => (
    <span
      className="absolute inset-x-0 top-1/2 -mt-px block h-px"
      style={{
        transform: open ? "translateY(0)" : `translateY(${dir * -4}px)`,
        transition: `transform 0.22s ${ease} ${open ? "0s" : "0.22s"}`,
      }}
    >
      <span
        className="block h-px w-full bg-current"
        style={{
          transform: open ? `rotate(${dir * 45}deg)` : dir === -1 ? "scaleX(0.6) translateX(33%)" : "none",
          transition: `transform 0.28s ${ease} ${open ? "0.2s" : "0s"}`,
        }}
      />
    </span>
  );
  return (
    <span className="relative block h-[10px] w-4" aria-hidden="true">
      {line(1)}
      {line(-1)}
    </span>
  );
}

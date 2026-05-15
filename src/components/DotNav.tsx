"use client";

import { SLIDES } from "@/lib/slides";
import { useCarousel } from "@/lib/use-carousel";

const COL_W = 32; // px：每个编号槽位宽度
const UNDERLINE_W = 14; // px：下划线宽度

export function DotNav() {
  const index = useCarousel((s) => s.index);
  const gotoIndex = useCarousel((s) => s.gotoIndex);

  return (
    <nav
      aria-label="slide navigation"
      className="pointer-events-auto fixed bottom-6 left-1/2 z-30 -translate-x-1/2 font-mono"
    >
      <div className="relative flex items-end">
        {SLIDES.map((slide, i) => {
          const active = i === index;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => gotoIndex(i)}
              aria-label={`Go to ${slide.label}`}
              aria-current={active ? "true" : undefined}
              style={{ width: COL_W }}
              className={`group relative flex h-7 items-center justify-center text-[10px] tracking-[0.25em] transition-opacity duration-300 ease-out ${
                active ? "opacity-100" : "opacity-30 hover:opacity-70"
              }`}
            >
              {String(i).padStart(2, "0")}
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-[0.3em] opacity-0 transition-opacity group-hover:opacity-50">
                {slide.label}
              </span>
            </button>
          );
        })}
        {/* 滑动下划线：transform translateX 切位，Safari 上稳。
            只动 transform 和 opacity，绕开 width/height transition 残留 bug。*/}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 h-px bg-current transition-transform duration-[420ms]"
          style={{
            width: UNDERLINE_W,
            left: (COL_W - UNDERLINE_W) / 2,
            transform: `translateX(${index * COL_W}px)`,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </nav>
  );
}

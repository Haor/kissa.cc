"use client";

import type { CSSProperties } from "react";
import { SLIDES } from "@/lib/slides";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";

/**
 * 底部刻度尺导航。
 *   左：滚动计数器（每位数字是一条 0–9 的竖条，translateY 滚到位）/ 总数
 *   中：10 个刻度，当前刻度拉高着色，滑块沿刻度平移
 *   右：上一屏 / 下一屏
 * 所有尺寸变化只用 transform（Safari 对 className 切换触发的
 * width/height transition 会留残影，见 CLAUDE.md）。
 */

const TICK = 22; // 每个刻度槽宽度 px

function Digit({ value }: { value: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-top">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[900ms]"
        style={{
          transform: `translateY(${-value}em)`,
          transitionTimingFunction: "var(--ease-out-expo)",
        }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-[1em] leading-none">
            {i}
          </span>
        ))}
      </span>
    </span>
  );
}

export function IndexNav() {
  const index = useCarousel((s) => s.index);
  const goto = useCarousel((s) => s.goto);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const slide = SLIDES[index];
  const accent = THEMES[slide.theme].glyph;
  const last = SLIDES.length - 1;

  return (
    <nav
      aria-label="slides"
      className="fade-on-menu ink-shadow fixed inset-x-[var(--gutter)] bottom-[calc(20px+env(safe-area-inset-bottom))] z-30 flex items-end justify-between gap-6"
      style={{ "--accent": accent } as CSSProperties}
    >
      {/* 计数器 */}
      <div className="flex min-w-0 items-end gap-4">
        <div className="text-[30px] font-medium leading-none tabular-nums" aria-live="polite" aria-atomic="true">
          <span className="sr-only">
            {index} of {last}, {slide.label}
          </span>
          <span aria-hidden="true">
            <Digit value={Math.floor(index / 10)} />
            <Digit value={index % 10} />
          </span>
        </div>
        {/* 屏名已经在每屏的小标题里，这里只留总数 */}
        <div className="tag mb-[3px] opacity-35" aria-hidden="true">
          / {String(last).padStart(2, "0")}
        </div>
      </div>

      {/* 刻度 */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
        <div className="relative flex items-end" style={{ height: 30 }}>
          {SLIDES.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => gotoIndex(i)}
                aria-label={`${String(i).padStart(2, "0")} ${s.label}`}
                aria-current={active ? "true" : undefined}
                className="group relative flex h-full items-end justify-center"
                style={{ width: TICK }}
                data-cursor={active ? undefined : String(i).padStart(2, "0")}
              >
                <span
                  className="block h-[22px] w-px origin-bottom transition-[transform,opacity,background-color] duration-500"
                  style={{
                    transform: `scaleY(${active ? 1 : 0.36})`,
                    background: active ? "var(--accent)" : "currentColor",
                    opacity: active ? 1 : 0.4,
                    transitionTimingFunction: "var(--ease-out-expo)",
                  }}
                />
                <span className="tag pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 translate-y-1 whitespace-nowrap opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-70">
                  {s.label}
                </span>
              </button>
            );
          })}
          {/* 滑块 */}
          <span
            aria-hidden="true"
            className="absolute -bottom-[7px] left-0 block size-[5px] transition-transform duration-[900ms]"
            style={{
              background: "var(--accent)",
              transform: `translateX(${index * TICK + TICK / 2 - 2.5}px)`,
              transitionTimingFunction: "var(--ease-out-expo)",
            }}
          />
        </div>
      </div>

      {/* 前后 */}
      <div className="tag flex items-center gap-1">
        <button
          type="button"
          onClick={() => goto(-1)}
          disabled={index === 0}
          className="px-2 py-2 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-20"
          aria-label="previous"
          data-cursor="prev"
        >
          ←
        </button>
        <span className="hidden opacity-35 lg:inline">prev / next</span>
        <button
          type="button"
          onClick={() => goto(1)}
          disabled={index === last}
          className="px-2 py-2 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-20"
          aria-label="next"
          data-cursor="next"
        >
          →
        </button>
      </div>
    </nav>
  );
}

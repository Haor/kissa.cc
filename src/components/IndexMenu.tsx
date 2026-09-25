"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { SLIDES, type Slide } from "@/lib/slides";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";
import { glyphBus } from "@/lib/glyph/bus";

/**
 * 全屏目录。悬停某一行时，背后的字符场直接 morph 成那一屏的 figure
 * （复用引擎的转场状态机），离开 / 关闭时 morph 回当前屏。
 */

function titleOf(s: Slide) {
  if (s.id === "about") return (s.sentence ?? "").replace("·", "&").toLowerCase();
  return s.sentence ?? s.intent ?? s.label;
}

export function IndexMenu() {
  const open = useCarousel((s) => s.menuOpen);
  const index = useCarousel((s) => s.index);
  const setMenu = useCarousel((s) => s.setMenu);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    glyphBus.aside(open);
    if (!open) {
      glyphBus.target(useCarousel.getState().index);
      return;
    }
    const first = listRef.current?.querySelector<HTMLAnchorElement>("[aria-current='true']");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setMenu]);

  return (
    <div
      id="index-menu"
      role="dialog"
      aria-modal="true"
      aria-label="index"
      inert={!open}
      className="fixed inset-0 z-40 transition-[opacity,visibility] duration-500"
      style={{
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transitionDelay: open ? "0s" : "0.25s",
        background:
          "linear-gradient(90deg, rgb(6 6 7 / 0.9) 0%, rgb(6 6 7 / 0.78) 55%, rgb(6 6 7 / 0.35) 100%)",
      }}
      onPointerLeave={() => glyphBus.target(useCarousel.getState().index)}
    >
      <div className="absolute inset-x-[var(--gutter)] top-1/2 -translate-y-1/2 md:right-auto md:w-[min(64vw,980px)]">
        <div className="tag mb-6 flex items-center gap-3 opacity-45">
          <span>contents</span>
          <span className="inline-block h-px w-8 bg-current" />
          <span>{SLIDES.length} selves</span>
        </div>
        <ol ref={listRef} className="border-t border-current/15">
          {SLIDES.map((s, i) => {
            const accent = THEMES[s.theme].glyph;
            const current = i === index;
            return (
              <li
                key={s.id}
                className="border-b border-current/15"
                style={{
                  transform: open ? "none" : "translate3d(0, 14px, 0)",
                  opacity: open ? 1 : 0,
                  transition: `transform 0.9s var(--ease-out-expo) ${open ? 80 + i * 40 : 0}ms, opacity 0.6s ${open ? 80 + i * 40 : 0}ms`,
                }}
              >
                <a
                  href={`#${s.id}`}
                  aria-current={current ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    gotoIndex(i);
                    setMenu(false);
                  }}
                  onPointerEnter={() => glyphBus.target(i)}
                  onFocus={() => glyphBus.target(i)}
                  data-cursor={String(i).padStart(2, "0")}
                  className="row group grid grid-cols-[2.6em_1fr_auto] items-baseline gap-x-4 py-[clamp(4px,0.75vh,10px)]"
                  style={{ "--accent": accent } as CSSProperties}
                >
                  <span className="tag opacity-40 transition-colors group-hover:text-[var(--accent)] group-hover:opacity-100">
                    {String(i).padStart(2, "0")}
                  </span>
                  <span className="shift font-serif truncate text-[clamp(24px,min(3.4vw,5.1vh),52px)] leading-[1.08]">
                    {titleOf(s)}
                  </span>
                  <span className="tag flex items-center gap-3 opacity-50">
                    {current && <span className="inline-block size-[6px]" style={{ background: accent }} />}
                    {s.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

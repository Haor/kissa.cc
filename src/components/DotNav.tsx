"use client";

import { SLIDES } from "@/lib/slides";
import { useCarousel } from "@/lib/use-carousel";

export function DotNav() {
  const index = useCarousel((s) => s.index);
  const gotoIndex = useCarousel((s) => s.gotoIndex);

  return (
    <nav
      aria-label="slide navigation"
      className="pointer-events-auto fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 font-mono"
    >
      {SLIDES.map((slide, i) => {
        const active = i === index;
        return (
          <button
            key={slide.id}
            type="button"
            onClick={() => gotoIndex(i)}
            aria-label={`Go to ${slide.label}`}
            aria-current={active ? "true" : undefined}
            className="group relative flex h-7 w-7 items-center justify-center"
          >
            <span
              className={`block rounded-full transition-all duration-300 ease-out ${
                active
                  ? "h-2 w-6 bg-current opacity-100"
                  : "h-1.5 w-1.5 bg-current opacity-30 group-hover:opacity-70"
              }`}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase tracking-[0.3em] opacity-0 transition-opacity group-hover:opacity-60">
              {slide.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

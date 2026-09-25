"use client";

import { useEffect, useRef } from "react";

/**
 * 自定义光标：一个实心点（跟手）+ 一个方形取景框（带惯性）。
 * 悬停在带 data-cursor 的元素上时，取景框放大并显示该元素的动作词
 * （open / copy / mail / 03 …）。只在精确指针设备上启用，触屏不渲染。
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const dot = dotRef.current!;
    const frame = frameRef.current!;
    const label = labelRef.current!;
    document.documentElement.dataset.cursor = "on";

    let x = -100;
    let y = -100;
    let fx = x;
    let fy = y;
    let size = 30;
    let targetSize = 30;
    let visible = false;
    let raf = 0;
    let down = false;

    const loop = () => {
      fx += (x - fx) * 0.2;
      fy += (y - fy) * 0.2;
      size += (targetSize * (down ? 0.82 : 1) - size) * 0.2;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame.style.transform = `translate3d(${fx}px, ${fy}px, 0)`;
      frame.style.width = frame.style.height = `${size.toFixed(2)}px`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        fx = x;
        fy = y;
        dot.style.opacity = "1";
        frame.style.opacity = "1";
      }
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cursor], a, button");
      const word = el ? (el.dataset.cursor ?? (el.tagName === "A" ? "open" : "")) : "";
      targetSize = el ? 64 : 30;
      frame.dataset.hot = el ? "true" : "false";
      if (label.textContent !== word) label.textContent = word;
    };
    const onLeave = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      visible = false;
      dot.style.opacity = "0";
      frame.style.opacity = "0";
    };
    const onDown = () => (down = true);
    const onUp = () => (down = false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      delete document.documentElement.dataset.cursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] hidden [@media(pointer:fine)]:block" style={{ mixBlendMode: "difference" }}>
      <div
        ref={dotRef}
        className="absolute left-0 top-0 -ml-[2px] -mt-[2px] size-[4px] bg-white opacity-0 transition-opacity"
      />
      <div
        ref={frameRef}
        className="cursor-frame absolute left-0 top-0 opacity-0 transition-opacity"
        style={{ width: 30, height: 30 }}
      >
        <div className="absolute inset-0 -translate-x-1/2 -translate-y-1/2">
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <span
              key={c}
              className={`absolute size-[7px] border-white ${c[0] === "t" ? "top-0 border-t" : "bottom-0 border-b"} ${
                c[1] === "l" ? "left-0 border-l" : "right-0 border-r"
              }`}
            />
          ))}
          <span
            ref={labelRef}
            className="tag absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 whitespace-nowrap text-white"
          />
        </div>
      </div>
    </div>
  );
}

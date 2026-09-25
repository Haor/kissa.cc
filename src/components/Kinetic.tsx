"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * 动态排版小件：
 *   <Words>     展示标题逐词从遮罩底部升起（纯 CSS，见 globals.css .word）
 *   <Scramble>  等宽文字从乱码 decode 成原文（JS，只改 textContent，不触发 React 渲染）
 *   useMagnetic 元素被指针「吸」过去一点
 */

export function Words({
  text,
  start = 0,
  className,
}: {
  text: string;
  /** 第一个词的 stagger 序号 */
  start?: number;
  className?: string;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={`${w}-${i}`}>
            <span className="word" style={{ "--w": start + i } as CSSProperties}>
              <span>{w}</span>
            </span>
            {i < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </span>
  );
}

const GLYPHS = "!<>-_\\/[]{}=+*^?#%&@$~01";

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Scramble({
  text,
  active,
  delay = 0,
  className,
  style,
}: {
  text: string;
  active: boolean;
  /** ms */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active || prefersReduced()) {
      el.textContent = text;
      return;
    }
    const chars = [...text];
    const t0 = performance.now() + delay;
    const STEP = 24; // 每个字符比前一个晚多少 ms 定格
    const HOLD = 260; // 定格前乱码持续多久
    let raf = 0;
    let lastSwap = 0;
    let noise = chars.map(() => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
    const tick = (now: number) => {
      const t = now - t0;
      if (now - lastSwap > 50) {
        noise = noise.map(() => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
        lastSwap = now;
      }
      let out = "";
      let done = true;
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        const settle = i * STEP + HOLD;
        if (c === " ") out += " ";
        else if (t >= settle) out += c;
        else if (t >= i * STEP * 0.6) {
          out += noise[i];
          done = false;
        } else {
          out += " ";
          done = false;
        }
      }
      el.textContent = out;
      if (!done) raf = requestAnimationFrame(tick);
    };
    el.textContent = " ".repeat(chars.length);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, text, delay]);

  return (
    <span className={className} style={style}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true" className="whitespace-pre">
        {text}
      </span>
    </span>
  );
}

/** 指针靠近时元素朝指针方向偏移（strength = 最大位移占元素尺寸的比例） */
export function useMagnetic<T extends HTMLElement>(strength = 0.28) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced() || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const loop = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const reach = Math.max(r.width, r.height) * 0.9 + 40;
      if (Math.hypot(dx, dy) < reach) {
        tx = dx * strength;
        ty = dy * strength;
      } else {
        tx = 0;
        ty = 0;
      }
      kick();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [strength]);
  return ref;
}

export function Magnetic({
  children,
  strength,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useMagnetic<HTMLSpanElement>(strength);
  return (
    <span ref={ref} className={`inline-block will-change-transform ${className ?? ""}`}>
      {children}
    </span>
  );
}

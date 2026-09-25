"use client";

import { useEffect, useRef } from "react";
import { SLIDES, SLIDE_INDEX_BY_ID } from "@/lib/slides";
import { profile } from "@/lib/data";
import { useCarousel } from "@/lib/use-carousel";
import { glyphBus } from "@/lib/glyph/bus";
import { SceneStage } from "./SceneStage";
import { SlideShell, type SlidePos } from "./SlideShell";
import { Hud } from "./Hud";
import { IndexNav } from "./IndexNav";
import { IndexMenu } from "./IndexMenu";
import { Cursor } from "./Cursor";
import { Intro } from "./Intro";

const WHEEL_THRESHOLD = 60;
const DRAG_THRESHOLD_RATIO = 0.18;

/**
 * 顶层编排。
 *
 *   SceneStage   单实例字符场（GlyphEngine，1 个 WebGL2 context）
 *   SlideShell×N 纯 DOM 文案层，data-pos = before / active / after 驱动 CSS 进出场
 *   Hud / IndexNav / IndexMenu / Cursor / Intro
 *
 * 输入：wheel / pointer drag / keyboard / URL hash。
 * 拖拽和触控板横扫在「提交」之前就会实时驱动字符场的 wipe 预览
 * （glyphBus.gesture），松手没过阈值则回弹 —— 转场是可以被手「拉」出来的。
 */
export function Carousel() {
  const rootRef = useRef<HTMLDivElement>(null);
  const index = useCarousel((s) => s.index);
  const booted = useCarousel((s) => s.booted);
  const menuOpen = useCarousel((s) => s.menuOpen);
  const goto = useCarousel((s) => s.goto);
  const gotoIndex = useCarousel((s) => s.gotoIndex);
  const gotoId = useCarousel((s) => s.gotoId);

  // DOM 跟手位移：直接写 CSS 变量，不触发 React 渲染
  const setDrag = (px: number) => {
    rootRef.current?.style.setProperty("--drag", `${px.toFixed(1)}px`);
  };

  // -------- 输入：wheel（含触控板横扫预览）----------
  useEffect(() => {
    // Mac 触控板惯性滚动会在停手后持续发 wheel event。翻页后进入「缴械」态，
    // 等到一次 ≥120ms 的静默才重新装弹，避免一次手势翻好几页。
    const SILENCE_MS = 120;
    let accum = 0;
    let armed = true;
    let silence: number | null = null;

    const settle = () => {
      if (silence !== null) window.clearTimeout(silence);
      silence = window.setTimeout(() => {
        armed = true;
        if (accum !== 0) {
          accum = 0;
          glyphBus.gesture(null, 0, 0);
          setDrag(0);
        }
        silence = null;
      }, SILENCE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (useCarousel.getState().menuOpen) return;
      e.preventDefault();
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const st = useCarousel.getState();
      if (st.busy || !armed || !st.booted) {
        armed = false;
        accum = 0;
        settle();
        return;
      }
      accum += dx;
      settle();
      const dir = accum > 0 ? 1 : -1;
      const target = st.index + dir;
      const amount = Math.min(1, Math.abs(accum) / WHEEL_THRESHOLD);
      if (Math.abs(accum) >= WHEEL_THRESHOLD) {
        accum = 0;
        armed = false;
        setDrag(0);
        goto(dir);
        glyphBus.gesture(null, 0, 0);
        return;
      }
      if (target >= 0 && target < SLIDES.length) {
        glyphBus.gesture(target, amount, amount * dir * 0.4);
        setDrag(-amount * dir * 14);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      if (silence !== null) window.clearTimeout(silence);
    };
  }, [goto]);

  // -------- 输入：键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useCarousel.getState();
      if (e.key === "i" || e.key === "I") {
        st.setMenu(!st.menuOpen);
        return;
      }
      if (st.menuOpen) return;
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
      } else if (/^[0-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10);
        if (n < SLIDES.length) {
          e.preventDefault();
          gotoIndex(n);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goto, gotoIndex]);

  // -------- 输入：pointer drag（跟手预览 + 过阈值提交）----------
  useEffect(() => {
    const drag = { active: false, id: -1, x0: 0, y0: 0, dx: 0, w: 1, horizontal: false };

    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("button, a, input, textarea, [data-no-drag]")) return;
      const st = useCarousel.getState();
      if (st.menuOpen || !st.booted || e.button !== 0) return;
      Object.assign(drag, { active: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, w: window.innerWidth, horizontal: false });
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x0;
      if (!drag.horizontal && Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(e.clientY - drag.y0)) {
        drag.horizontal = true;
      }
      if (!drag.horizontal) return;
      const st = useCarousel.getState();
      const dir = drag.dx < 0 ? 1 : -1;
      const target = st.index + dir;
      const ratio = Math.abs(drag.dx) / drag.w;
      const amount = Math.min(1, ratio / DRAG_THRESHOLD_RATIO);
      if (!st.busy && target >= 0 && target < SLIDES.length) {
        glyphBus.gesture(target, amount, amount * dir * 0.5);
      }
      // 端点处加阻尼
      const edge = target < 0 || target >= SLIDES.length ? 0.25 : 0.6;
      setDrag(drag.dx * 0.08 * edge * 2);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      const ratio = Math.abs(drag.dx) / drag.w;
      setDrag(0);
      if (drag.horizontal && ratio >= DRAG_THRESHOLD_RATIO) goto(drag.dx < 0 ? 1 : -1);
      // 提交后引擎已进入 auto，这里只负责把位移归零；未提交则触发回弹
      glyphBus.gesture(null, 0, 0);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [goto]);

  // -------- URL hash 双向同步 ----------
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (!id || !(id in SLIDE_INDEX_BY_ID)) return;
      // 开场前直接落到目标屏（开场凝聚出的就是它），之后走正常翻页
      if (!useCarousel.getState().booted) {
        useCarousel.setState({ index: SLIDE_INDEX_BY_ID[id], prevIndex: SLIDE_INDEX_BY_ID[id] });
      } else {
        gotoId(id);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [gotoId]);

  useEffect(() => {
    const id = SLIDES[index]?.id;
    if (id && window.location.hash.replace(/^#/, "") !== id) {
      window.history.replaceState(null, "", `#${id}`);
    }
  }, [index]);

  // -------- 阅读区 scrim：量出每一屏文案块的矩形，交给字符场压暗 ----------
  // 一次量全部 10 屏（隐藏的屏 visibility:hidden 仍然参与布局），转场时引擎按
  // 每个字符格的 wipe 进度在新旧两块之间切换。
  useEffect(() => {
    if (!booted) return;
    glyphBus.scrimOn(!menuOpen);
  }, [booted, menuOpen]);

  useEffect(() => {
    if (!booted) return;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const rectOf = (el: HTMLElement | null, pad: number) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        // display:none（手机上隐藏的图注）量出来是 0
        if (!r.width || !r.height) return null;
        return new DOMRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2);
      };
      glyphBus.scrims(
        SLIDES.map((s) => {
          const slide = root.querySelector<HTMLElement>(`[data-slide="${s.id}"]`);
          return [
            rectOf(slide?.querySelector<HTMLElement>("[data-scrim]") ?? null, 24),
            rectOf(slide?.querySelector<HTMLElement>("figure") ?? null, 14),
          ];
        }),
      );
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [booted]);

  const posOf = (i: number): SlidePos => (i === index ? "active" : i < index ? "before" : "after");

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 select-none overflow-hidden bg-ink"
      data-booted={booted ? "true" : "false"}
      data-menu={menuOpen ? "true" : "false"}
      style={{ touchAction: "pan-y" }}
    >
      <h1 className="sr-only">
        {profile.name} · {profile.aka} — {profile.title}
      </h1>
      <SceneStage />
      <main
        className="fade-on-menu absolute inset-0 z-10"
        style={{
          transform: "translate3d(var(--drag, 0px), 0, 0)",
          // 这里的 inline transition 会覆盖 .fade-on-menu 的，所以一并写上
          transition: "transform 0.45s var(--ease-out-expo), opacity 0.5s var(--ease-out-expo), filter 0.5s",
        }}
      >
        {SLIDES.map((slide, i) => (
          <SlideShell key={slide.id} slide={slide} index={i} pos={posOf(i)} />
        ))}
      </main>
      <Hud />
      <IndexNav />
      <IndexMenu />
      <Cursor />
      <Intro />
    </div>
  );
}

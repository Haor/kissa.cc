"use client";

import { create } from "zustand";
import { SLIDES, SLIDE_INDEX_BY_ID } from "./slides";

/**
 * Carousel 状态。
 *
 * 转场动画不再由 store 推进：字符场的 morph 由 GlyphEngine 自己计时，
 * DOM 文案的进出场由 CSS transition（data-active）驱动。store 只管
 * 「现在是哪一屏」+ 翻页冷却，所以每次翻页只触发一次 React 渲染。
 *
 *   - goto(delta)        相对翻页 (+1/-1)
 *   - gotoIndex(n)       绝对跳转
 *   - busy / pending     冷却期间的输入只保留最后一次，冷却结束立即执行
 */

const COOLDOWN_MS = 640;

export type CarouselState = {
  index: number;
  prevIndex: number;
  /** 上一次翻页方向：-1 / 0 / +1 */
  direction: -1 | 0 | 1;
  busy: boolean;
  pending: number | null;
  /** 开场 loader 结束，DOM 开始入场 */
  booted: boolean;
  /** 全屏目录是否打开 */
  menuOpen: boolean;
};

type CarouselActions = {
  goto: (delta: number) => void;
  gotoIndex: (i: number) => void;
  gotoId: (id: string) => void;
  setBooted: () => void;
  setMenu: (open: boolean) => void;
};

const last = SLIDES.length - 1;
const clamp = (n: number) => Math.max(0, Math.min(last, n));
let timer: ReturnType<typeof setTimeout> | null = null;

export const useCarousel = create<CarouselState & CarouselActions>((set, get) => ({
  index: 0,
  prevIndex: 0,
  direction: 0,
  busy: false,
  pending: null,
  booted: false,
  menuOpen: false,

  goto(delta) {
    const { pending, index } = get();
    get().gotoIndex((pending ?? index) + delta);
  },

  gotoIndex(target) {
    const next = clamp(target);
    const state = get();
    if (state.busy) {
      set({ pending: next === state.index ? null : next });
      return;
    }
    if (next === state.index) return;
    set({
      index: next,
      prevIndex: state.index,
      direction: next > state.index ? 1 : -1,
      busy: true,
      pending: null,
    });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const { pending } = get();
      set({ busy: false, pending: null });
      if (pending !== null) get().gotoIndex(pending);
    }, COOLDOWN_MS);
  },

  gotoId(id) {
    const i = SLIDE_INDEX_BY_ID[id];
    if (typeof i === "number") get().gotoIndex(i);
  },

  setBooted() {
    set({ booted: true });
  },

  setMenu(open) {
    set({ menuOpen: open });
  },
}));

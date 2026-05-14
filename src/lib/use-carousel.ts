"use client";

import { create } from "zustand";
import { SLIDES, SLIDE_INDEX_BY_ID } from "./slides";

/**
 * Carousel state + 输入聚合。
 *
 * 单一动作：
 *   - goto(delta)        相对翻页 (+1/-1)
 *   - gotoIndex(n)       绝对跳转
 *   - setTransition(p)   由 Carousel 的 RAF 驱动 0..1 进度
 *   - finishTransition() transition 结束、解开 cooldown
 */

const COOLDOWN_MS = 720; // 转场 600ms + 120ms 缓冲

export type CarouselState = {
  index: number;
  /** 转场期间的"旧屏"index；稳态时 = index */
  prevIndex: number;
  /** 上一次翻页方向：-1 / 0 / +1 */
  direction: -1 | 0 | 1;
  /** transition 进度 0..1；0 表示稳态，1 表示完成切换那一瞬间 */
  transition: number;
  /** 正在 transition；期间忽略新输入（但保留最后一次） */
  busy: boolean;
  pending: number | null; // 等待中的目标 index（取最后一次）
};

type CarouselActions = {
  goto: (delta: number) => void;
  gotoIndex: (i: number) => void;
  gotoId: (id: string) => void;
  setTransition: (p: number) => void;
  finishTransition: () => void;
};

const last = SLIDES.length - 1;
const clamp = (n: number) => Math.max(0, Math.min(last, n));

export const useCarousel = create<CarouselState & CarouselActions>((set, get) => ({
  index: 0,
  prevIndex: 0,
  direction: 0,
  transition: 0,
  busy: false,
  pending: null,

  goto(delta) {
    get().gotoIndex(get().index + delta);
  },

  gotoIndex(target) {
    const next = clamp(target);
    const state = get();
    if (next === state.index && !state.busy) return;
    if (state.busy) {
      // 在 transition 期间，只保存最后一次目标
      set({ pending: next });
      return;
    }
    if (next === state.index) return;
    const direction = next > state.index ? 1 : -1;
    set({
      index: next,
      prevIndex: state.index,
      direction,
      transition: 0,
      busy: true,
      pending: null,
    });
  },

  gotoId(id) {
    const i = SLIDE_INDEX_BY_ID[id];
    if (typeof i === "number") get().gotoIndex(i);
  },

  setTransition(p) {
    set({ transition: Math.max(0, Math.min(1, p)) });
  },

  finishTransition() {
    const { pending, index } = get();
    set({ transition: 0, busy: false, direction: 0, prevIndex: index });
    if (pending !== null) {
      // 立即触发挂起的目标
      setTimeout(() => get().gotoIndex(pending), 0);
    }
  },
}));

export { COOLDOWN_MS };

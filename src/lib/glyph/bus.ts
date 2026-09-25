import type { GlyphEngine } from "./engine";

/**
 * 引擎的模块级入口。
 *
 * 手势预览、涟漪、阅读区 scrim 这些信号每帧都可能变，不能走 React state
 * （会触发整棵树重渲染）。SceneStage mount 时把引擎挂到这里，其它组件
 * 直接调用；引擎还没起来时全部是 no-op。
 */
let engine: GlyphEngine | null = null;
let resolveReady: () => void = () => {};

/** 字体 + mask 全部到位（或 WebGL 不可用而放弃）时 resolve */
const ready = new Promise<void>((r) => (resolveReady = r));

export const glyphBus = {
  ready,
  attach(e: GlyphEngine | null) {
    engine = e;
    if (e) e.ready.then(resolveReady);
  },
  /** WebGL2 不可用：直接放行开场 */
  fail() {
    resolveReady();
  },
  target(i: number) {
    engine?.setTarget(i);
  },
  boot(i: number) {
    engine?.boot(i);
  },
  gesture(target: number | null, amount: number, drag: number) {
    engine?.setGesture(target, amount, drag);
  },
  aside(on: boolean) {
    engine?.setAside(on);
  },
  ripple(x: number, y: number, amp?: number) {
    engine?.ripple(x, y, amp);
  },
  scrims(rects: (DOMRect | null)[]) {
    engine?.setScrims(rects);
  },
  scrimOn(on: boolean) {
    engine?.setScrimOn(on);
  },
};

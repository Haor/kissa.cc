"use client";

/**
 * 极轻的切屏音效：单振荡器，5ms attack / 30ms release，800Hz。
 * 默认静音（用户 opt-in），开关持久化到 localStorage。
 */

const STORAGE_KEY = "kissa.sound.enabled";

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/**
 * Soft click：用滤波白噪声 burst 模拟机械按键的"咔哒"感。
 *  - 短爆发: ~45ms
 *  - 带通滤波 1.6kHz Q=5（让噪声呈金属/键盘音色）
 *  - 极轻 gain（默认峰值 0.06）
 */
export function playTick(opts?: { gainPeak?: number; releaseMs?: number; freq?: number }): void {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const sampleRate = c.sampleRate;
  const releaseMs = opts?.releaseMs ?? 45;
  const lifeMs = releaseMs + 6;
  const length = Math.max(1, Math.floor((sampleRate * lifeMs) / 1000));

  // 生成短促白噪声
  const buffer = c.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  // 带通滤波让噪声呈"咔哒"音色
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = opts?.freq ?? 1600;
  filter.Q.value = 5;

  // 高通过滤掉低频隆隆
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 600;

  const gain = c.createGain();
  const now = c.currentTime;
  const peak = opts?.gainPeak ?? 0.06;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.003 + releaseMs / 1000);

  noise.connect(filter);
  filter.connect(hp);
  hp.connect(gain);
  gain.connect(c.destination);
  noise.start(now);
  noise.stop(now + lifeMs / 1000);
}

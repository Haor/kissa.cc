"use client";

/**
 * 单色 line SVG 图标。统一 16px / stroke=currentColor / 1.5 line-width。
 * 不使用图标库，4 个内联 path 即可。
 */

type IconName = "mail" | "discord" | "telegram" | "vrchat" | "back" | "copy";

const PATHS: Record<IconName, React.ReactNode> = {
  mail: (
    <>
      <rect x="2.5" y="4" width="13" height="10" rx="1.2" />
      <path d="M3 5l6 4.5L15 5" />
    </>
  ),
  discord: (
    <>
      <path d="M5 5.5C6.5 5 8 4.8 9 4.8s2.5.2 4 0.7M5 12.5c1.5 0.5 3 0.7 4 0.7s2.5-0.2 4-0.7" />
      <path d="M4.5 6c-1 1.6-1.5 3.5-1.5 5.2 0 0.6 0.6 1 1.1 0.9 0.6-0.1 1.4-0.4 1.9-0.8" />
      <path d="M13.5 6c1 1.6 1.5 3.5 1.5 5.2 0 0.6-0.6 1-1.1 0.9-0.6-0.1-1.4-0.4-1.9-0.8" />
      <circle cx="7" cy="9.5" r="0.9" />
      <circle cx="11" cy="9.5" r="0.9" />
    </>
  ),
  telegram: (
    <>
      <path d="M15 3L1.8 8.4c-0.5 0.2-0.5 0.9 0 1.1l3.2 1.2 1.4 4c0.1 0.4 0.6 0.5 0.9 0.2L9 13l3.4 2.5c0.4 0.3 0.9 0.1 1-0.4L15 3z" />
      <path d="M5 10.7l7-5.4-5.5 6" />
    </>
  ),
  vrchat: (
    // 简化 VR headset 轮廓：横置胶囊 + 双目护盖 + 顶部头带挂点
    <>
      <rect x="1.6" y="5.4" width="14.8" height="7.6" rx="2.4" />
      <path d="M5 8.4l1.4 2.4M11 8.4l-1.4 2.4M8.5 7.6v3.2" />
      <path d="M6 5.2l0.6-1.4h4.8l0.6 1.4" />
    </>
  ),
  back: (
    <>
      <path d="M14 9a5 5 0 1 1-1.5-3.5" />
      <path d="M14 3v3h-3" />
    </>
  ),
  copy: (
    <>
      <rect x="5.6" y="5.6" width="8.4" height="9.4" rx="1.2" />
      <path d="M3.2 11.4V4.6c0-0.7 0.6-1.4 1.4-1.4h6.8" />
    </>
  ),
};

export function ContactIcon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };

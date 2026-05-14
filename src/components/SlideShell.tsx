"use client";

import type { Slide } from "@/lib/slides";
import { profile } from "@/lib/data";
import { THEMES } from "@/lib/theme";
import { useMask } from "@/lib/use-mask";
import { AsciiStage } from "./AsciiStage";

type Props = {
  slide: Slide;
  index: number;
  total: number;
};

export function SlideShell({ slide, index, total }: Props) {
  const theme = THEMES[slide.theme];
  const mask = useMask(slide.maskId);

  return (
    <section
      className="slide-root relative h-full w-full overflow-hidden"
      style={
        {
          "--bg": theme.bg,
          "--fg": theme.fg,
          "--accent": theme.accent,
        } as React.CSSProperties
      }
      aria-labelledby={`slide-${slide.id}-title`}
    >
      <h1 id={`slide-${slide.id}-title`} className="sr-only">
        {slide.label}
      </h1>

      <div className="absolute inset-0 z-0">
        <AsciiStage slide={slide} theme={theme} index={index} mask={mask} />
      </div>

      {/* 柔和的顶/底蒙层：让 chrome 和文案文字更易读，
       *  不挡视觉中心的 ASCII */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-28"
        style={{
          background: `linear-gradient(to bottom, ${theme.bg} 0%, ${theme.bg}cc 35%, transparent 100%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-48"
        style={{
          background: `linear-gradient(to top, ${theme.bg} 0%, ${theme.bg}cc 40%, transparent 100%)`,
        }}
      />

      <SlideChrome slide={slide} index={index} total={total} />
      <SlideContent slide={slide} />
    </section>
  );
}

function SlideChrome({
  slide,
  index,
  total,
}: {
  slide: Slide;
  index: number;
  total: number;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-6 top-6 z-20 font-mono text-[11px] uppercase tracking-[0.32em] opacity-60">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span className="mx-1 opacity-50">/</span>
        <span className="opacity-60">{String(total).padStart(2, "0")}</span>
        <span className="mx-3 opacity-30">·</span>
        <span className="opacity-80">{slide.label}</span>
      </div>
      <div className="pointer-events-none absolute right-6 top-6 z-20 hidden font-mono text-[10px] uppercase tracking-[0.3em] opacity-40 sm:block">
        kissa.dev
      </div>
    </>
  );
}

function SlideContent({ slide }: { slide: Slide }) {
  switch (slide.id) {
    case "cover":
      return <CoverContent slide={slide} />;
    case "about":
      return <AboutContent slide={slide} />;
    case "contact":
      return <ContactContent slide={slide} />;
    default:
      return <BrandContent slide={slide} />;
  }
}

// ---------------- Templates ----------------

function CoverContent({ slide }: { slide: Slide }) {
  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full flex-col font-mono">
      <div className="mt-auto px-8 pb-28 pl-10">
        <div className="text-[10px] uppercase tracking-[0.5em] opacity-50">
          a personal homepage
        </div>
        <div className="mt-3 text-[2.4rem] leading-[1.05] tracking-tight md:text-[3.4rem]">
          {slide.sentence}
        </div>
        <div className="mt-4 text-sm opacity-70">
          {profile.name} <span className="opacity-50">·</span> {profile.aka}
        </div>
        <div className="mt-1 text-xs opacity-50">
          {profile.title} <span className="opacity-50">·</span> {profile.location}
        </div>
        <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] opacity-60">
          <span className="kbd">→</span>
          <span>slide</span>
          <span className="opacity-40">·</span>
          <span className="kbd">1</span>
          <span className="opacity-40">..</span>
          <span className="kbd">8</span>
          <span>jump</span>
        </div>
      </div>
    </div>
  );
}

function AboutContent({ slide }: { slide: Slide }) {
  // 与 brand 屏保持一致的"底部居中"布局，让画册视觉语言统一
  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-lg text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-60"
          style={{ color: "var(--fg)" }}
        >
          who
        </div>
        <p
          className="mt-3 text-2xl md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed opacity-70">
          {slide.intent}
        </p>
        {slide.cta && (
          <a
            href={slide.cta.href}
            className="mt-6 inline-block border-b border-current pb-1 text-sm opacity-80 transition-opacity hover:opacity-100"
          >
            {slide.cta.label}
          </a>
        )}
      </div>
    </div>
  );
}

function BrandContent({ slide }: { slide: Slide }) {
  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-md text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-60"
          style={{ color: "var(--fg)" }}
        >
          {slide.handle}
        </div>
        <p
          className="mt-3 text-lg md:text-xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.intent}
        </p>
        {slide.cta && (
          <a
            href={slide.cta.href}
            target={slide.cta.href.startsWith("http") ? "_blank" : undefined}
            rel={slide.cta.href.startsWith("http") ? "noreferrer noopener" : undefined}
            className="mt-6 inline-block border-b border-current pb-1 text-sm opacity-80 transition-opacity hover:opacity-100"
          >
            {slide.cta.label}
          </a>
        )}
      </div>
    </div>
  );
}

function ContactContent({ slide }: { slide: Slide }) {
  // 底部居中布局：与 brand/about 风格统一；三条联系方式 inline 横排
  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-xl text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-60"
          style={{ color: "var(--fg)" }}
        >
          end of transmission
        </div>
        <p
          className="mt-3 text-2xl md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        {slide.contacts && (
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            {slide.contacts.map((c, i) => (
              <li key={c.label} className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.35em] opacity-55">
                  {c.label}
                </span>
                <a
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={c.href.startsWith("http") ? "noreferrer noopener" : undefined}
                  className="border-b border-current pb-0.5 opacity-90 transition-opacity hover:opacity-100"
                >
                  {c.value}
                </a>
                {i < (slide.contacts?.length ?? 0) - 1 && (
                  <span className="opacity-30">·</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 text-[10px] uppercase tracking-[0.35em] opacity-40">
          {profile.handle} · {profile.location}
        </div>
      </div>
    </div>
  );
}

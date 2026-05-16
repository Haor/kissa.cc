"use client";

import { useState } from "react";
import type { Slide } from "@/lib/slides";
import { profile } from "@/lib/data";
import { THEMES } from "@/lib/theme";
import { ContactIcon, type IconName } from "./ContactIcon";

const CONTACT_ICON_MAP: Record<string, IconName> = {
  email: "mail",
  discord: "discord",
  telegram: "telegram",
  vrchat: "vrchat",
  back: "back",
};

type Props = {
  slide: Slide;
  index: number;
  total: number;
};

export function SlideShell({ slide, index, total }: Props) {
  const theme = THEMES[slide.theme];

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

      {/* ASCII 背景由顶层 <SceneStage /> 单实例渲染，这里不再各自起 GL context。 */}

      {/* 柔和的顶/底蒙层：让 chrome 和文案文字更易读，
       *  不挡视觉中心的 ASCII */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32"
        style={{
          background: `linear-gradient(to bottom, ${theme.bg}f2 0%, ${theme.bg}99 45%, transparent 100%)`,
        }}
      />
      {/* 底部 overlay 柔化：shader 端已经接管"阅读带"亮度衰减，CSS 这里只做
       *  最后一点点贴底色加深，保证 chrome 文字与底部装饰仍然可读。 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
        style={{
          // 含密集列表的屏（hardware / links）给更高更深的渐变；其它屏保持原 h-40 高度
          height: slide.id === "hardware" || slide.id === "links" ? "60%" : "10rem",
          background:
            slide.id === "hardware" || slide.id === "links"
              ? `linear-gradient(to top, ${theme.bg}f8 0%, ${theme.bg}cc 35%, ${theme.bg}66 65%, transparent 100%)`
              : `linear-gradient(to top, ${theme.bg}f2 0%, ${theme.bg}80 50%, transparent 100%)`,
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
      <div className="text-soft-shadow pointer-events-none absolute left-6 top-6 z-20 font-mono text-[11px] uppercase tracking-[0.32em] opacity-70">
        <span>{String(index).padStart(2, "0")}</span>
        <span className="mx-1 opacity-60">/</span>
        <span className="opacity-70">{String(total - 1).padStart(2, "0")}</span>
        <span className="mx-3 opacity-40">·</span>
        <span className="opacity-90">{slide.label}</span>
      </div>
      <div className="text-soft-shadow pointer-events-none absolute right-6 top-6 z-20 hidden font-mono text-[10px] uppercase tracking-[0.3em] opacity-55 sm:block">
        kissa.cc
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
    case "hardware":
      return <HardwareContent slide={slide} />;
    case "links":
      return <LinksContent slide={slide} />;
    case "contact":
      return <ContactContent slide={slide} />;
    default:
      return <BrandContent slide={slide} />;
  }
}

// ---------------- Templates ----------------

function CoverContent({ slide }: { slide: Slide }) {
  return (
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full flex-col font-mono">
      <div className="mt-auto px-8 pb-28 pl-10">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] opacity-60">
          <span
            className="inline-block h-px w-8"
            style={{ background: "currentColor" }}
            aria-hidden="true"
          />
          <span>{slide.kicker ?? `${profile.name.toLowerCase()} · index`}</span>
        </div>
        <div className="mt-3 text-[2.4rem] font-medium leading-[1.05] tracking-tight md:text-[3.4rem]">
          {slide.sentence}
        </div>
        <div className="mt-4 text-sm opacity-80">
          {profile.name} <span className="opacity-55">·</span> {profile.aka}
        </div>
        <div className="mt-1 text-xs opacity-60">{profile.title}</div>
        <div className="mt-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] opacity-70">
          <span>→</span>
          <span>slide</span>
          <span className="opacity-40">·</span>
          <span>0–9</span>
          <span>jump</span>
        </div>
      </div>
    </div>
  );
}

function AboutContent({ slide }: { slide: Slide }) {
  return (
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-lg text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-70"
          style={{ color: "var(--fg)" }}
        >
          who
        </div>
        <p
          className="mt-3 text-2xl font-medium md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed opacity-80">
          {slide.intent}
        </p>
        {slide.cta && (
          <a
            href={slide.cta.href}
            className="mt-6 inline-block border-b border-current/80 pb-1 text-sm opacity-90 transition-opacity hover:opacity-100"
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
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-md text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-70"
          style={{ color: "var(--fg)" }}
        >
          {slide.handle}
        </div>
        <p
          className="mt-3 text-lg font-medium md:text-xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.intent}
        </p>
        {slide.cta && (
          <a
            href={slide.cta.href}
            target={slide.cta.href.startsWith("http") ? "_blank" : undefined}
            rel={slide.cta.href.startsWith("http") ? "noreferrer noopener" : undefined}
            className="mt-6 inline-block border-b border-current/80 pb-1 text-sm opacity-90 transition-opacity hover:opacity-100"
          >
            {slide.cta.label}
          </a>
        )}
      </div>
    </div>
  );
}

function HardwareContent({ slide }: { slide: Slide }) {
  return (
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-20 font-mono">
      <div className="pointer-events-auto w-full max-w-2xl text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-70"
          style={{ color: "var(--fg)" }}
        >
          rig
        </div>
        <p
          className="mt-3 text-2xl font-medium md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        {slide.hardware && (
          <dl className="mx-auto mt-5 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-left">
            {slide.hardware.map((row) => (
              <div key={row.group} className="contents">
                <dt className="text-right text-[10px] uppercase tracking-[0.35em] opacity-60">
                  {row.group}
                </dt>
                <dd className="text-sm opacity-90">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function LinksContent({ slide }: { slide: Slide }) {
  const groups: { key: keyof NonNullable<Slide["links"]>; label: string }[] = [
    { key: "projects", label: "projects" },
    { key: "tools", label: "tools" },
    { key: "friends", label: "friends" },
  ];
  return (
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-20 font-mono">
      <div className="pointer-events-auto w-full max-w-3xl text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-70"
          style={{ color: "var(--fg)" }}
        >
          out there
        </div>
        <p
          className="mt-3 text-2xl font-medium md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        {slide.links && (
          <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 text-left sm:grid-cols-3">
            {groups.map((g) => {
              const items = slide.links?.[g.key] ?? [];
              return (
                <div key={g.key}>
                  <div className="text-[10px] uppercase tracking-[0.4em] opacity-55">
                    {g.label}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {items.map((it, i) => {
                      const isPlaceholder = it.href === "#";
                      return (
                        <li key={`${it.label}-${i}`} className="leading-tight">
                          <a
                            href={it.href}
                            target={
                              it.href.startsWith("http") ? "_blank" : undefined
                            }
                            rel={
                              it.href.startsWith("http")
                                ? "noreferrer noopener"
                                : undefined
                            }
                            aria-disabled={isPlaceholder || undefined}
                            className={`block whitespace-nowrap text-sm transition-opacity ${
                              isPlaceholder
                                ? "opacity-35"
                                : "opacity-85 hover:opacity-100"
                            }`}
                          >
                            {it.label}
                          </a>
                          {it.note && (
                            <div className="mt-0.5 whitespace-nowrap text-[10px] opacity-55">
                              {it.note}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactContent({ slide }: { slide: Slide }) {
  return (
    <div className="text-soft-shadow pointer-events-none relative z-10 flex h-full w-full items-end justify-center px-8 pb-24 font-mono">
      <div className="pointer-events-auto max-w-xl text-center">
        <div
          className="text-[11px] uppercase tracking-[0.45em] opacity-70"
          style={{ color: "var(--fg)" }}
        >
          end of transmission
        </div>
        <p
          className="mt-3 text-2xl font-medium md:text-3xl"
          style={{ color: "var(--fg)" }}
        >
          {slide.sentence}
        </p>
        {slide.contacts && (
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm">
            {slide.contacts.map((c) => (
              <ContactRow key={c.label} contact={c} />
            ))}
          </ul>
        )}
        <div className="mt-6 text-[10px] uppercase tracking-[0.35em] opacity-50">
          {profile.handle}
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  contact: c,
}: {
  contact: NonNullable<Slide["contacts"]>[number];
}) {
  const icon = CONTACT_ICON_MAP[c.label];
  const [copied, setCopied] = useState(false);
  const isCopy = c.action === "copy";

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(c.href);
      } else {
        // 旧浏览器降级：临时 textarea + execCommand
        const ta = document.createElement("textarea");
        ta.value = c.href;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  if (isCopy) {
    return (
      <li>
        <button
          type="button"
          onClick={handleCopy}
          className="group inline-flex items-center gap-2 opacity-85 transition-opacity hover:opacity-100"
          aria-label={`copy ${c.label} ${c.href}`}
        >
          {icon && (
            <ContactIcon
              name={copied ? "copy" : icon}
              className="opacity-80 transition-opacity group-hover:opacity-100"
            />
          )}
          <span className="text-[10px] uppercase tracking-[0.32em] opacity-65">
            {c.label}
          </span>
          <span className="relative border-b border-dashed border-current/60 pb-0.5 transition-colors group-hover:border-current">
            {copied ? "copied" : c.value}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <a
        href={c.href}
        target={c.href.startsWith("http") ? "_blank" : undefined}
        rel={c.href.startsWith("http") ? "noreferrer noopener" : undefined}
        className="group inline-flex items-center gap-2 opacity-85 transition-opacity hover:opacity-100"
      >
        {icon && (
          <ContactIcon
            name={icon}
            className="opacity-80 transition-opacity group-hover:opacity-100"
          />
        )}
        <span className="text-[10px] uppercase tracking-[0.32em] opacity-65">
          {c.label}
        </span>
        <span className="border-b border-current/60 pb-0.5 transition-colors group-hover:border-current">
          {c.value}
        </span>
      </a>
    </li>
  );
}

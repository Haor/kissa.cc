"use client";

import { useState, type CSSProperties } from "react";
import type { Slide, LinkItem } from "@/lib/slides";
import { profile } from "@/lib/data";
import { THEMES } from "@/lib/theme";
import { useCarousel } from "@/lib/use-carousel";
import { ContactIcon, type IconName } from "./ContactIcon";
import { Magnetic, Scramble, Words } from "./Kinetic";

const CONTACT_ICON_MAP: Record<string, IconName> = {
  email: "mail",
  discord: "discord",
  telegram: "telegram",
  vrchat: "vrchat",
  back: "back",
};

export type SlidePos = "before" | "active" | "after";

type Props = {
  slide: Slide;
  index: number;
  pos: SlidePos;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isExternal = (href: string) => href.startsWith("http");
const extProps = (href: string) =>
  isExternal(href) ? { target: "_blank", rel: "noreferrer noopener" } : {};
/** site.json 里的 CTA 文案自带 "→"，统一换成我们自己的箭头 */
const ctaText = (label: string) => label.replace(/\s*[→↗]\s*$/, "");

/** 进场 stagger：d = 序号，base = 起始延迟 */
const d = (i: number): CSSProperties => ({ "--d": i }) as CSSProperties;

export function SlideShell({ slide, index, pos }: Props) {
  const theme = THEMES[slide.theme];
  const booted = useCarousel((s) => s.booted);
  const live = pos === "active" && booted;
  const right = slide.text === "right";

  return (
    <section
      className="slide absolute inset-0"
      data-pos={pos}
      data-slide={slide.id}
      style={{ "--accent": theme.glyph } as CSSProperties}
      aria-hidden={pos !== "active"}
      inert={pos !== "active"}
      aria-labelledby={`slide-${slide.id}-title`}
    >
      <h2 id={`slide-${slide.id}-title`} className="sr-only">
        {pad(index)} {slide.label}
      </h2>

      <div
        data-scrim=""
        className={`ink-shadow absolute inset-x-[var(--gutter)] ${
          right
            ? "bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-auto md:left-auto md:right-[var(--gutter)] md:top-1/2 md:w-[min(44vw,600px)] md:-translate-y-1/2"
            : "bottom-[calc(76px+env(safe-area-inset-bottom))] md:right-auto md:bottom-[clamp(104px,15vh,160px)] md:w-[min(48vw,700px)]"
        }`}
      >
        <SlideContent slide={slide} index={index} live={live} />
      </div>

      <FigureCaption slide={slide} />
    </section>
  );
}

function SlideContent({ slide, index, live }: { slide: Slide; index: number; live: boolean }) {
  switch (slide.id) {
    case "cover":
      return <CoverContent slide={slide} live={live} />;
    case "about":
      return <AboutContent slide={slide} index={index} />;
    case "hardware":
      return <HardwareContent slide={slide} index={index} live={live} />;
    case "links":
      return <LinksContent slide={slide} index={index} />;
    case "contact":
      return <ContactContent slide={slide} index={index} />;
    default:
      return <BrandContent slide={slide} index={index} live={live} />;
  }
}

// ---------------------------------------------------------------------------
// 公共件
// ---------------------------------------------------------------------------

function Eyebrow({ index, text, i = 0 }: { index: number; text: string; i?: number }) {
  return (
    <div className="tag rv flex items-center gap-3" style={d(i)}>
      <span className="inline-block size-[7px]" style={{ background: "var(--accent)" }} />
      <span className="opacity-90">{pad(index)}</span>
      <span className="inline-block h-px w-6 bg-current opacity-40" />
      <span className="opacity-70">{text}</span>
    </div>
  );
}

function Display({
  text,
  size = "md",
  start = 1,
}: {
  text: string;
  size?: "xl" | "md";
  start?: number;
}) {
  return (
    <p
      className={`font-serif font-normal leading-[0.92] tracking-[-0.012em] ${
        size === "xl"
          ? "text-[clamp(64px,10.5vw,196px)]"
          : "text-[clamp(46px,6.4vw,118px)]"
      }`}
    >
      <Words text={text} start={start} />
    </p>
  );
}

function Cta({ href, label, i }: { href: string; label: string; i: number }) {
  return (
    <div className="rv mt-9" style={d(i)}>
      <Magnetic strength={0.22}>
        <a href={href} {...extProps(href)} className="cta" data-cursor={isExternal(href) ? "open" : "mail"}>
          <span>{ctaText(label)}</span>
          <span className="arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      </Magnetic>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 模板
// ---------------------------------------------------------------------------

function CoverContent({ slide, live }: { slide: Slide; live: boolean }) {
  return (
    <div>
      <div className="tag rv flex items-center gap-3" style={d(0)}>
        <span className="inline-block size-[7px]" style={{ background: "var(--accent)" }} />
        <span className="opacity-70">{slide.kicker}</span>
      </div>
      <div className="mt-5 -ml-[0.04em]">
        <Display text={slide.sentence ?? ""} size="xl" start={1} />
      </div>
      <div className="rule mt-8 max-w-[560px]" style={d(4)} />
      <div className="mt-5 flex max-w-[560px] flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
        <p className="rv text-[14px] tracking-[0.04em]" style={d(5)}>
          {profile.name} <span className="opacity-40">/</span> {profile.aka}
        </p>
        <div className="tag rv flex items-center gap-3 opacity-60" style={d(6)}>
          <span className="nudge inline-block">→</span>
          {/* 触屏没有键盘和滚轮 */}
          <Scramble text="scroll · drag · 0–9" active={live} delay={1100} className="hidden md:inline" />
          <Scramble text="swipe" active={live} delay={1100} className="md:hidden" />
        </div>
      </div>
    </div>
  );
}

function AboutContent({ slide, index }: { slide: Slide; index: number }) {
  const [engineer, dreamer] = (slide.sentence ?? "").split("·").map((s) => s.trim());
  return (
    <div>
      <Eyebrow index={index} text={slide.eyebrow ?? slide.label} />
      <p className="rv mt-7 text-[clamp(22px,2.6vw,40px)] font-medium uppercase leading-none tracking-[0.14em]" style={d(1)}>
        {engineer}
      </p>
      {dreamer && (
        <div className="mt-2">
          <Display text={`& ${dreamer.toLowerCase()}.`} start={2} />
        </div>
      )}
      {slide.intent && (
        <p className="rv mt-8 max-w-[44ch] text-[13.5px] leading-[1.75] opacity-75" style={d(5)}>
          {slide.intent}
        </p>
      )}
      {slide.cta && <Cta href={slide.cta.href} label={slide.cta.label} i={6} />}
    </div>
  );
}

function BrandContent({ slide, index, live }: { slide: Slide; index: number; live: boolean }) {
  return (
    <div>
      <Eyebrow index={index} text={slide.eyebrow ?? slide.label} />
      <div className="mt-6">
        <Display text={slide.intent ?? ""} start={1} />
      </div>
      {slide.handle && (
        <div className="rv mt-7 flex items-baseline gap-4" style={d(4)}>
          <span className="tag opacity-40">handle</span>
          <Scramble
            text={slide.handle}
            active={live}
            delay={620}
            className="text-[16px] tracking-[0.04em]"
          />
        </div>
      )}
      {slide.cta && <Cta href={slide.cta.href} label={slide.cta.label} i={5} />}
    </div>
  );
}

function HardwareContent({ slide, index, live }: { slide: Slide; index: number; live: boolean }) {
  const rows = slide.hardware ?? [];
  return (
    <div>
      <Eyebrow index={index} text={slide.eyebrow ?? slide.label} />
      <div className="mt-6">
        <Display text={slide.sentence ?? ""} start={1} />
      </div>
      <div className="rule mt-9" style={d(3)} />
      <dl className="mt-1">
        {rows.map((row, i) => (
          <div
            key={row.group}
            className="rv grid grid-cols-[2.2em_7.5em_1fr] items-baseline gap-x-3 border-b border-current/10 py-[9px] text-[13px]"
            style={d(4 + i)}
          >
            <span className="tag opacity-30">{pad(i + 1)}</span>
            <dt className="tag opacity-55">{row.group}</dt>
            <dd className="truncate opacity-95">
              <Scramble text={row.value} active={live} delay={560 + i * 70} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LinkRow({ it, n }: { it: LinkItem; n: number }) {
  const placeholder = it.href === "#";
  return (
    <li>
      <a
        href={it.href}
        {...extProps(it.href)}
        aria-disabled={placeholder || undefined}
        data-cursor="open"
        className={`row grid grid-cols-[2.2em_1fr_auto_1.2em] items-baseline gap-x-3 py-[7px] ${
          placeholder ? "pointer-events-none opacity-35" : ""
        }`}
      >
        <span className="tag opacity-30">{pad(n)}</span>
        <span className="shift truncate text-[14px]">{it.label}</span>
        {it.note ? (
          <span className="font-serif hidden text-[17px] leading-none opacity-60 sm:inline">{it.note}</span>
        ) : (
          <span />
        )}
        <span className="go text-right text-[13px]" aria-hidden="true">
          ↗
        </span>
      </a>
    </li>
  );
}

function LinksContent({ slide, index }: { slide: Slide; index: number }) {
  const groups: { key: keyof NonNullable<Slide["links"]>; label: string }[] = [
    { key: "projects", label: "projects" },
    { key: "tools", label: "tools" },
    { key: "friends", label: "friends" },
  ];
  let n = 0;
  let k = 3;
  return (
    <div>
      <Eyebrow index={index} text={slide.eyebrow ?? slide.label} />
      <div className="mt-6">
        <Display text={slide.sentence ?? ""} start={1} />
      </div>
      <div className="mt-7 space-y-5">
        {groups.map((g) => {
          const items = slide.links?.[g.key] ?? [];
          if (!items.length) return null;
          const gi = k++;
          return (
            <div key={g.key}>
              <div className="rv flex items-center gap-3" style={d(gi)}>
                <span className="tag opacity-45">{g.label}</span>
                <span className="tag opacity-25">{pad(items.length)}</span>
              </div>
              <div className="rule mt-2" style={d(gi)} />
              <ul className="rv mt-1" style={d(gi + 1)}>
                {items.map((it) => (
                  <LinkRow key={it.label} it={it} n={++n} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContactContent({ slide, index }: { slide: Slide; index: number }) {
  const contacts = slide.contacts ?? [];
  const main = contacts.filter((c) => c.label !== "back");
  const back = contacts.find((c) => c.label === "back");
  return (
    <div>
      <Eyebrow index={index} text={slide.eyebrow ?? slide.label} />
      <div className="mt-6">
        <Display text={slide.sentence ?? ""} start={1} />
      </div>
      <div className="rule mt-9" style={d(4)} />
      <ul>
        {main.map((c, i) => (
          <ContactRow key={c.label} contact={c} i={5 + i} />
        ))}
      </ul>
      <div className="rv mt-8 flex items-center justify-between" style={d(10)}>
        {back && (
          <a href={back.href} className="tag group inline-flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100">
            <ContactIcon name="back" size={14} className="transition-transform duration-700 group-hover:-rotate-[200deg]" />
            <span>
              back <span className="opacity-50">·</span> {back.value}
            </span>
          </a>
        )}
        <span className="tag opacity-35">{profile.handle}</span>
      </div>
    </div>
  );
}

function ContactRow({
  contact: c,
  i,
}: {
  contact: NonNullable<Slide["contacts"]>[number];
  i: number;
}) {
  const icon = CONTACT_ICON_MAP[c.label];
  const [copied, setCopied] = useState(false);
  const isCopy = c.action === "copy";

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(c.href);
      } else {
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
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const inner = (
    <>
      <span className="opacity-60">{icon && <ContactIcon name={copied ? "copy" : icon} size={15} />}</span>
      <span className="tag opacity-50">{c.label}</span>
      <span className="shift truncate text-[15px]">{copied ? "copied to clipboard" : c.value}</span>
      <span className="go tag text-right" aria-hidden="true">
        {isCopy ? (copied ? "✓" : "copy") : "↗"}
      </span>
    </>
  );
  const cls =
    "row grid w-full grid-cols-[1.6em_6.5em_1fr_auto] items-center gap-x-3 border-b border-current/10 py-[13px] text-left";

  return (
    <li className="rv" style={d(i)}>
      {isCopy ? (
        <button type="button" onClick={handleCopy} className={cls} data-cursor="copy" aria-label={`copy ${c.label} ${c.href}`}>
          {inner}
        </button>
      ) : (
        <a href={c.href} {...extProps(c.href)} className={cls} data-cursor={c.label === "email" ? "mail" : "open"}>
          {inner}
        </a>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Figure 注释：像展签一样贴在 figure 下沿
// ---------------------------------------------------------------------------

function FigureCaption({ slide }: { slide: Slide }) {
  const note = slide.figureNote;
  if (!note) return null;
  const right = slide.text === "right";
  return (
    <figure
      className={`ink-shadow pointer-events-none absolute top-[76px] hidden text-right md:top-auto md:block md:bottom-[clamp(96px,13vh,140px)] ${
        right ? "md:left-[calc(var(--gutter)+2px)] md:text-left" : "right-[var(--gutter)]"
      }`}
    >
      <div className={`tag rv flex items-center gap-3 opacity-45 ${right ? "" : "justify-end"}`} style={d(3)}>
        <span>fig.</span>
        <span className="inline-block h-px w-5 bg-current" />
        <span>{note.fig}</span>
      </div>
      <figcaption className={`rv mt-3 flex items-baseline gap-3 ${right ? "" : "justify-end"}`} style={d(4)}>
        {note.mark && <span className="text-[26px] leading-none">{note.mark}</span>}
        <span className="font-serif text-[19px] leading-none opacity-80">
          {note.reading ? (
            <>
              {note.reading} <span className="opacity-50">—</span> {note.gloss}
            </>
          ) : (
            note.gloss
          )}
        </span>
      </figcaption>
    </figure>
  );
}

"use client";

import { useCallback, useState } from "react";
import AsciiCanvas from "./AsciiCanvas";
import UnicornEmbed from "./UnicornEmbed";
import { PRESETS } from "@/lib/ascii-presets";
import type { Project } from "@/lib/data";

type Props = {
  projects: Project[];
  defaultPresetId: keyof typeof PRESETS;
  unicornProjectId?: string;
  profileTitle: string;
  profileName: string;
  profileAka?: string;
  profileBio: string;
  profileLocation: string;
};

export default function HeroSwitcher({
  projects,
  defaultPresetId,
  unicornProjectId,
  profileTitle,
  profileName,
  profileAka,
  profileBio,
  profileLocation,
}: Props) {
  const [activeId, setActiveId] = useState<keyof typeof PRESETS>(defaultPresetId);
  const active = PRESETS[activeId];

  const switchTo = useCallback((id: keyof typeof PRESETS) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="relative">
        <div className="relative h-[58vh] min-h-[420px] w-full overflow-hidden border border-line bg-bg-soft/40 scan">
          {/* AsciiCanvas 通过 preset 引用变化触发 useEffect 重建 WebGL */}
          <AsciiCanvas
            preset={active}
            className="absolute inset-0 h-full w-full"
            interactive
            maxDpr={1.75}
            maxPixels={1_600_000}
          />
          <UnicornEmbed
            projectId={unicornProjectId}
            className="absolute inset-0 h-full w-full"
          />

          <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10">
            <div>
              <h1 className="font-mono text-2xl uppercase leading-tight tracking-[0.08em] text-accent-strong sm:text-4xl md:text-5xl">
                {active.label.split(" ").map((w, i) => (
                  <span key={i} className="block">
                    {w}
                  </span>
                ))}
              </h1>
              <p className="mt-3 max-w-sm font-mono text-xs uppercase tracking-[0.18em] text-muted">
                {profileTitle}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70">
                {active.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#links"
                className="border border-fg/80 bg-fg/0 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-fg transition-colors hover:bg-fg hover:text-bg"
              >
                Get Started
              </a>
              <a
                href="#work"
                className="border border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted transition-colors hover:border-fg/40 hover:text-fg"
              >
                Learn More
              </a>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm text-fg/80">
            <span className="text-fg">{profileName}</span>
            {profileAka && (
              <span className="ml-2 font-mono text-xs text-muted/80">/ {profileAka}</span>
            )}
            <span className="mx-2 text-muted">·</span>
            {profileBio}
          </p>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {profileLocation}
          </span>
        </div>
      </section>

      {/* Projects */}
      <section id="work" className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
            // selected work · click to preview in hero
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {String(projects.length).padStart(2, "0")} entries
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const preset = PRESETS[p.presetId];
            const isActive = p.presetId === activeId;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => switchTo(p.presetId)}
                className={`card-hover group flex h-full flex-col border bg-bg-soft/40 text-left backdrop-blur-sm ${
                  isActive
                    ? "border-accent/60 ring-1 ring-accent/40"
                    : "border-line"
                }`}
              >
                <div className="relative aspect-[5/3] w-full overflow-hidden scan">
                  <AsciiCanvas
                    preset={preset}
                    className="absolute inset-0 h-full w-full"
                    interactive={false}
                    maxDpr={1.25}
                    fpsCap={30}
                    maxPixels={500_000}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
                  <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/90">
                    {p.tag}
                  </div>
                  <div className="absolute right-3 top-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/90">
                    {isActive && (
                      <span className="rounded-sm border border-accent/60 px-1.5 py-0.5 text-accent">
                        ACTIVE
                      </span>
                    )}
                    <span>{p.year}</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    <span
                      aria-hidden
                      className="font-mono text-xs text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    >
                      {isActive ? "●" : "↗"}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{p.caption}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

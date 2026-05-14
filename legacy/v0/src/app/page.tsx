import AsciiCanvas from "@/components/AsciiCanvas";
import HeroSwitcher from "@/components/HeroSwitcher";
import LinkCard from "@/components/LinkCard";
import StatusBar from "@/components/StatusBar";
import UnicornEmbed from "@/components/UnicornEmbed";
import { PRESETS } from "@/lib/ascii-presets";
import { groupLabels, links, profile, projects } from "@/lib/data";

export default function Home() {
  const groupedLinks = (Object.keys(groupLabels) as Array<keyof typeof groupLabels>).map(
    (g) => ({
      key: g,
      label: groupLabels[g],
      items: links.filter((l) => l.group === g),
    })
  );

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-5 pb-20 pt-6 sm:px-8 md:gap-24 md:px-12 md:pt-10">
      <header className="flex items-center justify-between gap-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          {profile.handle}
        </div>
        <StatusBar status={profile.status} />
      </header>

      {/* Hero + 项目卡 · 客户端组件，点卡片切换首图效果 */}
      <HeroSwitcher
        projects={projects}
        defaultPresetId="mushroom"
        unicornProjectId={process.env.NEXT_PUBLIC_UNICORN_ID}
        profileTitle={profile.title}
        profileName={profile.name}
        profileAka={profile.aka}
        profileBio={profile.bio}
        profileLocation={profile.location}
      />

      {/* 调研对照：可选，通过 NEXT_PUBLIC_UNICORN_REF_ID 控制是否显示 */}
      {process.env.NEXT_PUBLIC_UNICORN_REF_ID && (
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
              // research · unicorn studio reference
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              projectId · {process.env.NEXT_PUBLIC_UNICORN_REF_ID}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-line bg-bg-soft/40 backdrop-blur-sm">
              <div className="border-b border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                // ours · pure webgl shader (mit-friendly)
              </div>
              <div className="relative aspect-[5/3]">
                <AsciiCanvas
                  preset={PRESETS.mushroom}
                  className="absolute inset-0 h-full w-full"
                  maxDpr={1.0}
                  fpsCap={30}
                  maxPixels={350_000}
                />
              </div>
            </div>
            <div className="border border-line bg-bg-soft/40 backdrop-blur-sm">
              <div className="border-b border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                // theirs · unicorn studio &quot;ASCII (Remix)&quot;
              </div>
              <div className="relative aspect-[5/3]">
                <UnicornEmbed
                  projectId={process.env.NEXT_PUBLIC_UNICORN_REF_ID}
                  className="absolute inset-0 h-full w-full"
                  mode="iframe"
                  blend="normal"
                />
              </div>
            </div>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            // 该 embed 为第三方公开作品，仅用于视觉对照；版权归 Unicorn Studio。
            <br />// 上线请使用左侧自研 shader 或在自己的 Unicorn Legend 账号下重做。
          </p>
        </section>
      )}

      {/* Links */}
      <section id="links" className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
            // signal channels
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {String(links.length).padStart(2, "0")} endpoints
          </span>
        </div>
        <div className="flex flex-col gap-8">
          {groupedLinks
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.key} className="flex flex-col gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/80">
                  {g.label}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((item) => (
                    <LinkCard key={item.label} item={item} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      <footer className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          {profile.tagline}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span className="blink">_</span>
          <span>© 2026 {profile.name}</span>
        </div>
      </footer>
    </main>
  );
}

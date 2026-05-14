"use client";

import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled, playTick } from "@/lib/sound";

export function SoundToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
    if (next) playTick();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Mute sound" : "Enable sound"}
      aria-pressed={enabled}
      className="pointer-events-auto fixed right-6 top-6 z-30 flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[10px] uppercase tracking-wider opacity-60 transition-opacity hover:opacity-100"
      style={{ borderColor: "color-mix(in srgb, var(--fg) 30%, transparent)" }}
    >
      {enabled ? "●))" : "○"}
    </button>
  );
}

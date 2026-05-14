"use client";

import { useEffect, useState } from "react";

export default function StatusBar({ status }: { status: string }) {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
    };
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted flex items-center gap-6">
      <span className="flex items-center gap-2">
        <span>system status</span>
        <span className="inline-block size-2 rounded-full bg-emerald-400 pulse-dot" />
        <span className="text-fg/80">{status}</span>
      </span>
      <span className="hidden sm:inline">{time}</span>
      <span className="hidden md:inline">v 1.0.0 · self-hosted</span>
    </div>
  );
}

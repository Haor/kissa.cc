/**
 * 编辑这个文件改你的个人主页内容。
 */
import { PRESETS } from "./ascii-presets";

export const profile = {
  handle: "@kissa",
  name: "Kissa",
  aka: "椎名晴樹",
  title: "Engineer · Daydreamer",
  tagline: "As I Dreamed",
  bio: "As I Dreamed.",
  location: "Shenzhen / 深圳",
  status: "OPERATIONAL",
};

export type LinkItem = {
  label: string;
  href: string;
  hint?: string;
  group: "social" | "work" | "play" | "contact";
};

export const links: LinkItem[] = [
  { label: "X / Twitter", href: "https://x.com/haor233_re", hint: "@haor233_re", group: "social" },
  { label: "Instagram", href: "https://www.instagram.com/haor233/", hint: "@haor233", group: "social" },
  { label: "Discord", href: "https://discord.com/users/402097792681508865", hint: "haor233", group: "social" },
  { label: "GitHub", href: "https://github.com/Haor", hint: "github.com/Haor", group: "work" },
  { label: "Hugging Face", href: "https://huggingface.co/haor", hint: "models & datasets", group: "work" },
  { label: "Steam", href: "https://steamcommunity.com/id/haor233/", hint: "@haor233", group: "play" },
  { label: "Email", href: "mailto:i@haor.cc", hint: "i@haor.cc", group: "contact" },
];

export type Project = {
  slug: string;
  title: string;
  caption: string;
  year: string;
  href?: string;
  presetId: keyof typeof PRESETS;
  tag: string;
};

export const projects: Project[] = [
  {
    slug: "signal",
    title: "Autonomous Signal",
    caption: "Adaptive infrastructure for autonomous workflows",
    year: "2026",
    presetId: "mushroom",
    tag: "// hero",
    href: "#",
  },
  {
    slug: "wave-stats",
    title: "Wave Stats",
    caption: "Real-time insight. Minimal noise.",
    year: "2026",
    presetId: "wave",
    tag: "// dashboard",
    href: "#",
  },
  {
    slug: "overview",
    title: "Overview Profits",
    caption: "Adaptive infrastructure for autonomous workflows",
    year: "2025",
    presetId: "orbit",
    tag: "// terminal",
    href: "#",
  },
  {
    slug: "market-downfall",
    title: "Market Downfall",
    caption: "Predictive systems for the next generation of SaaS",
    year: "2025",
    presetId: "chaos",
    tag: "// research",
    href: "#",
  },
  {
    slug: "market-sentiment",
    title: "Market Sentiment",
    caption: "Signal-first analytics across markets",
    year: "2025",
    presetId: "grid",
    tag: "// dataviz",
    href: "#",
  },
];

export const groupLabels: Record<LinkItem["group"], string> = {
  social: "// social",
  work: "// work",
  play: "// play",
  contact: "// contact",
};

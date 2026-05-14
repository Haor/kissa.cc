import type { LinkItem } from "@/lib/data";

export default function LinkCard({ item }: { item: LinkItem }) {
  const external = item.href.startsWith("http");
  return (
    <a
      href={item.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="card-hover group block border border-line bg-bg-soft/40 px-4 py-3 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {item.group}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{item.label}</div>
          {item.hint && (
            <div className="mt-0.5 truncate text-xs text-muted">{item.hint}</div>
          )}
        </div>
        <span
          aria-hidden
          className="font-mono text-xs text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
        >
          {"→"}
        </span>
      </div>
    </a>
  );
}
